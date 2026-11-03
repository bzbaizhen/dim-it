# Dim It - PDF Drawing Workbench

English · [简体中文](README.md) · [Download the latest release](https://github.com/bzbaizhen/dim-it/releases/latest)

An offline desktop tool for measuring PDF drawings. Calibrate the drawing with two points of a known dimension, then measure other distances. Built for everyday architectural, interior and engineering drawing checks on Windows and macOS.

![Dim It measurement workspace](docs/images/measurement-en.png)

## Download and install

Get the installer from [GitHub Releases](https://github.com/bzbaizhen/dim-it/releases).

| Platform            | Installation                                        |
| ------------------- | --------------------------------------------------- |
| Windows 10 / 11 x64 | Download the `.exe` and run the installation wizard |
| macOS Apple Silicon | Open the `.dmg` and drag Dim It into Applications   |

Current version is **0.4.1**. Installers are unsigned, so your operating system may show a publisher or security warning. Check the download source. macOS has been tested on actual hardware. Windows packages are cross-built and still require Windows hardware validation. The current macOS build is ARM64.

Choose **English** in the language selector at the top of the window or in the startup guide. The interface switches immediately and remembers your choice. Chinese is the default. Toolbars, measurement settings, calibration dialogs, snap and SmartTrack hints, the six-step guide and native application menus support both languages. Drawing content, filenames, user notes and measurement values are preserved.

## Core features

- **Open and navigate** local PDFs and `.planmeasure` projects. Drag and drop, page selection, pan, zoom and rotation. Files are processed locally.
- **Two-point calibration** from a known dimension and unit. Each page has its own scale. Recalibration updates measurements on that page.
- **Length measurements and annotations** with continuous two-point picking, notes, colors, deletion, undo and redo.
- **Metric and imperial units** including mm, inches, feet and fractional feet/inches to the nearest 1/16 inch.
- **Object snapping** to vector line endpoints, midpoints and finite-segment intersections, with green markers and point-type labels.
- **Shift SmartTrack** for horizontal or vertical measurement alignment using nearby reference points and purple tracking guides.
- **Save and export** editable projects containing the original PDF, scales and annotations. Export annotated PDFs or CSV lists with dimensions, millimeter values and notes.
- **Skippable quick start** with six illustrated steps, a launch preference and a help entry for reopening the guide.

### Calibrate and measure

1. Open a PDF and zoom into a known dimension.
2. Click Calibrate, pick both ends, and enter a value such as `6000` mm, `3 1/2` inch or `8' 6"`.
3. Click Length and pick the endpoints of another distance. Measurements appear in the list automatically.
4. Use Save project to save editable work, or Export for PDF and CSV output.

The workspace screenshot above uses a generated demo with a 6,000 mm reference and a 12,000 mm measurement.

### Highlighted snapping

Endpoints use a green square, midpoints a triangle and intersections a cross. Clicking uses the highlighted point's exact PDF coordinates. Press S to toggle snapping or hold Alt for temporary free picking.

![Midpoint snapping](docs/images/snapping.png)

### Shift SmartTrack

Pick a start point, hold Shift, then hover over a snap point for about 350 ms. Up to four recent reference points are retained. Purple dashed guides and a diamond indicate the orthogonal target. Click to confirm. Releasing Shift hides the guides temporarily, Esc cancels the current operation, and Alt permits free picking along the orthogonal direction.

![Orthogonal SmartTrack](docs/images/smarttrack.png)

### Quick start

The six-step illustrated guide appears on launch by default. Click Skip guide or press Esc to skip. Select Don't show on launch to remember your preference. Reopen it with Help in the top-right corner.

![Skippable startup guide](docs/images/quickstart-en.png)

## Keyboard shortcuts

| Action                                   | Shortcut                                  |
| ---------------------------------------- | ----------------------------------------- |
| Open / save project                      | Cmd / Ctrl + O / S                        |
| Calibrate / measure                      | C / M                                     |
| Select / pan                             | V / H                                     |
| Temporary pan                            | Space + drag, or middle mouse button      |
| Zoom                                     | Cmd / Ctrl + wheel, or + / -              |
| Orthogonal / SmartTrack                  | Hold Shift after choosing the start point |
| Toggle snapping / temporary free picking | S / Alt                                   |
| Undo / redo                              | Cmd / Ctrl + Z / Shift + Z                |
| Cancel / delete                          | Esc / Delete or Backspace                 |

Windows also supports Ctrl + Y for redo.

## Data and measurement limits

- One scale per page. Save separate projects for details with different scales on the same page. Scan distortion can affect measurements. Check against another known dimension.
- Automatic snapping uses vector straight lines and straight contour edges. Scanned images support manual calibration and picking.
- Local recovery retains the most recent work. Save a `.planmeasure` project before switching drawings.
- Exported PDF dimensions are drawn lines and text. Use the project file for continued editing. Notes are included in project and CSV files.
- Unlock encrypted PDFs in a reader before opening. The current measurement tool measures two-point lengths.
- The repository and installers contain no customer drawings, customer projects, real drawing screenshots or local work data. Documentation images use generated geometry and the built-in demo.

## Development

Use Node.js 24+ and npm. Dependencies are pinned through `package-lock.json`.

```bash
npm ci
npm run desktop
```

Use `npm run dev` for browser development. Desktop mode provides native open and save dialogs.

```bash
npm run build
npm test
npm run test:e2e
npm run package:mac
npm run package:win
```

Test entry points generate synthetic geometric PDFs and a blank password test fixture. Generated fixtures are Git-ignored. UI tests use isolated temporary profiles and write to the ignored `test-results/` directory. Packages are written to `release/0.4.1/`. Building the macOS package requires macOS.

## Implementation and status

React / TypeScript, PDF.js, pdf-lib and Electron. Points use native PDF coordinates, calibration stores millimeters per PDF coordinate unit, and display/export convert units. Existing PlanMeasure `.planmeasure` projects and local recovery data remain compatible.

Version 0.4.1 has passed a production build, 11 core tests and Electron workflow checks on Apple Silicon macOS, covering calibration, units, save/reopen, export, snapping, SmartTrack, quick start and failure recovery. Windows hardware validation remains open. The default source branch is `main`. Download binaries from the corresponding Release.
