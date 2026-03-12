import pkg from '../package.json';
import './style.css';

const appVersion = pkg.version;
const extensionVersion = new URLSearchParams(window.location.search).get('extensionVersion');

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="layout">
    <section class="hero">
      <p class="eyebrow">Grok Image Workflow</p>
      <h1>Generate image prompts and send them into the extension.</h1>
      <p class="lede">
        หน้านี้ deploy บน Vercel ด้วย Vite และใช้ส่ง prompt ไปยัง Chrome extension เพื่อเปิด Grok Imagine และสร้างภาพอัตโนมัติ
      </p>
    </section>

    <section class="panel">
      <label class="label" for="prompt-input">Prompt</label>
      <textarea id="prompt-input" class="prompt-input" rows="10" placeholder="เช่น cinematic product photo of a luxury perfume bottle on reflective black glass, dramatic rim light, high detail"></textarea>

      <div class="controls">
        <label class="toggle">
          <input id="auto-submit" type="checkbox" checked />
          <span>ส่งและกดสร้างภาพอัตโนมัติ</span>
        </label>
        <button id="send-button" class="send-button" type="button">Send To Grok</button>
      </div>

      <p id="status" class="status">พร้อมส่ง prompt ไปยัง extension</p>
    </section>

    <section class="downloads-card">
      <div class="downloads-copy">
        <p class="downloads-eyebrow">Extension Download</p>
        <h2>ดาวน์โหลดไฟล์ extension เพื่อติดตั้งใน Chrome</h2>
        <p class="downloads-text">
          ระบบจะ generate ไฟล์ zip ของ extension ตอน build แล้วปล่อยไว้กับเว็บนี้โดยอัตโนมัติ
        </p>
      </div>
      <div class="downloads-actions">
        <a id="download-extension" class="download-button is-disabled" href="#" aria-disabled="true">Preparing package...</a>
        <a id="download-release-info" class="text-link" href="/downloads/release-info.json" target="_blank" rel="noreferrer">View release info</a>
      </div>
      <ol class="install-steps">
        <li>กด Download Extension</li>
        <li>แตก zip ออกเป็นโฟลเดอร์</li>
        <li>เปิด chrome://extensions และเปิด Developer mode</li>
        <li>กด Load unpacked แล้วเลือกโฟลเดอร์ที่แตกไฟล์ไว้</li>
      </ol>
    </section>

    <footer class="footer">
      <span>App v${appVersion}</span>
      <span>${extensionVersion ? `Extension v${extensionVersion}` : 'Extension version unavailable'}</span>
    </footer>
  </main>
`;

const promptInput = document.querySelector('#prompt-input');
const autoSubmitInput = document.querySelector('#auto-submit');
const sendButton = document.querySelector('#send-button');
const status = document.querySelector('#status');
const downloadLink = document.querySelector('#download-extension');
const releaseInfoLink = document.querySelector('#download-release-info');

function updateStatus(message, tone = 'default') {
  status.textContent = message;
  status.dataset.tone = tone;
}

function dispatchPrompt(prompt, autoSubmit) {
  const payload = {
    action: 'sendPrompt',
    prompt,
    autoSubmit
  };

  if (window.parent && window.parent !== window) {
    window.parent.postMessage(payload, '*');
  }

  window.postMessage(payload, window.location.origin);
}

sendButton.addEventListener('click', () => {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    updateStatus('กรุณากรอก prompt ก่อนส่ง', 'error');
    promptInput.focus();
    return;
  }

  dispatchPrompt(prompt, autoSubmitInput.checked);
  updateStatus('ส่ง prompt แล้ว ถ้า extension เปิดอยู่ Grok จะเริ่มทำงาน', 'success');
});

async function initializeDownloads() {
  try {
    const response = await fetch('/downloads/release-info.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Release info not found');
    }

    const releaseInfo = await response.json();
    const zipName = releaseInfo?.downloads?.zip || 'latest.zip';
    const version = releaseInfo?.version || appVersion;

    downloadLink.href = `/downloads/${zipName}`;
    downloadLink.textContent = `Download Extension v${version}`;
    downloadLink.classList.remove('is-disabled');
    downloadLink.removeAttribute('aria-disabled');

    releaseInfoLink.textContent = `View release info v${version}`;
  } catch (error) {
    downloadLink.textContent = 'Extension package unavailable';
    downloadLink.setAttribute('aria-disabled', 'true');
    downloadLink.removeAttribute('href');
  }
}

initializeDownloads();
