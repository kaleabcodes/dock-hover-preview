// Extra cards next to the window previews: media controls for an app that's
// playing, and the files the app opened recently.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

const ART_SIZE = 96;
const CARD_WIDTH = 240;
const FILE_ICON_SIZE = 20;

// Album art, title, artist and ⏮ ⏯ ⏭, kept in sync with the player.
export const MediaCard = GObject.registerClass(
class MediaCard extends St.BoxLayout {
    _init(player) {
        super._init({
            style_class: 'dhp-card dhp-media',
            orientation: Clutter.Orientation.VERTICAL,
            width: CARD_WIDTH,
            reactive: true,
            track_hover: true,
        });
        this._player = player;

        this._art = new St.Icon({style_class: 'dhp-media-art', icon_size: ART_SIZE, x_align: Clutter.ActorAlign.CENTER});
        this._title = label('dhp-media-title');
        this._artist = label('dhp-media-artist');

        const controls = new St.BoxLayout({style_class: 'dhp-media-controls', x_align: Clutter.ActorAlign.CENTER});
        this._prev = button('media-skip-backward-symbolic', 'Previous', () => player.previous());
        this._playPause = button('media-playback-start-symbolic', 'Play or pause', () => player.playPause());
        this._playPause.add_style_class_name('dhp-media-play');
        this._next = button('media-skip-forward-symbolic', 'Next', () => player.next());
        controls.add_child(this._prev);
        controls.add_child(this._playPause);
        controls.add_child(this._next);

        this.add_child(this._art);
        this.add_child(this._title);
        this.add_child(this._artist);
        this.add_child(controls);

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

// "Recent" list: click a file to open it again in the same app.
export const RecentCard = GObject.registerClass(
class RecentCard extends St.BoxLayout {
    _init(app, paths, onOpened) {
        super._init({
            style_class: 'dhp-card dhp-recent',
            orientation: Clutter.Orientation.VERTICAL,
            width: CARD_WIDTH,
        });
        this.add_child(new St.Label({text: 'Recent', style_class: 'dhp-recent-header'}));

        for (const path of paths) {
            const row = new St.Button({style_class: 'dhp-recent-row', can_focus: true, x_expand: true});
            const box = new St.BoxLayout({style_class: 'dhp-recent-box', x_expand: true});
            const [type] = Gio.content_type_guess(path, null);
            const isFolder = GLib.file_test(path, GLib.FileTest.IS_DIR);
            box.add_child(new St.Icon({
                gicon: Gio.content_type_get_icon(isFolder ? 'inode/directory' : type),
                icon_size: FILE_ICON_SIZE,
            }));
            const name = label('dhp-recent-name');
            name.text = GLib.path_get_basename(path);
            name.x_expand = true;
            name.x_align = Clutter.ActorAlign.START;
            name.y_align = Clutter.ActorAlign.CENTER;
            box.add_child(name);
            row.set_child(box);
            row.connect('clicked', () => {
                const file = Gio.File.new_for_path(path);
                try {
                    app.get_app_info().launch([file], global.create_app_launch_context(0, -1));
                } catch {
                    Gio.AppInfo.launch_default_for_uri(file.get_uri(), global.create_app_launch_context(0, -1));
                }
                onOpened();
            });
            this.add_child(row);
        }
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

function label(styleClass) {
    const l = new St.Label({style_class: styleClass, x_align: Clutter.ActorAlign.CENTER});
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
