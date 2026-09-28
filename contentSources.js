// Where the popup's extra cards get their data: the media player an app is
// playing on (via GNOME Shell's own MPRIS tracker) and the files an app
// recently opened (GNOME's recently-used.xbel).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Mpris from 'resource:///org/gnome/shell/ui/mpris.js';

import {playerBelongsToApp} from './mediaMatch.js';
import {parseRecentFiles, recentPathsForApp} from './recentFiles.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.DBusConnection.prototype, 'call');

export class MediaSource {
    constructor() {
        this._source = new Mpris.MprisSource();
        this._pids = new Map(); // bus name -> pid, looked up once per player
        this._source.connectObject('player-added', (_, player) => this._lookupPid(player), this);
    }

    /**
     * The media player that belongs to `app`, if it's playing or paused.
     *
     * @param {Shell.App} app
     * @returns {Mpris.MprisPlayer|null}
     */
    playerFor(app) {
        const info = {desktopId: app.get_id(), pids: app.get_pids()};
        for (const player of this._source.players) {
            if (!this._pids.has(player._busName))
                this._lookupPid(player);
            const desktopEntry = player.app?.get_id()?.replace(/\.desktop$/, '') ?? null;
            if (playerBelongsToApp({busName: player._busName, desktopEntry, pid: this._pids.get(player._busName)}, info))
                return player;
        }
        return null;
    }

    async _lookupPid(player) {
        const busName = player._busName;
        if (this._pids.has(busName))
            return;
        this._pids.set(busName, null);
        try {
            const reply = await Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
                'org.freedesktop.DBus', 'GetConnectionUnixProcessID', new GLib.Variant('(s)', [busName]),
                null, Gio.DBusCallFlags.NONE, -1, null);
            this._pids.set(busName, reply.deepUnpack()[0]);
        } catch {
            // Sandboxed or gone; name matching still works.
        }
    }

    destroy() {
        this._source.disconnectObject(this);
        this._source = null;
    }
}

export class RecentSource {
    constructor() {
        this._file = Gio.File.new_for_path(`${GLib.get_user_data_dir()}/recently-used.xbel`);
        this._files = [];
        this._monitor = this._file.monitor_file(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', () => this._load());
        this._load();
    }

    async _load() {
        try {
            const [bytes] = await this._file.load_contents_async(null);
            this._files = parseRecentFiles(new TextDecoder().decode(bytes));
        } catch {
            this._files = [];
        }
    }

    /**
     * Files `app` opened recently that still exist, newest first.
     *
     * @param {Shell.App} app
     * @param {number} limit
     * @returns {string[]}
     */
    forApp(app, limit) {
        const info = app.get_app_info();
        if (!info)
            return [];
        const paths = recentPathsForApp(this._files, {desktopId: app.get_id(), executable: info.get_executable()});
        const existing = [];
        for (const path of paths) {
            if (existing.length >= limit)
                break;
            if (GLib.file_test(path, GLib.FileTest.EXISTS))
                existing.push(path);
        }
        return existing;
    }

    destroy() {
        this._monitor.cancel();
        this._monitor = null;
    }
}
