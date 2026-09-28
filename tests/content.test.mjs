// Run with: npm test
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {playerBelongsToApp, playingWindowIndex} from '../mediaMatch.js';

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

test('media controls go in the playing window, else the focused one', () => {
    const titles = ['Downloads', 'Astrid S - Breathe - VLC media player'];
    assert.equal(playingWindowIndex(titles, 'Breathe', -1), 1);
    assert.equal(playingWindowIndex(titles, 'breathe', 0), 1, 'title match beats focus');
    assert.equal(playingWindowIndex(titles, 'Other Song', 0), 0);
    assert.equal(playingWindowIndex(titles, '', 1), 1);
    assert.equal(playingWindowIndex(titles, 'Other', -1), 0);
    assert.equal(playingWindowIndex([], 'x', -1), -1);
});
