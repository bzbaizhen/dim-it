# Detailed usage

[简体中文](usage.md) · [Back to README](../README.en.md)

## Calibrate and measure

1. Open a PDF and zoom into a known dimension.
2. Click Calibrate, pick both ends, and enter a value such as `6000` mm, `3 1/2` inch or `8' 6"`.
3. Click Length and pick the endpoints of another distance. Measurements appear in the list automatically.
4. Use Save project to save editable work, or Export for PDF and CSV output.

The README workspace screenshot uses a generated demo with a 6,000 mm reference and a 12,000 mm measurement.

## Arc and curve length

Choose Curve length, hover over an existing vector arc or curve to preview its full path and length, then click to record it. Consecutive Bézier segments are measured together. Straight lines, disconnected subpaths and PDF drawing-object boundaries end the chain. Closed curves measure their full perimeter. Zoom and rotation preserve the measured dimension.

Lengths follow the actual PDF path using adaptive numerical subdivision. Scanned images and curves already converted into straight polylines cannot be detected automatically. Picking selects the whole curve chain.

![Whole-path curve measurement](images/curve-length.png)

Curve annotations support notes, color and opacity, undo, recalibration and PDF / CSV export. Projects containing curves use v2 and require version 0.4.2 or later. Version 0.4.3 continues to read v1 and v2 projects.

## Highlighted snapping

Open the dropdown beside Snap and check the modes to combine. Use Only or right-click a mode to enable it alone. Preferences are saved locally. End, Mid and Int are enabled by default.

| Mode | Target |
| --- | --- |
| End | Endpoints of lines and curves |
| Mid | Line midpoint or halfway along the full curve length |
| Int | Intersection of finite straight segments |
| Near | Closest point on a line or curve, used when no other enabled snap is valid |
| Perp | Foot of a perpendicular from the picked start point to a line or curve |
| Tan | Contact point of a tangent from the picked start point to a curve |

Perp and Tan require a picked start point and work during calibration, line measurement and subsequent polygon vertices. Curve Near, Perp and Tan use the PDF's original quadratic or cubic Bézier controls. Curve Mid uses the existing adaptive subdivision for half-arc-length placement. Int continues to target finite straight segments.

Green markers and labels identify the active snap, and clicking saves its PDF coordinates. S suspends or restores snapping, Alt temporarily bypasses it, Clear permits free picking, and Reset defaults restores the original three modes. Changing modes clears existing temporary SmartTrack references. Raster-only pages support manual picking.

![Midpoint snapping](images/snapping.png)

## Shift SmartTrack

Pick a start point, hold Shift, then hover over a snap point for about 350 ms. Up to four recent reference points are retained. Purple dashed guides and a diamond indicate the orthogonal target. Click to confirm. Releasing Shift hides the guides temporarily, Esc cancels the current operation, and Alt permits free picking along the orthogonal direction.

![Orthogonal SmartTrack](images/smarttrack.png)

## Region fills and editing

Press **3** to fill a region. With an empty draft, hold the left mouse button and move more than 5 screen pixels to preview a rectangle, then release to finish. A click begins a polygon. Click more vertices, then close with Enter, a double-click, or a click on the first vertex after at least three valid vertices. Dragging within an active polygon adds a vertex. Backspace removes the last point. Escape cancels the draft, then returns to Select on the next press.

![Rectangle and polygon fills](images/region-fill-en.png)

Use the palette and opacity control for new regions. Select a region to edit its color, opacity, note or vertices. Rectangle edits fix the opposite corner and retain right angles. Zero-area and self-intersecting edits restore the original shape. Clicking overlapping fills selects the topmost region. The list also selects underlying regions. Dimensions render above fills. Drawing, a vertex drag and an opacity adjustment each create one undo step.

Polygons support snapping, Shift orthogonal constraints and SmartTrack. Middle-mouse pan, Space-drag and zoom preserve drafts. Page changes and tool switches end unfinished drafts. Finish or cancel a draft before saving/exporting. PDF export includes Multiply-blended fills. CSV continues to list lengths. Projects containing regions use **v3 and require version 0.4.3 or later**.

## Text markup and revision clouds

Press **5** or choose Text markup, drag a text box, then enter text in the sidebar. Chinese, multiple paragraphs and automatic wrapping are supported. A single click places a default-sized box. Click away or press **Mod+Enter** to commit text. Escape cancels the current text edit. Box height grows to accommodate text.

The Appearance section provides font size and independent color and opacity for text, background and border. Legacy markup retains its original white background and annotation color.

Press **6** or choose Revision cloud and drag a cloud box. Edit the triangular revision label (1 to 8 characters) and revision description in the sidebar. New clouds default to the next numeric label.

Both tools are available immediately. Select a box to move it or resize it using its four corner handles. Double-click or press E to edit text or a revision label. Delete, undo and redo are supported. Annotations follow page zoom and rotation and are created in the current page orientation.

Project files retain editable boxes, text, revision labels and descriptions. Projects containing text or revisions use **v4 and require a version supporting these tools**. The current implementation continues to read v1 through v3 projects. PDF exports include text boxes, clouds and revision labels. Text is rendered as high-resolution images for offline Unicode support, with vector borders. Revision descriptions are retained in the project. CSV exports contain measurement lengths.

## Appearance settings

Line and curve measurements, region fills, text markup and revision clouds use the same Appearance section. Click a swatch to choose a color and drag the slider on the same row to set opacity. A value of 0% is fully transparent and 100% is fully opaque. Presets set the primary annotation color, which is the text color for markup.

Changes made before drawing set the tool's defaults. Line and curve measurements share their defaults. With an annotation selected, changes apply to that item. Sliders preview changes live and create one undo step on release. Project files and PDF exports retain styles. Legacy dimensions and revision clouds without an opacity setting use 100% opacity.

## Tab thin-line display

Press **Tab** on the canvas or click Thin lines to toggle between original and uniform thin stroke widths, including while calibrating, measuring, selecting or drawing a region. Vector paths retain their original centerlines and snap coordinates through zoom and rotation. Raster images, filled shapes and ordinary filled text retain their appearance. Stroked or outlined text may also appear thinner. PDF exports retain original drawing widths. Tab within fields and dialogs moves focus.

![Thin-line display](images/thin-lines-en.png)

## Quick start

The six-step illustrated guide appears on launch by default. Click Skip guide or press Esc to skip. Select Don't show on launch to remember your preference. Reopen it with Help in the top-right corner.

![Skippable startup guide](images/quickstart-en.png)

## Shortcut settings

Default bindings are listed in the README. [Shortcut reference](../README.en.md#shortcuts)

![Grouped shortcut settings](images/shortcuts-en.png)

Each action supports a primary and one alternate binding. Clear individual bindings or confirm a complete reset. Single keys and Mod/Shift combinations are supported. Conflicts identify the existing action. System/window and text-editing combinations are protected. Fields, selects and IME composition retain native editing. Only zoom, undo and redo repeat when held. Capture suspends workbench actions. Escape cancels capture. Closing settings resumes the current drawing. Preferences are stored locally, with a session-only warning if storage fails.

Select and Pan remain available through mouse controls. Middle-mouse or Space-drag pans temporarily. Shift enables orthogonal constraints and SmartTrack. Alt temporarily bypasses snapping. Pressing 1 or 2 on an uncalibrated page starts calibration and returns to the requested tool afterward. Text buttons show their current bindings and icon buttons show them on hover. Page navigation, view controls, export and settings entries update together. Native menus and the quick-start guide read the same configuration.
