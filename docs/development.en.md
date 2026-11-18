# Development and releases

[简体中文](development.md) · [Back to README](../README.en.md)

## Local development

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

Test entry points generate synthetic geometric PDFs and a blank password test fixture. Generated fixtures are Git-ignored. UI tests use isolated temporary profiles and write to the ignored `test-results/` directory. Packages are written to `release/<version>/`. Building the macOS package requires macOS.

## 2026-11-18 Dim It 0.5.0 stable

The stable release rebuilds beta.9 with the same application behavior and project formats. The production build, 46 unit tests, 12 desktop workflows and targeted packaged Mac checks passed. The Mac ARM64 installer is Developer ID signed and notarized. The Windows x64 NSIS installer was cross-built and unpacked to verify its version and resources. Native Windows testing is pending.

Local installers and the SHA-256 list are in `release/0.5.0/`. Validation logs are under `test-results/release-0.5.0-*.log`. [Download 0.5.0](https://github.com/bzbaizhen/dim-it/releases/tag/v0.5.0)

## 2026-11-18 Tab and thin lines after changing drawings

Mouse page navigation, page shortcuts and opening a drawing return focus to the canvas. Activating a page button with Enter keeps keyboard navigation in the page list. Opening a PDF recreates its canvases so the thin-line setting controls actual stroke width.

Both failures reproduced in beta.8. In beta.9, the build, 46 unit tests and 12 virtual-display desktop workflows pass. The packaged application passed the two targeted workflows. 0.5.0-beta.9 is a GitHub prerelease.

## 2026-11-18 Persistent core shortcuts

In beta.8, the toolbar shows the current shortcuts for calibration, line and curve measurements, fill, text markup, revision and snapping. The bilingual toolbar fits on one row at 1480 pixels, and all seven default hints remain visible at 1000×650. Workbench and shortcut rebinding tests passed on the virtual display with both the built source and the packaged app. Beta.8 is installed at `/Applications/Dim It.app`. The signature and SHA-256 match the verified package. The beta.7 backup is at `release/0.5.0-beta.8/installed-backup/Dim It.app`.

## 2026-11-18 workbench layout and performance

In 0.5.0-beta.7, Appearance sits at the top of the inspector. Text, background and border accept preset colors and typed 0–100% opacity independently. The app remembers new-item styles per tool, with a reset for the current tool. Page thumbnails and the current-page list share a count of measurements, fills, markup and revisions. The toolbar packs more tightly at narrower widths, with shortcuts available in tooltips.

Thumbnails render as they approach the visible area. Text layout is reused for unchanged markup. Curves export as a continuous path with round joins. Local recovery retains a complete drawing checkpoint and updates a small matching record after edits and page changes. Use Save Project to make a portable copy with the latest edits for an earlier build.

Installed locally on macOS. The production build, 46 unit tests, 12 desktop workflows on a virtual display, and an installed-app check passed. The 96-page fixture renders 6 thumbnails initially. Forty pointer moves over 500 text annotations triggered 860,000 text-width measurements before the change and zero after. Editing the 128 MiB recovery fixture writes only the small state record, with synchronous submission dropping from around 28.1 ms to below timer resolution. Installed assets match the signed package. The previous bundle is at `release/0.5.0-beta.7/installed-backup/Dim It.app`. Evidence is under `test-results/workbench-*`.

On macOS, run on a separate virtual display with an isolated profile. Set `DIMIT_TEST_DISPLAY` to that display ID and run `npm run test:e2e`. The app checks the window placement and shows it without activation.

## 2026-11-18 unified annotation appearance

Line and curve measurements, region fills, text markup and revision clouds share the compact color swatch and 0–100% opacity slider, live preview and undo. Text markup exposes independent rows for text, background and border. Drawing tools use their defaults until an item is selected. Line and curve measurements share defaults.

Measurement and revision opacity are optional project fields. Existing measurements and revisions use 100% opacity when the field is absent. Canvas and PDF rendering apply opacity to lines, dimension labels and revision tags. Project format versions remain v1 through v4.

Version 0.5.0-beta.6 is installed at `/Applications/Dim It.app` and running. The previous drawing restored successfully. Dimension, fill, revision and markup controls were verified in the installed interface. The build, 46 unit tests and all 11 Electron workflows pass, covering project reopen, PDF opacity and both languages at 1000×650. Signature integrity passed and installed assets match the tested build. Evidence is in `test-results/appearance-unified-result.json` and `appearance-unified-*.log`. Recovery uses `release/0.5.0-beta.5/mac-arm64/Dim It.app`.

## 2026-11-17 annotation appearance

The compact follow-up aligns color and opacity in a single row, reduces section spacing and font-size control height, moves HEX values into swatch tooltips and aligns region opacity horizontally. The markup appearance panel measures 197px high. Both languages fit the 1000×650 window without horizontal overflow, retaining at least 55px of slider width. The build, 46 unit tests and annotation, fill and language workflows pass. Version 0.5.0-beta.5 is installed and running, with its compact layout visually verified, installed resources matched to the build and signature integrity checked. Evidence is in `test-results/appearance-compact-result.json`, `appearance-compact-*.log` and `annotations-appearance-compact-minimum-en.png`. Recovery uses `release/0.5.0-beta.4/mac-arm64/Dim It.app`.

The dedicated Appearance section groups text, background and border colors and opacity, font size, region fill settings and revision color. Content editing sits above appearance. Controls cover new-box defaults, live previews, atomic slider undo, project reopen and PDF export. Optional MarkupStyle fields extend v4 projects, with legacy white backgrounds at 94% opacity and original annotation colors.

The build, 46 unit tests and complete 11-suite Electron regression pass. Coverage includes three independent channels, full transparency, atomic slider undo, defaults for new boxes, legacy v4 files, all page orientations, project reopen and PDF fill/border/text alpha. Version 0.5.0-beta.4 is installed at `/Applications/Dim It.app` and running. The installed-app workflow passes, with the version and all color/opacity controls read back from the actual interface. Installed resources match the verified build and signature integrity passes. This batch is complete. Evidence is in `test-results/appearance-result.json`, `appearance-*.log`, `annotations-appearance.png` and `annotations*.pdf`. Recovery uses `release/0.5.0-beta.3/mac-arm64/Dim It.app`.

## 2026-11-17 snap-settings hover blanking

The 0.5.0-beta.2 blanking issue was reproduced. The full-window dismissal button inherited the general button hover background, becoming opaque `rgb(234, 240, 245)` and covering the workspace. Its hover/active styles now retain transparency and disable pressed-state translation.

The new regression failed on the prior build and passed after the fix. It covers moving over multiple drawing positions with settings open, pressing and releasing, dismissal, canvas visibility and renderer errors. The complete snap-settings workflow and 45 unit tests passed. Before/after images are `test-results/snap-settings-hover-before.png` and `snap-settings-hover.png`, with `snap-hover-red.log`, `snap-hover-green.log` and `snap-hover-packaged.log` as evidence. The packaged 0.5.0-beta.3 workflow passed. It is installed at `/Applications/Dim It.app` and running, with its version read back and the drawing visually confirmed beneath the open settings panel. The fix is complete. Verification is summarized in `test-results/snap-hover-result.json`. The prior build is retained at `release/0.5.0-beta.2/mac-arm64/Dim It.app` for recovery.

## 2026-11-17 snap-settings development batch

This batch provides combinable End, Mid, Int, Near, Perp and Tan modes with persisted preferences and existing S/Alt/Shift and SmartTrack behavior. Defaults remain End, Mid and Int. Only, right-click isolation, Select all, Clear and Reset defaults are supported. Perp and Tan use the picked start point during calibration, line measurement and subsequent polygon vertices. Near acts as a fallback for discrete snaps.

Original quadratic/cubic Bézier controls feed a spatial index and numerical roots for curve Near, Perp and Tan. Mid reuses adaptive half-arc-length subdivision. Int targets finite straight segments. All 45 unit tests and the complete 11-suite Electron regression passed. A read-only review found no required fixes, with 12,000 constructed true tangent/perpendicular probes passing.

Candidate and verification records are in `test-results/snap-candidate.json`, `snap-regression-result.json`, `snap-regression.log` and `snap-review.md`. The 0.5.0-beta.2 packaged workflow passed. The app is installed at `/Applications/Dim It.app` and running, with its version and six snap options read back from the actual interface. The installed `app.asar` matches the tested source and signature integrity checks passed. Required batch work is complete. Usage is in `docs/usage.en.md`. The previous installation is retained at `release/0.5.0-beta.1/installed-backup/Dim It.app`. The local test package follows the Ad Hoc build commands below.

## 2026-11-17 text and revision batch

The batch covers creating, editing, moving, resizing, saving, reopening and exporting text markup and revision clouds. Shortcuts 5 / 6 integrate with colors, deletion, undo/redo, language settings and native menus. Projects containing these annotations use v4. Versions v1 through v3 remain readable. Exported text uses high-resolution images, while borders, clouds and revision triangles stay vector-based.

The local production build and 34 unit tests passed. All 10 Electron workflow suites passed individually, covering the new tools and existing measurement, fills, curves, snapping, SmartTrack, onboarding and shortcuts. A subpixel coincidence issue exposed by toolbar wrapping was fixed and the fill workflow passed again. Curve hover preview timed out once and passed on an independent rerun. Synthetic export and screenshot evidence is in `test-results/annotations*.pdf` and `test-results/annotations-*.png`.

The local test version is **0.5.0-beta.1**, installed at `/Applications/Dim It.app` and launched on 2026-11-17. The installed ARM64 app passed the text/revision, project persistence and PDF export workflow. Its `app.asar` hash matches the packaged source and signature integrity checks passed. It uses an Ad Hoc local test signature. The current public Release is 0.4.3. Developer ID publishing and Windows hardware validation remain open.

Build the local test app with the installed Electron distribution using the following commands. Ad Hoc test builds disable Hardened Runtime to allow local framework loading across differing Team IDs.

```sh
npm run build
npx --no-install electron-builder --mac dir --arm64 --config.electronDist=node_modules/electron/dist --config.mac.identity=- --config.mac.hardenedRuntime=false
```

## Mac signing and notarization

Install a `Developer ID Application` certificate with its private key in the local Keychain. Store notarization credentials using the interactive command below, which prompts for your Apple ID, Team ID and app-specific password.

```sh
xcrun notarytool store-credentials dim-it-notary
npm run package:mac:signed
```

The signed ARM64 build is written to `release/<version>/mac-signed/`. It enables Hardened Runtime, signs and notarizes the app and DMG, staples tickets, checks Gatekeeper acceptance and writes SHA-256 checksums. Missing certificates or invalid notarization credentials stop the build. Set `APPLE_KEYCHAIN_PROFILE` to use another profile and `CSC_NAME` to select among multiple signing identities. Private keys and notarization credentials stay in the local Keychain. Releases indicate which artifacts have actually been published.

On 2026-11-05, the local 0.4.3 ARM64 app and DMG passed signing, notarization and ticket validation. Gatekeeper reports `Notarized Developer ID`. The signed app passed the bilingual, calibration, measurement and persistence workflow. The signed installer is available on GitHub Releases.

## Implementation and 0.4.3 validation record

React / TypeScript, PDF.js, pdf-lib and Electron. Points use native PDF coordinates, calibration stores millimeters per PDF coordinate unit, and display/export convert units. Existing PlanMeasure `.planmeasure` projects and local recovery data remain compatible.

Version 0.4.3 was validated on Apple Silicon Mac with a production build, 29 unit tests, nine Electron workflow suites and a smoke run of the final packaged Mac app. Coverage includes custom shortcuts, region fills, thin-line display, measurement, calibration, save/reopen, export, snapping, SmartTrack and bilingual onboarding. Both packages were checked for version, bundled resource consistency, customer drawing exclusion and SHA-256 integrity. The DMG structure was verified. Windows hardware validation remains open. The default source branch is `main`. Download binaries from the corresponding Release.
