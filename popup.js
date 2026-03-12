const ALLOWED_ORIGINS = new Set([
  'https://easyaff.vercel.app'
]);
const REMOTE_UI_BASE_URL = 'https://easyaff.vercel.app';

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.has(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
}

function initializeFooter() {
  const manifest = chrome.runtime.getManifest();
  const versionLabel = document.getElementById('extension-version');
  const buildLabel = document.getElementById('extension-build-label');
  const iframe = document.getElementById('remote-ui');

  if (versionLabel) {
    versionLabel.textContent = `v${manifest.version}`;
  }

  if (buildLabel) {
    buildLabel.textContent = `Build ${manifest.version}`;
  }

  if (iframe) {
    const remoteUrl = new URL(REMOTE_UI_BASE_URL);
    remoteUrl.searchParams.set('extensionVersion', manifest.version);
    iframe.src = remoteUrl.toString();
  }
}

document.addEventListener('DOMContentLoaded', initializeFooter);

window.addEventListener('message', (event) => {
  if (!isAllowedOrigin(event.origin)) {
    return;
  }

  if (event.data?.action !== 'sendPrompt' || !event.data.prompt) {
    return;
  }

  chrome.runtime.sendMessage({
    action: 'forwardToGrok',
    prompt: event.data.prompt,
    autoSubmit: event.data.autoSubmit !== false
  });
});
