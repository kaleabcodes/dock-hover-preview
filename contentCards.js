// Media controls for an app that's playing music or video.
//
// If the app has windows, a compact row of controls goes inside the playing
// window's card (see previewPopup.js); only an app with no windows (e.g.
// Spotify in the background) gets a standalone MediaCard, so the same track
// is never shown twice.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

const CARD_WIDTH = 240;
const CARD_ART_SIZE = 96;
const ROW_ART_SIZE = 32;

// Album art, title, artist and ⏮ ⏯ ⏭, kept in sync with the player.
// `compact`: one row (art, text, buttons) for inside a window card;
// otherwise a column for the standalone card.
export const MediaControls = GObject.registerClass(
class MediaControls extends St.BoxLayout {
    _init(player, {compact}) {
        super._init({
            style_class: compact ? 'dhp-media-row' : 'dhp-media-column',
            orientation: compact ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        this._player = player;

        this._art = new St.Icon({
            style_class: 'dhp-media-art',
            icon_size: compact ? ROW_ART_SIZE : CARD_ART_SIZE,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const align = compact ? Clutter.ActorAlign.START : Clutter.ActorAlign.CENTER;
        this._title = label('dhp-media-title', align);
        this._artist = label('dhp-media-artist', align);

        const text = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: compact,
            y_align: Clutter.ActorAlign.CENTER,
        });
        text.add_child(this._title);
        text.add_child(this._artist);

        const buttons = new St.BoxLayout({
            style_class: 'dhp-media-controls',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._prev = button('media-skip-backward-symbolic', 'Previous', () => player.previous());
        this._playPause = button('media-playback-start-symbolic', 'Play or pause', () => player.playPause());
        this._playPause.add_style_class_name('dhp-media-play');
        this._next = button('media-skip-forward-symbolic', 'Next', () => player.next());
        buttons.add_child(this._prev);
        buttons.add_child(this._playPause);
        buttons.add_child(this._next);

        this.add_child(this._art);
        this.add_child(text);
        this.add_child(buttons);

        player.connectObject('changed', () => this._sync(), this);
        this._sync();
    }

    _sync() {
        const p = this._player;
        this._art.gicon = coverIcon(p.trackCoverUrl);
        this._title.text = p.trackTitle || 'Unknown title';
        this._artist.text = (p.trackArtists ?? []).join(', ');
        this._artist.visible = this._artist.text.length > 0;
        this._playPause.child.icon_name = p.status === 'Playing'
            ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        this._prev.reactive = p.canGoPrevious;
        this._next.reactive = p.canGoNext;
        this._prev.opacity = p.canGoPrevious ? 255 : 100;
        this._next.opacity = p.canGoNext ? 255 : 100;
    }
});

// The standalone card, for a player whose app has no windows.
export const MediaCard = GObject.registerClass(
class MediaCard extends St.Bin {
    _init(player) {
        super._init({
            style_class: 'dhp-card dhp-media',
            width: CARD_WIDTH,
            reactive: true,
            track_hover: true,
            child: new MediaControls(player, {compact: false}),
        });
    }
});

// The album art, or a music icon when there's none or a local file is
// missing (remote art, e.g. Spotify's https URLs, is loaded by GIO).
function coverIcon(url) {
    if (url) {
        const file = Gio.File.new_for_uri(url);
        if (!file.is_native() || file.query_exists(null))
            return new Gio.FileIcon({file});
    }
    return new Gio.ThemedIcon({name: 'audio-x-generic-symbolic'});
}

function label(styleClass, xAlign) {
    const l = new St.Label({style_class: styleClass, x_align: xAlign});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}

function button(iconName, accessibleName, onClick) {
    const b = new St.Button({
        style_class: 'dhp-media-button',
        can_focus: true,
        accessible_name: accessibleName,
        child: new St.Icon({icon_name: iconName}),
    });
    b.connect('clicked', onClick);
    return b;
}
