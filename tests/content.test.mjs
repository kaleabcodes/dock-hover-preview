// Run with: npm test
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {playerBelongsToApp} from '../mediaMatch.js';
import {execMatchesApp, parseRecentFiles, recentPathsForApp} from '../recentFiles.js';

const XBEL = `<?xml version="1.0"?>
<xbel>
<bookmark href="file:///home/me/a.txt" added="x" modified="2026-09-01T10:00:00Z" visited="x">
  <info><metadata><bookmark:applications>
    <bookmark:application name="org.gnome.Nautilus" exec="&apos;gnome-text-editor %U&apos;" modified="x" count="1"/>
  </bookmark:applications></metadata></info>
</bookmark>
<bookmark href="file:///home/me/Movies/film%201.mkv" added="x" modified="2026-09-02T10:00:00Z" visited="x">
  <info><metadata><bookmark:applications>
    <bookmark:application name="org.gnome.Nautilus" exec="&apos;/usr/bin/flatpak run --branch=stable --arch=x86_64 --command=/app/bin/vlc --file-forwarding org.videolan.VLC --started-from-file @@u %U @@&apos;" modified="x" count="1"/>
  </bookmark:applications></metadata></info>
</bookmark>
<bookmark href="file:///home/me/Pictures/p.png" added="x" modified="2026-08-01T10:00:00Z" visited="x">
  <info><metadata><bookmark:applications>
    <bookmark:application name="loupe" exec="&apos;loupe %u&apos;" modified="x" count="1"/>
    <bookmark:application name="gnome-shell" exec="&apos;gio open %u&apos;" modified="x" count="1"/>
  </bookmark:applications></metadata></info>
</bookmark>
<bookmark href="https://example.com" added="x" modified="2026-09-09T10:00:00Z" visited="x"></bookmark>
</xbel>`;

test('parses recent files, newest first, local only, with exec lines', () => {
    const files = parseRecentFiles(XBEL);
    assert.deepEqual(files.map(f => f.path), ['/home/me/Movies/film 1.mkv', '/home/me/a.txt', '/home/me/Pictures/p.png']);
    assert.equal(files[1].execs[0], 'gnome-text-editor %U');
    assert.equal(files[2].execs.length, 2);
});

test('matches apps by program, flatpak id or app id; not by launcher name', () => {
    const textEditor = {desktopId: 'org.gnome.TextEditor.desktop', executable: 'gnome-text-editor'};
    const vlc = {desktopId: 'org.videolan.VLC.desktop', executable: '/usr/bin/flatpak'};
    const files = {desktopId: 'org.gnome.Nautilus.desktop', executable: 'nautilus'};
    const all = parseRecentFiles(XBEL);
    assert.deepEqual(recentPathsForApp(all, textEditor), ['/home/me/a.txt']);
    assert.deepEqual(recentPathsForApp(all, vlc), ['/home/me/Movies/film 1.mkv']);
    assert.deepEqual(recentPathsForApp(all, files), [], 'Files only launched them');
    assert.ok(execMatchesApp('org.gnome.Nautilus %u', files));
    assert.ok(!execMatchesApp('gio open %u', textEditor));
});

test('media players match their app', () => {
    const spotify = {desktopId: 'com.spotify.Client.desktop', pids: [10]};
    const brave = {desktopId: 'com.brave.Browser.desktop', pids: [20]};
    assert.ok(playerBelongsToApp({busName: 'org.mpris.MediaPlayer2.spotify', desktopEntry: null, pid: null}, spotify));
    assert.ok(playerBelongsToApp({busName: 'org.mpris.MediaPlayer2.x', desktopEntry: 'com.spotify.Client', pid: null}, spotify));
    assert.ok(playerBelongsToApp({busName: 'org.mpris.MediaPlayer2.brave.instance55', desktopEntry: null, pid: null}, brave));
    assert.ok(playerBelongsToApp({busName: 'org.mpris.MediaPlayer2.chromium.instance1', desktopEntry: null, pid: 20}, brave));
    assert.ok(!playerBelongsToApp({busName: 'org.mpris.MediaPlayer2.spotify', desktopEntry: null, pid: null}, brave));
    assert.ok(!playerBelongsToApp({busName: 'org.mpris.MediaPlayer2.instance9', desktopEntry: null, pid: null}, brave));
});
