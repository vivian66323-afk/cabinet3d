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

  const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  App.defaultState = function () {
    return {
      app: 'cab3d', version: 1,
      id: newId(),
      name: '未命名專案',
      client: '',
      created: new Date().toISOString(),
      room: null,              // 目前編輯中的房間（＝ rooms[roomIdx] 同一個物件）
      rooms: [], roomIdx: 0,   // 本樓層全部房間（同一層可有多個房間，各有自己的牆、門窗、天花）
      underlay: null,
      cabinets: [],
      floors: [{ id: 'f1', name: '1F', room: null, rooms: [], roomIdx: 0, cabinets: [] }],
      floor: 0,
      scenes: [],
      // 櫃身／門片／踢腳板預設 110 白，和型錄卡片的標準售價（110 白每才單價 × 總才數）用同一個色板
      defaults: { bodyColor: '110', doorColor: '110', topColor: '407', kickColor: '110', doorStyle: 'STD' },
      pricing: window.Pricing.defaultPricing()
    };
  };

  // 多房間：rooms＝該層全部房間，room＝目前編輯中的房間（rooms[roomIdx] 同一個物件）。舊專案只有 room → rooms=[room]
  function fixRooms(rooms, room, idx) {
    let list = Array.isArray(rooms) && rooms.length ? rooms : (room ? [room] : []);
    list = list.filter(r => r && Array.isArray(r.points) && r.points.length >= 3);
    list.forEach((r, i) => {
      if (!r.id) r.id = window.Model.uid('r');
      if (!r.name) r.name = '房間 ' + (i + 1);
      if (!Array.isArray(r.walls) || r.walls.length !== r.points.length) r.walls = r.points.map((_, j) => (r.walls && r.walls[j]) || { id: window.Model.uid('w'), locked: false, openings: [] });
    });
    const k = list.length ? Math.max(0, Math.min(+idx || 0, list.length - 1)) : 0;
    return { rooms: list, roomIdx: k, room: list[k] || null };
  }
  App.fixRooms = fixRooms;
  // 把某樓層的房間／櫃體／底圖換成目前顯示的
  function pullFloor(st, f) { Object.assign(st, fixRooms(f.rooms, f.room, f.roomIdx)); st.cabinets = f.cabinets || []; st.underlay = f.underlay || null; }

  function normalize(s) {
    const d = App.defaultState();
    const out = { ...d, ...s };
    if (!out.id) out.id = newId();
    // 型錄已移除的型號（舊專案）：略過，避免後續讀不到規格而出錯
    const D = window.DATA, dropped = [];
    const clean = list => (list || []).map(c => { if (c && c.code === 'CURTAIN') c.code = 'CURTAIN-' + (c.cstyle || 'wave').toUpperCase(); return c; }).filter(c => { if (c && c.kind === 'appl' && D && D.byCode && !D.byCode[c.code]) { dropped.push(c.code); return false; } return true; });
    out.cabinets = clean(out.cabinets);
    if (Array.isArray(out.floors)) out.floors.forEach(f => { f.cabinets = clean(f.cabinets); });
    if (dropped.length) setTimeout(() => App.toast && App.toast('型錄已無這些設備型號，已略過：' + [...new Set(dropped)].join('、')), 500);
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
    out.floors = (s.floors && s.floors.length ? s.floors : [{ id: 'f1', name: '1F' }]).map(f => ({ ...f, cabinets: fixCabs(f.cabinets), ...fixRooms(f.rooms, f.room, f.roomIdx) }));
    out.floor = Math.max(0, Math.min(+s.floor || 0, out.floors.length - 1));
    Object.assign(out, fixRooms(s.rooms, s.room, s.roomIdx));
    out.floors[out.floor].room = out.room; out.floors[out.floor].rooms = out.rooms; out.floors[out.floor].roomIdx = out.roomIdx;
    out.floors[out.floor].cabinets = out.cabinets;
    out.floors[out.floor].underlay = out.underlay || null;
    out.scenes = out.scenes || [];
    return out;
  }

  App.boot = async function (THREE, OrbitControls) {
    window.THREE = THREE;
    window.Model.init(THREE);
    // 教學版：不需登入，直接開啟空白專案；重新整理（F5）時還原本分頁的暫存專案
    App.user = null;
    // 暫存專案若用到延遲載入的型錄／色板（IKEA 家具、各廠商色板、品牌地板…），先抓回來再還原，normalize 才不會把它們當成「型錄已無此型號」略過
    const raw = readSaved(null);
    if (raw && window.Lazy) { try { await window.Lazy.load(window.Lazy.needsFor(raw)); } catch (e) { console.warn('暫存專案用到的資料載入失敗：', e); } }
    let saved = null;
    try { saved = raw ? normalize(raw) : null; } catch (e) { console.warn('暫存專案無法還原：', e); }
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
    if (window.Cloud) window.Cloud.init();
    // 未匯出就關閉網站：瀏覽器跳出確認
    window.addEventListener('beforeunload', e => {
      if (App.dirty && App.hasContent()) { e.preventDefault(); e.returnValue = ''; }
    });
  };

  // 目前樓層的 room/cabinets 寫回 floors
  App.syncFloor = function () {
    const st = App.state; if (!st || !st.floors) return;
    const f = st.floors[st.floor]; if (!f) return;
    f.room = st.room; f.rooms = st.rooms || (st.room ? [st.room] : []); f.roomIdx = st.roomIdx || 0; f.cabinets = st.cabinets; f.underlay = st.underlay || null;
  };
  // 目前樓層的房間／櫃體／底圖在 state 最上層已有一份，floors[目前樓層] 是同一批物件：快照不重複寫（底圖是整張圖，重複一次就多好幾 MB），
  // 還原時 normalize 會從最上層補回。opt.noImage：連底圖影像也不寫（暫存空間不夠時的退路，房間與櫃體要保住）
  function snapshot(opt) {
    App.syncFloor();
    const st = App.state, noImg = opt && opt.noImage;
    const slim = { ...st, floors: (st.floors || []).map((f, i) => i === st.floor ? { ...f, room: undefined, rooms: undefined, cabinets: undefined, underlay: undefined } : (noImg && f.underlay ? { ...f, underlay: null } : f)) };
    if (noImg) slim.underlay = null;
    return JSON.stringify(slim);
  }
  const userKey = u => LS_STATE + '.' + (u && u.name ? u.name : '_guest');
  // 讀出本分頁暫存的專案（未 normalize）；沒有或壞掉回傳 null
  function readSaved(u) {
    try {
      let s = JSON.parse(STORE.getItem(userKey(u)) || 'null');
      if (!s && STORE.getItem(LS_STATE)) { s = JSON.parse(STORE.getItem(LS_STATE)); STORE.removeItem(LS_STATE); }
      return s && s.app === 'cab3d' ? s : null;
    } catch (e) { return null; }
  }
  App.dirty = false;
  App.save = function () {
    try { STORE.setItem(userKey(App.user), snapshot()); App.saveState = 'ok'; }
    catch (e) {
      // 瀏覽器分頁暫存放不下（多半是底圖太大）。以前是默默略過，暫存停在舊版本，重新整理後畫面退回舊狀態、後來畫的房間不見。
      // 現在改存不含底圖影像的版本，房間與櫃體保住；仍放不下就清掉舊暫存，避免還原成過期內容
      let ok = false;
      try { STORE.setItem(userKey(App.user), snapshot({ noImage: true })); ok = true; } catch (e2) { try { STORE.removeItem(userKey(App.user)); } catch (e3) { /* 忽略 */ } }
      const was = App.saveState; App.saveState = ok ? 'noimage' : 'fail';
      if (was !== App.saveState && App.toast) App.toast(ok ? '專案含大張底圖，瀏覽器暫存放不下：重新整理後房間與櫃體會保留，但底圖需重新匯入。建議先按「儲存專案」' : '專案太大，瀏覽器無法暫存：重新整理或關閉前請務必先按「儲存專案」');
    }
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
    if (window.Cloud) window.Cloud.touch();
  };
  function applyRebuild(rebuild) {
    const V = window.Viewer;
    if (rebuild === 'all') V.rebuildAll();
    else if (rebuild === 'room') V.rebuildRoom();
    else if (rebuild === 'underlay') V.rebuildUnderlay();
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
      // 選取的櫃體不在目前樓層（例如在報價分頁點到別層的列）：清掉選取即可，不能讀 null 的 locked 而拋錯
      if (!cab) { App.sel = null; window.Viewer.updateSelection(); App.ui.showProps(false); return; }
      if (cab.locked) { App.toast(window.Model.cabName(cab) + ' 已鎖定，請先解鎖再刪除'); return; }
      App.sel = null;
      App.mutate('刪除 ' + window.Model.cabName(cab), st => { st.cabinets = st.cabinets.filter(c => c.id !== cab.id); }, [cab.id]);
      window.Viewer.updateSelection();
    } else if (s.type === 'ceil') {
      const nm = { zone: '天花區域', st: '線型燈具', fx: '天花設備' }[s.kind];
      if (!nm) { App.toast('整片天花不能刪除；不要天花請在屬性面板取消「做天花板」'); return; }
      App.sel = null;
      App.mutate('刪除' + nm, st => { const c = st.room.ceiling, key = { zone: 'zones', st: 'strips', fx: 'fixtures' }[s.kind]; c[key] = c[key].filter(q => q.id !== s.id); }, 'room');
      window.Viewer.updateSelection(); App.ui.showProps(false);
    } else if (s.type === 'wall') App.toast('牆面無法單獨刪除，可於屬性面板刪除整個空間');
  };
  App.duplicateSelected = function () {
    const cab = App.selectedCab(); if (!cab) return;
    const c = JSON.parse(JSON.stringify(cab));
    c.id = window.Model.uid(); c.locked = false;
    const r = cab.rot * Math.PI / 180;
    c.x = Math.round(cab.x + Math.cos(r) * cab.w); c.z = Math.round(cab.z - Math.sin(r) * cab.w);
    App.mutate('複製 ' + window.Model.cabName(cab), s => s.cabinets.push(c), [c.id]);
    App.select({ type: 'cab', id: c.id });
  };
  App.rotateSelected = function (d) {
    const cab = App.selectedCab(); if (!cab) return;
    if (cab.locked) { App.toast('已鎖定，無法旋轉'); return; }
    App.mutate('旋轉', () => { cab.rot = ((cab.rot + d) % 360 + 360) % 360; }, [cab.id]);
  };
  App.nudge = function (dx, dz) {
    const cab = App.selectedCab(); if (!cab) return;
    if (cab.locked) { App.toast('已鎖定，無法移動'); return; }
    App.mutate('微調位置', () => { cab.x += dx; cab.z += dz; }, [cab.id]);
  };
  // 方向鍵微調級距（mm），記在瀏覽器；1 / 10 / 100 / 1000 ＝ 1mm / 1cm / 10cm / 1m
  const LS_NUDGE = 'cab3d.nudge';
  App.nudgeStep = function () { const v = Number(localStorage.getItem(LS_NUDGE)); return v > 0 ? v : 10; };
  App.setNudgeStep = function (mm) { mm = Math.max(0.1, Number(mm) || 10); try { localStorage.setItem(LS_NUDGE, String(mm)); } catch (e) { /* 無痕 */ } return mm; };
  App.fmtStep = mm => mm >= 1000 && mm % 1000 === 0 ? (mm / 1000) + ' m' : mm >= 10 && mm % 100 === 0 ? (mm / 10) + ' cm' : mm + ' mm';
  // 依「畫面上的方向」微調：dir 'left'|'right'|'up'|'down'，依目前視角把畫面方向對到最近的世界軸，
  // 這樣不管視角轉到哪，按 → 物件就往畫面右邊走；mult 為倍數（Shift ×10）
  App.nudgeDir = function (dir, mult) {
    const cab = App.selectedCab(); if (!cab) return;
    const step = App.nudgeStep() * (mult || 1);
    if (dir === 'raise' || dir === 'lower') {        // 上下：離地高度
      if (cab.locked) { App.toast('已鎖定，無法移動'); return; }
      const ny = Math.max(0, Math.round((cab.y + (dir === 'raise' ? step : -step)) * 1000) / 1000);
      if (ny === cab.y) { App.toast('已在地面，不能再往下'); return; }
      App.mutate('微調高度', () => { cab.y = ny; }, [cab.id]);
      return;
    }
    const ax = window.Viewer && window.Viewer.screenAxes ? window.Viewer.screenAxes() : { right: [1, 0], up: [0, -1] };
    const v = dir === 'left' ? [-ax.right[0], -ax.right[1]] : dir === 'right' ? ax.right : dir === 'up' ? ax.up : [-ax.up[0], -ax.up[1]];
    App.nudge(Math.round(v[0] * step * 1000) / 1000, Math.round(v[1] * step * 1000) / 1000);
  };
  App.updateCab = function (id, label, fn) {
    const cab = App.state.cabinets.find(c => c.id === id); if (!cab) return;
    App.mutate(label, () => fn(cab), [id]);
  };

  /* ---------- 空間 ---------- */
  // 結束天花／設備編輯與迴路指派模式：空間刪除／重建、切換樓層、載入或開新專案時，
  // 原本的掣點與指派中的迴路 id 都指向舊空間（迴路 id 是每個空間自己的），留著會把設備指派到不存在的迴路
  App.exitCeilEdit = function () {
    const V = window.Viewer; if (!V) return;
    if (V.cktAssign) V.cktAssign = null;
    if (V.ceilEdit && V.setCeilEdit) V.setCeilEdit(false);
  };
  // 建立房間：mode 'add'＝新增為本樓層的新房間（預設）、'replace'＝取代目前編輯中的房間
  App.setRoom = function (room, mode) {
    App.sel = null;
    App.exitCeilEdit();
    const st = App.state, had = (st.rooms || []).length;
    const replace = mode === 'replace' && had > 0;
    if (!room.id) room.id = window.Model.uid('r');
    if (!room.name) room.name = replace ? (st.room && st.room.name) || '房間 1' : '房間 ' + (had + 1);
    App.mutate(replace ? '重建房間 ' + room.name : had ? '新增房間 ' + room.name : '建立空間', s => {
      if (!Array.isArray(s.rooms)) s.rooms = [];
      if (replace) s.rooms[s.roomIdx] = room; else { s.rooms.push(room); s.roomIdx = s.rooms.length - 1; }
      s.room = room;
    }, 'room');
    window.Viewer.zoomExtents([1, 0.8, 1.15]);
  };
  // 切換目前編輯中的房間（不列入復原）：牆面／門窗／天花／插座的編輯都針對目前房間
  App.setActiveRoom = function (i) {
    const st = App.state; if (!st.rooms || !st.rooms[i] || i === st.roomIdx) return false;
    App.sel = null; App.exitCeilEdit();
    st.roomIdx = i; st.room = st.rooms[i];
    window.Viewer.rebuildRoom(); window.Viewer.updateSelection(); App.ui.refresh(); App.save();
    return true;
  };
  App.deleteRoom = function (i) {
    const st = App.state; if (!st.rooms || !st.rooms[i]) return;
    const name = st.rooms[i].name || '房間';
    App.sel = null; App.exitCeilEdit();
    App.mutate('刪除房間 ' + name, s => {
      s.rooms.splice(i, 1);
      s.roomIdx = s.rooms.length ? Math.min(s.roomIdx > i ? s.roomIdx - 1 : s.roomIdx, s.rooms.length - 1) : 0;
      s.room = s.rooms[s.roomIdx] || null;
    }, 'room');
  };
  App.renameRoom = function (i, name) {
    name = String(name || '').trim(); if (!name || !App.state.rooms || !App.state.rooms[i]) return;
    App.mutate('房間名稱', s => { s.rooms[i].name = name; });
  };

  /* ---------- 專案檔 ---------- */
  App.exportJSON = function () {
    App.syncFloor();
    if (App.user) App.state.owner = App.state.owner || App.user.name;
    App.dirty = false;
    setTimeout(() => App.ui.refresh(), 0);
    const blob = new Blob([App.projectJSON()], { type: 'application/json' });
    App.download(blob, (App.state.name || '專案') + '.json');
  };
  // 專案檔內容（含自訂 / 修改過的色板與貼圖，換電腦匯入也能顯示）；匯出 .json 與雲端儲存共用
  App.projectJSON = function (pretty = true) {
    App.syncFloor();
    const out = window.SwatchLib ? { ...App.state, swatches: window.SwatchLib.projectSwatches(App.state) } : App.state;
    return pretty ? JSON.stringify(out, null, 2) : JSON.stringify(out);   // 雲端用壓縮格式（約 1/3 大小）
  };
  // 載入專案檔資料（匯入 .json 與雲端開啟共用）
  App.loadProject = function (data) {
    const sws = data.swatches; delete data.swatches;
    const apply = () => {
      App.loadState(data);
      if (sws && sws.length && window.SwatchLib) window.SwatchLib.importProject(sws).then(n => { if (n) App.toast(`已載入專案「${App.state.name}」，並將 ${n} 個專案色板加入色板庫`); });
    };
    const need = window.Lazy ? window.Lazy.needsFor(data) : [];
    if (!need.length) { apply(); return Promise.resolve(); }
    // 專案用到還沒載入的型錄／色板：先抓檔再載入。呼叫端（匯入、雲端開啟）會緊接著用 App.state.name 顯示訊息，先把名稱換上
    const prevName = App.state.name;
    App.state.name = data.name || prevName;
    App.busy(true, '載入專案用到的型錄資料…');
    return window.Lazy.load(need).then(apply, e => {
      App.state.name = prevName;
      console.error(e);
      App.ui.alert('載入失敗', `專案用到的${need.map(window.Lazy.label).join('、')}無法載入：${e.message}`);
    }).finally(() => App.busy(false));
  };
  App.importJSON = function (file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data || data.app !== 'cab3d') throw new Error('不是本平台的專案檔');
        App.loadProject(data);
        App.toast('已匯入專案「' + App.state.name + '」');
        if (window.Cloud) window.Cloud.newProjectReset();
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
    App.exitCeilEdit();
    if (window.Cloud) window.Cloud.newProjectReset();
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
    App.exitCeilEdit();
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
    pullFloor(st, st.floors[i]);
    App.sel = null;
    App.exitCeilEdit();
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
    // 新樓層沿用目前樓層各房間的外框（不含門窗、不含櫃體）；天花造型／燈具／插座／冷氣／迴路屬於該層的工程內容，不能跟著複製，否則報價會把這些項目再算一次
    const rooms = (st.rooms || []).map(cur => {
      const room = { ...JSON.parse(JSON.stringify(cur)), id: window.Model.uid('r'), walls: cur.walls.map(() => ({ id: window.Model.uid('w'), locked: false, openings: [] })), outlets: [], acs: [], circuits: [] };
      if (room.ceiling) room.ceiling = { ...room.ceiling, zones: [], strips: [], fixtures: [] };   // 只留天花基本設定（是否做天花、基本高、顏色、線板）
      return room;
    });
    const ri = Math.min(st.roomIdx || 0, Math.max(0, rooms.length - 1));
    App.mutate('新增樓層 ' + n + 'F', s2 => { s2.floors.push({ id: window.Model.uid('f'), name: n + 'F', room: rooms[ri] || null, rooms, roomIdx: ri, cabinets: [] }); });
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
    App.sel = null;   // 先清掉選取：刪除後目前樓層會換，舊的選取（櫃體／牆面）已不存在
    App.exitCeilEdit();
    App.mutate('刪除樓層 ' + st.floors[i].name, s2 => {
      s2.floors.splice(i, 1);
      s2.floor = Math.min(s2.floor > i ? s2.floor - 1 : s2.floor, s2.floors.length - 1);
      const f = s2.floors[s2.floor];
      // room／cabinets／underlay 三者都要換成新目前樓層的，否則被刪樓層的底圖會留在畫面上，存檔時還會蓋掉這一層自己的底圖
      pullFloor(s2, f);
      s2.scenes.forEach(sc => { if (sc.floor === i) sc.floor = null; else if (sc.floor > i) sc.floor--; });
    }, 'all');
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
