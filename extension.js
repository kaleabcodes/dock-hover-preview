import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {PreviewController} from './previewController.js';

export default class DockHoverPreviewExtension extends Extension {
    enable() {
        this._controller = new PreviewController(this.getSettings());
    }

    disable() {
        this._controller.destroy();
        this._controller = null;
    }
}
