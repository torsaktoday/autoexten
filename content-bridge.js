const ALLOWED_ORIGINS = new Set([
  'https://easyaff.vercel.app'
]);

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.has(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
}

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
