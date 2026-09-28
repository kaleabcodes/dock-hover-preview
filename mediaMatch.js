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

/**
 * Which window's card gets the media controls: the one whose title contains
 * the track title (VLC: "Astrid S - Breathe - VLC media player"; a browser
 * tab playing the video), otherwise the focused window, otherwise the first.
 *
 * @param {string[]} windowTitles
 * @param {string} trackTitle
 * @param {number} focusedIndex  -1 when none of the windows has focus
 * @returns {number} index into windowTitles, or -1 when there are none
 */
export function playingWindowIndex(windowTitles, trackTitle, focusedIndex) {
    if (windowTitles.length === 0)
        return -1;
    const track = (trackTitle ?? '').trim().toLowerCase();
    if (track) {
        const match = windowTitles.findIndex(t => (t ?? '').toLowerCase().includes(track));
        if (match >= 0)
            return match;
    }
    return focusedIndex >= 0 ? focusedIndex : 0;
}
