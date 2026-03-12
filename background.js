
const GROK_URL_PATTERN = '*://grok.com/*';
const GROK_IMAGINE_URL = 'https://grok.com/imagine';
const MESSAGE_FORWARD = 'forwardToGrok';
const MESSAGE_FILL = 'fillPrompt';
const TAB_LOAD_TIMEOUT_MS = 30000;

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Failed to configure side panel:', error));

function normalizePrompt(prompt) {
  return typeof prompt === 'string' ? prompt.trim() : '';
}

function toPromptPayload(request) {
  const text = normalizePrompt(request.prompt);

  if (!text) {
    throw new Error('Prompt is empty.');
  }

  return {
    text,
    autoSubmit: request.autoSubmit !== false,
    createdAt: Date.now()
  };
}

async function storePendingPrompt(promptPayload) {
  await chrome.storage.local.set({ pendingPrompt: promptPayload });
}

async function findExistingGrokTab() {
  const tabs = await chrome.tabs.query({ url: GROK_URL_PATTERN });
  return tabs[0] ?? null;
}

async function ensureImagineTab() {
  const existingTab = await findExistingGrokTab();

  if (!existingTab) {
    return chrome.tabs.create({ url: GROK_IMAGINE_URL, active: true });
  }

  const nextUrl = existingTab.url?.startsWith(GROK_IMAGINE_URL) ? undefined : GROK_IMAGINE_URL;
  return chrome.tabs.update(existingTab.id, { active: true, ...(nextUrl ? { url: nextUrl } : {}) });
}

async function waitForTabToFinishLoading(tabId, timeoutMs = TAB_LOAD_TIMEOUT_MS) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === 'complete') {
    return;
  }

  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(handleUpdate);
      reject(new Error(`Timed out waiting for tab ${tabId} to finish loading.`));
    }, timeoutMs);

    function handleUpdate(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(handleUpdate);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(handleUpdate);
  });
}

async function sendFillPromptMessage(tabId, promptPayload) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      action: MESSAGE_FILL,
      prompt: promptPayload
    });

    return Boolean(response?.ok);
  } catch (error) {
    console.warn('Unable to send fillPrompt message immediately:', error);
    return false;
  }
}

async function forwardPromptToGrok(request) {
  const promptPayload = toPromptPayload(request);
  await storePendingPrompt(promptPayload);

  const grokTab = await ensureImagineTab();
  await waitForTabToFinishLoading(grokTab.id);

  const delivered = await sendFillPromptMessage(grokTab.id, promptPayload);

  return {
    ok: true,
    delivered,
    tabId: grokTab.id
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.action !== MESSAGE_FORWARD) {
    return false;
  }

  forwardPromptToGrok(request)
    .then((result) => sendResponse(result))
    .catch((error) => {
      console.error('Failed to forward prompt to Grok:', error);
      sendResponse({
        ok: false,
        error: error.message
      });
    });

  return true;
});
