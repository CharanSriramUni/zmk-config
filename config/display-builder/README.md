# nice!view Builder

This is a local browser prototype for designing a constrained ZMK nice!view status screen.

Open `index.html` in a browser. No dev server or npm install is required.

The tool has three parts:

- A JSON widget config that is the source of truth.
- A browser preview renderer for vertical 68 x 160 designs and horizontal 160 x 68 designs.
- A starter C/LVGL generator for a custom ZMK status screen.

The generated C is intended as a starting point for a custom shield. It is not wired into the firmware build automatically.

Vertical mode treats the design canvas as 68 x 160 logical pixels and emits C that rotates the logical canvas into the nice!view panel's physical 160 x 68 framebuffer. If the output is rotated the wrong direction on hardware, change the generated `lv_canvas_transform` angle from `900` to `2700`.

## Model

Widgets are intentionally constrained so they can be rendered both in the browser and in firmware:

- `battery`
- `layerText`
- `bleProfiles`
- `wpmGraph`
- `label`
- `image`

Images are stored in the JSON config as data URL assets. The preview thresholds them into a 1-bit bitmap, and the generated C emits packed bitmap bytes plus a small draw loop. The image widget supports `contain`, `cover`, and `stretch` fit modes, plus threshold and invert controls.

React or another frontend framework can be layered on top later, but the durable API should stay as the JSON scene graph.
