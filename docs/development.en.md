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

Test entry points generate synthetic geometric PDFs and a blank password test fixture. Generated fixtures are Git-ignored. UI tests use isolated temporary profiles and write to the ignored `test-results/` directory. Packages are written to `release/0.4.3/`. Building the macOS package requires macOS.

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
