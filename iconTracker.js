// Finds which dock icon the pointer is over using only GNOME Shell's own
// classes, so it works with the built-in dash, Ubuntu Dock, Dash to Dock or
// any dock built from the shell's dash items — without depending on them.

import Clutter from 'gi://Clutter';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';

import {debug} from './util.js';

export class IconTracker {
    constructor({onIconEnter, onIconLeave, onIconActivated}) {
        this._onIconEnter = onIconEnter;
        this._onIconLeave = onIconLeave;
        this._onIconActivated = onIconActivated;
        this._currentIcon = null;
        this._iconSignals = [];

        // captured-event on the stage sees pointer motion over every shell
        // actor before anything can stop it, wherever the dock lives.
        this._stageEventId = global.stage.connect('captured-event', (_, event) => {
            if (event.type() === Clutter.EventType.MOTION) {
                const icon = findDockAppIcon(global.stage.get_event_actor(event));
                if (icon)
                    this._setIcon(icon);
            }
            return Clutter.EVENT_PROPAGATE; // never swallow events
        });
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
