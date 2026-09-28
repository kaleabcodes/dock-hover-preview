// Which media player (MPRIS) belongs to which dock app. Pure JavaScript,
// unit-tested with Node.

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';

/**
 * @param {{busName: string, desktopEntry: string|null, pid: number|null}} player
 * @param {{desktopId: string, pids: number[]}} app
 * @returns {boolean}
 */
export function playerBelongsToApp(player, app) {
    const appId = app.desktopId.replace(/\.desktop$/, '').toLowerCase();
    if (player.desktopEntry && player.desktopEntry.toLowerCase() === appId)
        return true;
    if (player.pid && app.pids.includes(player.pid))
        return true;
    // "org.mpris.MediaPlayer2.spotify" and "com.spotify.Client";
    // "org.mpris.MediaPlayer2.brave.instance1234" and "com.brave.Browser".
    const name = player.busName.startsWith(MPRIS_PREFIX)
        ? player.busName.slice(MPRIS_PREFIX.length).split('.')[0].toLowerCase()
        : '';
    const ignored = new Set(['', 'instance', 'org', 'com', 'io', 'app', 'desktop']);
    if (ignored.has(name) || name.length < 3)
        return false;
    return appId.split(/[._-]/).includes(name);
}
