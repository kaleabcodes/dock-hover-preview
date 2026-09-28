// Finds the media player an app is playing on, via GNOME Shell's own MPRIS
// tracker, for the popup's media card.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Mpris from 'resource:///org/gnome/shell/ui/mpris.js';

import {playerBelongsToApp} from './mediaMatch.js';

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
