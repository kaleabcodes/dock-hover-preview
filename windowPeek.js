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
        this._faded = new Map(); // window actor -> {id, opacity}
        this._target = null;
    }

    get active() {
        return this._target !== null;
    }

    peek(win) {
        if (win === this._target)
            return;
        const workspace = global.workspace_manager.get_active_workspace();
        // Only fade the desktop when the target can actually be seen here.
        if (win.minimized || !win.located_on_workspace(workspace) ||
            !win.get_compositor_private()) {
            this.end();
            return;
        }

        this._target = win;
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
            this._faded.set(actor, {
                id: actor.connect('destroy', () => this._faded.delete(actor)),
                opacity: actor.opacity,
            });
        }
        actor.ease({
            opacity: 0,
            duration: FADE_TIME_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _restore(actor, animate = true) {
        const saved = this._faded.get(actor);
        if (!saved)
            return;
        actor.remove_transition('opacity');
        const finish = () => {
            actor.disconnect(saved.id);
            this._faded.delete(actor);
        };
        if (animate) {
            actor.ease({
                opacity: saved.opacity,
                duration: FADE_TIME_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                // Keep the saved opacity if another peek interrupts restoration.
                onStopped: finished => {
                    if (finished)
                        finish();
                },
            });
        } else {
            actor.opacity = saved.opacity;
            finish();
        }
    }
}
