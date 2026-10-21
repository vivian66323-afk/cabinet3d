#!/usr/bin/env node
/* DXF 匯入測試：把 js/dxfin.js 載進 Node（用 vm 模擬 window），逐一解析 tests/dxf/fixtures/ 的每個檔案並檢查結果。
   執行：npm run test:dxf  或  node tests/dxf/run.js [--verbose] [名稱片段…]
   fixtures 由 tests/dxf/make-fixtures.py（ezdxf）產生，已進版控；平常跑測試不需要 Python。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const FIX = path.join(__dirname, 'fixtures');
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const only = args.filter(a => !a.startsWith('--'));

/* ---------- 把 dxfin.js 載進來（模擬瀏覽器全域） ---------- */
const calls = { toast: [], alert: [], busy: [], dialog: [] };
const sandbox = {
  window: {},
  TextDecoder, console, Math, Number, String, Object, Array, Map, Set, Uint8Array, DataView, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat, Event: class { },
  App: { busy: (on, msg) => calls.busy.push([on, msg]), toast: m => calls.toast.push(m), state: {}, mutate() { }, setRoom() { } },
};
sandbox.window.App = sandbox.App;
sandbox.window.UI = { alert: async (t, m) => calls.alert.push([t, m]), esc: s => s, icon: () => '', modal: async () => null };
sandbox.window.Model = {}; sandbox.window.Viewer = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'dxfin.js'), 'utf8'), sandbox, { filename: 'js/dxfin.js' });
const DxfIn = sandbox.window.DxfIn;
if (!DxfIn || typeof DxfIn.parse !== 'function') { console.error('js/dxfin.js 沒有提供 DxfIn.parse'); process.exit(1); }
// 對外介面必須存在（ui.js／underlay.js 用到的）
for (const fn of ['open', 'openFrame', 'guessScale', 'faces', 'candidates', 'openings', 'bridge', 'thickness', 'pip', 'dialog']) {
  if (typeof DxfIn[fn] !== 'function') { console.error('DxfIn.' + fn + ' 不見了（對外介面改變）'); process.exit(1); }
}
const UNIT = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };

/* ---------- 小工具 ---------- */
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const len = e => Math.hypot(e.p[2] - e.p[0], e.p[3] - e.p[1]);
const lines = fr => fr.ents.filter(e => e.k === 'L');
const arcs = fr => fr.ents.filter(e => e.k === 'A');
const circles = fr => fr.ents.filter(e => e.k === 'C');
const textsOf = fr => fr.ents.filter(e => e.k === 'T').map(e => e.s);
const layersOf = fr => [...new Set(fr.ents.map(e => e.l))];
const hasLine = (fr, x1, y1, x2, y2, tol = 0.05) => lines(fr).some(e => (near(e.p[0], x1, tol) && near(e.p[1], y1, tol) && near(e.p[2], x2, tol) && near(e.p[3], y2, tol)) || (near(e.p[0], x2, tol) && near(e.p[1], y2, tol) && near(e.p[2], x1, tol) && near(e.p[3], y1, tol)));
const hasCircle = (fr, cx, cy, r, tol = 0.05) => circles(fr).some(e => near(e.c[0], cx, tol) && near(e.c[1], cy, tol) && near(e.r, r, tol));
const hasArc = (fr, cx, cy, r, a1, a2, tol = 0.05) => arcs(fr).some(e => near(e.c[0], cx, tol) && near(e.c[1], cy, tol) && near(e.r, r, tol) && (a1 == null || (near(((e.a1 % 360) + 360) % 360, a1, 0.5) && near(((e.a2 % 360) + 360) % 360, a2, 0.5))));
const segsOnLayer = (fr, re, k = 1) => fr.ents.filter(e => e.k === 'L' && re.test(e.l)).map(e => [e.p[0] * k, e.p[1] * k, e.p[2] * k, e.p[3] * k]);
const read = name => new Uint8Array(fs.readFileSync(path.join(FIX, name)));
function parse(name) {
  const t0 = Date.now();
  const fr = DxfIn.parse(read(name));
  fr._ms = Date.now() - t0;
  return fr;
}
// 同一個 4 m × 3 m 房間：單位換算後最長的牆應是 4000 mm
function room4x3(t, fr, unit) {
  t.ok(!fr.error, '不應有錯誤：' + fr.error);
  t.eq(fr.unit, unit, '單位');
  const k = UNIT[fr.unit] || 1;
  const L = lines(fr).map(e => len(e) * k);
  t.eq(L.length, 4, '四道牆');
  t.ok(near(Math.max(...L), 4000, 1) && near(Math.min(...L), 3000, 1), `牆長換算後應為 4000／3000 mm，實際 ${Math.max(...L).toFixed(1)}／${Math.min(...L).toFixed(1)}`);
}
function chineseLayers(t, fr) {
  t.ok(!fr.error, '不應有錯誤：' + fr.error);
  const ls = layersOf(fr);
  for (const n of ['牆', '門窗', '文字標註', '家具-沙發']) t.ok(ls.includes(n), `圖層「${n}」應正確顯示（實際：${ls.join('、')}）`);
  t.ok(fr.layers.some(l => l.name === '門窗'), 'LAYER 表的中文名稱');
  const tx = textsOf(fr);
  for (const s of ['客廳', '主臥室', '衛浴']) t.ok(tx.includes(s), `文字「${s}」（實際：${tx.join('、')}）`);
  t.eq(fr.ents.filter(e => e.l === '牆' && e.k === 'L').length, 2, '牆圖層兩條線');
}

/* ---------- 測試案例 ---------- */
const CASES = [
  ['r12_basic.dxf', '（R12 AC1009）LINE／CIRCLE／ARC／舊式 POLYLINE 含 bulge／TEXT，沒有 $INSUNITS', (t, fr) => {
    t.ok(!fr.error, fr.error);
    t.eq(fr.header.ver, 'AC1009', '版本');
    t.eq(fr.counts.LINE, 4, 'LINE 數'); t.eq(fr.counts.POLYLINE, 1, 'POLYLINE 數'); t.eq(fr.counts.CIRCLE, 1); t.eq(fr.counts.ARC, 1); t.eq(fr.counts.TEXT, 1);
    t.eq(lines(fr).length, 7, '線段：4 牆 + 多段線 3 直段');
    t.ok(hasArc(fr, 3500, 2300, 300, 270, 90), '多段線 bulge=1 的半圓：圓心 (3500,2300) r300，270°→90°');
    t.ok(hasArc(fr, 2000, 1000, 500, 0, 90), 'ARC');
    t.ok(hasCircle(fr, 1000, 1000, 300), 'CIRCLE');
    t.ok(textsOf(fr).includes('ROOM A'), 'TEXT');
    t.eq(fr.unit, 4, 'R12 沒有 $INSUNITS → 依圖幅推測為 mm'); t.ok(fr.unitGuessed, 'unitGuessed');
    t.ok(fr.warnings.some(w => /\$INSUNITS/.test(w)), '要提醒使用者單位是推測的');
    t.ok(near(fr.bbox.x0, 0) && near(fr.bbox.x1, 4000) && near(fr.bbox.y0, 0) && near(fr.bbox.y1, 3000), 'bbox');
  }],
  ['r2000_entities.dxf', '（R2000 AC1015）LINE／LWPOLYLINE 閉合含 bulge／ARC／CIRCLE／ELLIPSE／SPLINE／TEXT／MTEXT／HATCH', (t, fr) => modernEntities(t, fr, 'AC1015')],
  ['r2018_entities.dxf', '（R2018 AC1032）同上', (t, fr) => modernEntities(t, fr, 'AC1032')],
  ['polyline_old.dxf', '舊式 POLYLINE／VERTEX／SEQEND：閉合＋90° bulge、3D 多段線投影、多面網格略過', (t, fr) => {
    t.ok(!fr.error, fr.error);
    t.eq(fr.counts.POLYLINE, 3, '三個 POLYLINE');
    t.eq(lines(fr).filter(e => e.e === 'POLYLINE').length, 5, '閉合矩形 3 直段 + 3D 多段線 2 段');
    t.ok(hasArc(fr, 2500, 1500, 2121.32, 315, 45, 0.1), '90° bulge 段：圓心 (2500,1500) r≈2121，315°→45°');
    t.ok(hasLine(fr, 100, 100, 500, 100) && hasLine(fr, 500, 100, 500, 500), '3D 多段線投影到平面');
    t.ok(fr.warnings.some(w => /網格/.test(w)), '網格要在警告裡說明略過');
  }],
  ['blocks_nested.dxf', 'INSERT：原尺寸、縮放＋旋轉、巢狀、基準點非原點、X 鏡射、陣列（MINSERT）、找不到的圖塊', (t, fr) => {
    t.ok(!fr.error, fr.error);
    t.ok(hasLine(fr, 1000, 500, 1100, 500) && hasLine(fr, 1100, 500, 1100, 550) && hasCircle(fr, 1050, 525, 10), 'CHAIR 原尺寸 @ (1000,500)');
    t.ok(hasLine(fr, 2000, 500, 2212.132, 712.132, 0.01) && hasCircle(fr, 2053.033, 659.099, 30, 0.01), 'CHAIR ×3 轉 45° @ (2000,500)');
    t.ok(hasLine(fr, 5000, 1000, 4850, 1259.808, 0.01), 'TABLE ×1.5 轉 30° 自己的線');
    t.ok(hasLine(fr, 5389.711, 1225, 5239.711, 1484.808, 0.01) && hasLine(fr, 5239.711, 1484.808, 5109.808, 1409.808, 0.01) && hasCircle(fr, 5249.760, 1317.404, 30, 0.01), '巢狀 CHAIR（×2 轉 90°）在 TABLE（×1.5 轉 30°）裡');
    t.ok(hasLine(fr, 8000, 0, 7900, 0) && hasLine(fr, 7900, 0, 7900, 50) && hasCircle(fr, 7950, 25, 10), 'X 鏡射（xscale = -1）');
    let n = 0; for (let c = 0; c < 2; c++) for (let r = 0; r < 3; r++) if (hasCircle(fr, 50 + 500 * c, 5025 + 400 * r, 10)) n++;
    t.eq(n, 6, '陣列插入 2 欄 × 3 列（欄距 500、列距 400）');
    t.ok(hasLine(fr, 3000, 3000, 3100, 3000), '圖塊基準點 (100,100) 要扣掉');
    t.eq(circles(fr).length, 10, '圓總數');
    t.ok(fr.warnings.some(w => /MISSING/.test(w)), '找不到的圖塊要警告');
    t.ok(fr.ents.every(e => e.l === 'BLK'), '圖塊內圖元保留自己的圖層');
  }],
  ['layers_utf8.dxf', '（R2018）中文圖層名與文字：UTF-8', (t, fr) => { chineseLayers(t, fr); t.eq(fr.encoding, 'utf-8', '編碼'); }],
  ['layers_big5.dxf', '（R2000）中文圖層名與文字：Big5／CP950（$DWGCODEPAGE ANSI_950）', (t, fr) => { chineseLayers(t, fr); t.eq(fr.encoding, 'big5', '編碼'); t.ok(fr.warnings.some(w => /Big5/.test(w)), '提示已轉碼'); }],
  ['layers_big5_nocodepage.dxf', '（R2000）Big5 但沒寫 $DWGCODEPAGE：預設以 Big5 解碼', (t, fr) => { chineseLayers(t, fr); t.eq(fr.encoding, 'big5'); t.ok(fr.warnings.some(w => /DWGCODEPAGE/.test(w)), '提示沒有字碼頁'); }],
  ['layers_big5_wrongcodepage.dxf', '（R2000）$DWGCODEPAGE 標成 ANSI_1252 但內容是 Big5：要自動改用 Big5', (t, fr) => { chineseLayers(t, fr); t.eq(fr.encoding, 'big5'); t.ok(fr.warnings.some(w => /標示為 ANSI_1252/.test(w)), '提示字碼頁標錯'); }],
  ['layers_gbk.dxf', '（R2000）簡體 GBK（$DWGCODEPAGE ANSI_936）', (t, fr) => { t.ok(!fr.error, fr.error); t.eq(fr.encoding, 'gbk'); t.ok(layersOf(fr).includes('墙体'), '圖層「墙体」'); }],
  ['text_escapes.dxf', 'AutoCAD 文字轉義 \\M+1XXXX（Big5）與 \\U+XXXX', (t, fr) => { t.ok(!fr.error, fr.error); t.ok(textsOf(fr).includes('牆門'), `應還原成「牆門」（實際：${textsOf(fr).join('、')}）`); }],
  ['units_mm.dxf', '$INSUNITS = 4（mm）', (t, fr) => room4x3(t, fr, 4)],
  ['units_cm.dxf', '$INSUNITS = 5（cm）', (t, fr) => room4x3(t, fr, 5)],
  ['units_m.dxf', '$INSUNITS = 6（m）', (t, fr) => room4x3(t, fr, 6)],
  ['units_inch.dxf', '$INSUNITS = 1（inch）', (t, fr) => room4x3(t, fr, 1)],
  ['units_none_cm.dxf', '$INSUNITS = 0（無單位）、圖以 cm 畫 → 依圖幅推測', (t, fr) => { room4x3(t, fr, 5); t.ok(fr.unitGuessed && fr.warnings.some(w => /\$INSUNITS/.test(w)), '要提醒單位是推測的'); }],
  ['units_none_r12_mm.dxf', 'R12 沒有 $INSUNITS、圖以 mm 畫 → 依圖幅推測', (t, fr) => { room4x3(t, fr, 4); t.ok(fr.unitGuessed, 'unitGuessed'); }],
  ['binary_r2000.dxf', '二進位 DXF（R2000）', (t, fr) => { t.ok(fr.binary, '要辨識為二進位'); room4x3(t, fr, 4); t.eq(fr.header.ver, 'AC1015'); t.ok(layersOf(fr).includes('WALL'), '圖層'); }],
  ['house_plan.dxf', '真實尺寸住宅平面（mm）：雙線牆、門弧、窗線、房間名稱、家具圖塊', (t, fr) => {
    t.ok(!fr.error, fr.error);
    t.eq(fr.unit, 4, 'mm');
    for (const n of ['牆', '門', '窗', '文字', '家具']) t.ok(layersOf(fr).includes(n), `圖層「${n}」`);
    const tx = textsOf(fr); for (const s of ['客廳', '主臥', '浴室']) t.ok(tx.includes(s), `房間名稱「${s}」`);
    t.ok(hasLine(fr, 500, 500, 2500, 500) && hasLine(fr, 2500, 500, 2500, 1400), 'SOFA 圖塊展開位置');
    const wall = segsOnLayer(fr, /牆/, UNIT[fr.unit]);
    const Ls = wall.map(s => Math.hypot(s[2] - s[0], s[3] - s[1]));
    t.ok(Math.max(...Ls) > 8000 && Math.max(...Ls) < 10000, `牆長應在 cm～m 數量級（最長 ${Math.max(...Ls).toFixed(0)} mm）`);
    t.ok(Ls.every(l => l >= 100 && l <= 10000), '所有牆線長度合理');
    // 自動找房間（dxfin 既有流程）：橋接門口 → 找封閉面 → 候選房間
    const br = DxfIn.bridge(wall), faces = DxfIn.faces(br.segs), cands = DxfIn.candidates(faces);
    t.ok(cands.length >= 3, `應找到 ≥3 個房間（找到 ${cands.length}）`);
    const areaNear = a => cands.some(c => Math.abs(c.area - a) / a < 0.02);
    t.ok(areaNear(5000 * 6000), '客廳 5000×6000'); t.ok(areaNear(3880 * 3000), '浴室 3880×3000'); t.ok(areaNear(3880 * 2880), '主臥 3880×2880');
    const living = cands.find(c => Math.abs(c.area - 30e6) / 30e6 < 0.02);
    if (living) {
      const th = DxfIn.thickness(living.pts, wall);
      t.ok(th === 120 || th === 150, `牆厚估計 120 或 150（得到 ${th}）`);
      const det = DxfIn.openings(living.pts, th || 120, fr.ents, 1, {}, br.bridges, wall);
      const nd = det.openings.filter(o => o.type === 'door').length, nw = det.openings.length - nd;
      t.ok(nd >= 2, `客廳應偵測到 ≥2 扇門（大門、通往右側）（得到 ${nd}）`);
      t.ok(nw >= 1, `客廳應偵測到 ≥1 扇窗（得到 ${nw}）`);
    }
  }],
  ['sketchup_r12.dxf', 'SketchUp 式匯出（R12）：LINE 帶 Z、垂直線、3DFACE', (t, fr) => {
    t.ok(!fr.error, fr.error);
    t.ok(hasLine(fr, 0, 0, 4000, 0) && hasLine(fr, 4000, 3000, 0, 3000), '帶 Z 的 LINE 投影');
    t.eq(lines(fr).filter(e => e.e === '3DFACE').length, 2, '3DFACE 投影後只剩兩條有長度的邊');
    t.ok(!fr.warnings.some(w => /3DFACE/.test(w)), '3DFACE 不應列為不支援');
  }],
  ['extrusion_mirror.dxf', '擠出方向 (0,0,-1)（MIRROR 過的圓／弧／多段線）：x 要反向', (t, fr) => {
    t.ok(!fr.error, fr.error);
    t.ok(hasCircle(fr, -1000, 500, 200), '鏡射的圓應在 (-1000,500)');
    t.ok(hasArc(fr, -2000, 500, 300, 90, 180), '鏡射的弧：圓心 (-2000,500)，角度 90°→180°');
    t.ok(hasLine(fr, 0, 0, -500, 0) && hasLine(fr, -500, 0, -500, 300), '鏡射的 LWPOLYLINE');
    t.ok(hasLine(fr, 0, 0, 1000, 0), '一般 LINE 不受影響');
  }],
  ['empty_modelspace.dxf', '只有配置（圖紙空間）有圖：要有明確的錯誤訊息', (t, fr) => {
    t.ok(fr.error, '應回報錯誤');
    t.ok(/配置|圖紙空間/.test(fr.error || ''), `錯誤訊息要說明圖在配置裡（實際：${fr.error}）`);
  }],
  ['minimal_crlf.dxf', '手寫極簡 DXF：CRLF、群組碼補空白、沒有 HEADER／TABLES／EOF', (t, fr) => {
    t.ok(!fr.error, fr.error);
    t.eq(lines(fr).length, 4, '2 LINE + LWPOLYLINE 2 段');
    t.eq(fr.unit, 4, '沒有 HEADER → 推測 mm');
  }],
  ['not_a_dxf.dwg', '不是 DXF（誤選 DWG）：要有明確的錯誤訊息', (t, fr) => {
    t.ok(fr.error, '應回報錯誤');
    t.ok(/不是 DXF/.test(fr.error || '') && /dwg/i.test(fr.error || ''), `錯誤訊息要說這不是 DXF 並提到 DWG 另存（實際：${fr.error}）`);
  }],
  ['mtext_long.dxf', 'MTEXT：長字串以 code 3 分段、格式碼、直書字型', (t, fr) => {
    t.ok(!fr.error, fr.error);
    const tx = textsOf(fr);
    t.ok(tx.includes('粗體一般'), `格式碼拿掉後「粗體一般」（實際：${tx.slice(0, 3).join('、')}…）`);
    t.ok(tx.some(s => s === 'ABCDEFGHIJ'.repeat(30)), '300 字的長字串要接回一段');
    t.ok(tx.includes('直') && tx.includes('書'), '直書拆成單字');
  }],
];
function modernEntities(t, fr, ver) {
  t.ok(!fr.error, fr.error);
  t.eq(fr.header.ver, ver, '版本'); t.eq(fr.unit, 4, 'mm');
  for (const [k, n] of [['LINE', 4], ['LWPOLYLINE', 1], ['ELLIPSE', 1], ['SPLINE', 1], ['MTEXT', 1], ['HATCH', 1], ['TEXT', 1], ['CIRCLE', 1], ['ARC', 1]]) t.eq(fr.counts[k], n, k + ' 數');
  t.eq(lines(fr).filter(e => !e.e).length, 4, '四條 LINE');
  t.eq(lines(fr).filter(e => e.e === 'LWPOLYLINE').length, 3, 'LWPOLYLINE 閉合：3 直段');
  t.ok(hasArc(fr, 3500, 2300, 300, 270, 90), 'LWPOLYLINE bulge=1 半圓');
  const el = lines(fr).filter(e => e.e === 'ELLIPSE');
  t.ok(el.length >= 16, `ELLIPSE 攤平成 ≥16 段（${el.length}）`);
  t.ok(el.every(e => Math.abs(e.p[0] - 1000) <= 400.01 && Math.abs(e.p[1] - 2200) <= 200.01), 'ELLIPSE 的點落在長短軸範圍內');
  t.ok(el.some(e => near(e.p[0], 1400, 0.01) && near(e.p[1], 2200, 0.01)), 'ELLIPSE 通過長軸端點 (1400,2200)');
  const sp = lines(fr).filter(e => e.e === 'SPLINE');
  t.ok(sp.length >= 8, `SPLINE 攤平成 ≥8 段（${sp.length}）`);
  t.ok(near(sp[0].p[0], 200, 0.01) && near(sp[0].p[1], 200, 0.01) && near(sp[sp.length - 1].p[2], 1400, 0.01) && near(sp[sp.length - 1].p[3], 600, 0.01), 'SPLINE 起點 (200,200) 終點 (1400,600)');
  t.ok(sp.some(e => near(e.p[0], 600, 0.5) && near(e.p[1], 500, 0.5)), 'SPLINE 穿過擬合點 (600,500)');
  const h = lines(fr).filter(e => e.e === 'HATCH');
  t.eq(h.length, 4, 'HATCH 邊界 4 條');
  t.ok(hasLine(fr, 3600, 200, 3900, 200) && hasLine(fr, 3900, 500, 3600, 500), 'HATCH 邊界位置');
  const tx = textsOf(fr);
  t.ok(tx.includes('ROOM A') && tx.includes('第一行') && tx.includes('第二行'), `TEXT／MTEXT（實際：${tx.join('、')}）`);
  t.ok(!fr.warnings.some(w => /不支援/.test(w)), `不應有「不支援」警告（${fr.warnings.join('；')}）`);
}

/* ---------- X.open 流程（含錯誤訊息呈現） ---------- */
const FLOW = [
  ['binary_r2000.dxf', '二進位 DXF 走 open() 要能開到對話框', async () => {
    const r = await openFile('binary_r2000.dxf');
    return [[!r.alert && r.dialog, `應直接開對話框（alert=${JSON.stringify(r.alert)}）`], [r.dialog && r.dialog.unit === 4, '單位 mm']];
  }],
  ['not_a_dxf.dwg', 'DWG 走 open() 要跳出說明', async () => {
    const r = await openFile('not_a_dxf.dwg');
    return [[r.alert && /不是 DXF/.test(r.alert[1]), `應 alert 不是 DXF（${JSON.stringify(r.alert)}）`], [!r.dialog, '不應開對話框']];
  }],
  ['empty_modelspace.dxf', '圖在配置裡走 open() 要跳出說明', async () => {
    const r = await openFile('empty_modelspace.dxf');
    return [[r.alert && /配置/.test(r.alert[1]), `應 alert 配置（${JSON.stringify(r.alert)}）`]];
  }],
  ['layers_big5.dxf', 'Big5 檔走 open() 後對話框的圖層名要是中文、警告要帶進對話框', async () => {
    const r = await openFile('layers_big5.dxf');
    return [[r.dialog && r.dialog.layerNames.includes('門窗'), `圖層名（${r.dialog && r.dialog.layerNames.join('、')}）`], [r.dialog && r.dialog.st.warn.some(w => /Big5/.test(w)), '警告要帶進對話框']];
  }],
  ['house_plan.dxf', '對話框 HTML：圖層清單、單位選項、警告區塊（用 modal 樁擷取 body）', async () => {
    const r = await openDialog('units_none_cm.dxf');
    return [[/WALL/.test(r.body), '圖層清單'], [/ft（英呎）/.test(r.body), '單位選項含英呎'], [/⚠.*\$INSUNITS/.test(r.body), '警告區塊要顯示單位推測提示'], [/value="5" selected/.test(r.body), '推測的單位 cm 要預選'], [r.title.includes('units_none_cm.dxf'), '標題帶檔名']];
  }],
];
// 真的跑 X.dialog（modal 用樁擷取 HTML 後立刻取消）
async function openDialog(name) {
  const bytes = read(name);
  const file = { name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  let cap = null;
  const origModal = sandbox.window.UI.modal;
  sandbox.window.UI.modal = async o => { cap = o; return null; };
  try { await DxfIn.open(file); } finally { sandbox.window.UI.modal = origModal; }
  return cap || { body: '', title: '' };
}
async function openFile(name) {
  calls.alert.length = calls.toast.length = calls.dialog.length = 0;
  const bytes = read(name);
  const file = { name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  const orig = DxfIn.dialog;
  DxfIn.dialog = async (st, counts, layerNames) => { calls.dialog.push({ st, counts, layerNames, unit: st.unit }); };
  try { await DxfIn.open(file); } finally { DxfIn.dialog = orig; }
  return { alert: calls.alert[0] || null, toast: calls.toast[0] || null, dialog: calls.dialog[0] || null };
}

/* ---------- 執行 ---------- */
(async () => {
  let pass = 0, fail = 0;
  const failures = [];
  const mk = name => { const fails = []; return { fails, ok: (c, m) => { if (!c) fails.push(m || '條件不成立'); }, eq: (a, b, m) => { if (a !== b) fails.push(`${m || ''} 期望 ${JSON.stringify(b)}，實際 ${JSON.stringify(a)}`); } }; };
  for (const [file, desc, check] of CASES) {
    if (only.length && !only.some(o => file.includes(o))) continue;
    const t = mk(file);
    let fr;
    try { fr = parse(file); check(t, fr); } catch (e) { t.fails.push('拋出例外：' + (e.stack || e)); }
    const ok = !t.fails.length;
    if (ok) pass++; else { fail++; failures.push([file, t.fails]); }
    console.log(`${ok ? '✅' : '❌'} ${file.padEnd(28)} ${desc}${fr && fr._ms != null ? `  [${fr._ms} ms, ${fr.ents ? fr.ents.length : 0} 圖元]` : ''}`);
    if (VERBOSE && fr) console.log('   warnings:', fr.warnings);
    t.fails.forEach(f => console.log('     ✗ ' + f));
  }
  for (const [file, desc, run] of FLOW) {
    if (only.length && !only.some(o => file.includes(o))) continue;
    let res;
    try { res = await run(); } catch (e) { res = [[false, '拋出例外：' + (e.stack || e)]]; }
    const fails = res.filter(r => !r[0]).map(r => r[1]);
    const ok = !fails.length;
    if (ok) pass++; else { fail++; failures.push(['open:' + file, fails]); }
    console.log(`${ok ? '✅' : '❌'} ${('open:' + file).padEnd(28)} ${desc}`);
    fails.forEach(f => console.log('     ✗ ' + f));
  }
  console.log(`\n${pass} 通過，${fail} 失敗`);
  process.exit(fail ? 1 : 0);
})();
