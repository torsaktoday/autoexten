const COMPOSER_SELECTORS = [
  'textarea',
  'form textarea',
  '[role="textbox"][contenteditable="true"]',
  '[contenteditable="true"][data-lexical-editor="true"]'
];
const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'button[aria-label*="send" i]',
  'button[aria-label*="generate" i]',
  'button[aria-label*="create" i]',
  'button[data-testid*="send" i]',
  'button[data-testid*="submit" i]'
];
const MAX_PENDING_PROMPT_AGE_MS = 10 * 60 * 1000;
const COMPOSER_WAIT_TIMEOUT_MS = 30000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePromptPayload(promptValue) {
  if (typeof promptValue === 'string') {
    return {
      text: promptValue.trim(),
      autoSubmit: true
    };
  }

  return {
    text: typeof promptValue?.text === 'string' ? promptValue.text.trim() : '',
    autoSubmit: promptValue?.autoSubmit !== false,
    createdAt: promptValue?.createdAt
  };
}

function isPromptFresh(promptPayload) {
  if (!promptPayload.createdAt) {
    return true;
  }

  return Date.now() - promptPayload.createdAt <= MAX_PENDING_PROMPT_AGE_MS;
}

function getComposer() {
  for (const selector of COMPOSER_SELECTORS) {
    const element = document.querySelector(selector);
    if (element && !element.disabled) {
      return element;
    }
  }

  return null;
}

async function waitForComposer(timeoutMs = COMPOSER_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const composer = getComposer();
    if (composer) {
      return composer;
    }

    await sleep(250);
  }

  throw new Error('Prompt composer was not found on Grok Imagine.');
}

function setNativeValue(element, value) {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const prototype = element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (nativeSetter) {
      nativeSetter.call(element, value);
      return;
    }

    element.value = value;
    return;
  }

  if (element.isContentEditable) {
    element.textContent = value;
  }
}

function dispatchComposerEvents(element) {
  element.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    data: null,
    inputType: 'insertText'
  }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function findSubmitButtonNearComposer(composer) {
  const scopedRoots = [
    composer.closest('form'),
    composer.closest('[role="dialog"]'),
    composer.parentElement,
    document
  ].filter(Boolean);

  for (const root of scopedRoots) {
    for (const selector of SUBMIT_SELECTORS) {
      const button = root.querySelector(selector);
      if (button && !button.disabled) {
        return button;
      }
    }
  }

  const buttons = Array.from(document.querySelectorAll('button'));
  return buttons.reverse().find((button) => {
    if (button.disabled) {
      return false;
    }

    const label = `${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`.toLowerCase();
    return button.querySelector('svg') || /send|generate|create|submit/.test(label);
  }) ?? null;
}

async function submitPrompt(composer) {
  await sleep(300);

  const submitButton = findSubmitButtonNearComposer(composer);
  if (submitButton) {
    submitButton.click();
    return true;
  }

  composer.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  }));
  composer.dispatchEvent(new KeyboardEvent('keyup', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  }));

  return true;
}

async function fillPrompt(promptValue) {
  const promptPayload = parsePromptPayload(promptValue);
  if (!promptPayload.text) {
    throw new Error('Prompt is empty.');
  }

  const composer = await waitForComposer();
  composer.focus();
  setNativeValue(composer, promptPayload.text);
  dispatchComposerEvents(composer);

  if (promptPayload.autoSubmit) {
    await submitPrompt(composer);
  }

  return true;
}

async function handlePendingPrompt() {
  const { pendingPrompt } = await chrome.storage.local.get(['pendingPrompt']);
  if (!pendingPrompt) {
    return;
  }

  const promptPayload = parsePromptPayload(pendingPrompt);
  if (!promptPayload.text || !isPromptFresh(promptPayload)) {
    await chrome.storage.local.remove('pendingPrompt');
    return;
  }

  try {
    await fillPrompt(promptPayload);
    await chrome.storage.local.remove('pendingPrompt');
  } catch (error) {
    console.warn('Failed to process pending prompt from storage:', error);
  }
}

handlePendingPrompt().catch((error) => {
  console.warn('Unable to process pending prompt on page load:', error);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.action !== 'fillPrompt') {
    return false;
  }

  fillPrompt(request.prompt)
    .then(async () => {
      await chrome.storage.local.remove('pendingPrompt');
      sendResponse({ ok: true });
    })
    .catch((error) => {
      console.error('Failed to fill prompt:', error);
      sendResponse({ ok: false, error: error.message });
    });

  return true;
});
