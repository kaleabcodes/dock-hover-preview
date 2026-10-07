// Finds which dock icon the pointer is over using only GNOME Shell's own
// classes, so it works with the built-in dash, Ubuntu Dock, Dash to Dock or
// any dock built from the shell's dash items — without depending on them.

import Clutter from 'gi://Clutter';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';

import {Timer, debug} from './util.js';

const LONG_PRESS_MS = 425; // under the dock menu's own long press (~500 ms)

export class IconTracker {
    constructor({
        onIconEnter, onIconLeave, onIconActivated, onIconFocus, onFocusElsewhere, onIconKeyPress,
        onIconScroll, onIconLongPress, onPress,
    }) {
        this._onIconEnter = onIconEnter;
        this._onIconLeave = onIconLeave;
        this._onIconActivated = onIconActivated;
        this._onIconFocus = onIconFocus;
        this._onFocusElsewhere = onFocusElsewhere;
        this._onIconKeyPress = onIconKeyPress;
        this._onIconScroll = onIconScroll;
        this._onIconLongPress = onIconLongPress;
        this._onPress = onPress;
        this._currentIcon = null;
        this._iconSignals = [];
        this._longPress = new Timer();
        this._longPressed = null; // the icon whose touch turned into a long press

        // captured-event on the stage sees pointer motion over every shell
        // actor before anything can stop it, wherever the dock lives.
        this._stageEventId = global.stage.connect('captured-event', (_, event) => {
            switch (event.type()) {
            case Clutter.EventType.MOTION: {
                const icon = findDockAppIcon(global.stage.get_event_actor(event));
                if (icon)
                    this._setIcon(icon);
                break;
            }
            case Clutter.EventType.KEY_PRESS: {
                // Only keys on a focused dock icon, and only the ones the
                // extension asks to keep (e.g. the arrow into the preview).
                const icon = findDockAppIcon(global.stage.key_focus);
                if (icon)
                    return this._onIconKeyPress(icon, icon._delegate.app, event);
                break;
            }
            case Clutter.EventType.SCROLL: {
                const icon = findDockAppIcon(global.stage.get_event_actor(event));
                if (icon)
                    return this._onIconScroll(icon, icon._delegate.app, event);
                break;
            }
            case Clutter.EventType.BUTTON_PRESS:
                this._onPress(global.stage.get_event_actor(event));
                break;
            case Clutter.EventType.TOUCH_BEGIN: {
                // Touch screens have no hover: holding a finger on an icon
                // opens its preview instead.
                const actor = global.stage.get_event_actor(event);
                this._onPress(actor);
                const icon = findDockAppIcon(actor);
                this._longPress.stop();
                if (icon)
                    this._longPress.start(LONG_PRESS_MS, () => this._onLongPress(icon));
                break;
            }
            case Clutter.EventType.TOUCH_END:
            case Clutter.EventType.TOUCH_CANCEL:
                this._longPress.stop();
                this._restoreIconGestures();
                if (this._longPressed) {
                    // Lifting the finger must not count as a click, which
                    // would launch the app and dismiss the preview.
                    this._longPressed = null;
                    return Clutter.EVENT_STOP;
                }
                break;
            default:
                break;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Keyboard users reach dock icons with Ctrl+Alt+Tab and the arrow
        // keys; a focused icon counts like a hovered one.
        this._keyFocusId = global.stage.connect('notify::key-focus', () => {
            const actor = global.stage.key_focus;
            const icon = findDockAppIcon(actor);
            if (icon)
                this._onIconFocus(icon, icon._delegate.app);
            else
                this._onFocusElsewhere(actor);
        });
    }

    // The dock icon under the pointer, if any.
    get hoveredIcon() {
        return this._currentIcon;
    }

    _onLongPress(icon) {
        // Track the icon like a hovered one, so clicks, its menu opening
        // and its destruction dismiss the preview.
        this._setIcon(icon);
        // Our long press fires just before the icon's own, which would
        // open its context menu. If the preview has something to show,
        // keep this touch for it (a second long press, with the preview
        // already open, falls through to the dock's menu).
        if (!this._onIconLongPress(icon, icon._delegate.app))
            return;
        this._longPressed = icon;
        this._suppressIconGestures(icon);
        // Release the dock button's press so it won't fire "clicked".
        icon.fake_release?.();
        debug(`long press on ${icon._delegate.app.get_id()}`);
    }

    // Disables the icon's own long-press gesture (the context menu on
    // GNOME ≥ 49) and menu timeout (older shells) for the current touch.
    _suppressIconGestures(icon) {
        this._restoreIconGestures();
        if (Clutter.LongPressGesture) {
            this._disabledGestures = icon.get_actions()
                .filter(a => a instanceof Clutter.LongPressGesture && a.enabled);
            this._disabledGestures.forEach(a => (a.enabled = false));
        }
        icon._removeMenuTimeout?.();
    }

    _restoreIconGestures() {
        this._disabledGestures?.forEach(a => (a.enabled = true));
        this._disabledGestures = null;
    }

    _setIcon(icon) {
        if (icon === this._currentIcon)
            return;

        if (this._currentIcon) {
            const previous = this._currentIcon;
            this._disconnectIcon();
            this._currentIcon = null;
            this._onIconLeave(previous);
        }

        if (!icon)
            return;

        this._currentIcon = icon;
        this._iconSignals = [
            // Leaving is detected on the icon itself, since the pointer may
            // leave straight onto an app window where the stage sees nothing.
            icon.connect('notify::hover', () => {
                if (!icon.hover)
                    this._setIcon(null);
            }),
            // Clicking the icon or opening its menu should dismiss the preview.
            icon.connect('clicked', () => this._onIconActivated(icon)),
            icon.connect('menu-state-changed', (_, opened) => {
                if (opened)
                    this._onIconActivated(icon);
            }),
            // The app quit while hovered: its icon is removed from the dock.
            icon.connect('destroy', () => this._setIcon(null)),
        ];
        debug(`pointer on ${icon._delegate.app.get_id()}`);
        this._onIconEnter(icon, icon._delegate.app);
    }

    _disconnectIcon() {
        this._iconSignals.forEach(id => this._currentIcon.disconnect(id));
        this._iconSignals = [];
    }

    destroy() {
        global.stage.disconnect(this._stageEventId);
        global.stage.disconnect(this._keyFocusId);
        this._longPress.stop();
        this._restoreIconGestures();
        if (this._currentIcon)
            this._disconnectIcon();
        this._currentIcon = null;
    }
}

// Hides the dock's app-name tooltip, which would otherwise overlap the
// preview. The tooltip belongs to the icon's dash item container.
export function hideIconLabel(icon) {
    icon.get_parent()?.hideLabel?.();
}

// Asks an auto-hiding dock to stay visible while the pointer is in the
// preview. Docks that don't have this property are simply left alone.
// Returns a function that releases the pin; it is safe to call even after
// the dock has been destroyed.
export function pinDock(icon) {
    let dock = null;
    for (let a = icon.get_parent(); a && !dock; a = a.get_parent()) {
        if ('requiresVisibility' in a)
            dock = a;
    }
    if (!dock)
        return () => {};

    dock.requiresVisibility = true;
    const destroyId = dock.connect('destroy', () => {
        dock = null;
    });
    return () => {
        if (!dock)
            return;
        dock.disconnect(destroyId);
        dock.requiresVisibility = false;
        dock = null;
    };
}

// Walks up from the actor under the pointer to an app icon that sits in a
// dash item (i.e. a dock icon, not an app-grid icon). Returns null for the
// "Show Apps" button, separators and everything else.
function findDockAppIcon(actor) {
    for (let a = actor; a; a = a.get_parent()) {
        if (a._delegate?.app && a.get_parent() instanceof Dash.DashItemContainer)
            return a;
    }
    return null;
}
