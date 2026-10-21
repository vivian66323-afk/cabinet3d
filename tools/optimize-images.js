#!/usr/bin/env node
/*
  圖片批次最佳化：把 swatches/、floors/、catalog/ 裡的 JPG／PNG 縮到需要的尺寸並轉成 WebP

  安裝（第一次）：npm install
  用法：
    node tools/optimize-images.js                       處理 swatches/ floors/ catalog/ 三個資料夾
    node tools/optimize-images.js floors                只處理指定資料夾（可多個）
    node tools/optimize-images.js swatches/egger        也可以指定子資料夾
    node tools/optimize-images.js --update-refs         轉完後把 js/css/html 裡對應的 .jpg 路徑改成 .webp
    node tools/optimize-images.js --dry-run             只估算，不寫檔也不刪檔
    node tools/optimize-images.js --keep-jpg            保留原本的 .jpg（預設轉好後會 git rm 掉）
    node tools/optimize-images.js --force               已有 .webp 也重新轉（從還在的 .jpg 轉）
    node tools/optimize-images.js --quality 85          覆蓋所有類別的品質（預設見下表）

  尺寸與品質規則（依路徑判斷）：
    類別                      最長邊上限   WebP 品質   用途
    swatches/<品牌>/*.jpg        1024         80       3D 貼圖（three.js RepeatWrapping）、立面圖 canvas pattern；保留原比例
    floors/*.jpg                 1024         80       地板 3D 貼圖（方形無縫重複）
    *\/thumb/*.jpg                 320         75       面板縮圖（CSS background，顯示 30～64px）
    catalog/**\/*.jpg              320         80       型錄照片（<img>，顯示 56～64px）
  目前的來源圖最大只有 640px，所以貼圖不會被縮小，只有型錄 400px 的照片會縮到 320px。

  可重跑：已經有同名 .webp 且比來源新時會跳過（除非 --force）。
  新增圖片時：把 .jpg 放進對應資料夾、在 js 資料檔填 .jpg 路徑，然後執行
    node tools/optimize-images.js --update-refs
  再用 node tools/check-images.js 確認沒有缺圖。
*/
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

let sharp;
try { sharp = require('sharp'); }
catch (e) { console.error('找不到 sharp，請先在專案根目錄執行：npm install'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DIRS = ['swatches', 'floors', 'catalog'];
const INPUT_EXT = /\.(jpe?g|png)$/i;
const REF_SOURCE_FILES = ['index.html', 'extension/index.html'];
const REF_SOURCE_DIRS = [['js', /\.js$/i], ['css', /\.css$/i]];
const REF_SKIP = new Set(['js/swatches.js']);   // base64 內嵌色板，由另一個工作處理

/* 類別規則：第一個符合的為準 */
const RULES = [
  { name: 'thumb（面板縮圖）', test: r => /\/thumb\//.test(r), max: 320, quality: 75 },
  { name: 'catalog（型錄照片）', test: r => /^catalog\//.test(r), max: 320, quality: 80 },
  { name: 'floors（地板貼圖）', test: r => /^floors\//.test(r), max: 1024, quality: 80 },
  { name: 'swatches（色板貼圖）', test: r => /^swatches\//.test(r), max: 1024, quality: 80 },
  { name: 'other', test: () => true, max: 1024, quality: 80 },
];

/* ---------- 參數 ---------- */
const opt = { dirs: [], dryRun: false, keepJpg: false, force: false, quality: null, updateRefs: false, concurrency: Math.max(2, os.cpus().length) };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dry-run') opt.dryRun = true;
  else if (a === '--keep-jpg') opt.keepJpg = true;
  else if (a === '--force') opt.force = true;
  else if (a === '--update-refs') opt.updateRefs = true;
  else if (a === '--quality') opt.quality = Number(argv[++i]);
  else if (a.startsWith('--quality=')) opt.quality = Number(a.slice(10));
  else if (a === '--concurrency') opt.concurrency = Number(argv[++i]);
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\s*/, '')); process.exit(0); }
  else if (a.startsWith('-')) { console.error('不認識的參數：' + a); process.exit(2); }
  else opt.dirs.push(a.replace(/\/+$/, ''));
}
if (!opt.dirs.length) opt.dirs = DEFAULT_DIRS;
if (opt.quality != null && !(opt.quality >= 1 && opt.quality <= 100)) { console.error('--quality 要在 1～100'); process.exit(2); }

/* ---------- 工具 ---------- */
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const fmtMB = b => (b / 1048576).toFixed(2) + ' MB';
const pct = (a, b) => a ? `-${Math.round(100 - b / a * 100)}%` : '';
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && INPUT_EXT.test(e.name)) out.push(p);
  }
  return out;
}
function ruleOf(r) { return RULES.find(x => x.test(r)); }
function topDir(r) { return r.split('/')[0]; }
function isGitTracked(files) {
  // 回傳 Set（相對路徑），一次查完
  const out = new Set();
  for (let i = 0; i < files.length; i += 500) {
    const res = spawnSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z', '--', ...files.slice(i, i + 500)], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (res.status === 0) res.stdout.split('\0').filter(Boolean).forEach(p => out.add(p));
  }
  return out;
}
function gitRm(files) {
  for (let i = 0; i < files.length; i += 500) {
    const res = spawnSync('git', ['rm', '-q', '--', ...files.slice(i, i + 500)], { cwd: ROOT, encoding: 'utf8' });
    if (res.status !== 0) { console.error('git rm 失敗：' + res.stderr); process.exit(1); }
  }
}

/* ---------- 收集檔案 ---------- */
const inputs = [];
for (const d of opt.dirs) {
  const dir = path.join(ROOT, d);
  if (!fs.existsSync(dir)) { console.error(`資料夾不存在：${d}`); process.exit(2); }
  if (fs.statSync(dir).isFile()) inputs.push(dir); else inputs.push(...walk(dir));
}
if (!inputs.length) { console.log('沒有要處理的 JPG／PNG。'); process.exit(0); }

/* ---------- 轉檔 ---------- */
const stat = {};   // topDir → { files, skipped, before, after }
const bump = (k, f) => { const s = stat[k] || (stat[k] = { files: 0, skipped: 0, resized: 0, before: 0, after: 0 }); f(s); };
const converted = [];   // 轉好的來源檔（相對路徑）
const failed = [];

async function processOne(file) {
  const r = rel(file);
  const rule = ruleOf(r);
  const quality = opt.quality || rule.quality;
  const outFile = file.replace(INPUT_EXT, '.webp');
  const before = fs.statSync(file).size;
  if (!opt.force && fs.existsSync(outFile) && fs.statSync(outFile).mtimeMs >= fs.statSync(file).mtimeMs) {
    bump(topDir(r), s => { s.skipped++; s.before += before; s.after += fs.statSync(outFile).size; });
    converted.push(r);   // 已轉過：仍視為可刪來源
    return;
  }
  try {
    const img = sharp(file, { failOn: 'none' }).rotate();   // rotate()＝套用 EXIF 方向
    const meta = await img.metadata();
    const resized = Math.max(meta.width || 0, meta.height || 0) > rule.max;
    const buf = await img
      .resize({ width: rule.max, height: rule.max, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 6 })
      .toBuffer();
    if (!opt.dryRun) fs.writeFileSync(outFile, buf);
    bump(topDir(r), s => { s.files++; s.before += before; s.after += buf.length; if (resized) s.resized++; });
    converted.push(r);
  } catch (e) {
    failed.push(r + '：' + (e.message || e));
  }
}

async function runPool(items, worker, n) {
  let i = 0;
  const next = async () => { while (i < items.length) { const it = items[i++]; await worker(it); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, next));
}

(async () => {
  const t0 = Date.now();
  console.log(`${opt.dryRun ? '【估算模式】' : ''}處理 ${inputs.length} 個檔案（${opt.dirs.join(', ')}），並行 ${opt.concurrency}…`);
  let done = 0;
  await runPool(inputs, async f => { await processOne(f); if (++done % 500 === 0) console.log(`  …${done}/${inputs.length}`); }, opt.concurrency);

  /* 刪除來源 jpg */
  let removed = 0;
  if (!opt.dryRun && !opt.keepJpg && converted.length) {
    const tracked = isGitTracked(converted);
    const viaGit = converted.filter(r => tracked.has(r));
    const viaFs = converted.filter(r => !tracked.has(r));
    gitRm(viaGit);
    viaFs.forEach(r => fs.unlinkSync(path.join(ROOT, r)));
    removed = converted.length;
    // 新的 webp 一起加入 git（來源有追蹤的才加）
    const webps = viaGit.map(r => r.replace(INPUT_EXT, '.webp'));
    for (let i = 0; i < webps.length; i += 500) spawnSync('git', ['add', '--', ...webps.slice(i, i + 500)], { cwd: ROOT });
  }

  /* 更新引用 */
  let refFiles = 0, refCount = 0;
  if (opt.updateRefs && !opt.dryRun) {
    const sources = [];
    for (const f of REF_SOURCE_FILES) if (fs.existsSync(path.join(ROOT, f))) sources.push(path.join(ROOT, f));
    for (const [d, re] of REF_SOURCE_DIRS) if (fs.existsSync(path.join(ROOT, d))) sources.push(...(function w(dir, out = []) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) w(p, out); else if (re.test(e.name)) out.push(p); } return out; })(path.join(ROOT, d)));
    const dirAlt = DEFAULT_DIRS.join('|');
    const re = new RegExp('((?:\\.\\.?/)*(?:' + dirAlt + ')/[^\\s"\'`<>()?#,;*]+?)\\.(jpe?g|png)\\b', 'gi');
    for (const s of sources) {
      if (REF_SKIP.has(rel(s))) continue;
      const text = fs.readFileSync(s, 'utf8');
      let n = 0;
      const out = text.replace(re, (m, p, ext) => {
        const clean = p.replace(/^(\.\.?\/)+/, '');
        if (fs.existsSync(path.join(ROOT, clean + '.webp'))) { n++; return p + '.webp'; }
        return m;
      });
      if (n) { fs.writeFileSync(s, out); refFiles++; refCount += n; }
    }
  }

  /* 摘要 */
  console.log('');
  console.log('資料夾          轉檔   跳過   縮尺寸    改前        改後        變化');
  let tb = 0, ta = 0;
  for (const [k, s] of Object.entries(stat)) {
    tb += s.before; ta += s.after;
    console.log(`${k.padEnd(14)} ${String(s.files).padStart(6)} ${String(s.skipped).padStart(6)} ${String(s.resized).padStart(8)}   ${fmtMB(s.before).padEnd(11)} ${fmtMB(s.after).padEnd(11)} ${pct(s.before, s.after)}`);
  }
  console.log(`${'合計'.padEnd(13)} ${String(converted.length).padStart(6)} ${''.padStart(6)} ${''.padStart(8)}   ${fmtMB(tb).padEnd(11)} ${fmtMB(ta).padEnd(11)} ${pct(tb, ta)}`);
  console.log(`品質：${RULES.slice(0, 4).map(r => `${r.name} q${opt.quality || r.quality}（≤${r.max}px）`).join('；')}`);
  if (removed) console.log(`已刪除 ${removed} 個來源 JPG／PNG（git 歷史裡仍在）`);
  if (opt.updateRefs) console.log(`引用更新：${refFiles} 個檔案、${refCount} 處路徑改成 .webp`);
  if (failed.length) { console.log(`失敗 ${failed.length} 個：`); failed.forEach(f => console.log('  ! ' + f)); }
  console.log(`耗時 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  process.exit(failed.length ? 1 : 0);
})();
