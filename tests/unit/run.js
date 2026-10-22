#!/usr/bin/env node
/* Node 單元測試：把不需要瀏覽器畫面的模組（資料、報價、建模資料、圖面幾何、天花、DXF 輸出、狀態／樓層）
   載進 vm 沙箱（模擬 window／document／Viewer／UI 的最小樁），逐一驗證邏輯。
   執行：npm run test:unit  或  node tests/unit/run.js [--verbose] [名稱片段…]
   這裡的每個案例都對應一個修過的 bug（或守住一個容易壞掉的邊界），修壞了就會紅。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const only = args.filter(a => !a.startsWith('--'));

/* ---------- 瀏覽器環境樁 ---------- */
function makeStorage() {
  const m = new Map();
  const st = {
    getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, clear: () => m.clear(),
    get length() { return m.size; }, key: i => [...m.keys()][i]
  };
  return new Proxy(st, { ownKeys: () => [...m.keys()], getOwnPropertyDescriptor: (t, k) => (m.has(k) ? { enumerable: true, configurable: true, value: m.get(k) } : Object.getOwnPropertyDescriptor(t, k)), get: (t, k) => (k in t ? t[k] : m.get(k)) });
}
function fakeEl() { return { textContent: '', hidden: false, innerHTML: '', style: {}, addEventListener() { }, appendChild() { }, remove() { }, click() { }, querySelector() { return null; } }; }
const calls = { toast: [], alert: [], rebuild: [] };
function makeSandbox() {
  const win = {};
  const sb = {
    window: win, console, Math, Number, String, Object, Array, Map, Set, JSON, Date, RegExp, Error, Promise, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat, setTimeout, clearTimeout,
    Image: class { }, DOMMatrix: class { }, TextDecoder, Uint8Array, DataView, Blob: class { constructor(parts) { this.parts = parts; } }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() { } }, FileReader: class { },
    document: { createElement: () => fakeEl(), getElementById: () => fakeEl(), body: fakeEl(), addEventListener() { }, head: fakeEl() },
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    performance: { now: () => Date.now() }, matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 0, ResizeObserver: class { observe() { } }
  };
  Object.assign(win, { localStorage: sb.localStorage, sessionStorage: sb.sessionStorage, document: sb.document, addEventListener() { }, matchMedia: sb.matchMedia, location: { href: 'http://localhost/index.html' } });
  // 3D 檢視器與介面：記錄呼叫即可
  win.Viewer = { rebuildAll: () => calls.rebuild.push('all'), rebuildRoom: () => calls.rebuild.push('room'), rebuildUnderlay: () => calls.rebuild.push('underlay'), rebuildCabinet: id => calls.rebuild.push(id), checkOverlaps() { }, refreshGaps() { }, updateSelection() { }, zoomExtents() { }, setView() { }, init() { }, getCabGroup: () => ({ children: [] }) };
  win.UI = { init() { }, refresh() { }, showProps() { }, alert: (t, m) => calls.alert.push([t, m]), syncToolbar() { }, matOf: () => null };
  vm.createContext(sb);
  // 讓 window.X 與全域 X 同步（原始碼有時直接用 App／THREE 等全域名）
  const load = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  ['js/catalog.js', 'js/swatches.js', 'js/catalog-handles.js', 'js/data.js', 'js/swatchlib.js', 'js/pricing.js', 'js/model.js', 'js/drawings.js', 'js/export.js', 'js/ceiling.js', 'js/dxf.js'].forEach(load);
  // app.js 會在模組內直接用 App（window.App 在最後才指定），先載入後把全域對上
  load('js/app.js');
  vm.runInContext('var App = window.App; var THREE = undefined;', sb);
  win.App.ui = win.UI;
  win.App.toast = m => calls.toast.push(m);
  win.App.state = win.App.defaultState();
  return sb;
}

/* ---------- 小工具 ---------- */
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
// 解析 DXF 文字為 [code, value] 對，並取出所有圖元
function dxfEntities(text) {
  const L = text.split(/\r\n|\n/), ents = []; let cur = null, inEnt = false;
  for (let i = 0; i + 1 < L.length; i += 2) {
    const c = parseInt(L[i].trim(), 10), v = L[i + 1].trim();
    if (c === 2 && v === 'ENTITIES') inEnt = true;
    if (!inEnt) continue;
    if (c === 0) { if (v === 'ENDSEC') break; cur = { t: v, g: {} }; ents.push(cur); }
    else if (cur) cur.g[c] = v;
  }
  return ents;
}

/* ---------- 測試案例：[名稱, 說明, fn(t, sb)] ---------- */
const CASES = [
  ['app:deleteFloor-underlay', '刪除目前樓層後，底圖要換成新目前樓層自己的底圖，不能把被刪樓層的底圖帶過去', (t, sb) => {
    const { App } = sb.window;
    App.newProject();
    const u1 = { src: 'data:1', w: 100, h: 80, scale: 10, x: 0, z: 0, rot: 0, opacity: 0.7, visible: true, name: '1F.png' };
    const u2 = { src: 'data:2', w: 120, h: 90, scale: 12, x: 5, z: 5, rot: 0, opacity: 0.7, visible: true, name: '2F.png' };
    App.mutate('底圖 1F', s => { s.underlay = u1; }, 'underlay');
    App.addFloor();                                   // 切到 2F
    t.eq(App.state.floor, 1, '新增樓層後應在 2F');
    App.mutate('底圖 2F', s => { s.underlay = u2; }, 'underlay');
    App.sel = { type: 'cab', id: 'nope' };
    App.deleteFloor(1);                               // 刪掉目前的 2F → 回到 1F
    t.eq(App.state.floor, 0, '刪除後應回到 1F');
    t.eq(App.state.floors.length, 1, '只剩一層');
    t.ok(App.state.underlay && App.state.underlay.name === '1F.png', `目前底圖應是 1F 的（實際：${App.state.underlay && App.state.underlay.name}）`);
    t.ok(App.state.floors[0].underlay && App.state.floors[0].underlay.name === '1F.png', `1F 樓層資料裡的底圖不可被 2F 覆蓋（實際：${App.state.floors[0].underlay && App.state.floors[0].underlay.name}）`);
    t.eq(App.sel, null, '刪除樓層後不應留著舊的選取');
    // 刪除「非目前」且排在前面的樓層：目前樓層索引往前移，底圖仍是自己的
    App.addFloor(); App.mutate('底圖 2F', s => { s.underlay = u2; }, 'underlay');
    App.deleteFloor(0);
    t.eq(App.state.floor, 0, '刪掉前面的樓層後索引要往前移');
    t.ok(App.state.underlay && App.state.underlay.name === '2F.png', '仍是自己（原 2F）的底圖');
  }],
  ['app:addFloor-no-copy-mep', '新增樓層只沿用空間外框：天花設備、插座、冷氣、迴路不可複製到新樓層（否則報價重複計價）', (t, sb) => {
    const { App, Model, Pricing, Ceiling } = sb.window;
    App.newProject(); App.setRoom(Model.rectRoom(4000, 3000, 2800, 120));
    const r = App.state.room; Ceiling.ensure(r); r.ceiling.h = 2500; r.ceiling.molding = 'flat';
    Ceiling.addZone(r, 'drop', [[-1000, -1000], [1000, -1000], [1000, 1000], [-1000, 1000]], 2300, true);
    Ceiling.addFixture(r, 'dl_big', [0, 0]); Ceiling.addStrip(r, [-500, 0], [500, 0]); Ceiling.addOutlet(r, 'socket', 1900, 0); Ceiling.addAC(r, [0, 0], [2000, 1500], 3.6); Ceiling.autoCircuits(r);
    r.walls[0].openings.push({ id: 'd', type: 'door', offset: 500, width: 900, height: 2100, sill: 0 });
    const before = Pricing.quote(App.state).ceilTotal;
    App.addFloor();
    const f2 = App.state.floors[1].room;
    t.ok(f2 && f2.points.length === 4 && f2.height === 2800, '外框（頂點、高度）有沿用');
    t.eq(f2.walls[0].openings.length, 0, '門窗不複製');
    t.eq(f2.ceiling.h, 2500, '天花基本高沿用'); t.eq(f2.ceiling.molding, 'flat', '線板設定沿用');
    t.eq(f2.ceiling.zones.length, 0, '降板區不複製'); t.eq(f2.ceiling.strips.length, 0, '鋁槽燈不複製'); t.eq(f2.ceiling.fixtures.length, 0, '崁燈不複製');
    t.eq(f2.outlets.length, 0, '插座不複製'); t.eq(f2.acs.length, 0, '冷氣不複製'); t.eq(f2.circuits.length, 0, '迴路不複製');
    const after = Pricing.quote(App.state);
    const flat = after.ceiling.filter(l => /^平釘天花/.test(l.name));
    t.eq(flat.length, 2, '兩層各一筆平釘天花');
    t.ok(after.ceilTotal < before * 2, `天花工程不可整份重複（前 ${before}、後 ${after.ceilTotal}）`);
    t.eq(after.ceiling.filter(l => /崁燈|插座|冷氣|迴路|鋁槽燈/.test(l.name)).length, Pricing.quote({ ...App.state, floors: [App.state.floors[0]], floor: 0, room: App.state.floors[0].room, cabinets: [] }).ceiling.filter(l => /崁燈|插座|冷氣|迴路|鋁槽燈/.test(l.name)).length, '設備／電路項目只有 1F 的');
  }],
  ['app:deleteSelected-stale', '選取指向不在目前樓層的櫃體時（報價分頁點到別層的列），按刪除不可拋錯，應清掉選取', (t, sb) => {
    const { App, Model } = sb.window;
    App.newProject();
    const c = Model.createCabinet('W450D580H320-左開32-S', App.state.defaults); App.addCabinet(c);
    App.addFloor();                                    // 切到 2F，1F 的櫃體不在 App.state.cabinets
    App.sel = { type: 'cab', id: c.id };
    let threw = null;
    try { App.deleteSelected(); } catch (e) { threw = e; }
    t.ok(!threw, '不可拋出例外：' + (threw && threw.message));
    t.eq(App.sel, null, '選取應被清掉');
    t.eq(App.state.floors[0].cabinets.length, 1, '別層的櫃體不可被誤刪');
  }],
  ['app:normalize-roundtrip', '存檔→載入（normalize）不會遺失樓層、底圖、天花與電路資料', (t, sb) => {
    const { App, Model, Ceiling } = sb.window;
    App.newProject();
    App.setRoom(Model.rectRoom(4000, 3000, 2800, 120));
    const c = Model.createCabinet('W450D580H320-左開32-S', App.state.defaults); App.addCabinet(c);
    Ceiling.ensure(App.state.room); Ceiling.addFixture(App.state.room, 'dl_big', [100, 100]); Ceiling.addOutlet(App.state.room, 'socket', 1900, 0); Ceiling.autoCircuits(App.state.room);
    App.mutate('底圖', s => { s.underlay = { src: 'data:u', w: 10, h: 10, scale: 1, x: 0, z: 0, rot: 0, opacity: 0.7, visible: true, name: 'u' }; }, 'underlay');
    App.addFloor();
    const json = App.projectJSON();
    const data = JSON.parse(json);
    App.loadProject(data);
    const st = App.state;
    t.eq(st.floors.length, 2, '兩層');
    t.eq(st.floor, 1, '目前樓層');
    t.ok(st.floors[0].underlay && st.floors[0].underlay.name === 'u', '1F 底圖保留');
    t.eq(st.floors[0].cabinets.length, 1, '1F 櫃體保留');
    t.eq(st.floors[0].room.ceiling.fixtures.length, 1, '天花設備保留');
    t.eq(st.floors[0].room.outlets.length, 1, '插座保留');
    t.ok(st.floors[0].room.circuits.length >= 2, '迴路保留');
    t.ok(st.floors[0].cabinets[0].shelves && st.floors[0].cabinets[0].base, '層板與 base 欄位');
  }],
  ['pricing:handles-fold', '報價的把手數：折疊門（4 片）要算 4 支，與 3D 與拆料清單一致', (t, sb) => {
    const { App, Model, Pricing, Exporter, DATA } = sb.window;
    App.newProject();
    const hd = DATA.HANDLES.find(h => h.price > 0);
    t.ok(hd, '型錄裡要有有單價的把手（IKEA）');
    const cab = Model.createCabinet('W450D580H320-左開32-S', App.state.defaults);
    cab.handle = hd.id;
    const count = (fronts) => {
      cab.fronts = fronts.map(r => ({ ...r })); cab.shelves = Model.genShelves(cab);
      const p = Pricing.cabinetPrice(cab, App.state.pricing);
      const line = p.lines.find(l => /^把手/.test(l.name));
      const cut = Exporter.cutParts(cab).filter(r => r[0] === '把手').reduce((s, r) => s + r[6], 0);
      return { quote: line ? line.qty : 0, cut };
    };
    t.eq(count([{ t: 'F', h: 32 }]).quote, 4, '折疊門一列＝4 片門＝4 支把手');
    t.eq(count([{ t: 'F', h: 32 }]).cut, 4, '拆料清單同樣 4 支');
    t.eq(count([{ t: 'P', h: 32 }]).quote, 2, '對開＝2');
    t.eq(count([{ t: 'L', h: 16 }, { t: 'D', h: 16 }]).quote, 2, '單門＋抽屜＝2');
    t.eq(count([{ t: 'GP', h: 32 }]).quote, 2, '玻璃對開＝2');
    t.eq(count([{ t: 'O', h: 32 }]).quote, 0, '開放格無把手');
  }],
  ['dxf:plan-door-arc', '平面圖 DXF 的門開啟弧：不論空間頂點是順時針或逆時針畫，弧都要是 90°（不能畫成 270°）', (t, sb) => {
    const { Model, DXFOut } = sb.window;
    const sweep = pts => {
      const room = Model.createRoom(pts, 2800, 120);
      room.walls[0].openings.push({ id: 'd1', type: 'door', offset: 500, width: 900, height: 2100, sill: 0, style: 'single' });
      const doc = DXFOut.Doc({ scale: 30 });
      DXFOut.plan(doc, { room, cabinets: [] }, 0, 0, { labels: false, dims: false, index: false, hatch: false });
      const arcs = dxfEntities(doc.toString()).filter(e => e.t === 'ARC');
      t.eq(arcs.length, 1, '一道門一個弧');
      if (!arcs.length) return NaN;
      const a1 = +arcs[0].g[50], a2 = +arcs[0].g[51];
      return ((a2 - a1) % 360 + 360) % 360;
    };
    const ccw = [[-2000, -1500], [2000, -1500], [2000, 1500], [-2000, 1500]];
    const cw = ccw.slice().reverse();
    const s1 = sweep(ccw), s2 = sweep(cw);
    t.ok(near(s1, 90, 0.5), `逆時針空間的門弧應為 90°（實際 ${s1.toFixed(1)}°）`);
    t.ok(near(s2, 90, 0.5), `順時針空間的門弧應為 90°（實際 ${s2.toFixed(1)}°）`);
  }],
  ['drawings:elevation-wallCabinets', '立面圖：靠牆櫃體的左側位置與門窗位置用同一套方向，順時針空間也不能左右顛倒', (t, sb) => {
    const { Model, Drawings } = sb.window;
    const check = pts => {
      const room = Model.createRoom(pts, 2800, 120);
      // 找出 y=-1500 這道牆（底牆）的索引
      const i = room.points.findIndex((p, k) => p[1] === -1500 && room.points[(k + 1) % 4][1] === -1500);
      const wi = Model.wallInfo(room, i);
      const cab = Model.createCabinet('W450D580H320-左開32-S', {});
      // 放在牆上距 p 點 1000 處、櫃背貼牆
      const rot = Math.round(Math.atan2(wi.nIn[0], wi.nIn[1]) * 180 / Math.PI);
      Object.assign(cab, { x: wi.p[0] + wi.dir[0] * 1000, z: wi.p[1] + wi.dir[1] * 1000 + wi.nIn[1] * 290, rot: ((rot % 360) + 360) % 360 });
      cab.x += wi.nIn[0] * 290;
      room.walls[i].openings.push({ id: 'w1', type: 'window', offset: 2500, width: 800, height: 1000, sill: 900 });
      const { list, right } = Drawings.wallCabinets({ room, cabinets: [cab] }, i);
      t.eq(list.length, 1, '櫃體要被算進這道牆');
      const fwd = (wi.dir[0] * right[0] + wi.dir[1] * right[1]) > 0;
      const winLeft = fwd ? 2500 : wi.len - 2500 - 800;
      const cabLeft = list[0].left;
      // 從室內面向牆：櫃體在距 p 點 1000、窗在 2500；兩者的左右關係要和 fwd 一致
      t.ok(fwd ? cabLeft < winLeft : cabLeft > winLeft, `櫃體與窗的左右順序（fwd=${fwd}，櫃 ${cabLeft.toFixed(0)}、窗 ${winLeft.toFixed(0)}）`);
    };
    check([[-2000, -1500], [2000, -1500], [2000, 1500], [-2000, 1500]]);
    check([[-2000, -1500], [-2000, 1500], [2000, 1500], [2000, -1500]]);
  }],
  ['export:cutParts-no-throw', '拆料清單對各種櫃型（含三角邊櫃、轉角、桌面、設備、補板）都能產生、才數為整數', (t, sb) => {
    const { Model, Exporter, Pricing, DATA } = sb.window;
    const codes = ['W450D580H320-左開32-S', 'DESK-L', 'DESK-U', 'DESK-R'];
    const extra = DATA.items.filter(it => ['corner', 'tri', 'filler', 'appl'].includes(it.kind)).slice(0, 12).map(it => it.code);
    codes.concat(extra).forEach(code => {
      const cab = Model.createCabinet(code, {});
      t.ok(cab, '可建立 ' + code);
      if (!cab) return;
      const rows = Exporter.cutParts(cab);
      t.ok(Array.isArray(rows), '拆料 ' + code);
      Pricing.boardCai(cab).forEach((o, k) => t.ok(Number.isInteger(o.cai) && o.cai >= 0, `${code} 色號 ${k} 才數應為整數`));
      const p = Pricing.cabinetPrice(cab, Pricing.defaultPricing());
      t.ok(Number.isFinite(p.total) && p.total >= 0, `${code} 報價為有限數（${p.total}）`);
    });
  }]
];

/* ---------- 執行 ---------- */
(async () => {
  let pass = 0, fail = 0;
  for (const [name, desc, fn] of CASES) {
    if (only.length && !only.some(o => name.includes(o))) continue;
    const fails = [];
    const t = { ok: (c, m) => { if (!c) fails.push(m || '條件不成立'); }, eq: (a, b, m) => { if (a !== b) fails.push(`${m || ''} 期望 ${JSON.stringify(b)}，實際 ${JSON.stringify(a)}`); } };
    try { calls.toast.length = calls.alert.length = calls.rebuild.length = 0; await fn(t, makeSandbox()); }
    catch (e) { fails.push('拋出例外：' + (e.stack || e)); }
    const ok = !fails.length;
    if (ok) pass++; else fail++;
    console.log(`${ok ? '✅' : '❌'} ${name.padEnd(32)} ${desc}`);
    fails.forEach(f => console.log('     ✗ ' + f));
    if (VERBOSE) console.log('   calls:', JSON.stringify(calls));
  }
  console.log(`\n${pass} 通過，${fail} 失敗`);
  process.exit(fail ? 1 : 0);
})();
