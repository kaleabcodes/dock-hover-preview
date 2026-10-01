import assert from 'node:assert/strict';
import {test} from 'node:test';
import {inTravelCorridor} from '../previewGeometry.js';

const icon = {x: 400, y: 700, width: 48, height: 48};
const popup = {x: 150, y: 400, width: 700, height: 260};

test('diagonal travel stays protected without covering adjacent dock icons', () => {
    assert.ok(inTravelCorridor({x: 424, y: 695}, icon, popup, 'bottom'));
    assert.ok(inTravelCorridor({x: 310, y: 680}, icon, popup, 'bottom'));
    assert.ok(inTravelCorridor({x: 760, y: 663}, icon, popup, 'bottom'));
    assert.ok(!inTravelCorridor({x: 760, y: 695}, icon, popup, 'bottom'));
    assert.ok(!inTravelCorridor({x: 480, y: 720}, icon, popup, 'bottom'));
    assert.ok(!inTravelCorridor({x: 100, y: 680}, icon, popup, 'bottom'));
    assert.ok(!inTravelCorridor({x: 424, y: 800}, icon, popup, 'bottom'));
});

test('corridor works for all dock edges and monitors with negative coordinates', () => {
    const point = {x: 310, y: 680};
    const transforms = [
        ['bottom', p => p, r => r],
        ['top', p => ({x: p.x, y: -p.y}), r => ({...r, y: -r.y - r.height})],
        ['right', p => ({x: p.y, y: p.x}), r => ({x: r.y, y: r.x, width: r.height, height: r.width})],
        ['left', p => ({x: -p.y, y: p.x}), r => ({x: -r.y - r.height, y: r.x, width: r.height, height: r.width})],
    ];
    for (const [side, transformPoint, transformRect] of transforms)
        assert.ok(inTravelCorridor(transformPoint(point), transformRect(icon), transformRect(popup), side), side);
});

test('overlapping or touching surfaces need no travel corridor', () => {
    assert.ok(!inTravelCorridor({x: 424, y: 700}, icon,
        {...popup, y: 440}, 'bottom'));
    assert.ok(!inTravelCorridor({x: 424, y: 700}, icon,
        {...popup, y: 460}, 'bottom'));
});
