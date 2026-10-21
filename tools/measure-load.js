#!/usr/bin/env node
/* 量測首頁「首次載入」的 JS 總量。
   用法：
     node tools/measure-load.js            解析 index.html 的 <script src="js/…"> 清單，加總檔案大小（CDN 檔不計）
     node tools/measure-load.js --browser  另用 Playwright 開啟首頁，統計瀏覽器實際抓取的本機 .js 位元組（含延遲載入器之後的請求則不計）
   兩種算法都只算 js/ 內的檔案；--browser 需要 npx playwright 可用。 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]).filter(s => !/^https?:/.test(s));
const fmt = n => n.toLocaleString('en-US');

function staticSizes() {
  const rows = srcs.map(s => {
    const file = s.split('?')[0];
    const size = fs.statSync(path.join(root, file)).size;
    return { file, size };
  });
  const total = rows.reduce((a, r) => a + r.size, 0);
  return { rows, total };
}

async function browserSizes() {
  const { chromium } = require('playwright');
  const http = require('http');
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(root, p === '/' ? 'index.html' : p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const rows = [];
  page.on('response', async resp => {
    const u = new URL(resp.url());
    if (u.hostname !== '127.0.0.1' || !u.pathname.endsWith('.js')) return;
    try { const body = await resp.body(); rows.push({ file: u.pathname.slice(1), size: body.length }); } catch (e) { /* 忽略 */ }
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await browser.close();
  server.close();
  return { rows, total: rows.reduce((a, r) => a + r.size, 0) };
}

(async () => {
  const useBrowser = process.argv.includes('--browser');
  const { rows, total } = useBrowser ? await browserSizes() : staticSizes();
  rows.sort((a, b) => b.size - a.size);
  console.log((useBrowser ? '瀏覽器實際抓取' : 'index.html 腳本清單') + '：');
  rows.forEach(r => console.log(`  ${fmt(r.size).padStart(10)}  ${r.file}`));
  console.log(`檔案數 ${rows.length}，JS 總量 ${fmt(total)} bytes（${(total / 1024 / 1024).toFixed(2)} MB）`);
})().catch(e => { console.error(e); process.exit(1); });
