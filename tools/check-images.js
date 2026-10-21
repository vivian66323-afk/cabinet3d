#!/usr/bin/env node
/*
  圖片盤點與檢查工具（只用 Node 內建模組，不需要安裝套件）

  用法：
    node tools/check-images.js                 盤點 swatches/、floors/、catalog/
    node tools/check-images.js --dirs floors   只盤點指定資料夾（逗號分隔）
    node tools/check-images.js --json          以 JSON 輸出（給其他腳本或 PR 說明用）
    node tools/check-images.js --quiet         只印摘要與問題清單（不列每個子資料夾）

  輸出內容：
    1. 每個資料夾（含子資料夾）的檔案數、總容量、副檔名分布
    2. 尺寸分布：寬／高的最小、中位數、最大值（直接讀 JPEG／PNG／WebP／GIF 檔頭）
    3. 「程式碼裡有引用但檔案不存在」清單（會讓畫面出現破圖 404）
    4. 「檔案存在但沒有任何地方引用」清單（可能是多餘的圖）
    5. 無法解析尺寸的檔案（可能是壞圖）

  引用來源掃描：js/**\/*.js、css/**\/*.css、index.html、extension/index.html
  只要字串裡出現 swatches/…、floors/…、catalog/… 開頭並以圖片副檔名結尾的路徑都算引用，
  所以組合出來的路徑（例如 'swatches/' + brand + …）掃不到；若有這種寫法請改成完整路徑或另外列入。

  結束碼：有「有引用但檔案不存在」時回傳 1，其餘回傳 0（方便 CI 使用）。
*/
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IMG_EXT = /\.(jpe?g|png|webp|gif|svg|avif)$/i;
const DEFAULT_DIRS = ['swatches', 'floors', 'catalog'];
const SOURCE_FILES = ['index.html', 'extension/index.html'];
const SOURCE_DIRS = [['js', /\.js$/i], ['css', /\.css$/i]];

/* ---------- 參數 ---------- */
const args = process.argv.slice(2);
const opt = { dirs: DEFAULT_DIRS, json: false, quiet: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--json') opt.json = true;
  else if (a === '--quiet') opt.quiet = true;
  else if (a === '--dirs') opt.dirs = String(args[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
  else if (a.startsWith('--dirs=')) opt.dirs = a.slice(7).split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\s*/, '')); process.exit(0); }
  else { console.error('不認識的參數：' + a); process.exit(2); }
}

/* ---------- 工具函式 ---------- */
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const fmtMB = b => (b / 1048576).toFixed(2) + ' MB';
const fmtKB = b => (b / 1024).toFixed(1) + ' KB';
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
function stats(arr) { return arr.length ? { min: Math.min(...arr), median: median(arr), max: Math.max(...arr) } : null; }

/* 讀圖片檔頭取得尺寸；失敗回傳 null */
function imageSize(file) {
  let fd, buf;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    buf = Buffer.alloc(Math.min(size, 65536));
    fs.readSync(fd, buf, 0, buf.length, 0);
  } catch (e) { return null; } finally { if (fd !== undefined) fs.closeSync(fd); }
  if (buf.length < 12) return null;
  // PNG
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') {
    if (buf.length < 24) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: 'png' };
  }
  // GIF
  if (buf.toString('ascii', 0, 3) === 'GIF') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), format: 'gif' };
  // WebP
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ' && buf.length >= 30) return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, format: 'webp' };
    if (chunk === 'VP8L' && buf.length >= 25) {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)), format: 'webp' };
    }
    if (chunk === 'VP8X' && buf.length >= 30) return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), format: 'webp' };
    return null;
  }
  // JPEG：走 marker 找 SOF0/1/2
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m === 0xff) { i++; continue; }
      const len = buf.readUInt16BE(i + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(m)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), format: 'jpeg' };
      }
      if (m === 0xd9 || m === 0xda) break;   // EOI / SOS：沒找到
      i += 2 + len;
    }
    return null;
  }
  // SVG：不算尺寸
  if (/\.svg$/i.test(file)) return { width: null, height: null, format: 'svg' };
  return null;
}

/* ---------- 1. 盤點資料夾 ---------- */
const folders = [];
const allFiles = new Map();   // rel path → { size, dim }
const broken = [];
for (const d of opt.dirs) {
  const dir = path.join(ROOT, d);
  if (!fs.existsSync(dir)) { folders.push({ dir: d, missing: true }); continue; }
  const files = walk(dir).filter(f => IMG_EXT.test(f));
  const groups = new Map();   // 子資料夾（相對於 ROOT）→ 檔案清單
  for (const f of files) {
    const r = rel(f);
    const st = fs.statSync(f);
    const dim = imageSize(f);
    if (!dim) broken.push(r);
    allFiles.set(r, { size: st.size, dim });
    const g = path.posix.dirname(r);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const summarize = list => {
    const sizes = list.map(r => allFiles.get(r).size);
    const ws = [], hs = [], ext = {};
    for (const r of list) {
      const e = path.posix.extname(r).toLowerCase();
      ext[e] = (ext[e] || 0) + 1;
      const dm = allFiles.get(r).dim;
      if (dm && dm.width) { ws.push(dm.width); hs.push(dm.height); }
    }
    return { files: list.length, bytes: sizes.reduce((a, b) => a + b, 0), ext, width: stats(ws), height: stats(hs) };
  };
  folders.push({ dir: d, ...summarize(files.map(rel)), sub: [...groups.keys()].sort().map(g => ({ dir: g, ...summarize(groups.get(g)) })) });
}

/* ---------- 2. 掃描程式碼裡的引用 ---------- */
const sources = [];
for (const f of SOURCE_FILES) if (fs.existsSync(path.join(ROOT, f))) sources.push(path.join(ROOT, f));
for (const [d, re] of SOURCE_DIRS) sources.push(...walk(path.join(ROOT, d)).filter(f => re.test(f)));
const dirAlt = opt.dirs.map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const refRe = new RegExp('(?:\\.\\.?/)*(?:' + dirAlt + ')/[^\\s"\'`<>()?#,;*]+?\\.(?:jpe?g|png|webp|gif|svg|avif)', 'gi');
const refs = new Map();   // 路徑 → Set(來源檔)
for (const s of sources) {
  const text = fs.readFileSync(s, 'utf8');
  let m;
  refRe.lastIndex = 0;
  while ((m = refRe.exec(text))) {
    let p = m[0].replace(/^(\.\.?\/)+/, '');   // extension/index.html 用 ../ 回到根目錄
    try { p = decodeURIComponent(p); } catch (e) { /* 保留原字串 */ }
    if (!refs.has(p)) refs.set(p, new Set());
    refs.get(p).add(rel(s));
  }
}
const missing = [...refs.keys()].filter(p => !fs.existsSync(path.join(ROOT, p))).sort().map(p => ({ path: p, from: [...refs.get(p)].sort() }));
const unreferenced = [...allFiles.keys()].filter(p => !refs.has(p)).sort();
const unrefBytes = unreferenced.reduce((a, p) => a + allFiles.get(p).size, 0);
const refExt = {};
for (const p of refs.keys()) { const e = path.posix.extname(p).toLowerCase(); refExt[e] = (refExt[e] || 0) + 1; }

/* ---------- 3. 輸出 ---------- */
const result = {
  root: ROOT,
  dirs: opt.dirs,
  totalFiles: allFiles.size,
  totalBytes: [...allFiles.values()].reduce((a, v) => a + v.size, 0),
  folders,
  sourcesScanned: sources.length,
  referenced: refs.size,
  referencedByExt: refExt,
  missing,
  unreferenced,
  unreferencedBytes: unrefBytes,
  broken,
};
if (opt.json) { console.log(JSON.stringify(result, null, 2)); }
else {
  const dimStr = (w, h) => (w && h) ? `寬 ${w.min}/${w.median}/${w.max}　高 ${h.min}/${h.median}/${h.max}` : '（無法讀取尺寸）';
  const extStr = ext => Object.entries(ext).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e || '(無副檔名)'}×${n}`).join('、');
  console.log('圖片盤點（尺寸欄位為 最小/中位數/最大，單位 px）');
  console.log('='.repeat(72));
  for (const f of folders) {
    if (f.missing) { console.log(`${f.dir}/：資料夾不存在`); continue; }
    console.log(`${f.dir}/　${f.files} 個檔案　${fmtMB(f.bytes)}　${extStr(f.ext)}`);
    console.log(`    尺寸：${dimStr(f.width, f.height)}`);
    if (!opt.quiet) for (const s of f.sub) {
      console.log(`    ${s.dir}/　${s.files} 檔　${fmtMB(s.bytes)}（平均 ${fmtKB(s.bytes / s.files)}）　${dimStr(s.width, s.height)}`);
    }
  }
  console.log('-'.repeat(72));
  console.log(`合計 ${result.totalFiles} 個檔案　${fmtMB(result.totalBytes)}`);
  console.log(`掃描 ${sources.length} 個程式檔，找到 ${refs.size} 個不同的圖片路徑引用（${extStr(refExt)}）`);
  console.log('');
  console.log(`【有引用但檔案不存在】${missing.length} 個`);
  for (const m of missing) console.log(`  ✗ ${m.path}　← ${m.from.join(', ')}`);
  console.log(`【檔案存在但沒有任何地方引用】${unreferenced.length} 個（${fmtMB(unrefBytes)}）`);
  for (const p of unreferenced) console.log(`  · ${p}　${fmtKB(allFiles.get(p).size)}`);
  console.log(`【無法解析尺寸（可能是壞圖）】${broken.length} 個`);
  for (const p of broken) console.log(`  ! ${p}`);
}
process.exit(missing.length ? 1 : 0);
