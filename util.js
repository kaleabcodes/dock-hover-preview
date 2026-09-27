import GLib from 'gi://GLib';

// Set DHP_DEBUG=1 in gnome-shell's environment to log what the extension
// detects and decides.
const DEBUG = !!GLib.getenv('DHP_DEBUG');

export function debug(msg) {
    if (DEBUG)
        console.log(`[dock-hover-preview] ${msg}`);
}

// A single restartable GLib timeout, so callers don't juggle source ids.
export class Timer {
    constructor() {
        this._id = 0;
    }

    get pending() {
        return this._id !== 0;
    }

    start(ms, callback) {
        this.stop();
        this._id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._id = 0;
            callback();
            return GLib.SOURCE_REMOVE;
        });
    }

    stop() {
        if (this._id) {
            GLib.source_remove(this._id);
            this._id = 0;
        }
    }
}
