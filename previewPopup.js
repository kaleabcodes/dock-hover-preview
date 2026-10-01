import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {MediaCard} from './contentCards.js';
import {playingWindowIndex} from './mediaMatch.js';
import {inTravelCorridor} from './previewGeometry.js';
import {debug} from './util.js';
import {WindowCard} from './windowCard.js';

const SLIDE_DISTANCE = 8;
const DARK_BACKGROUND = [28, 28, 30];
const LIGHT_BACKGROUND = [250, 250, 251];
const GAP_FROM_ICON = 8;
const SCREEN_FRACTION = 0.9; // how much of the screen edge the popup may use
const REFOCUS_TIMEOUT_US = 1000 * 1000;

/**
 * @typedef {object} Extras
 * @property {object|null} player   MPRIS player to show controls for
 */

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
        this._cards = new St.BoxLayout({style_class: 'dhp-cards'});
        this._scroll = new St.ScrollView({
            child: this._cards,
            enable_mouse_scrolling: false,
            overlay_scrollbars: false,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER,
        });
        this.add_child(this._scroll);
        this._scroll.connect('scroll-event', (_, event) => this._onScroll(event));
        for (const adjustment of [this._scroll.hadjustment, this._scroll.vadjustment])
            adjustment.connectObject('notify::value', () => this._clearCardHover(), this);
        // Key presses bubble up here from the focused card.
        this.connect('key-press-event', (_, event) => this._onKeyPress(event));

        // The real size is only known after layout (styles, fonts), so
        // re-place the popup whenever its size changes.
        this.connect('notify::size', () => {
            if (this._icon)
                this._reposition();
        });

        const settingsId = settings.connect('changed::background-opacity',
            () => this._syncBackground());
        this._syncBackground();
        this._scrollLater = 0;
        this._repositionLater = 0;
        this._refocus = null; // {index, until} after closing a window with Delete
        this.connect('destroy', () => {
            settings.disconnect(settingsId);
            this._cancelScrollIntoView();
            this._cancelReposition();
        });
    }

    get isOpen() {
        return this.visible && this._icon !== null;
    }

    get icon() {
        return this._icon;
    }

    /**
     * @param {Extras} [extras]  media controls
     */
    open(icon, app, windows, extras = {player: null}) {
        const wasOpen = this.isOpen;
        this._syncBackground(); // picks up a light/dark switch since last time
        this._icon = icon;
        this._app = app;
        this._side = getDockSide(icon);
        this._cards.orientation = this._side === St.Side.LEFT || this._side === St.Side.RIGHT
            ? Clutter.Orientation.VERTICAL
            : Clutter.Orientation.HORIZONTAL;

        if (!wasOpen || this._lastIcon !== icon) {
            this._scroll.hadjustment.value = 0;
            this._scroll.vadjustment.value = 0;
        }
        this._lastIcon = icon;

        this.setWindows(windows, extras);

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

    /**
     * @param {Meta.Window[]} windows
     * @param {Extras} [extras]
     */
    setWindows(windows, extras = this._extras ?? {player: null}) {
        this._extras = extras;
        this._clearCardHover();
        // Keep keyboard focus in the popup while its cards are replaced,
        // then give it to the card now in the same place.
        const focusedIndex = this._focusedCardIndex();
        if (focusedIndex >= 0)
            this.grab_key_focus();
        this._cancelScrollIntoView();
        this._cards.destroy_all_children();

        const monitor = Main.layoutManager.findMonitorForActor(this._icon);
        const vertical = this._cards.orientation === Clutter.Orientation.VERTICAL;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        // CSS lengths are logical pixels; monitor geometry is in stage pixels.
        // Bound both dimensions, including unusually tall media cards.
        const maxWidth = Math.floor(monitor.width * SCREEN_FRACTION / scale - 20);
        const maxHeight = Math.floor(monitor.height * SCREEN_FRACTION / scale - 20);
        this._scroll.style = `max-width: ${maxWidth}px; max-height: ${maxHeight}px;`;
        this._maxCardsLength = (vertical ? maxHeight : maxWidth) * scale;
        // With windows, the controls go inside the playing window's card;
        // only an app with no windows gets a separate media card.
        const playerWindow = extras.player
            ? playingWindowIndex(windows.map(w => w.get_title() ?? ''), extras.player.trackTitle,
                windows.findIndex(w => w.has_focus()))
            : -1;
        const previewWidth = Math.min(this._settings.get_int('preview-size'),
            monitor.width * SCREEN_FRACTION - 40 * scale,
            (monitor.height * SCREEN_FRACTION - 140 * scale) / 0.66);

        windows.forEach((win, index) => {
            const card = new WindowCard({
                win,
                app: this._app,
                maxWidth: previewWidth,
                settings: this._settings,
                onActivated: () => this.emit('window-activated'),
                player: index === playerWindow ? extras.player : null,
            });
            card.connect('notify::hover', () =>
                this.emit('card-hover-changed', card.hover ? win : null));
            // A card focused from the keyboard behaves like a hovered one.
            card.connect('key-focus-in', () => {
                this._scrollIntoView(card);
                card.syncTitleTooltip(); // scrolling hid it
                this.emit('card-hover-changed', win);
            });
            card.connect('key-focus-out', () => this.emit('card-hover-changed', null));
            this._cards.add_child(card);
        });

        if (extras.player && windows.length === 0)
            this._cards.add_child(new MediaCard(extras.player));

        this._syncScrollbar();
        this._reposition();
        // Sizes are only right once the new cards are styled, and cards
        // the same size as the last ones don't change the popup's size, so
        // notify::size wouldn't re-place it. Check both before drawing.
        if (!this._repositionLater) {
            this._repositionLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._repositionLater = 0;
                if (this._icon) {
                    this._syncScrollbar();
                    this._reposition();
                }
                return GLib.SOURCE_REMOVE;
            });
        }
        if (focusedIndex >= 0)
            this.focusCard(focusedIndex);
    }

    // Gives keyboard focus to a card (clamped to the ones there are).
    focusCard(index) {
        const cards = this._cards.get_children();
        if (cards.length === 0)
            return;
        const card = cards[clamp(index, 0, cards.length - 1)];
        // The standalone media card isn't focusable itself; its buttons are.
        if (card.can_focus)
            card.grab_key_focus();
        else
            card.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
    }

    // Closing a window from the keyboard can hand focus to another window,
    // which takes it away from the popup. Takes it back for the card now in
    // the closed one's place; returns whether it did.
    reclaimKeyFocus() {
        const refocus = this._refocus;
        this._refocus = null;
        if (!this.isOpen || !refocus || GLib.get_monotonic_time() > refocus.until)
            return false;
        this.focusCard(refocus.index);
        return true;
    }

    // Shows the scrollbar only when the cards don't fit: St's AUTOMATIC
    // policy showed one even when they fitted exactly (GNOME 50).
    _syncScrollbar() {
        const vertical = this._cards.orientation === Clutter.Orientation.VERTICAL;
        const [, length] = vertical
            ? this._cards.get_preferred_height(-1)
            : this._cards.get_preferred_width(-1);
        const policy = length > this._maxCardsLength ? St.PolicyType.AUTOMATIC : St.PolicyType.NEVER;
        this._scroll.hscrollbar_policy = vertical ? St.PolicyType.NEVER : policy;
        this._scroll.vscrollbar_policy = vertical ? policy : St.PolicyType.NEVER;
    }

    _cancelScrollIntoView() {
        if (this._scrollLater) {
            global.compositor.get_laters().remove(this._scrollLater);
            this._scrollLater = 0;
        }
    }

    _cancelReposition() {
        if (this._repositionLater) {
            global.compositor.get_laters().remove(this._repositionLater);
            this._repositionLater = 0;
        }
    }

    _focusedCardIndex() {
        const focus = global.stage.key_focus;
        return focus ? this._cards.get_children().findIndex(card => card.contains(focus)) : -1;
    }

    // Arrows along the popup move between cards, the arrow toward the dock
    // or Escape goes back to the icon, Tab moves through the buttons,
    // Delete closes the window. Enter and Space are handled by the card.
    _onKeyPress(event) {
        const key = event.get_key_symbol();
        const index = this._focusedCardIndex();
        const vertical = this._cards.orientation === Clutter.Orientation.VERTICAL;
        const rtl = !vertical && this._cards.get_text_direction() === Clutter.TextDirection.RTL;
        const previous = vertical ? Clutter.KEY_Up : rtl ? Clutter.KEY_Right : Clutter.KEY_Left;
        const next = vertical ? Clutter.KEY_Down : rtl ? Clutter.KEY_Left : Clutter.KEY_Right;

        switch (key) {
        case previous:
            this.focusCard(index - 1);
            break;
        case next:
            this.focusCard(index + 1);
            break;
        case Clutter.KEY_Home:
            this.focusCard(0);
            break;
        case Clutter.KEY_End:
            this.focusCard(this._cards.get_n_children() - 1);
            break;
        case Clutter.KEY_Escape:
        case keyTowardDock(this._side):
            this._icon?.grab_key_focus();
            break;
        case Clutter.KEY_Tab:
        case Clutter.KEY_ISO_Left_Tab: {
            const focus = global.stage.key_focus;
            const backward = key === Clutter.KEY_ISO_Left_Tab ||
                (event.get_state() & Clutter.ModifierType.SHIFT_MASK) !== 0;
            this.navigate_focus(focus === this ? null : focus,
                backward ? St.DirectionType.TAB_BACKWARD : St.DirectionType.TAB_FORWARD, true);
            break;
        }
        case Clutter.KEY_Delete:
        case Clutter.KEY_KP_Delete: {
            const card = this._cards.get_child_at_index(index);
            if (card?.closeWindow) {
                this._refocus = {index, until: GLib.get_monotonic_time() + REFOCUS_TIMEOUT_US};
                card.closeWindow();
            }
            break;
        }
        default:
            return Clutter.EVENT_PROPAGATE;
        }
        return Clutter.EVENT_STOP;
    }

    // Scrolls just enough to show a card, e.g. one reached with the arrows.
    _scrollIntoView(card) {
        this._cancelScrollIntoView();
        if (!card.has_allocation()) {
            // Freshly rebuilt cards aren't laid out yet.
            this._scrollLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._scrollLater = 0;
                if (card.has_allocation())
                    this._scrollIntoView(card);
                return GLib.SOURCE_REMOVE;
            });
            return;
        }
        const vertical = this._cards.orientation === Clutter.Orientation.VERTICAL;
        const adjustment = vertical ? this._scroll.vadjustment : this._scroll.hadjustment;
        const box = card.get_allocation_box();
        const [start, end] = vertical ? [box.y1, box.y2] : [box.x1, box.x2];
        if (start < adjustment.value)
            adjustment.value = start;
        else if (end > adjustment.value + adjustment.page_size)
            adjustment.value = end - adjustment.page_size;
    }

    close(animate = true) {
        this._clearCardHover();
        if (!this.visible)
            return;

        // A hidden card must not keep receiving keys.
        const focus = global.stage.key_focus;
        if (focus && this.contains(focus))
            global.stage.set_key_focus(null);

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
        this._cancelScrollIntoView();
        this._cancelReposition();
        this.hide();
        this._cards.destroy_all_children();
    }

    _clearCardHover() {
        for (const card of this._cards.get_children())
            card.hideTitleTooltip?.();
        this.emit('card-hover-changed', null);
    }

    _onScroll(event) {
        if (event.is_pointer_emulated())
            return Clutter.EVENT_STOP;
        const vertical = this._cards.orientation === Clutter.Orientation.VERTICAL;
        const adjustment = vertical ? this._scroll.vadjustment : this._scroll.hadjustment;
        let delta;
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP:
        case Clutter.ScrollDirection.LEFT:
            delta = -1;
            break;
        case Clutter.ScrollDirection.DOWN:
        case Clutter.ScrollDirection.RIGHT:
            delta = 1;
            break;
        case Clutter.ScrollDirection.SMOOTH: {
            const [dx, dy] = event.get_scroll_delta();
            delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
            break;
        }
        default:
            return Clutter.EVENT_PROPAGATE;
        }
        adjustment.value = clamp(adjustment.value + delta * 60,
            adjustment.lower, Math.max(adjustment.lower, adjustment.upper - adjustment.page_size));
        return Clutter.EVENT_STOP;
    }

    pointerInTravelCorridor(x, y) {
        if (!this.isOpen)
            return false;
        const [ix, iy] = this._icon.get_transformed_position();
        const [iw, ih] = this._icon.get_transformed_size();
        const [px, py] = this.get_transformed_position();
        const [pw, ph] = this.get_transformed_size();
        const side = {
            [St.Side.TOP]: 'top', [St.Side.BOTTOM]: 'bottom',
            [St.Side.LEFT]: 'left', [St.Side.RIGHT]: 'right',
        }[this._side];
        return inTravelCorridor({x, y}, {x: ix, y: iy, width: iw, height: ih},
            {x: px, y: py, width: pw, height: ph}, side,
            12 * St.ThemeContext.get_for_stage(global.stage).scale_factor);
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
        // Newly added or disappearing dock icons may not have a valid
        // transform yet. In particular, never feed NaN back into layout.
        if (![ix, iy, iw, ih, width, height].every(Number.isFinite))
            return;

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

// The arrow key pointing from the dock toward its popup, and back.
export function keyIntoPopup(icon) {
    return {
        [St.Side.TOP]: Clutter.KEY_Down,
        [St.Side.LEFT]: Clutter.KEY_Right,
        [St.Side.RIGHT]: Clutter.KEY_Left,
    }[getDockSide(icon)] ?? Clutter.KEY_Up;
}

function keyTowardDock(side) {
    return {
        [St.Side.TOP]: Clutter.KEY_Up,
        [St.Side.LEFT]: Clutter.KEY_Left,
        [St.Side.RIGHT]: Clutter.KEY_Right,
    }[side] ?? Clutter.KEY_Down;
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
