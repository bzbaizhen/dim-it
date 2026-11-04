import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Arch, build, Platform } from 'electron-builder';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
assert.equal(process.platform, 'darwin', 'Mac signing requires macOS.');

const profile = process.env.APPLE_KEYCHAIN_PROFILE || 'dim-it-notary';
const keychainArgs = process.env.APPLE_KEYCHAIN ? ['--keychain', process.env.APPLE_KEYCHAIN] : [];
const identityOutput = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
const identities = [...identityOutput.matchAll(/\b([A-F0-9]{40}) "(Developer ID Application: [^"\r\n]+)"/g)]
  .filter((identity) => !process.env.CSC_NAME || identity[0].includes(process.env.CSC_NAME));
assert.equal(identities.length, 1, 'Install one valid Developer ID Application certificate with its private key. Use CSC_NAME to select a certificate if several exist.');

// v26 can silently skip notarization, so require a validated Keychain profile first.
assert.ok(!process.env.APPLE_ID && !process.env.APPLE_APP_SPECIFIC_PASSWORD && !process.env.APPLE_API_KEY,
  'This local workflow uses a Keychain profile. Unset Apple ID / API key environment variables.');
process.env.APPLE_KEYCHAIN_PROFILE = profile;
execFileSync('xcrun', ['notarytool', 'history', '--keychain-profile', profile, ...keychainArgs], { stdio: 'pipe' });

const packageData = JSON.parse(readFileSync('package.json', 'utf8'));
const output = path.resolve('release', packageData.version, 'mac-signed');
rmSync(path.join(output, 'SHA256SUMS.txt'), { force: true });
execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
const artifacts = await build({
  targets: Platform.MAC.createTarget(['dmg'], Arch.arm64),
  publish: 'never',
  config: {
    ...packageData.build,
    directories: { ...packageData.build.directories, output },
    forceCodeSigning: true,
    mac: {
      ...packageData.build.mac,
      identity: identities[0][1],
      hardenedRuntime: true,
      entitlements: 'build/entitlements.mac.plist',
      entitlementsInherit: 'build/entitlements.mac.plist',
      // Chromium language resources are sealed by the framework's resource signature.
      signIgnore: ['\\.pak$'],
      notarize: true,
    },
    dmg: { ...packageData.build.dmg, sign: true, writeUpdateInfo: false },
  },
});

const app = path.join(output, 'mac-arm64', `${packageData.build.productName}.app`);
execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
execFileSync('xcrun', ['stapler', 'validate', app], { stdio: 'inherit' });
execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose=2', app], { stdio: 'inherit' });
const dmgs = artifacts.filter((artifact) => artifact.endsWith('.dmg'));
assert.equal(dmgs.length, 1, 'Expected one signed ARM64 DMG.');
const dmg = dmgs[0];
execFileSync('codesign', ['--verify', '--strict', '--verbose=2', dmg], { stdio: 'inherit' });
const notarization = JSON.parse(execFileSync('xcrun', [
  'notarytool', 'submit', dmg, '--keychain-profile', profile, ...keychainArgs,
  '--wait', '--output-format', 'json', '--no-progress', '--no-s3-acceleration',
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));
console.log(JSON.stringify(notarization));
assert.equal(notarization.status, 'Accepted', `DMG notarization failed. Inspect submission ${notarization.id}.`);
execFileSync('xcrun', ['stapler', 'staple', dmg], { stdio: 'inherit' });
execFileSync('xcrun', ['stapler', 'validate', dmg], { stdio: 'inherit' });
execFileSync('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', dmg], { stdio: 'inherit' });
execFileSync('hdiutil', ['verify', dmg], { stdio: 'inherit' });
const digest = createHash('sha256').update(readFileSync(dmg)).digest('hex');
writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${digest}  ${path.basename(dmg)}\n`);
console.log(`Signed and notarized installer verified: ${dmg}`);
