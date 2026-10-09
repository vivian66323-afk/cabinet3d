/* 色板庫：內建色板（swatches.js）＋ 使用者新增/修改/刪除（存在瀏覽器 IndexedDB，關閉網站後仍保留）
   entries：code → { code, name, brand, series, hex, img, en, hidden, updated }
   brand＝廠商（內建色板為伸保；不同廠商色號重複時，匯入會自動加「廠商-」前綴）
   - 內建色號有 entry：覆寫（修改）或 hidden（刪除）
   - 非內建色號：自訂色板 */
(function () {
  const BUILTIN = (window.SWATCHES || []).map(s => ({ brand: '伸保', ...s }));
  const BUILTIN_BY = new Map(BUILTIN.map(s => [s.code, s]));
  const entries = new Map();
  const DB = 'cab3d-swatches', STORE = 'items';
  const Lib = { BUILTIN, entries, ready: null, version: 0 };

  function db() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('此瀏覽器不支援 IndexedDB')); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'code' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(STORE, mode), st = t.objectStore(STORE);
      const out = fn(st);
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  }

  Lib.init = function () {
    if (Lib.ready) return Lib.ready;
    Lib.ready = tx('readonly', st => st.getAll())
      .then(list => { (list || []).forEach(e => entries.set(e.code, e)); })
      .catch(e => console.warn('色板庫無法讀取：', e))
      .then(() => { if (entries.size) Lib.apply(); });
    return Lib.ready;
  };

  Lib.isBuiltin = code => BUILTIN_BY.has(code);
  // 合併後的色板清單（不含已刪除）
  Lib.list = function () {
    const out = [];
    BUILTIN.forEach(b => {
      const e = entries.get(b.code);
      if (e && e.hidden) return;
      // 只設定單價不算「已修改」
      const mod = !!e && Object.keys(e).some(k => !['code', 'price', 'updated', 'hidden'].includes(k));
      out.push(e ? { ...b, ...e, ...(e.img && e.img !== b.img ? { thumb: '' } : {}), builtin: true, modified: mod } : { ...b, builtin: true, modified: false });
    });
    entries.forEach(e => { if (!BUILTIN_BY.has(e.code) && !e.hidden) out.push({ ...e, builtin: false, modified: false }); });
    return out;
  };
  Lib.hidden = () => BUILTIN.filter(b => (entries.get(b.code) || {}).hidden);
  Lib.get = code => Lib.list().find(s => s.code === code) || null;

  const put = e => tx('readwrite', st => st.put(e));
  const del = code => tx('readwrite', st => st.delete(code));

  Lib.save = async function (sw, opts = {}) {
    const e = { code: String(sw.code).trim(), name: sw.name || '', brand: sw.brand || '自訂', series: sw.series || '自訂色板', hex: sw.hex || '#cccccc', img: sw.img || '', en: sw.en || '', updated: Date.now() };
    const pr = priceOf(sw.price); if (pr != null) e.price = pr;
    if (sw.imgGrain === 'h' || sw.imgGrain === 'v') e.imgGrain = sw.imgGrain;   // 圖片紋路方向（未指定＝自動偵測）
    await put(e); entries.set(e.code, e);
    if (!opts.silent) Lib.apply([e.code]);
    return e;
  };
  // 單價（元/才）；空白＝未設定（使用預設單價）
  function priceOf(v) { if (v === '' || v == null) return null; const n = +v; return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; }
  Lib.priceOf = priceOf;
  Lib.setPrices = async function (map) {
    for (const [code, v] of Object.entries(map)) {
      const e = { ...(entries.get(code) || { code }) }, pr = priceOf(v);
      if (pr == null) delete e.price; else e.price = pr;
      e.updated = Date.now();
      if (Lib.isBuiltin(code) && Object.keys(e).every(k => ['code', 'updated'].includes(k))) { await del(code); entries.delete(code); }
      else { await put(e); entries.set(code, e); }
      const sw = window.DATA.SWATCH_BY_CODE[code]; if (sw) { if (pr == null) delete sw.price; else sw.price = pr; }
    }
    (window.SWATCHES || []).forEach(s => { const x = window.DATA.SWATCH_BY_CODE[s.code]; if (x) s.price = x.price; });
    if (window.App && App.ui && App.ui.refresh) App.ui.refresh();
  };
  Lib.saveMany = async function (list) {
    for (const sw of list) await Lib.save(sw, { silent: true });
    Lib.apply(list.map(s => s.code));
  };
  Lib.remove = async function (code) {
    if (BUILTIN_BY.has(code)) { const e = { code, hidden: true, updated: Date.now() }; await put(e); entries.set(code, e); }
    else { await del(code); entries.delete(code); }
    Lib.apply([code]);
  };
  // 內建色板還原為原始狀態
  Lib.restore = async function (code) { await del(code); entries.delete(code); Lib.apply([code]); };
  Lib.resetAll = async function () { await tx('readwrite', st => st.clear()); entries.clear(); Lib.apply(); };

  // 專案內用到、且不是原始內建的色板（儲存專案時一併寫入 .json）
  Lib.projectSwatches = function (state) {
    const used = new Set();
    const add = c => { if (c) used.add(c); };
    const scan = cabs => (cabs || []).forEach(c => { add(c.bodyColor); add(c.doorColor); add(c.topColor); add(c.kickColor); });
    scan(state.cabinets); (state.floors || []).forEach(f => scan(f.cabinets));
    Object.values(state.defaults || {}).forEach(add);
    return Lib.list().filter(s => used.has(s.code) && (!s.builtin || s.modified || s.price != null)).map(s => ({ code: s.code, name: s.name, brand: s.brand, series: s.series, hex: s.hex, img: s.img, en: s.en || '', ...(s.price != null ? { price: s.price } : {}) }));
  };
  // 匯入專案時：專案內的色板若本機沒有就加入色板庫（本機已有的自訂色板不覆蓋）
  Lib.importProject = async function (list) {
    const add = (list || []).filter(s => s && s.code && s.img && !entries.has(s.code));
    if (!add.length) return 0;
    await Lib.saveMany(add);
    return add.length;
  };

  // 套用到平台：型錄材質、貼圖快取、圖面、樣式
  Lib.apply = function (changed) {
    const D = window.DATA, list = Lib.list();
    Lib.version++;
    window.SWATCHES = list;
    Object.keys(D.SWATCH_BY_CODE).forEach(k => delete D.SWATCH_BY_CODE[k]);
    list.forEach(s => { D.SWATCH_BY_CODE[s.code] = s; });
    // D.MATERIALS：以色板清單重建貼圖材質（保留原係數）
    const oldTex = new Map(D.MATERIALS.filter(m => m.tex).map(m => [m.code, m]));
    for (let i = D.MATERIALS.length - 1; i >= 0; i--) if (D.MATERIALS[i].tex) D.MATERIALS.splice(i, 1);
    list.forEach(s => D.MATERIALS.push({ code: s.code, name: s.name, en: s.en, brand: s.brand || '自訂', series: s.series || '自訂色板', hex: s.hex, use: 'both', cat: '色板', factor: (oldTex.get(s.code) || {}).factor || 100, grain: false, tex: true }));
    Lib.syncProject();
    if (window.Model && window.Model.clearSwatchTex) window.Model.clearSwatchTex(changed);
    if (window.Drawings && window.Drawings.resetSwatches) window.Drawings.resetSwatches();
    if (window.UI && window.UI.injectSwatchCSS) window.UI.injectSwatchCSS();
    if (window.App && App.state && window.Viewer && window.Viewer.rebuildAll) { window.Model.clearMatCache(); window.Viewer.rebuildAll(); }
    if (window.App && App.ui && App.ui.refresh) App.ui.refresh();
    // 色板單價可能一併改了，型錄卡片的才數售價要重算
    if (window.UI && window.UI.refreshCatalog) window.UI.refreshCatalog();
  };
  // 目前專案的材質清單與色板庫同步：新增/更新；已刪除且未使用者移除
  Lib.syncProject = function (state) {
    state = state || (window.App && App.state);
    if (!state || !state.pricing) return;
    const mats = state.pricing.materials, list = Lib.list(), byCode = new Map(list.map(s => [s.code, s]));
    const used = new Set();
    const scan = cabs => (cabs || []).forEach(c => ['bodyColor', 'doorColor', 'topColor', 'kickColor'].forEach(k => c[k] && used.add(c[k])));
    scan(state.cabinets); (state.floors || []).forEach(f => scan(f.cabinets)); Object.values(state.defaults || {}).forEach(v => used.add(v));
    for (let i = mats.length - 1; i >= 0; i--) {
      const m = mats[i];
      if (!m.tex) continue;
      const s = byCode.get(m.code);
      if (s) Object.assign(m, { name: s.name, en: s.en, brand: s.brand || '自訂', series: s.series || '自訂色板', hex: s.hex });
      else if (!used.has(m.code)) mats.splice(i, 1);
      else m.tex = false; // 已刪除但仍被使用：改以色碼顯示
    }
    const have = new Set(mats.map(m => m.code));
    list.forEach(s => { if (!have.has(s.code)) mats.push({ code: s.code, name: s.name, en: s.en, brand: s.brand || '自訂', series: s.series || '自訂色板', hex: s.hex, use: 'both', cat: '色板', factor: 100, grain: false, tex: true }); });
    mats.forEach(m => { if (!m.tex && byCode.has(m.code)) m.tex = true; });
  };

  /* ---------- 圖片處理 ---------- */
  // 任何圖片（File / Blob / dataURL / 網址）→ 640×400 JPEG dataURL ＋ 平均色碼
  Lib.processImage = function (src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      let url = src;
      if (src instanceof Blob) url = URL.createObjectURL(src);
      im.onload = () => {
        try {
          const W = 640, H = 400, c = document.createElement('canvas'); c.width = W; c.height = H;
          const g = c.getContext('2d'), sc = Math.max(W / im.width, H / im.height);
          const w = im.width * sc, h = im.height * sc;
          g.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
          const px = g.getImageData(0, 0, W, H).data; let r = 0, gg = 0, b = 0, n = 0;
          for (let i = 0; i < px.length; i += 4 * 97) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; n++; }
          const hex = '#' + [r, gg, b].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('');
          res({ img: c.toDataURL('image/jpeg', 0.85), hex });
        } catch (e) { rej(new Error('圖片無法讀取（網址可能不允許跨網站存取）')); }
        if (src instanceof Blob) URL.revokeObjectURL(url);
      };
      im.onerror = () => { if (src instanceof Blob) URL.revokeObjectURL(url); rej(new Error('圖片載入失敗')); };
      im.src = url;
    });
  };

  /* ---------- CSV ---------- */
  // 解析 CSV（支援引號、逗號、換行、BOM）
  Lib.parseCSV = function (text) {
    text = text.replace(/^﻿/, '');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  };
  // Excel 中文版存 CSV 常為 Big5：UTF-8 解碼失敗時改用 Big5
  Lib.decodeText = function (buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('big5').decode(buf); }
  };
  const csvCell = v => { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  Lib.toCSV = rows => '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');

  window.SwatchLib = Lib;
})();
