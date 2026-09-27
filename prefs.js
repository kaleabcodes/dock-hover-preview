import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const AUTHOR = 'Kaleab Tesfaye';
const EMAIL = 'kaleabcodes@gmail.com';

export default class DockHoverPreviewPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        // Keep the settings object alive as long as the window.
        window._settings = settings;

        window.add(this._behaviorPage(settings));
        window.add(this._appearancePage(settings));
        window.add(this._aboutPage(window));
    }

    _behaviorPage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'Behavior',
            icon_name: 'preferences-system-symbolic',
        });

        const timing = new Adw.PreferencesGroup({title: 'Timing'});
        timing.add(spinRow(settings, 'hover-delay', 'Hover delay',
            'Milliseconds to rest on an icon before the preview opens', 0, 2000, 50));
        timing.add(spinRow(settings, 'hide-delay', 'Hide delay',
            'Milliseconds the preview stays open after the pointer leaves', 0, 2000, 50));
        page.add(timing);

        const windows = new Adw.PreferencesGroup({title: 'Windows'});
        windows.add(switchRow(settings, 'current-workspace-only', 'Current workspace only',
            'Otherwise windows on other workspaces are shown with their workspace number'));
        windows.add(switchRow(settings, 'click-focused-minimizes', 'Click focused window to minimize',
            'Clicking the preview of the window that already has focus minimizes it'));
        windows.add(switchRow(settings, 'middle-click-close', 'Middle-click to close',
            'Middle-clicking a preview closes that window'));
        page.add(windows);

        const peek = new Adw.PreferencesGroup({
            title: 'Peek',
            description: 'Rest on a preview to fade out other windows and see it in place',
        });
        peek.add(switchRow(settings, 'peek-on-hover', 'Peek at window', null));
        const peekDelay = spinRow(settings, 'peek-delay', 'Peek delay',
            'Milliseconds to rest on a preview before peeking', 0, 3000, 50);
        settings.bind('peek-on-hover', peekDelay, 'sensitive', Gio.SettingsBindFlags.GET);
        peek.add(peekDelay);
        page.add(peek);

        return page;
    }

    _appearancePage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'Appearance',
            icon_name: 'applications-graphics-symbolic',
        });

        const preview = new Adw.PreferencesGroup({title: 'Previews'});
        preview.add(spinRow(settings, 'preview-size', 'Preview width',
            'Maximum width of each window thumbnail, in pixels', 100, 480, 10));
        preview.add(switchRow(settings, 'show-titles', 'Show window titles', null));
        preview.add(switchRow(settings, 'show-app-icon', 'Show app icon', null));
        preview.add(switchRow(settings, 'show-close-button', 'Show close button', null));
        page.add(preview);

        const style = new Adw.PreferencesGroup({title: 'Style'});
        style.add(spinRow(settings, 'background-opacity', 'Background opacity',
            'Popup background opacity, in percent', 0, 100, 5));
        style.add(spinRow(settings, 'animation-duration', 'Animation duration',
            'Milliseconds; 0 turns animations off', 0, 500, 25));
        page.add(style);

        const reset = new Adw.PreferencesGroup();
        const resetRow = new Adw.ButtonRow({title: 'Reset All Settings'});
        resetRow.add_css_class('destructive-action');
        resetRow.connect('activated', () => {
            for (const key of settings.settings_schema.list_keys())
                settings.reset(key);
        });
        reset.add(resetRow);
        page.add(reset);

        return page;
    }

    _aboutPage(window) {
        const page = new Adw.PreferencesPage({
            title: 'About',
            icon_name: 'help-about-symbolic',
        });

        const info = new Adw.PreferencesGroup({
            title: this.metadata.name,
            description: this.metadata.description,
        });
        info.add(new Adw.ActionRow({
            title: 'Version',
            subtitle: `${this.metadata.version}`,
        }));
        info.add(new Adw.ActionRow({title: 'Author', subtitle: AUTHOR}));
        page.add(info);

        const links = new Adw.PreferencesGroup({title: 'Contact'});
        links.add(linkRow(window, 'Website', this.metadata.url, this.metadata.url));
        links.add(linkRow(window, 'Email', EMAIL, `mailto:${EMAIL}`));
        page.add(links);

        return page;
    }
}

function linkRow(window, title, subtitle, uri) {
    const row = new Adw.ActionRow({title, subtitle, activatable: true});
    row.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
    row.connect('activated', () => new Gtk.UriLauncher({uri}).launch(window, null, null));
    return row;
}

function spinRow(settings, key, title, subtitle, min, max, step) {
    const row = Adw.SpinRow.new_with_range(min, max, step);
    row.set_title(title);
    if (subtitle)
        row.set_subtitle(subtitle);
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function switchRow(settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({title});
    if (subtitle)
        row.set_subtitle(subtitle);
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}
