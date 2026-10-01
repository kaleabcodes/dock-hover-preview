import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {MediaControls} from './contentCards.js';
import {Timer} from './util.js';

const MIN_CARD_WIDTH = 140;
const MIN_MEDIA_CARD_WIDTH = 230;
const THUMBNAIL_ASPECT = 0.66; // max height relative to max width
const APP_ICON_SIZE = 16;
const MINIMIZED_OPACITY = 150;

// One window in the popup: header (app icon, title, workspace badge, close
// button) above a live thumbnail.
//
// Left click focuses the window (or minimizes it if it already has focus,
// when enabled); middle click or Delete closes it (middle click only when
// enabled). Enter and Space act like a left click.
export const WindowCard = GObject.registerClass(
class WindowCard extends St.Button {
    /**
     * @param {object} params
     * @param {object|null} [params.player]  media player shown in this card
     *     (the playing window of an app that's playing)
     */
    _init({win, app, maxWidth, settings, onActivated, player = null}) {
        super._init({
            style_class: 'dhp-card',
            can_focus: true,
            track_hover: true,
            button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
        });
        this.window = win;
        this._settings = settings;
        this._onActivated = onActivated;
        this._signals = []; // [object, id]
        this._titleTimer = new Timer();
        this._titleTooltip = null;
        this._title = null;
        this.accessible_name = win.get_title() ?? '';
        this._connect(win, 'notify::title', () => {
            this.accessible_name = win.get_title() ?? '';
            this.hideTitleTooltip();
        });

        const thumbnail = createThumbnail(win, maxWidth, maxWidth * THUMBNAIL_ASPECT);
        // Room for the media row (art, title, three buttons) when it's shown.
        const cardWidth = Math.max(thumbnail.width, player ? MIN_MEDIA_CARD_WIDTH : MIN_CARD_WIDTH);

        const content = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL});
        const header = this._createHeader(win, app, cardWidth);
        if (header)
            content.add_child(header);
        content.add_child(new St.Bin({
            style_class: 'dhp-thumbnail',
            child: thumbnail,
            width: cardWidth,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        if (player) {
            const controls = new MediaControls(player, {compact: true});
            controls.width = cardWidth;
            content.add_child(controls);
        }
        this.set_child(content);

        this._connect(global.display, 'notify::focus-window', () => this._syncFocused());
        this._syncFocused();

        this.connect('clicked', (_, button) => this._onClicked(button));
        this.connect('key-focus-in', () => this.syncTitleTooltip());
        this.connect('key-focus-out', () => this.syncTitleTooltip());
        this.connect('destroy', () => {
            this.hideTitleTooltip();
            this._signals.forEach(([obj, id]) => obj.disconnect(id));
            this._signals = [];
        });
    }

    _createHeader(win, app, width) {
        const s = this._settings;
        const header = new St.BoxLayout({style_class: 'dhp-card-header', width});

        if (s.get_boolean('show-app-icon'))
            header.add_child(app.create_icon_texture(APP_ICON_SIZE));

        if (s.get_boolean('show-titles')) {
            const title = new St.Label({
                style_class: 'dhp-title',
                text: win.get_title() ?? '',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
                reactive: true,
                track_hover: true,
            });
            title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            this._connect(win, 'notify::title', () => title.set_text(win.get_title() ?? ''));
            title.connect('notify::hover', () => this.syncTitleTooltip());
            this._title = title;
            header.add_child(title);
        } else {
            header.add_child(new St.Widget({x_expand: true}));
        }

        // When windows from all workspaces are listed, mark the ones that
        // live elsewhere with their workspace number.
        const workspace = win.get_workspace();
        const active = global.workspace_manager.get_active_workspace();
        if (!s.get_boolean('current-workspace-only') && workspace && workspace !== active &&
            !win.is_on_all_workspaces()) {
            header.add_child(new St.Label({
                style_class: 'dhp-badge',
                text: `${workspace.index() + 1}`,
                y_align: Clutter.ActorAlign.CENTER,
            }));
        }

        if (s.get_boolean('show-close-button')) {
            const close = new St.Button({
                style_class: 'dhp-close',
                child: new St.Icon({icon_name: 'window-close-symbolic'}),
                y_align: Clutter.ActorAlign.CENTER,
            });
            close.connect('clicked', () => this.closeWindow());
            header.add_child(close);
        }

        // Nothing but the spacer: drop the header entirely.
        return header.get_n_children() > 1 ? header : null;
    }

    // The full title of a truncated one, shortly after the pointer rests
    // on it or the card gets keyboard focus.
    syncTitleTooltip() {
        const wanted = () => this._title && (this._title.hover || this.has_key_focus());
        this.hideTitleTooltip();
        if (!wanted())
            return;
        this._titleTimer.start(500, () => {
            if (wanted() && this._title.clutter_text.get_layout().is_ellipsized())
                this._showTitleTooltip(this._title);
        });
    }

    _showTitleTooltip(title) {
        const monitor = Main.layoutManager.findMonitorForActor(this);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const margin = 8 * scale;
        const tooltip = new St.Label({
            style_class: 'dhp-title-tooltip',
            text: this.window.get_title() ?? '',
            reactive: false,
        });
        if (Main.getStyleVariant() === 'light')
            tooltip.add_style_class_name('dhp-light');
        tooltip.clutter_text.line_wrap = true;
        tooltip.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        tooltip.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._titleTooltip = tooltip;
        Main.layoutManager.addTopChrome(tooltip);
        const [, naturalWidth] = tooltip.get_preferred_width(-1);
        tooltip.width = Math.min(naturalWidth, 480 * scale, monitor.width - 2 * margin);
        const [, height] = tooltip.get_preferred_height(tooltip.width);
        const [tx, ty] = title.get_transformed_position();
        const [tw, th] = title.get_transformed_size();
        const x = Math.max(monitor.x + margin,
            Math.min(tx + tw / 2 - tooltip.width / 2,
                monitor.x + monitor.width - tooltip.width - margin));
        let y = ty - height - margin;
        if (y < monitor.y + margin)
            y = ty + th + margin;
        y = Math.max(monitor.y + margin, Math.min(y, monitor.y + monitor.height - height - margin));
        tooltip.set_position(Math.round(x), Math.round(y));
    }

    hideTitleTooltip() {
        this._titleTimer.stop();
        if (this._titleTooltip) {
            Main.layoutManager.removeChrome(this._titleTooltip);
            this._titleTooltip.destroy();
            this._titleTooltip = null;
        }
    }

    _onClicked(button) {
        if (button === Clutter.BUTTON_MIDDLE) {
            if (this._settings.get_boolean('middle-click-close'))
                this.closeWindow();
            return;
        }

        const win = this.window;
        if (win.has_focus() && !win.minimized &&
            this._settings.get_boolean('click-focused-minimizes'))
            win.minimize();
        else
            Main.activateWindow(win);
        this._onActivated();
    }

    closeWindow() {
        this.window.delete(global.get_current_time());
    }

    _syncFocused() {
        if (this.window.has_focus())
            this.add_style_pseudo_class('focused');
        else
            this.remove_style_pseudo_class('focused');
    }

    _connect(obj, signal, callback) {
        this._signals.push([obj, obj.connect(signal, callback)]);
    }
});

// A live, scaled copy of the window, cropped to its visible frame (the
// window actor also contains shadows and invisible resize borders).
function createThumbnail(win, maxWidth, maxHeight) {
    const frame = win.get_frame_rect();
    const buffer = win.get_buffer_rect();
    const scale = Math.min(maxWidth / frame.width, maxHeight / frame.height, 1);

    const thumbnail = new Clutter.Actor({
        width: Math.round(frame.width * scale),
        height: Math.round(frame.height * scale),
        clip_to_allocation: true,
    });

    const windowActor = win.get_compositor_private();
    if (windowActor) {
        thumbnail.add_child(new Clutter.Clone({
            source: windowActor,
            x: Math.round((buffer.x - frame.x) * scale),
            y: Math.round((buffer.y - frame.y) * scale),
            width: Math.round(buffer.width * scale),
            height: Math.round(buffer.height * scale),
        }));
    }

    if (win.minimized)
        thumbnail.opacity = MINIMIZED_OPACITY;

    return thumbnail;
}
