// 測試共用工具：繞過登入遮罩、CDN 離線備援、等待應用程式開機、收集錯誤。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SAMPLE_JSON = path.join(ROOT, '一字型廚櫃範例.json');

/* ---------- 登入 ---------- */
// 讀 js/auth-config.js 裡的帳號（不改動 auth 檔案；只是把「記住登入」的 localStorage 先寫好）
function readAuthConfig() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'auth-config.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(src, sandbox);
  return sandbox.window.AUTH_CONFIG || { users: [] };
}

// auth.js 用 localStorage['cab3d_auth'] = {u, h} 判斷是否已登入；h 就是 auth-config.js 裡存的雜湊
async function bypassLogin(context) {
  const cfg = readAuthConfig();
  const user = cfg.users && cfg.users[0];
  if (!user) return;
  await context.addInitScript(remembered => {
    try { window.localStorage.setItem('cab3d_auth', JSON.stringify(remembered)); } catch (e) { /* 忽略 */ }
  }, { u: user.u, h: user.h });
}

/* ---------- CDN ---------- */
// 網站只依賴 cdnjs（jsPDF、JSZip）與 jsdelivr（three.js importmap）。
// 正常情況（GitHub Actions、本機）直接走網路；若 CDN 連不到（公司防火牆、離線沙箱），
// 自動改用 node_modules 裡「同版本」的檔案回應，讓測試仍能跑完。版本不符就不接手，照常走網路。
const CDN_RE = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//;
const PROBE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
let cdnOffline = null;   // 每個 worker 只探測一次

// 直接讀 node_modules/<pkg>/package.json（three 的 exports 不開放 require('three/package.json')）
const pkgVersion = pkg => JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', pkg, 'package.json'), 'utf8')).version;

function localCdnFile(url) {
  let m = url.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@(\d+\.\d+\.\d+)\/(.+?)(\?.*)?$/);
  if (m) {
    const want = m[1], file = m[2];
    const have = pkgVersion('three');
    if (want !== have) return null;
    return path.join(ROOT, 'node_modules', 'three', file);
  }
  m = url.match(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/(jspdf|jszip)\/(\d+\.\d+\.\d+)\/([^?]+)/);
  if (m) {
    const pkg = m[1], want = m[2], file = m[3];
    const have = pkgVersion(pkg);
    if (want !== have) return null;
    return path.join(ROOT, 'node_modules', pkg, 'dist', file);
  }
  return null;
}

async function probeCdn(context) {
  if (process.env.CDN_OFFLINE === '1') return true;
  if (process.env.CDN_OFFLINE === '0') return false;
  const p = await context.newPage();
  try {
    // 用一張空白頁當探測用的來源（不碰網站本身的檔案）
    await p.route('**/__cdn-probe', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>probe</title>' }));
    await p.goto('/__cdn-probe');
    // 在瀏覽器裡探測（和真正載入頁面走同一條網路路徑）；no-cors 只看連不連得到
    return await p.evaluate(async url => {
      try { await fetch(url, { mode: 'no-cors', cache: 'no-store' }); return false; }
      catch (e) { return true; }
    }, PROBE_URL);
  } finally { await p.close(); }
}

async function setupCdn(context) {
  if (cdnOffline === null) {
    cdnOffline = await probeCdn(context);
    console.log(cdnOffline
      ? '[cdn] 連不到 cdnjs／jsdelivr，改用 node_modules 內同版本的 three／jsPDF／JSZip'
      : '[cdn] cdnjs／jsdelivr 可連線，直接走網路');
  }
  if (!cdnOffline) return;
  await context.route(CDN_RE, async route => {
    const file = localCdnFile(route.request().url());
    if (!file || !fs.existsSync(file)) return route.continue();
    await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: fs.readFileSync(file) });
  });
}

/* ---------- 錯誤收集 ---------- */
// 收集 console error / 頁面例外 / 本站 4xx-5xx / 載入失敗的資源（本站與 CDN）
function collectErrors(page) {
  const errors = { console: [], pageErrors: [], badResponses: [], failed: [] };
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const loc = (msg.location() && msg.location().url) || '';
    // 「Failed to load resource」若來自其他外部網址（例如型錄縮圖的廠商網站），不算本站的錯誤
    if (/^Failed to load resource/.test(msg.text()) && loc && !isLocal(loc) && !CDN_RE.test(loc)) return;
    errors.console.push(`${msg.text()}${loc ? ' @ ' + loc : ''}`);
  });
  page.on('pageerror', err => errors.pageErrors.push(String((err && err.message) || err)));
  page.on('response', res => {
    const url = res.url();
    if ((isLocal(url) || CDN_RE.test(url)) && res.status() >= 400) errors.badResponses.push(`${res.status()} ${url}`);
  });
  page.on('requestfailed', req => {
    const url = req.url();
    if (isLocal(url) || CDN_RE.test(url)) errors.failed.push(`${url} ${req.failure() && req.failure().errorText}`);
  });
  return errors;
}
const isLocal = url => /^http:\/\/127\.0\.0\.1:\d+\//.test(url);

/* ---------- 頁面操作 ---------- */
// 開首頁並等到 App.boot 跑完（3D 畫面已建立、工具列已渲染）
async function openApp(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => window.App && window.App.state && window.Viewer && !!document.querySelector('#viewport canvas') && !!document.querySelector('#toolbar button'), null, { timeout: 60 * 1000 });
  if (await page.locator('.auth-gate').count()) throw new Error('登入遮罩仍在畫面上，繞過登入失敗');
}

// 匯入範例專案（走 #fileImport 的 change 事件，與使用者按「匯入專案 .json」相同）
async function loadSample(page) {
  // 用 buffer 餵檔案（直接給路徑時，中文檔名在部分環境會讓瀏覽器收不到檔案）
  await page.setInputFiles('#fileImport', { name: path.basename(SAMPLE_JSON), mimeType: 'application/json', buffer: fs.readFileSync(SAMPLE_JSON) });
  await page.waitForFunction(() => window.App.state.name === '一字型廚櫃範例' && window.App.state.cabinets.length > 0, null, { timeout: 30 * 1000 });
  await page.waitForFunction(() => window.Viewer.getCabGroup().children.length > 0);
}

// 3D 畫面中的櫃體物件數量（viewer.js 的 cabGroup，每件櫃體一個 Group）
const cabObjectCount = page => page.evaluate(() => window.Viewer.getCabGroup().children.length);

// 打開「匯出」選單並點某一項，回傳下載事件
async function exportVia(page, kind, afterClick) {
  await page.click('#btnExport');
  await page.locator('#exportMenu').waitFor({ state: 'visible' });
  const waitDownload = page.waitForEvent('download', { timeout: 80 * 1000 });
  await page.click(`#exportMenu [data-exp="${kind}"]`);
  if (afterClick) await afterClick();
  return waitDownload;
}

async function downloadSize(download) {
  const p = await download.path();
  return fs.statSync(p).size;
}
async function downloadHead(download, n) {
  const p = await download.path();
  const fd = fs.openSync(p, 'r'), buf = Buffer.alloc(n);
  const read = fs.readSync(fd, buf, 0, n, 0); fs.closeSync(fd);
  return buf.subarray(0, read).toString('latin1');
}
async function downloadText(download) {
  return fs.readFileSync(await download.path(), 'utf8');
}

module.exports = { ROOT, SAMPLE_JSON, bypassLogin, setupCdn, collectErrors, openApp, loadSample, cabObjectCount, exportVia, downloadSize, downloadHead, downloadText };
