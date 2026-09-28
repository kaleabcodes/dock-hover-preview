// Recent files per app, from GNOME's recently-used.xbel. Pure JavaScript
// (no GNOME imports) so it's unit-tested with Node.
//
// Each bookmark lists the apps that opened it; `exec` is what really opened
// the file ("'loupe %u'", "'/usr/bin/flatpak run … org.videolan.VLC …'"),
// while `name` is often just the launcher (e.g. Files), so matching uses exec.

/**
 * @typedef {object} RecentFile
 * @property {string} path
 * @property {string} modified   ISO date, newest first
 * @property {string[]} execs    commands that opened it
 */

/**
 * @param {string} xml
 * @returns {RecentFile[]} local files, newest first
 */
export function parseRecentFiles(xml) {
    const files = [];
    for (const [, attrs, body] of xml.matchAll(/<bookmark\s([^>]*)>([\s\S]*?)<\/bookmark>/g)) {
        const href = /href="([^"]+)"/.exec(attrs)?.[1];
        const path = href && uriToPath(decodeEntities(href));
        if (!path)
            continue;
        const modified = /modified="([^"]+)"/.exec(attrs)?.[1] ?? '';
        const execs = [...body.matchAll(/<bookmark:application\s[^>]*exec="([^"]*)"/g)]
            .map(([, exec]) => decodeEntities(exec).replace(/^'|'$/g, ''));
        files.push({path, modified, execs});
    }
    return files.sort((a, b) => b.modified.localeCompare(a.modified));
}

/**
 * Whether an app matches a recorded exec line.
 *
 * @param {string} exec          e.g. "gnome-text-editor %U"
 * @param {{desktopId: string, executable: string|null}} app
 * @returns {boolean}
 */
export function execMatchesApp(exec, {desktopId, executable}) {
    const appId = desktopId.replace(/\.desktop$/, '');
    const words = exec.split(/\s+/);
    // Flatpak: "flatpak run … org.videolan.VLC …"
    if (/(^|\/)flatpak$/.test(words[0]))
        return words.includes(appId);
    const program = basename(words[0]);
    // D-Bus activated apps record their id ("org.gnome.Nautilus %u").
    if (program === appId)
        return true;
    return Boolean(executable) && !/(^|\/)flatpak$/.test(executable) && program === basename(executable);
}

/**
 * @param {RecentFile[]} files
 * @param {{desktopId: string, executable: string|null}} app
 * @returns {string[]} paths, newest first
 */
export function recentPathsForApp(files, app) {
    return files.filter(f => f.execs.some(exec => execMatchesApp(exec, app))).map(f => f.path);
}

function basename(path) {
    return path.slice(path.lastIndexOf('/') + 1);
}

function uriToPath(uri) {
    if (!uri.startsWith('file://'))
        return null;
    try {
        return decodeURIComponent(uri.slice('file://'.length));
    } catch {
        return null;
    }
}

function decodeEntities(text) {
    return text.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
