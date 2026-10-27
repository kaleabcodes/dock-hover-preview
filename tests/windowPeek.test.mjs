import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

// Run the actual peek state machine with window actors in place of GI objects.
const source = readFileSync(new URL('../windowPeek.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace('export class WindowPeek', 'this.WindowPeek = class WindowPeek');

function desktop() {
    const workspace = {};
    const actors = [];
    const context = vm.createContext({
        Clutter: {AnimationMode: {EASE_OUT_QUAD: 0}},
        Meta: {WindowType: {NORMAL: 0, DIALOG: 1, MODAL_DIALOG: 2, UTILITY: 3}},
        global: {
            workspace_manager: {get_active_workspace: () => workspace},
            get_window_actors: () => actors,
        },
    });
    vm.runInContext(source, context);
    function window({here = true, minimized = false, opacity = 255, mapped = true} = {}) {
        const signals = new Map();
        const win = {
            minimized,
            located_on_workspace: current => here && current === workspace,
            get_window_type: () => 0,
            get_compositor_private: () => mapped ? actor : null,
        };
        const actor = {
            meta_window: win,
            opacity,
            connect: (name, callback) => { signals.set(name, callback); return name; },
            disconnect: id => signals.delete(id),
            ease: params => { actor.opacity = params.opacity; params.onStopped?.(true); },
            remove_transition: () => {},
            destroy: () => { signals.get('destroy')?.(); actors.splice(actors.indexOf(actor), 1); },
        };
        actors.push(actor);
        return actor;
    }
    return {peek: new context.WindowPeek(), window};
}

test('peek only reveals windows visible on the active workspace', () => {
    for (const options of [{here: false}, {minimized: true}, {mapped: false}]) {
        const {peek, window} = desktop();
        const current = window();
        const target = window(options);
        peek.peek(target.meta_window);
        assert.equal(current.opacity, 255);
        assert.equal(peek.active, false);
    }
});

test('interrupted restoration keeps the original opacity during rapid target changes', () => {
    const {peek, window} = desktop();
    const first = window({opacity: 220});
    const second = window({opacity: 180});
    second.ease = params => { second.opacity = params.opacity / 2; };
    peek.peek(first.meta_window);
    peek.peek(second.meta_window); // restoration has only reached opacity 90
    peek.peek(first.meta_window); // fade it again before restoration finishes
    peek.end(false);
    assert.equal(second.opacity, 180);
});

test('switching peek targets and ending restores each original opacity', () => {
    for (const animate of [true, false]) {
        const {peek, window} = desktop();
        const first = window({opacity: 220});
        const second = window({opacity: 180});
        const elsewhere = window({here: false});
        peek.peek(first.meta_window);
        assert.equal(second.opacity, 0);
        assert.equal(elsewhere.opacity, 255);
        peek.peek(second.meta_window);
        assert.equal(first.opacity, 0);
        assert.equal(second.opacity, 180);
        peek.end(animate);
        assert.equal(first.opacity, 220);
        assert.equal(second.opacity, 180);
        assert.equal(peek.active, false);
    }
});

test('an invisible target ends an existing peek and destroyed actors are released', () => {
    const {peek, window} = desktop();
    const target = window();
    const other = window({opacity: 200});
    peek.peek(target.meta_window);
    peek.peek(window({here: false}).meta_window);
    assert.equal(other.opacity, 200);
    assert.equal(peek.active, false);
    peek.peek(target.meta_window);
    other.destroy();
    assert.doesNotThrow(() => peek.end(false));
});
