import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

const FADE_TIME_MS = 150;

// Window types that get faded; docks, desktop icons and menus are left alone.
const FADED_TYPES = new Set([
    Meta.WindowType.NORMAL,
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
    Meta.WindowType.UTILITY,
]);

// "Peek": fades out every other window on the workspace so one window can
// be seen in place, then restores them.
export class WindowPeek {
    constructor() {
        this._faded = new Map(); // window actor -> destroy signal id
        this._target = null;
    }

    get active() {
        return this._target !== null;
    }

    peek(win) {
        if (win === this._target)
            return;
        // A minimized window has nothing on screen to reveal.
        if (win.minimized) {
            this.end();
            return;
        }

        this._target = win;
        const workspace = global.workspace_manager.get_active_workspace();

        for (const actor of global.get_window_actors()) {
            const other = actor.meta_window;
            const fade = other !== win && !other.minimized &&
                FADED_TYPES.has(other.get_window_type()) &&
                other.located_on_workspace(workspace);

            if (fade)
                this._fade(actor);
            else
                this._restore(actor);
        }
    }

    end(animate = true) {
        this._target = null;
        for (const actor of [...this._faded.keys()])
            this._restore(actor, animate);
    }

    _fade(actor) {
        if (!this._faded.has(actor)) {
            this._faded.set(actor, actor.connect('destroy', () => this._faded.delete(actor)));
        }
        actor.ease({
            opacity: 0,
            duration: FADE_TIME_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _restore(actor, animate = true) {
        const id = this._faded.get(actor);
        if (id === undefined)
            return;
        actor.disconnect(id);
        this._faded.delete(actor);

        actor.remove_transition('opacity');
        if (animate) {
            actor.ease({
                opacity: 255,
                duration: FADE_TIME_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            actor.opacity = 255;
        }
    }
}
