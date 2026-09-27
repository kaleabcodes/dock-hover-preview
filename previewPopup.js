import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {debug} from './util.js';
import {WindowCard} from './windowCard.js';

const SLIDE_DISTANCE = 8;
const DARK_BACKGROUND = [28, 28, 30];
const LIGHT_BACKGROUND = [250, 250, 251];
const GAP_FROM_ICON = 8;
const MIN_PREVIEW_WIDTH = 80;
const CARD_CHROME = 24; // card padding + spacing around each thumbnail
const SCREEN_FRACTION = 0.9; // how much of the screen edge the popup may use

// The floating box of window cards shown next to a dock icon. It only knows
// how to draw windows and where to sit; when to show or hide it is decided
// by the extension.
export const PreviewPopup = GObject.registerClass({
    Signals: {
        // The hovered card's window, or null when no card is hovered.
        'card-hover-changed': {param_types: [GObject.TYPE_OBJECT]},
        // A card was clicked and its window activated or minimized.
        'window-activated': {},
    },
}, class PreviewPopup extends St.BoxLayout {
    _init(settings) {
        super._init({
            style_class: 'dhp-popup',
            reactive: true,
            track_hover: true,
            visible: false,
        });
        this._settings = settings;
        this._icon = null;
        this._app = null;
        this._side = St.Side.BOTTOM;

        // The real size is only known after layout (styles, fonts), so
        // re-place the popup whenever its size changes.
        this.connect('notify::size', () => {
            if (this._icon)
                this._reposition();
        });

        const settingsId = settings.connect('changed::background-opacity',
            () => this._syncBackground());
        this._syncBackground();
        this.connect('destroy', () => settings.disconnect(settingsId));
    }

    get isOpen() {
        return this.visible && this._icon !== null;
    }

    get icon() {
        return this._icon;
    }

    open(icon, app, windows) {
        const wasOpen = this.isOpen;
        this._syncBackground(); // picks up a light/dark switch since last time
        this._icon = icon;
        this._app = app;
        this._side = getDockSide(icon);
        this.orientation = this._side === St.Side.LEFT || this._side === St.Side.RIGHT
            ? Clutter.Orientation.VERTICAL
            : Clutter.Orientation.HORIZONTAL;

        this.setWindows(windows);

        this.remove_all_transitions();
        // Stay above the dock, which may have been re-added after us.
        this.get_parent()?.set_child_above_sibling(this, null);
        this.show();

        const duration = this._settings.get_int('animation-duration');
        if (wasOpen || duration === 0) {
            // Moving between icons: jump straight to the new spot.
            this.opacity = 255;
            this.translation_x = this.translation_y = 0;
            return;
        }

        const [dx, dy] = slideOffset(this._side);
        this.opacity = 0;
        this.translation_x = dx;
        this.translation_y = dy;
        this.ease({
            opacity: 255,
            translation_x: 0,
            translation_y: 0,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    setWindows(windows) {
        this.destroy_all_children();

        const monitor = Main.layoutManager.findMonitorForActor(this._icon);
        const vertical = this.orientation === Clutter.Orientation.VERTICAL;
        const available = (vertical ? monitor.height : monitor.width) * SCREEN_FRACTION;
        // Shrink previews when there are too many windows to fit in a row.
        const maxWidth = Math.max(MIN_PREVIEW_WIDTH, Math.min(
            this._settings.get_int('preview-size'),
            available / windows.length - CARD_CHROME));

        for (const win of windows) {
            const card = new WindowCard({
                win,
                app: this._app,
                maxWidth,
                settings: this._settings,
                onActivated: () => this.emit('window-activated'),
            });
            card.connect('notify::hover', () =>
                this.emit('card-hover-changed', card.hover ? win : null));
            this.add_child(card);
        }

        this._reposition();
    }

    close(animate = true) {
        if (!this.visible)
            return;

        this._icon = null;
        this._app = null;
        this.remove_all_transitions();

        const duration = this._settings.get_int('animation-duration');
        if (!animate || duration === 0) {
            this._finishClose();
            return;
        }

        const [dx, dy] = slideOffset(this._side);
        this.ease({
            opacity: 0,
            translation_x: dx,
            translation_y: dy,
            duration,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onStopped: isFinished => {
                // A reopen during the fade cancels this transition.
                if (isFinished)
                    this._finishClose();
            },
        });
    }

    _finishClose() {
        this.hide();
        this.destroy_all_children();
    }

    // The background is set here, not in the stylesheet, so the
    // "background-opacity" setting can apply. Its base color follows the
    // shell's light/dark style (the stylesheets handle everything else).
    // Colors follow the shell's light/dark style, checked on every open.
    // The "dhp-light" class switches the stylesheet colors and the base of
    // the inline background (inline so "background-opacity" can apply)
    // together, so they can never disagree. Relying on GNOME swapping
    // extension stylesheets didn't work: it doesn't always reload them.
    _syncBackground() {
        const light = Main.getStyleVariant() === 'light';
        if (light)
            this.add_style_class_name('dhp-light');
        else
            this.remove_style_class_name('dhp-light');

        const alpha = this._settings.get_int('background-opacity') / 100;
        const [r, g, b] = light ? LIGHT_BACKGROUND : DARK_BACKGROUND;
        this.style = `background-color: rgba(${r}, ${g}, ${b}, ${alpha});`;
    }

    _reposition() {
        const icon = this._icon;
        const monitor = Main.layoutManager.findMonitorForActor(icon);
        const [ix, iy] = icon.get_transformed_position();
        const [iw, ih] = icon.get_transformed_size();
        const [, , width, height] = this.get_preferred_size();

        let x, y;
        switch (this._side) {
        case St.Side.TOP:
            x = ix + iw / 2 - width / 2;
            y = iy + ih + GAP_FROM_ICON;
            break;
        case St.Side.LEFT:
            x = ix + iw + GAP_FROM_ICON;
            y = iy + ih / 2 - height / 2;
            break;
        case St.Side.RIGHT:
            x = ix - width - GAP_FROM_ICON;
            y = iy + ih / 2 - height / 2;
            break;
        default:
            x = ix + iw / 2 - width / 2;
            y = iy - height - GAP_FROM_ICON;
        }

        x = clamp(x, monitor.x, monitor.x + monitor.width - width);
        y = clamp(y, monitor.y, monitor.y + monitor.height - height);
        this.set_position(Math.round(x), Math.round(y));
        debug(`popup ${Math.round(width)}x${Math.round(height)} at ${Math.round(x)},${Math.round(y)}`);
    }
});

// Which screen edge the dock is on, judged by the edge nearest the icon.
function getDockSide(icon) {
    const monitor = Main.layoutManager.findMonitorForActor(icon);
    const [ix, iy] = icon.get_transformed_position();
    const [iw, ih] = icon.get_transformed_size();
    const distances = [
        [St.Side.BOTTOM, monitor.y + monitor.height - (iy + ih)],
        [St.Side.TOP, iy - monitor.y],
        [St.Side.LEFT, ix - monitor.x],
        [St.Side.RIGHT, monitor.x + monitor.width - (ix + iw)],
    ];
    distances.sort((a, b) => a[1] - b[1]);
    return distances[0][0];
}

// The popup slides in from the dock's direction.
function slideOffset(side) {
    switch (side) {
    case St.Side.TOP:
        return [0, -SLIDE_DISTANCE];
    case St.Side.LEFT:
        return [-SLIDE_DISTANCE, 0];
    case St.Side.RIGHT:
        return [SLIDE_DISTANCE, 0];
    default:
        return [0, SLIDE_DISTANCE];
    }
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}
