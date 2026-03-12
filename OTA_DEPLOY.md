# OTA Deploy

## Build

```powershell
npm run build
```

If the app was updated and you want the extension package to use the same version number:

```powershell
npm run release -- --version=1.5.0
```

Or pass the app version from your deploy pipeline:

```powershell
$env:APP_VERSION='1.5.0'
npm run build
```

Artifacts will be generated in `dist/`:

- `dist/unpacked` for manual load in Developer Mode
- `dist/grok-imagine-prompt-sender-<version>.zip` for distribution
- `dist/release-info.json` with artifact metadata

## Enable CRX + updates.xml

Set these environment variables before running the build:

```powershell
$env:OTA_BASE_URL='https://your-domain.example/extensions/grok'
$env:EXTENSION_ID='your_extension_id'
$env:CHROME_BINARY='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:EXTENSION_KEY_PATH='C:\keys\grok-extension.pem'
npm run build
```

When all required values are present, the build also creates:

- `dist/grok-imagine-prompt-sender-<version>.crx`
- `dist/updates.xml`

## Deployment notes

- The `.crx`, `updates.xml`, and any assets they reference must be published under the same `OTA_BASE_URL`.
- The installed extension must keep the same PEM key so the extension ID does not change.
- Chrome on Windows/macOS typically allows seamless self-hosted updates only in enterprise-managed scenarios. For general public distribution, Chrome Web Store is the reliable path.
- The side panel footer shows the extension version from `manifest.json`, so after version sync/build the footer updates automatically.
