/* 報價計算 */
(function () {
  const D = window.DATA;

  function defaultPricing() {
    const styles = {};
    D.DOOR_STYLES.forEach(s => { styles[s.id] = s.factor; });
    return {
      materials: D.MATERIALS.map(m => ({ ...m })),
      styles,
      parts: JSON.parse(JSON.stringify({ S: D.PARTS.S, F: D.PARTS.F, ROD: D.PARTS.ROD, KICK_PER_M: D.PARTS.KICK_PER_M, HINGE: D.PARTS.HINGE, FOOT: D.PARTS.FOOT, ESLIDE: D.PARTS.ESLIDE })),
      codeOverrides: {},
      customRate: 10,   // 舊欄位（型錄牌價時代的訂製加工 %），已不再使用
      mode: 'cai',      // 計價方式：固定為色板才數×單價（型錄牌價模式已移除）
      caiDefault: 100,  // 未設定單價的色板：預設單價（元/才，1 才＝1 台尺×1 台尺）
      desk: { prices: JSON.parse(JSON.stringify(D.DESK_PRICE)), edge: { ...D.DESK_EDGE_PRICE } },
      discount: 100,
      taxRate: 5,
      note: '1. 以上報價不含把手、活隔粒、門縫條、運費及安裝；板材依才數計價（1 才＝303mm×303mm，每片無條件進位）。\n2. 訂製色、非規格品需另加工作天，下單後不接受更改。\n3. 本報價單有效期限 30 天。'
    };
  }

  // 依表格內插（高度 cm）
  function interp(table, h) {
    const keys = Object.keys(table).map(Number).filter(k => table[k] > 0).sort((a, b) => a - b);
    if (!keys.length) return 0;
    if (table[h]) return table[h];
    if (h <= keys[0]) return table[keys[0]] * h / keys[0];
    if (h >= keys[keys.length - 1]) { const k = keys[keys.length - 1]; return table[k] * h / k; }
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (h > a && h < b) return table[a] + (table[b] - table[a]) * (h - a) / (b - a);
    }
    return 0;
  }

  function nearest(v, arr) { return arr.reduce((p, c) => Math.abs(c - v) < Math.abs(p - v) ? c : p, arr[0]); }

  function stdDoor(wmm, hcm) {
    const wk = wmm / 10;
    if (wk > 60) return interp(D.DOOR_STD[60], hcm) * wk / 60;
    const k = nearest(wk, [15, 30, 45, 60]);
    // 60 寬無 192 以上高度，以 45 寬等比推估
    if (k === 60 && hcm > 192) return interp(D.DOOR_STD[45], hcm) * 60 / 45;
    return interp(D.DOOR_STD[k], hcm);
  }
  function glassDoor(wmm, hcm) {
    const wk = wmm / 10;
    if (wk >= 52) return interp(D.DOOR_GLASS[60], Math.min(hcm, 192)) * (hcm > 192 ? hcm / 192 : 1) * (wk > 60 ? wk / 60 : 1);
    const p = interp(D.DOOR_GLASS[45], hcm);
    return wk < 38 ? p * 0.8 : p;
  }
  function styleRatio(style, hcm, wmm) {
    const st = D.DOOR_STYLES.find(s => s.id === style) || D.DOOR_STYLES[0];
    if (st.id === 'STD') return 1;
    const use60 = wmm >= 525;
    const tab = use60 ? st.t60 : st.t45;
    const std = use60 ? D.DOOR_STD[60] : D.DOOR_STD[45];
    if (tab[hcm] && std[hcm]) return tab[hcm] / std[hcm];
    // 平均比例
    let n = 0, s = 0;
    Object.keys(tab).forEach(k => { if (std[k]) { n++; s += tab[k] / std[k]; } });
    return n ? s / n : 1;
  }
  function styleFactor(pricing, style) { return ((pricing.styles && pricing.styles[style]) || 100) / 100; }

  function leavesOf(row, w) {
    if (row.t === 'P' || row.t === 'GP') return [w / 2, w / 2];
    if (row.t === 'F') return [w / 4, w / 4, w / 4, w / 4];
    if (row.t === 'L' || row.t === 'R' || row.t === 'G') return [w];
    return [];
  }

  // 單列門/抽屜成本（標準款） 與 款式加價
  function rowCost(row, cab, pricing) {
    const w = cab.kind === 'corner' ? 450 : cab.w;
    if (row.t === 'O') return { std: 0, extra: 0 };
    if (row.t === 'D') {
      const hk = row.h <= 14 ? 16 : nearest(row.h, [16, 24, 32]);
      const wk = nearest(w / 10, [45, 60, 90]);
      const dc = cab.dc === 'T' ? 'A' : cab.dc;
      const box = (D.PARTS.DRAWER[hk][dc] || D.PARTS.DRAWER[hk].A)[wk];
      const head = (D.PARTS.HEAD[hk] || D.PARTS.HEAD[16])[wk] * row.h / hk;
      const r = styleRatio(cab.doorStyle, 32, w);
      const extra = head * (r * styleFactor(pricing, cab.doorStyle) - 1);
      return { std: box + head, extra };
    }
    const glass = row.t === 'G' || row.t === 'GP';
    let std = 0, extra = 0;
    leavesOf(row, w).forEach(lw => {
      if (glass) { std += glassDoor(lw, row.h); return; }
      const s = stdDoor(lw, row.h);
      std += s;
      extra += s * (styleRatio(cab.doorStyle, row.h, lw) * styleFactor(pricing, cab.doorStyle) - 1);
    });
    return { std, extra };
  }

  /* ---------- 五金自動數量 ---------- */
  const DOOR_TYPES = ['L', 'R', 'P', 'G', 'GP', 'F'];
  const hasDoor = cab => (cab.fronts || []).some(r => DOOR_TYPES.includes(r.t));
  // 西德鉸鍊：每片門依門高（cm）≤80:2、81–150:3、151–220:4、>220(至265):5
  function hingesPerLeaf(hcm) { return hcm <= 80 ? 2 : hcm <= 150 ? 3 : hcm <= 220 ? 4 : 5; }
  function autoHinges(cab) {
    let n = 0;
    (cab.fronts || []).forEach(r => { if (DOOR_TYPES.includes(r.t)) n += leavesOf(r, 1).length * hingesPerLeaf(r.h); });
    return n;
  }
  // 調整腳：有門片的落地櫃，櫃寬 ≤90cm:4、>90–120cm:6、>120cm:8
  function autoFeet(cab) {
    if (!hasDoor(cab) || cab.hanging || cab.kind === 'tri') return 0;
    const wcm = cab.w / 10;
    return wcm <= 90 ? 4 : wcm <= 120 ? 6 : 8;
  }
  function hingeQty(cab) { return cab.hingeQty != null ? cab.hingeQty : autoHinges(cab); }
  function footQty(cab) { return cab.footQty != null ? cab.footQty : autoFeet(cab); }

  function frontsCost(fronts, cab, pricing) {
    let std = 0, extra = 0;
    (fronts || []).forEach(r => { const c = rowCost(r, cab, pricing); std += c.std; extra += c.extra; });
    return { std, extra };
  }

  function shelfKey(cab) {
    if (cab.kind === 'corner' || cab.kind === 'hangcorner') return 90;
    return nearest(cab.w / 10, [30, 45, 60, 90]);
  }

  function matFactor(pricing, code) {
    const m = pricing.materials.find(x => x.code === code);
    return m ? m.factor / 100 : 1;
  }

  const deskMatName = id => (D.DESK_MATS.find(m => m.id === id) || {}).name || id;
  const deskEdgeName = id => (D.DESK_EDGES.find(m => m.id === id) || {}).name || id;
  // 桌面計價才數：整片桌面面積 ÷ 1 才（303×303mm），無條件進位到整數（與櫃體板材相同）
  function deskCai(cab) { return Math.ceil(window.Model.deskGeom(cab).area / D.CAI - 1e-9); }
  function deskPrice(cab, pricing) {
    const g = window.Model.deskGeom(cab);
    const dp = pricing.desk || { prices: D.DESK_PRICE, edge: D.DESK_EDGE_PRICE };
    const cai = deskCai(cab);
    // 賽麗石：桌面色板是賽麗石色號時，單價直接用該色板的元/才（板材售價可改），不看材質表
    const sw = D.SWATCH_BY_CODE[cab.topColor];
    const sil = sw && (sw.top || /賽麗石/.test(sw.brand || '')) && sw.price != null ? sw : null;   // 檯面材色板（賽麗石、人造石、石英石）：用該色板的元/才
    const unit = sil ? sil.price : (((dp.prices[cab.deskMat] || {})[cab.thick]) || 0);
    const chi = g.exposed / D.CHI, eu = (dp.edge[cab.edge] || 0);
    const lines = [{ name: sil ? `桌面 ${(sil.brand || '').replace(/ .*$/, '')} ${sil.code} ${sil.name}　${cai} 才 × ${unit}` : `桌面 ${deskMatName(cab.deskMat)} ${cab.thick}mm　${cai} 才 × ${unit}`, amount: Math.round(cai * unit), qty: cai, unit }];
    if (eu && cab.edge !== 'none') lines.push({ name: `端部 ${deskEdgeName(cab.edge)}　${chi.toFixed(1)} 尺 × ${eu}`, amount: Math.round(chi * eu) });
    const total = lines.reduce((a, l) => a + l.amount, 0);
    return { base: 0, catalogPrice: 0, total, lines, cai, chi };
  }
  function applPrice(cab, pricing) {
    const it = D.byCode[cab.code] || {};
    const base = pricing.codeOverrides[cab.code] != null ? +pricing.codeOverrides[cab.code] : (it.price || 0);
    return { base, catalogPrice: it.price || 0, total: Math.round(base), lines: [{ name: `${it.brand || ''} ${cab.code} ${it.name || ''}`, amount: Math.round(base) }] };
  }
  function isCustom(cab) { const c = D.byCode[cab.code]; return !!(c && cab.kind !== 'desk' && cab.kind !== 'appl' && (cab.w !== c.w || cab.h !== c.h || cab.d !== c.d)); }
  function fullCode(cab) {
    if (cab.kind === 'desk') return `${D.DESK_SHAPES[cab.shape]}桌面-${cab.topColor}`;
    if (cab.kind === 'appl') return cab.code + ((D.byCode[cab.code] || {}).finish === 'panel' ? '-' + cab.doorColor : '');
    // 櫃體一律用 W…H…-S／-M 命名（標準款／已修改）
    return window.Model.cabName(cab);
  }

  function describe(cab) {
    if (cab.kind === 'appl') { const it = D.byCode[cab.code] || {}; return `${D.APPL_TYPES[cab.at]}｜${it.brand || ''} ${it.name || ''}　${it.spec || ''}`; }
    if (cab.kind === 'filler') return `補板 ${cab.w}×${cab.h}（固定條 ${Math.min(50, cab.w)}mm）`;
    if (cab.kind === 'desk') return `${D.DESK_SHAPES[cab.shape]}桌面 ${cab.w}×${window.Model.footDepth(cab)}${cab.shape !== 'R' ? `（深${cab.d}）` : ''}　${deskMatName(cab.deskMat)} ${cab.thick}mm　端部${deskEdgeName(cab.edge)}`;
    const rows = cab.fronts.filter(r => r.t !== 'O');
    const parts = rows.map(r => `${D.FRONT_NAME[r.t] || r.t}${r.h}`);
    return parts.length ? parts.join('/') : '開放櫃';
  }

  /* ---------- 色板才數計價 ----------
     1 才＝1 台尺 × 1 台尺（303×303mm，D.CAI，與桌面相同）；每片板材的才數無條件進位到整數，再乘片數 */
  const CAI30 = D.CAI;   // 舊名稱保留（外部仍可讀 Pricing.CAI30）
  const BOARD_CATS = ['櫃體板材', '門片', '抽屜', '踢腳板'];
  // 單片板材的計價才數（L 型板以實際面積計）；不是板材回傳 0
  function pieceCai(cat, part, L, W, note) {
    if (!BOARD_CATS.includes(cat) || !L || !W) return 0;
    let a = L * W;
    const m = /臂深 (\d+)/.exec(note || '');
    if (m && /L型/.test(part)) { const arm = +m[1]; a = L * arm + (W - arm) * arm; }
    return Math.ceil(a / D.CAI - 1e-9);
  }
  // 色號單價（元/才）：色板維護設定的單價；未設定者用預設單價 × 材質係數
  function caiUnit(code, pricing) {
    const sw = D.SWATCH_BY_CODE[code];
    if (sw && +sw.price > 0) return { unit: +sw.price, set: true };
    const def = pricing.caiDefault != null ? +pricing.caiDefault : 100;
    return { unit: Math.round(def * matFactor(pricing, code)), set: false };
  }
  // 各色號使用才數（依拆料清單的板件尺寸；每片進位後 × 片數）
  function boardCai(cab) {
    const map = new Map();
    const rows = window.Exporter && window.Exporter.cutParts ? window.Exporter.cutParts(cab) : [];
    rows.forEach(([cat, part, code, , L, W, qty, , , note]) => {
      if (!BOARD_CATS.includes(cat) || !L || !W || !code || code === '清玻璃') return;
      const o = map.get(code) || { cai: 0, front: 0 };
      const c = pieceCai(cat, part, L, W, note) * qty;
      o.cai += c; if (cat === '門片' || cat === '抽屜') o.front += c;
      map.set(code, o);
    });
    return map;
  }
  /* 型錄卡片的參考售價：以預設色板「110 白」的每才單價 × 單一櫃體的總才數。
     只算板材（櫃體板材／門片／抽屜／踢腳板），不含五金與款式加價。
     每次搜尋都會重畫型錄，所以把結果快取起來（單價一改就整個失效）。 */
  const CAT_COLOR = '110';
  let caiCache = new Map(), caiCacheUnit = null;
  function catalogCai(code, pricing) {
    const it = D.byCode[code];
    if (!it || it.kind === 'desk' || it.kind === 'appl') return null;
    const u = caiUnit(CAT_COLOR, pricing);
    if (caiCacheUnit !== u.unit) { caiCache = new Map(); caiCacheUnit = u.unit; }
    if (caiCache.has(code)) return caiCache.get(code);
    let out = null;
    try {
      const cab = window.Model.createCabinet(code, { bodyColor: CAT_COLOR, doorColor: CAT_COLOR, topColor: CAT_COLOR, kickColor: CAT_COLOR });
      if (cab) {
        let cai = 0;
        boardCai(cab).forEach(o => { cai += o.cai; });
        out = { cai, unit: u.unit, set: u.set, price: Math.round(cai * u.unit), color: CAT_COLOR };
      }
    } catch (e) { out = null; }
    caiCache.set(code, out);
    return out;
  }
  function clearCatalogCai() { caiCache = new Map(); caiCacheUnit = null; }

  function caiPrice(cab, pricing) {
    const lines = [];
    let total = 0, frontAmt = 0;
    const add = (name, amount, extra) => { lines.push({ name, amount, ...(extra || {}) }); total += amount; };
    const mname = code => ((pricing.materials.find(m => m.code === code) || {}).name || '');
    boardCai(cab).forEach((o, code) => {
      const u = caiUnit(code, pricing), cai = o.cai;   // 每片已進位，總才數為整數
      add(`板材 ${code} ${mname(code)}　${cai} 才 × ${u.unit}${u.set ? '' : '（預設單價）'}`, cai * u.unit, { qty: cai, unit: u.unit, cai: true });
      frontAmt += o.front * u.unit;
    });
    // 門板款式加價（依型錄款式價差比例）
    if (cab.doorStyle && cab.doorStyle !== 'STD' && frontAmt) {
      const r = styleRatio(cab.doorStyle, 72, 450) * styleFactor(pricing, cab.doorStyle) - 1;
      const st = D.DOOR_STYLES.find(s => s.id === cab.doorStyle);
      if (Math.abs(r) > 0.001) add(`門板款式加價（${st ? st.name : cab.doorStyle}）`, frontAmt * r);
    }
    // 玻璃門（鋁框＋清玻璃，依型錄）、抽屜組（屜牆＋全展緩衝滑軌）
    const fw = cab.kind === 'corner' ? 450 : cab.w;
    let glass = 0, box = 0, nBox = 0;
    (cab.fronts || []).forEach(r => {
      if (r.t === 'G') glass += glassDoor(fw, r.h);
      else if (r.t === 'GP') glass += 2 * glassDoor(fw / 2, r.h);
      else if (r.t === 'D') {
        const hk = r.h <= 14 ? 16 : nearest(r.h, [16, 24, 32]), wk = nearest(fw / 10, [45, 60, 90]), dc = cab.dc === 'T' ? 'A' : cab.dc;
        box += (D.PARTS.DRAWER[hk][dc] || D.PARTS.DRAWER[hk].A)[wk]; nBox++;
      }
    });
    const nE = (cab.fronts || []).filter(r => r.t === 'E').length;
    if (nE) { const up = pricing.parts.ESLIDE != null ? pricing.parts.ESLIDE : D.PARTS.ESLIDE; add(`電器抽滑軌 ×${nE}`, nE * up, { qty: nE, unit: up }); }
    if (glass) add('鋁框玻璃門', glass);
    if (nBox) add(`抽屜組（屜牆＋滑軌）×${nBox}`, box);
    if (cab.rod) add('吊衣桿', pricing.parts.ROD);
    const nh = hingeQty(cab), nf = footQty(cab);
    if (nh > 0) { const up = pricing.parts.HINGE != null ? pricing.parts.HINGE : D.PARTS.HINGE; add(`西德鉸鍊 ×${nh}`, nh * up, { qty: nh, unit: up }); }
    if (nf > 0) { const up = pricing.parts.FOOT != null ? pricing.parts.FOOT : D.PARTS.FOOT; add(`調整腳 ×${nf}`, nf * up, { qty: nf, unit: up }); }
    if (cab.top && cab.top !== 'none' && D.PARTS.TOP[cab.top]) {
      const tp = D.PARTS.TOP[cab.top], len = cab.kind === 'corner' ? cab.w * 2 - cab.d : cab.w;
      add(`${tp.name} ${len}mm`, Math.ceil(len / 100) * (tp[cab.dc] || tp.A) * matFactor(pricing, cab.topColor || cab.doorColor));
    }
    return { base: 0, catalogPrice: 0, total: Math.round(total), lines: lines.map(l => ({ ...l, amount: Math.round(l.amount) })), mode: 'cai' };
  }

  function cabinetPrice(cab, pricing) {
    if (cab.kind === 'desk') return deskPrice(cab, pricing);
    if (cab.kind === 'appl') return applPrice(cab, pricing);
    return caiPrice(cab, pricing);   // 櫃體一律色板才數計價（型錄牌價模式已移除）
  }

  // 全部樓層的櫃體（目前樓層以 state.cabinets 為準）
  function floorsOf(state) {
    if (!state.floors || !state.floors.length) return [{ name: '', cabinets: state.cabinets }];
    return state.floors.map((f, i) => ({ name: f.name, cabinets: i === state.floor ? state.cabinets : (f.cabinets || []) }));
  }
  function quote(state) {
    const groups = new Map();
    const floors = floorsOf(state), multi = floors.length > 1;
    let count = 0;
    floors.forEach(fl => fl.cabinets.forEach(cab => {
      count++;
      const p = cabinetPrice(cab, state.pricing);
      /* 分組鍵：fullCode 以前帶著型錄代碼與櫃身/門片色號，改成 W…H…-S 之後就沒有了，
         所以這裡要自己補上 code、深度與這兩個色號，否則不同型號或不同顏色的櫃體會被併成同一列 */
      const key = JSON.stringify([multi ? fl.name : '', fullCode(cab), cab.code, cab.d, cab.bodyColor, cab.doorColor,
        cab.kind === 'desk' ? [cab.shape, cab.w, cab.d, cab.l2, cab.thick, cab.deskMat, cab.edge] : 0,
        cab.topColor, cab.kickColor, hingeQty(cab), footQty(cab), cab.doorStyle, cab.fronts,
        cab.shelves.length, cab.shelves.filter(s => s.fixed).length, cab.top, cab.rod, cab.kick, p.total]);
      if (!groups.has(key)) groups.set(key, { cab, price: p, qty: 0, ids: [], floor: multi ? fl.name : '' });
      const g = groups.get(key); g.qty++; g.ids.push(cab.id);
    }));
    const rows = [...groups.values()];
    const subtotal = rows.reduce((s, r) => s + r.price.total * r.qty, 0);
    const disc = Math.round(subtotal * (100 - state.pricing.discount) / 100);
    const afterDisc = subtotal - disc;
    const tax = Math.round(afterDisc * state.pricing.taxRate / 100);
    return { rows, subtotal, disc, afterDisc, tax, total: afterDisc + tax, count, multi };
  }

  const fmt = n => (Math.round(n) < 0 ? '-' : '') + 'NT$ ' + Math.abs(Math.round(n)).toLocaleString('en-US');

  window.Pricing = { defaultPricing, cabinetPrice, caiUnit, boardCai, pieceCai, deskCai, catalogCai, clearCatalogCai, CAI30, quote, fullCode, describe, fmt, interp, rowCost, hasDoor, autoHinges, autoFeet, hingeQty, footQty, deskMatName, deskEdgeName, isCustom, floorsOf };
})();
