import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {MediaSource} from './contentSources.js';
import {IconTracker, hideIconLabel, pinDock} from './iconTracker.js';
import {PreviewPopup, keyIntoPopup} from './previewPopup.js';
import {Timer, debug} from './util.js';
import {WindowPeek} from './windowPeek.js';

// Short grace period so moving between two cards doesn't flash the peek.
const PEEK_END_DELAY_MS = 80;
const POINTER_TRAVEL_GRACE_MS = 1000;

// Decides when the preview opens and closes:
// - resting on a running app's icon for `hover-delay` opens it;
// - moving to another icon while open switches immediately;
// - leaving both the icon and the popup closes it after `hide-delay`;
// - clicking the icon, opening its menu, picking a window, switching
//   workspace or opening the overview closes it at once.
// While open, resting on a card for `peek-delay` peeks at that window.
// A dock icon with keyboard focus counts as hovered, and the preview stays
// open while the keyboard focus is on the icon or in the preview.
export default class DockHoverPreviewExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._showTimer = new Timer();
        this._hideTimer = new Timer();
        this._peekTimer = new Timer();
        this._peekEndTimer = new Timer();
        this._peek = new WindowPeek();
        this._media = new MediaSource();
        this._pinnedIcon = null;
        this._unpinDock = null;
        this._appSignal = null; // [app, id] while open
        this._keyboard = false; // key focus is on the icon or in the preview
        this._touch = false; // the preview was opened with a long press

        this._popup = new PreviewPopup(this._settings);
        Main.layoutManager.addTopChrome(this._popup);
        this._popup.connectObject(
            // On shell shutdown the popup is destroyed before disable()
            // runs; stop app updates from reaching it.
            'destroy', () => this._unwatchApp(),
            'notify::hover', () => {
                if (this._popup.hover)
                    this._hideTimer.stop();
                else if (this._popup.isOpen)
                    this._scheduleHide();
            },
            'card-hover-changed', (_, win) => this._onCardHover(win),
            'window-activated', () => this._close(false),
            this);

        this._tracker = new IconTracker({
            onIconEnter: (icon, app) => this._onIconEnter(icon, app),
            onIconLeave: () => this._onIconLeave(),
            onIconActivated: () => this._close(false),
            onIconFocus: (icon, app) => this._onIconFocus(icon, app),
            onFocusElsewhere: actor => this._onFocusElsewhere(actor),
            onIconKeyPress: (icon, app, event) => this._onIconKeyPress(icon, app, event),
            onIconScroll: (icon, app, event) => this._onIconScroll(icon, app, event),
            onIconLongPress: (icon, app) => this._onIconLongPress(icon, app),
            onPress: actor => this._onPress(actor),
        });
        this._scrollAccumulator = 0;
        this._dragging = false; // a card is being dragged to a workspace

        this._popup.connectObject(
            'window-drag-begin', () => this._onWindowDragBegin(),
            'window-drag-end', () => {
                this._dragging = false;
            }, this);

        Main.overview.connectObject('showing', () => {
            if (!this._dragging) // dragging a card opens the overview itself
                this._close(false);
        }, this);
        global.workspace_manager.connectObject('active-workspace-changed',
            () => {
                if (!this._dragging)
                    this._close(false);
            }, this);
        Main.layoutManager.connectObject('monitors-changed', () => this._close(false), this);
        global.display.connectObject(
            'window-entered-monitor', (_, _monitor, win) => this._onWindowMonitorChanged(win),
            'window-left-monitor', (_, _monitor, win) => this._onWindowMonitorChanged(win), this);
        this._settings.connectObject('changed::current-monitor-only', () => this._refreshApp(),
            'changed::current-workspace-only', () => this._refreshApp(),
            'changed::show-media-controls', () => this._refreshApp(),
            'changed::peek-on-hover', () => this._endPeek(), this);
    }

    disable() {
        this._showTimer.stop();
        this._close(false);
        this._peek.end(false);

        this._tracker.destroy();
        this._tracker = null;

        Main.overview.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        global.display.disconnectObject(this);
        this._settings.disconnectObject(this);

        Main.layoutManager.removeChrome(this._popup);
        this._popup.destroy();
        this._popup = null;

        this._peek = null;
        this._media.destroy();
        this._media = null;
        this._showTimer = this._hideTimer = null;
        this._peekTimer = this._peekEndTimer = null;
        this._settings = null;
    }

    _onIconEnter(icon, app) {
        if (this._dragging)
            return;
        this._showTimer.stop();
        this._hideTimer.stop();

        if (this._popup.isOpen) {
            // Came back to the same icon before the hide delay ran out.
            if (this._popup.icon !== icon)
                this._open(icon, app);
            return;
        }

        this._showTimer.start(this._settings.get_int('hover-delay'),
            () => this._open(icon, app));
    }

    _onIconLeave() {
        if (!this._keyboard)
            this._showTimer.stop();
        // A preview opened by touch has no pointer to follow; it stays
        // until a tap elsewhere, on a card, or on the icon dismisses it.
        if (this._popup.isOpen && !this._touch)
            this._scheduleHide();
    }

    _onIconFocus(icon, app) {
        this._keyboard = true;
        this._onIconEnter(icon, app);
    }

    // Key focus moved to something that isn't a dock icon: fine if it's in
    // the preview, otherwise the keyboard user has left.
    _onFocusElsewhere(actor) {
        if (actor && this._popup.contains(actor)) {
            this._keyboard = true;
            return;
        }
        if (!this._keyboard || this._popup.reclaimKeyFocus())
            return;
        this._keyboard = false;
        if (!this._popup.hover && !this._tracker.hoveredIcon)
            this._close(false);
    }

    // Keys on a focused dock icon: the arrow pointing away from the dock
    // moves into the preview (opening it at once if needed), Escape closes
    // it, and activating the icon dismisses it. Everything else is the dock's.
    _onIconKeyPress(icon, app, event) {
        const key = event.get_key_symbol();
        const open = this._popup.isOpen && this._popup.icon === icon;
        switch (key) {
        case Clutter.KEY_Escape:
            if (!open && !this._showTimer.pending)
                return Clutter.EVENT_PROPAGATE;
            this._close(true);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter:
        case Clutter.KEY_ISO_Enter:
        case Clutter.KEY_space:
            this._close(false);
            return Clutter.EVENT_PROPAGATE;
        case keyIntoPopup(icon):
            if (!open) {
                this._open(icon, app);
                if (!this._popup.isOpen)
                    return Clutter.EVENT_PROPAGATE;
                this._keyboard = true;
            }
            this._popup.focusCard(0);
            return Clutter.EVENT_STOP;
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    _open(icon, app) {
        if (this._dragging)
            return;
        // A pending hover open (e.g. started when a long press began to
        // track the icon) must not re-open and reset the state below.
        this._showTimer.stop();
        const windows = this._getWindows(app, icon);
        const extras = this._getExtras(app);
        debug(`open ${app.get_id()}: ${windows.length} window(s), media=${Boolean(extras.player)}`);
        if (windows.length === 0 && !extras.player) {
            // Nothing to show: let the dock show its usual name tooltip.
            this._close(true);
            return;
        }

        this._endPeek();
        this._watchApp(app, icon);
        this._pin(icon);
        hideIconLabel(icon);
        this._touch = false; // a long press sets it back right after
        this._popup.open(icon, app, windows, extras);
    }

    // Media controls, if enabled and the app is playing.
    _getExtras(app) {
        return {
            player: this._settings.get_boolean('show-media-controls') ? this._media.playerFor(app) : null,
        };
    }

    // A finger held on an icon opens the preview at once. It then stays
    // until a tap somewhere else, on a card, or on the icon closes it.
    // Returns whether the touch was taken; otherwise the dock's own long
    // press (its context menu) goes ahead, including a second long press
    // while the preview is already open.
    _onIconLongPress(icon, app) {
        if (this._popup.isOpen && this._popup.icon === icon)
            return false;
        this._open(icon, app);
        this._touch = this._popup.isOpen;
        return this._touch;
    }

    // A press outside the preview and its icon dismisses it (clicks on the
    // icon itself are handled by its "clicked" signal).
    _onPress(actor) {
        if (!this._popup.isOpen || this._dragging)
            return;
        if (actor && (this._popup.contains(actor) || this._popup.icon.contains(actor)))
            return;
        this._close(true);
    }

    // Scrolling over an icon activates the app's next or previous window
    // (in the same order as the cards), when enabled.
    _onIconScroll(icon, app, event) {
        if (!this._settings.get_boolean('scroll-cycles-windows'))
            return Clutter.EVENT_PROPAGATE;
        if (event.is_pointer_emulated())
            return Clutter.EVENT_STOP;

        let step;
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP:
        case Clutter.ScrollDirection.LEFT:
            step = -1;
            break;
        case Clutter.ScrollDirection.DOWN:
        case Clutter.ScrollDirection.RIGHT:
            step = 1;
            break;
        case Clutter.ScrollDirection.SMOOTH: {
            // Touchpads send many small deltas; act once per whole step.
            const [dx, dy] = event.get_scroll_delta();
            this._scrollAccumulator += Math.abs(dx) > Math.abs(dy) ? dx : dy;
            if (Math.abs(this._scrollAccumulator) < 1)
                return Clutter.EVENT_STOP;
            step = Math.sign(this._scrollAccumulator);
            this._scrollAccumulator = 0;
            break;
        }
        default:
            return Clutter.EVENT_PROPAGATE;
        }

        const windows = this._getWindows(app, icon);
        if (windows.length === 0)
            return Clutter.EVENT_PROPAGATE;
        const focused = windows.findIndex(win => win.has_focus());
        const next = focused < 0
            ? (step > 0 ? 0 : windows.length - 1)
            : (focused + step + windows.length) % windows.length;
        debug(`scroll ${step > 0 ? 'next' : 'previous'} window of ${app.get_id()}`);
        Main.activateWindow(windows[next]);
        return Clutter.EVENT_STOP;
    }

    // Dragging a card: the preview gets out of the way (but stays mapped,
    // or the drag would break) and the overview opens so the window can be
    // dropped on a workspace.
    _onWindowDragBegin() {
        this._dragging = true;
        this._keyboard = false;
        this._touch = false;
        this._showTimer.stop();
        this._hideTimer.stop();
        this._endPeek();
        this._unwatchApp();
        this._pin(null);
        this._popup.hideForDrag();
        if (!Main.overview.visible)
            Main.overview.show();
    }

    _close(animate) {
        // Cleared first: closing drops key focus from the popup, which
        // must not re-enter here through _onFocusElsewhere.
        this._keyboard = false;
        this._touch = false;
        this._showTimer.stop();
        this._hideTimer.stop();
        this._endPeek();
        this._unwatchApp();
        this._pin(null);
        this._popup?.close(animate);
    }

    _scheduleHide() {
        const started = GLib.get_monotonic_time() / 1000;
        const check = () => {
            if (!this._popup.isOpen || this._popup.hover || this._popup.icon.hover || this._keyboard)
                return;
            const [x, y] = global.get_pointer();
            if (GLib.get_monotonic_time() / 1000 - started < POINTER_TRAVEL_GRACE_MS &&
                this._popup.pointerInTravelCorridor(x, y)) {
                this._hideTimer.start(50, check);
                return;
            }
            this._close(true);
        };
        this._hideTimer.start(this._settings.get_int('hide-delay'), check);
    }

    _onCardHover(win) {
        if (!this._settings.get_boolean('peek-on-hover')) {
            this._endPeek();
            return;
        }

        if (win) {
            this._peekEndTimer.stop();
            if (this._peek.active)
                this._peek.peek(win); // already peeking: switch at once
            else
                this._peekTimer.start(this._settings.get_int('peek-delay'), () => this._peek.peek(win));
        } else {
            this._peekTimer.stop();
            if (this._peek.active)
                this._peekEndTimer.start(PEEK_END_DELAY_MS, () => this._peek.end());
        }
    }

    _endPeek() {
        this._peekTimer.stop();
        this._peekEndTimer.stop();
        this._peek?.end();
    }

    // Keeps the cards in sync when the app opens or closes windows while
    // the preview is showing.
    _watchApp(app, icon) {
        this._unwatchApp();
        const id = app.connect('windows-changed', () => this._refreshApp());
        this._appSignal = [app, id];
        this._appIcon = icon;
        this._iconDestroyId = icon.connect('destroy', () => this._close(false));
    }

    // Only the open app's windows matter; others moving between monitors
    // would rebuild the cards for nothing.
    _onWindowMonitorChanged(win) {
        if (this._appSignal?.[0].get_windows().includes(win))
            this._refreshApp();
    }

    _refreshApp() {
        if (!this._appSignal || !this._popup.isOpen || this._dragging)
            return;
        const [app] = this._appSignal;
        const windows = this._getWindows(app, this._appIcon);
        const extras = this._getExtras(app);
        if (windows.length === 0 && !extras.player) {
            this._close(true);
        } else {
            this._endPeek();
            this._popup.setWindows(windows, extras);
        }
    }

    _unwatchApp() {
        if (this._appSignal) {
            const [app, id] = this._appSignal;
            app.disconnect(id);
            this._appSignal = null;
        }
        if (this._iconDestroyId) {
            this._appIcon.disconnect(this._iconDestroyId);
            this._iconDestroyId = 0;
        }
        this._appIcon = null;
    }

    _pin(icon) {
        if (this._pinnedIcon === icon)
            return;
        this._unpinDock?.();
        this._pinnedIcon = icon;
        this._unpinDock = icon ? pinDock(icon) : null;
    }

    // The app's normal windows, oldest first, skipping helper windows
    // (tooltips, splash screens) that don't appear in the taskbar.
    _getWindows(app, icon) {
        const workspace = global.workspace_manager.get_active_workspace();
        const currentOnly = this._settings.get_boolean('current-workspace-only');
        const monitor = Main.layoutManager.findMonitorForActor(icon);
        const monitorOnly = this._settings.get_boolean('current-monitor-only');
        return app.get_windows()
            .filter(win => !win.skip_taskbar &&
                (!currentOnly || win.located_on_workspace(workspace)) &&
                (!monitorOnly || !monitor || win.get_monitor() === monitor.index))
            .sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
    }
}
