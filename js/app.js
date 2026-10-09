/* 應用狀態、復原/重做、存檔 */
(function () {
  const LS_STATE = 'cab3d.project';
  const LS_USER = 'cab3d.user';
  // 專案暫存只存在「這個分頁」：重新整理（F5）保留；關閉網站後重開為新的空白專案
  const STORE = window.sessionStorage;
  try {
    Object.keys(window.localStorage).forEach(k => { if (/^cab3d\.(project|user|backup)/.test(k)) window.localStorage.removeItem(k); });
  } catch (e) { /* 忽略 */ }

  const App = {
    state: null, sel: null, renderMode: '',
    history: [], future: [], user: null
  };

  App.defaultState = function () {
    return {
      app: 'cab3d', version: 1,
      name: '未命名專案',
      client: '',
      created: new Date().toISOString(),
      room: null,
      cabinets: [],
      floors: [{ id: 'f1', name: '1F', room: null, cabinets: [] }],
      floor: 0,
      scenes: [],
      // 櫃身／門片／踢腳板預設 110 白，和型錄卡片的標準售價（110 白每才單價 × 總才數）用同一個色板
      defaults: { bodyColor: '110', doorColor: '110', topColor: '407', kickColor: '110', doorStyle: 'STD' },
      pricing: window.Pricing.defaultPricing()
    };
  };

  function normalize(s) {
    const d = App.defaultState();
    const out = { ...d, ...s };
    out.defaults = { ...d.defaults, ...(s.defaults || {}) };
    out.pricing = { ...d.pricing, ...(s.pricing || {}) };
    out.pricing.parts = { ...d.pricing.parts, ...((s.pricing || {}).parts || {}) };
    out.pricing.styles = { ...d.pricing.styles, ...((s.pricing || {}).styles || {}) };
    if (out.pricing.customRate == null) out.pricing.customRate = 10;
    out.pricing.mode = 'cai';   // 型錄牌價模式已移除：舊專案一律改用色板才數計價
    if (out.pricing.caiDefault == null) out.pricing.caiDefault = 100;
    const sd = (s.pricing || {}).desk || {};
    out.pricing.desk = { prices: { ...d.pricing.desk.prices }, edge: { ...d.pricing.desk.edge, ...(sd.edge || {}) } };
    Object.keys(out.pricing.desk.prices).forEach(k => { out.pricing.desk.prices[k] = { ...d.pricing.desk.prices[k], ...((sd.prices || {})[k] || {}) }; });
    // 補齊新增的預設材質
    // 內建材質以最新定義為準（保留使用者調整的係數），並補齊新增色板
    out.pricing.materials = out.pricing.materials.filter(m => !(m.code === '614' && !m.tex));
    const byCode = new Map(out.pricing.materials.map(m => [m.code, m]));
    d.pricing.materials.forEach(m => {
      const cur = byCode.get(m.code);
      if (!cur) out.pricing.materials.push(m);
      else if (m.tex) Object.assign(cur, { ...m, factor: cur.factor });
      else if (!cur.series) cur.series = m.series;
    });
    const fixCabs = list => (list || []).filter(c => window.DATA.byCode[c.code]).map(c => {
      if (!c.shelves) c.shelves = window.Model.genShelves(c);
      if (!c.base) c.base = { S: 0, F: 0, fronts: c.fronts || [] };
      if (!c.topColor) c.topColor = c.doorColor;
      if (!c.kickColor) c.kickColor = c.bodyColor;
      return c;
    });
    out.cabinets = fixCabs(out.cabinets);
    // 樓層：舊專案轉成 1F；目前樓層以 room/cabinets 為準
    out.floors = (s.floors && s.floors.length ? s.floors : [{ id: 'f1', name: '1F' }]).map(f => ({ ...f, cabinets: fixCabs(f.cabinets) }));
    out.floor = Math.max(0, Math.min(+s.floor || 0, out.floors.length - 1));
    out.floors[out.floor].room = out.room;
    out.floors[out.floor].cabinets = out.cabinets;
    out.scenes = out.scenes || [];
    return out;
  }

  App.boot = function (THREE, OrbitControls) {
    window.THREE = THREE;
    window.Model.init(THREE);
    // 教學版：不需登入，直接開啟空白專案；重新整理（F5）時還原本分頁的暫存專案
    App.user = null;
    const saved = loadSaved(null);
    App.state = saved || App.defaultState();
    window.Viewer.init(document.getElementById('viewport'), THREE, OrbitControls);
    App.ui = window.UI;
    App.ui.init();
    window.Viewer.rebuildAll();
    window.Viewer.setView('iso');
    window.Viewer.checkOverlaps();
    App.ui.refresh();
    // 色板庫（使用者新增 / 修改的色板，存在瀏覽器）
    if (window.SwatchLib) window.SwatchLib.init();
    // 未匯出就關閉網站：瀏覽器跳出確認
    window.addEventListener('beforeunload', e => {
      if (App.dirty && App.hasContent()) { e.preventDefault(); e.returnValue = ''; }
    });
  };

  // 目前樓層的 room/cabinets 寫回 floors
  App.syncFloor = function () {
    const st = App.state; if (!st || !st.floors) return;
    const f = st.floors[st.floor]; if (!f) return;
    f.room = st.room; f.cabinets = st.cabinets;
  };
  function snapshot() { App.syncFloor(); return JSON.stringify(App.state); }
  const userKey = u => LS_STATE + '.' + (u && u.name ? u.name : '_guest');
  function loadSaved(u) {
    try {
      let s = JSON.parse(STORE.getItem(userKey(u)) || 'null');
      if (!s && STORE.getItem(LS_STATE)) { s = JSON.parse(STORE.getItem(LS_STATE)); STORE.removeItem(LS_STATE); }
      return s && s.app === 'cab3d' ? normalize(s) : null;
    } catch (e) { return null; }
  }
  App.dirty = false;
  App.save = function () {
    try { STORE.setItem(userKey(App.user), snapshot()); } catch (e) { /* 儲存空間不足時忽略 */ }
  };

  // 所有會改變狀態的動作都經過 mutate，以支援復原
  App.mutate = function (label, fn, rebuild) {
    App.history.push({ label, s: snapshot() });
    if (App.history.length > 80) App.history.shift();
    App.future = [];
    fn(App.state);
    App.dirty = true;
    applyRebuild(rebuild);
    window.Viewer.checkOverlaps();
    window.Viewer.refreshGaps();
    App.ui.refresh();
    App.save();
  };
  function applyRebuild(rebuild) {
    const V = window.Viewer;
    if (rebuild === 'all') V.rebuildAll();
    else if (rebuild === 'room') V.rebuildRoom();
    else if (Array.isArray(rebuild)) rebuild.forEach(id => V.rebuildCabinet(id));
  }
  App.undo = function () {
    const h = App.history.pop(); if (!h) { App.toast('沒有可復原的動作'); return; }
    App.future.push({ label: h.label, s: snapshot() });
    App.state = normalize(JSON.parse(h.s));
    validateSel();
    window.Model.clearMatCache();
    window.Viewer.rebuildAll(); window.Viewer.checkOverlaps(); App.ui.refresh(); App.save();
    App.toast('已復原：' + h.label);
  };
  App.redo = function () {
    const h = App.future.pop(); if (!h) { App.toast('沒有可重做的動作'); return; }
    App.history.push({ label: h.label, s: snapshot() });
    App.state = normalize(JSON.parse(h.s));
    validateSel();
    window.Model.clearMatCache();
    window.Viewer.rebuildAll(); window.Viewer.checkOverlaps(); App.ui.refresh(); App.save();
    App.toast('已重做：' + h.label);
  };
  function validateSel() {
    const s = App.sel;
    if (!s) return;
    if (s.type === 'cab' && !App.state.cabinets.some(c => c.id === s.id)) App.sel = null;
    if (s.type === 'wall' && (!App.state.room || s.index >= App.state.room.points.length)) App.sel = null;
  }

  App.select = function (sel) {
    const prevWall = App.sel && App.sel.type === 'wall' ? App.sel.index : null;
    App.sel = sel;
    const nowWall = sel && sel.type === 'wall' ? sel.index : null;
    if (prevWall !== nowWall) window.Viewer.rebuildRoom();
    window.Viewer.updateSelection();
    App.ui.showProps(true);
  };
  App.selectedCab = function () {
    return App.sel && App.sel.type === 'cab' ? App.state.cabinets.find(c => c.id === App.sel.id) : null;
  };

  /* ---------- 櫃體操作 ---------- */
  App.addCabinet = function (cab) {
    App.mutate('新增 ' + window.Model.cabName(cab), s => s.cabinets.push(cab), [cab.id]);
  };
  App.deleteSelected = function () {
    const s = App.sel;
    if (!s) return;
    if (s.type === 'cab') {
      const cab = App.selectedCab();
      App.sel = null;
      App.mutate('刪除 ' + window.Model.cabName(cab), st => { st.cabinets = st.cabinets.filter(c => c.id !== cab.id); }, [cab.id]);
      window.Viewer.updateSelection();
    } else if (s.type === 'wall') App.toast('牆面無法單獨刪除，可於屬性面板刪除整個空間');
  };
  App.duplicateSelected = function () {
    const cab = App.selectedCab(); if (!cab) return;
    const c = JSON.parse(JSON.stringify(cab));
    c.id = window.Model.uid();
    const r = cab.rot * Math.PI / 180;
    c.x = Math.round(cab.x + Math.cos(r) * cab.w); c.z = Math.round(cab.z - Math.sin(r) * cab.w);
    App.mutate('複製 ' + window.Model.cabName(cab), s => s.cabinets.push(c), [c.id]);
    App.select({ type: 'cab', id: c.id });
  };
  App.rotateSelected = function (d) {
    const cab = App.selectedCab(); if (!cab) return;
    App.mutate('旋轉', () => { cab.rot = ((cab.rot + d) % 360 + 360) % 360; }, [cab.id]);
  };
  App.nudge = function (dx, dz) {
    const cab = App.selectedCab(); if (!cab) return;
    App.mutate('微調位置', () => { cab.x += dx; cab.z += dz; }, [cab.id]);
  };
  App.updateCab = function (id, label, fn) {
    const cab = App.state.cabinets.find(c => c.id === id); if (!cab) return;
    App.mutate(label, () => fn(cab), [id]);
  };

  /* ---------- 空間 ---------- */
  App.setRoom = function (room) {
    App.sel = null;
    App.mutate('建立空間', s => { s.room = room; }, 'room');
    window.Viewer.zoomExtents([1, 0.8, 1.15]);
  };

  /* ---------- 專案檔 ---------- */
  App.exportJSON = function () {
    App.syncFloor();
    if (App.user) App.state.owner = App.state.owner || App.user.name;
    App.dirty = false;
    setTimeout(() => App.ui.refresh(), 0);
    // 自訂 / 修改過的色板（含貼圖）一併存入專案，換電腦匯入也能顯示
    const out = window.SwatchLib ? { ...App.state, swatches: window.SwatchLib.projectSwatches(App.state) } : App.state;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    App.download(blob, (App.state.name || '專案') + '.json');
  };
  App.importJSON = function (file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data || data.app !== 'cab3d') throw new Error('不是本平台的專案檔');
        const sws = data.swatches; delete data.swatches;
        App.loadState(data);
        App.toast('已匯入專案「' + App.state.name + '」');
        if (sws && sws.length && window.SwatchLib) window.SwatchLib.importProject(sws).then(n => { if (n) App.toast(`已匯入專案「${App.state.name}」，並將 ${n} 個專案色板加入色板庫`); });
      } catch (e) { App.ui.alert('匯入失敗', '無法讀取此檔案：' + e.message); }
    };
    r.readAsText(file, 'utf-8');
  };
  App.newProject = function () {
    App.history = []; App.future = [];
    App.dirty = false;
    App.state = App.defaultState();
    const d = new Date(), p2 = n => String(n).padStart(2, '0');
    App.state.name = `新專案 ${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
    App.state.owner = App.user ? App.user.name : '';
    App.sel = null;
    window.Viewer.rebuildAll();
    window.Viewer.checkOverlaps();
    window.Viewer.setView('iso');
    App.ui.refresh(); App.save();
  };

  // 以指定資料取代目前專案（匯入、還原備份共用）
  App.loadState = function (data) {
    App.history = []; App.future = [];
    App.dirty = false;
    App.state = normalize(data);
    App.sel = null;
    window.Model.clearMatCache();
    window.Viewer.rebuildAll();
    window.Viewer.setView('iso');
    window.Viewer.checkOverlaps();
    App.ui.refresh(); App.save();
  };
  /* ---------- 樓層 ---------- */
  App.showFloor = function (i) {   // 切換顯示樓層（不列入復原）
    const st = App.state;
    if (i === st.floor || !st.floors[i]) return;
    App.syncFloor();
    st.floor = i;
    st.room = st.floors[i].room || null;
    st.cabinets = st.floors[i].cabinets || [];
    App.sel = null;
    window.Viewer.rebuildAll(); window.Viewer.checkOverlaps();
  };
  App.switchFloor = function (i) {
    App.showFloor(i);
    window.Viewer.zoomExtents();
    App.ui.refresh(); App.save();
    App.toast('切換到 ' + App.state.floors[i].name);
  };
  App.addFloor = function () {
    const st = App.state;
    App.syncFloor();
    const n = st.floors.length + 1;
    const cur = st.room;
    // 新樓層沿用目前樓層的空間外框（不含門窗、不含櫃體）
    const room = cur ? { ...JSON.parse(JSON.stringify(cur)), walls: cur.walls.map(() => ({ id: window.Model.uid('w'), locked: false, openings: [] })) } : null;
    App.mutate('新增樓層 ' + n + 'F', s2 => { s2.floors.push({ id: window.Model.uid('f'), name: n + 'F', room, cabinets: [] }); });
    App.switchFloor(st.floors.length - 1);
  };
  App.renameFloor = function (i, name) {
    name = String(name || '').trim(); if (!name) return;
    App.mutate('樓層名稱', s2 => { s2.floors[i].name = name; });
  };
  App.deleteFloor = function (i) {
    const st = App.state;
    if (st.floors.length <= 1) { App.toast('至少要保留一個樓層'); return; }
    App.syncFloor();
    App.mutate('刪除樓層 ' + st.floors[i].name, s2 => {
      s2.floors.splice(i, 1);
      s2.floor = Math.min(s2.floor > i ? s2.floor - 1 : s2.floor, s2.floors.length - 1);
      s2.room = s2.floors[s2.floor].room || null; s2.cabinets = s2.floors[s2.floor].cabinets || [];
      s2.scenes.forEach(sc => { if (sc.floor === i) sc.floor = null; else if (sc.floor > i) sc.floor--; });
    }, 'all');
    App.sel = null;
  };
  // 全部樓層（目前樓層已同步）
  App.floorList = function () { App.syncFloor(); return App.state.floors; };

  App.hasContent = () => !!(App.state.room || App.state.cabinets.length || App.state.scenes.length);

  App.download = function (blobOrUrl, name) {
    const a = document.createElement('a');
    const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  App.setUser = function () { /* 教學版：無帳號 */ 
  };

  App.status = function (t) { const el = document.getElementById('status'); if (el) el.textContent = t || '就緒'; };
  let toastTimer = null;
  App.toast = function (t) {
    const el = document.getElementById('toast');
    el.textContent = t; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  };
  App.busy = function (on, text) {
    const el = document.getElementById('busy');
    el.hidden = !on; if (text) document.getElementById('busyText').textContent = text;
  };

  window.App = App;
})();
