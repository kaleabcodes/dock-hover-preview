import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {IconTracker, hideIconLabel, pinDock} from './iconTracker.js';
import {PreviewPopup} from './previewPopup.js';
import {Timer, debug} from './util.js';
import {WindowPeek} from './windowPeek.js';

// Short grace period so moving between two cards doesn't flash the peek.
const PEEK_END_DELAY_MS = 80;

// Decides when the preview opens and closes:
// - resting on a running app's icon for `hover-delay` opens it;
// - moving to another icon while open switches immediately;
// - leaving both the icon and the popup closes it after `hide-delay`;
// - clicking the icon, opening its menu, picking a window, switching
//   workspace or opening the overview closes it at once.
// While open, resting on a card for `peek-delay` peeks at that window.
export default class DockHoverPreviewExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._showTimer = new Timer();
        this._hideTimer = new Timer();
        this._peekTimer = new Timer();
        this._peekEndTimer = new Timer();
        this._peek = new WindowPeek();
        this._pinnedIcon = null;
        this._unpinDock = null;
        this._appSignal = null; // [app, id] while open

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
        });

        Main.overview.connectObject('showing', () => this._close(false), this);
        global.workspace_manager.connectObject('active-workspace-changed',
            () => this._close(false), this);
    }

    disable() {
        this._showTimer.stop();
        this._close(false);
        this._peek.end(false);

        this._tracker.destroy();
        this._tracker = null;

        Main.overview.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);

        Main.layoutManager.removeChrome(this._popup);
        this._popup.destroy();
        this._popup = null;

        this._peek = null;
        this._settings = null;
    }

    _onIconEnter(icon, app) {
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
        this._showTimer.stop();
        if (this._popup.isOpen)
            this._scheduleHide();
    }

    _open(icon, app) {
        const windows = this._getWindows(app);
        debug(`open ${app.get_id()}: ${windows.length} window(s)`);
        if (windows.length === 0) {
            // Not running here: let the dock show its usual name tooltip.
            this._close(true);
            return;
        }

        this._endPeek();
        this._watchApp(app, icon);
        this._pin(icon);
        hideIconLabel(icon);
        this._popup.open(icon, app, windows);
    }

    _close(animate) {
        this._hideTimer.stop();
        this._endPeek();
        this._unwatchApp();
        this._pin(null);
        this._popup?.close(animate);
    }

    _scheduleHide() {
        this._hideTimer.start(this._settings.get_int('hide-delay'), () => this._close(true));
    }

    _onCardHover(win) {
        if (!this._settings.get_boolean('peek-on-hover'))
            return;

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
        const id = app.connect('windows-changed', () => {
            const windows = this._getWindows(app);
            if (windows.length === 0) {
                this._close(true);
            } else if (this._popup.icon === icon) {
                this._endPeek();
                this._popup.setWindows(windows);
            }
        });
        this._appSignal = [app, id];
    }

    _unwatchApp() {
        if (this._appSignal) {
            const [app, id] = this._appSignal;
            app.disconnect(id);
            this._appSignal = null;
        }
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
    _getWindows(app) {
        const workspace = global.workspace_manager.get_active_workspace();
        const currentOnly = this._settings.get_boolean('current-workspace-only');
        return app.get_windows()
            .filter(win => !win.skip_taskbar &&
                (!currentOnly || win.located_on_workspace(workspace)))
            .sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
    }
}
