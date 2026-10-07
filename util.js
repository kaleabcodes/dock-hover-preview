import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

// Set DHP_DEBUG=1 in gnome-shell's environment to log what the extension
// detects and decides.
const DEBUG = !!GLib.getenv('DHP_DEBUG');

export function debug(msg) {
    if (DEBUG)
        console.log(`[dock-hover-preview] ${msg}`);
}

// St.BoxLayout gained `orientation` in GNOME 48; 47 only has `vertical`.
const HAS_ORIENTATION = St.BoxLayout.find_property('orientation') !== null;

// Constructor properties for a box laid out in `orientation`, whichever
// property this shell version understands.
export function orientationProps(orientation) {
    return HAS_ORIENTATION
        ? {orientation}
        : {vertical: orientation === Clutter.Orientation.VERTICAL};
}

export function setOrientation(box, orientation) {
    if (HAS_ORIENTATION)
        box.orientation = orientation;
    else
        box.vertical = orientation === Clutter.Orientation.VERTICAL;
}

export function isVertical(box) {
    return HAS_ORIENTATION ? box.orientation === Clutter.Orientation.VERTICAL : box.vertical;
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
