// Run with: npm test
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {playerBelongsToApp} from '../mediaMatch.js';

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
