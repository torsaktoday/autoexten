import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile, copyFile, rename, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const unpackedDir = path.join(distDir, 'unpacked');
const sourceFiles = [
  'background.js',
  'content-bridge.js',
  'content.js',
  'manifest.json',
  'popup.html',
  'popup.js'
];

const otaBaseUrl = process.env.OTA_BASE_URL?.replace(/\/+$/, '') || '';
const extensionId = process.env.EXTENSION_ID?.trim() || '';
const chromeBinary = process.env.CHROME_BINARY?.trim() || '';
const extensionKeyPath = process.env.EXTENSION_KEY_PATH?.trim() || '';
const requestedVersion = getRequestedVersion(process.argv.slice(2), process.env.APP_VERSION);

function getRequestedVersion(argv, appVersion) {
  const cliValue = argv.find((arg) => arg.startsWith('--version='))?.split('=')[1]
    || argv[argv.indexOf('--version') + 1];
  const version = (cliValue || appVersion || '').trim();

  if (!version) {
    return '';
  }

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('Version must use semantic format like 1.5.0.');
  }

  return version;
}

function ensureCommandSucceeded(result, errorMessage) {
  if (result.status !== 0) {
    throw new Error(`${errorMessage}\n${result.stderr || result.stdout || 'Unknown command failure.'}`);
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runCommand(command, args) {
  return spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: 'pipe'
  });
}

async function prepareDist() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(unpackedDir, { recursive: true });
}

async function syncVersionFiles(version) {
  if (!version) {
    return;
  }

  const packageJsonPath = path.join(rootDir, 'package.json');
  const manifestPath = path.join(rootDir, 'manifest.json');

  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  packageJson.version = version;
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.version = version;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function buildManifest() {
  const manifestPath = path.join(rootDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  if (otaBaseUrl) {
    manifest.update_url = `${otaBaseUrl}/updates.xml`;
  } else {
    delete manifest.update_url;
  }

  await writeFile(
    path.join(unpackedDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  return manifest;
}

async function copyExtensionFiles() {
  for (const file of sourceFiles) {
    if (file === 'manifest.json') {
      continue;
    }

    await copyFile(path.join(rootDir, file), path.join(unpackedDir, file));
  }
}

async function buildZip(artifactBaseName) {
  const zipPath = path.join(distDir, `${artifactBaseName}.zip`);
  const psCommand = [
    'Compress-Archive',
    '-Path',
    `'${path.join(unpackedDir, '*')}'`,
    '-DestinationPath',
    `'${zipPath}'`,
    '-Force'
  ].join(' ');

  const result = runCommand('powershell', ['-NoProfile', '-Command', psCommand]);
  ensureCommandSucceeded(result, 'Failed to create zip package.');
  return zipPath;
}

async function buildCrx(artifactBaseName) {
  if (!chromeBinary || !extensionKeyPath) {
    return null;
  }

  const result = runCommand(chromeBinary, [
    `--pack-extension=${unpackedDir}`,
    `--pack-extension-key=${extensionKeyPath}`
  ]);
  ensureCommandSucceeded(result, 'Failed to package CRX.');

  const generatedCrxPath = path.join(distDir, 'unpacked.crx');
  const outputCrxPath = path.join(distDir, `${artifactBaseName}.crx`);

  if (!(await exists(generatedCrxPath))) {
    throw new Error('Chrome packaging completed without producing dist/unpacked.crx.');
  }

  if (await exists(outputCrxPath)) {
    await rm(outputCrxPath, { force: true });
  }

  await rename(generatedCrxPath, outputCrxPath);
  return outputCrxPath;
}

async function writeUpdatesXml(version, artifactBaseName, hasCrx) {
  if (!otaBaseUrl || !extensionId || !hasCrx) {
    return null;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">\n  <app appid="${extensionId}">\n    <updatecheck codebase="${otaBaseUrl}/${artifactBaseName}.crx" version="${version}" />\n  </app>\n</gupdate>\n`;

  const updatesPath = path.join(distDir, 'updates.xml');
  await writeFile(updatesPath, xml, 'utf8');
  return updatesPath;
}

async function writeReleaseInfo(version, zipPath, crxPath, updatesPath) {
  const releaseInfo = {
    version,
    generatedAt: new Date().toISOString(),
    artifacts: {
      unpacked: unpackedDir,
      zip: zipPath,
      crx: crxPath,
      updatesXml: updatesPath
    },
    ota: {
      baseUrl: otaBaseUrl || null,
      extensionId: extensionId || null
    },
    notes: [
      'Self-hosted auto-update requires a CRX signed with the same PEM key.',
      'Chrome on Windows/macOS generally requires Chrome Web Store or enterprise-managed installation for seamless self-hosted updates.'
    ]
  };

  await writeFile(
    path.join(distDir, 'release-info.json'),
    `${JSON.stringify(releaseInfo, null, 2)}\n`,
    'utf8'
  );
}

async function main() {
  await syncVersionFiles(requestedVersion);
  await prepareDist();
  await copyExtensionFiles();
  const manifest = await buildManifest();
  const artifactBaseName = `grok-imagine-prompt-sender-${manifest.version}`;
  const zipPath = await buildZip(artifactBaseName);
  const crxPath = await buildCrx(artifactBaseName);
  const updatesPath = await writeUpdatesXml(manifest.version, artifactBaseName, Boolean(crxPath));

  await writeReleaseInfo(manifest.version, zipPath, crxPath, updatesPath);

  console.log(`Built extension ${manifest.version}`);
  console.log(`Unpacked: ${unpackedDir}`);
  console.log(`ZIP: ${zipPath}`);

  if (crxPath) {
    console.log(`CRX: ${crxPath}`);
  } else {
    console.log('CRX: skipped (set CHROME_BINARY and EXTENSION_KEY_PATH to enable)');
  }

  if (updatesPath) {
    console.log(`updates.xml: ${updatesPath}`);
  } else {
    console.log('updates.xml: skipped (requires OTA_BASE_URL, EXTENSION_ID, and CRX packaging)');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
