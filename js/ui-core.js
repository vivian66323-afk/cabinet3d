/* 介面（核心）：共用工具（$、esc、icon、withFocus、num）、UI 物件本體、init 流程、分頁切換、狀態列與樓層列。
   原本的 js/ui.js 依功能拆成 js/ui-*.js；本檔必須最先載入（其他 ui-*.js 都掛在這裡建立的 window.UI 上）。
   跨檔共用的內部函式以 UI._ 開頭（例如 UI._withFocus、UI._renderQuote），不是對外介面。 */
(function () {
  const P = () => window.Pricing;
  const V = () => window.Viewer;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const UI = {};

  const ICON = {
    select: 'M5 3l12 8-5.2 1.3 3.2 6.2-2.2 1.1-3.1-6.3L6 17z',
    move: 'M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5',
    rotate: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5',
    delete: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
    dup: 'M8 8h12v12H8zM4 16V4h12',
    rect: 'M4 6h16v12H4zM4 3v2M20 3v2M4 19v2M20 19v2',
    line: 'M4 19 9 8l6 6 5-9M4 19h.01M9 8h.01M15 14h.01M20 5h.01',
    tape: 'M3 17h18v-5H3zM7 12v2M11 12v3M15 12v2M19 12v3M3 12V7h8',
    orbit: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3 12c0-2.8 4-5 9-5s9 2.2 9 5-4 5-9 5M8.5 14.5 12 17l-3 3',
    pan: 'M8 13V6a1.5 1.5 0 0 1 3 0v6M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-3 7-6 7s-5-2-6.5-4.5L3 13a1.5 1.5 0 0 1 2.5-1.5L8 14',
    zoom: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM20 20l-5.5-5.5M10 7v6M7 10h6',
    extents: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9 9h6v6H9z',
    walls: 'M3 20V9l9-5 9 5v11M3 20h18M9 20v-6h6v6',
    render: 'M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18',
    open: 'M4 21V3h10v18M14 5l6 2v14l-6-2M11 12h.01',
    dims: 'M3 8v8M21 8v8M3 12h18M7 10l-4 2 4 2M17 10l4 2-4 2',
    magnet: 'M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3zM6 7h4M14 7h4',
    undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
    redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
    help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
    x: 'M6 6l12 12M18 6 6 18',
    up: 'M12 19V5M6 11l6-6 6 6', down: 'M12 5v14M6 13l6 6 6-6',
    lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2',
    plus: 'M12 5v14M5 12h14', camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
    image: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01', snap: 'M3 12h4M17 12h4M9 6h6v12H9zM12 2v4M12 18v4', door: 'M5 21V3h11v18M16 21h3M12 12h.01', window: 'M4 4h16v16H4zM12 4v16M4 12h16'
  };
  const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24"><path d="${ICON[n]}"/></svg>`;
  UI.icon = icon; UI.esc = esc;

  UI.init = function () {
    // 工具列（js/ui-toolbar.js）
    UI._initToolbar();
    $('#viewCube').hidden = true;
    initFloorBar();
    // 選取物件浮動工具列：手動旋轉 90°
    // 畫線浮動按鈕（觸控沒有 Enter／雙擊）：退一點、完成封閉、取消
    const la = document.createElement('div'); la.className = 'line-actions'; la.id = 'lineActions'; la.hidden = true;
    la.innerHTML = '<button data-la="undo">退一點</button><button data-la="done" class="primary">完成封閉</button><button data-la="cancel">取消</button>';
    $('#viewport').appendChild(la);
    la.addEventListener('pointerdown', e => e.stopPropagation());
    la.addEventListener('click', e => {
      const b = e.target.closest('[data-la]'); if (!b) return;
      if (b.dataset.la === 'undo') { if (!V().lineUndoPoint()) App.toast('還沒有點'); }
      else if (b.dataset.la === 'done') V().lineFinish(true);
      else V().setTool('select');
    });
    // 左右面板收合（平板、小螢幕可放大 3D 區）
    const ws = document.querySelector('.workspace');
    let pst = {}; try { pst = JSON.parse(localStorage.getItem('cab3d.panels') || '{}'); } catch (e) { pst = {}; }
    const applyPanels = () => { ws.classList.toggle('hide-left', !!pst.l); ws.classList.toggle('hide-right', !!pst.r); $('#togL').textContent = pst.l ? '型錄 ›' : '‹'; $('#togR').textContent = pst.r ? '‹ 屬性' : '›'; $('#togL').title = pst.l ? '展開左側型錄' : '收合左側型錄'; $('#togR').title = pst.r ? '展開右側屬性面板' : '收合右側屬性面板'; };
    ['togL', 'togR'].forEach(id => { const b = document.createElement('button'); b.id = id; b.className = 'panel-tog ' + (id === 'togL' ? 'l' : 'r'); b.type = 'button'; $('#viewport').appendChild(b);
      b.addEventListener('pointerdown', e => e.stopPropagation());
      b.addEventListener('click', () => { if (id === 'togL') pst.l = !pst.l; else pst.r = !pst.r; localStorage.setItem('cab3d.panels', JSON.stringify(pst)); applyPanels(); }); });
    applyPanels();
    $('#miniBar').addEventListener('pointerdown', e => e.stopPropagation());
    $('#miniBar').addEventListener('click', e => {
      const b = e.target.closest('[data-mini]'); if (!b) return;
      const a = b.dataset.mini;
      if (a === 'rotl') App.rotateSelected(-90);
      else if (a === 'rotr') App.rotateSelected(90);
      else if (a === 'dup') App.duplicateSelected();
      else if (a === 'del') App.deleteSelected();
    });
    document.querySelectorAll('#emptyHint [data-act]').forEach(b => b.addEventListener('click', () => UI.action(b.dataset.act === 'line' ? 'line' : b.dataset.act === 'underlay' ? 'underlay' : 'rect')));

    // 專案
    $('#projName').addEventListener('change', e => App.mutate('專案名稱', s => { s.name = e.target.value.trim() || '未命名專案'; }));
    $('#btnImport').addEventListener('click', () => $('#fileImport').click());
    $('#fileImport').addEventListener('change', e => { const f = e.target.files[0]; if (f) App.importJSON(f); e.target.value = ''; });
    $('#btnSave').addEventListener('click', () => App.exportJSON());
    $('#btnNew').addEventListener('click', async () => {
      if (await UI.leaveDialog('開立新專案')) { App.newProject(); App.toast('已開立新專案「' + App.state.name + '」'); }
    });
    // Gemini 一鍵生成:輸出目前視角 + 白模 + 線稿,連同提示詞交給 Gemini 網頁
    const bg = $('#btnGemini');
    if (bg) bg.addEventListener('click', async () => { $('#exportMenu').hidden = true; if (window.Lazy && !(await window.Lazy.ensure('airender', '載入 3D 渲染模組…'))) return; window.AIRender.open(); });
    // 裝了就直接標版本,沒裝才是「安裝…」的引導
    const extVer = document.documentElement.getAttribute('data-aw-gemini-ext');
    const miExt = $('#miExt');
    if (miExt) {
      miExt.textContent = extVer ? ('自動送圖擴充功能 v' + extVer + '（已安裝）') : '安裝自動送圖擴充功能';
      miExt.title = extVer ? '已安裝，按「3D渲染」就會有全自動的送出按鍵'
                           : '選配：裝了之後「3D渲染」可以自動上傳、貼提示詞並送出';
    }
    // 匯出選單
    const em = $('#exportMenu');
    $('#btnExport').addEventListener('click', e => { e.stopPropagation(); em.hidden = !em.hidden; });
    em.addEventListener('click', e => {
      if (e.target.closest('[data-ext]')) { em.hidden = true; window.open('extension/', '_blank', 'noopener'); return; }
      const b = e.target.closest('[data-exp]'); if (!b) return; em.hidden = true; window.Exporter.run(b.dataset.exp);
    });
    document.addEventListener('click', () => { em.hidden = true; });

    // 分頁
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => UI.showTab(t.dataset.tab)));

    // 型錄（js/ui-catalog.js）
    UI._initCatalog();

    // 右側面板事件（委派，js/ui-props.js）
    UI._initProps();
    // 色板選擇器（js/ui-swatch.js）
    UI._initSwatch();
    UI._initQuote();      // 報價分頁（js/ui-pricing.js）
    UI._initScenes();     // 場景分頁（js/ui-scenes.js）
    UI._initPricing();    // 板材售價（js/ui-pricing.js）

    // 鍵盤 / 數值框（js/ui-toolbar.js）
    UI._initKeys();

    V().setTool('select');
  };

  UI.showTab = function (name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    ['props', 'quote', 'scenes', 'pricing'].forEach(n => { $('#tab-' + n).hidden = n !== name; });
    UI.curTab = name;
    if (name === 'pricing') UI._renderPricing();
    if (name === 'scenes') UI._renderScenes();
    if (name === 'quote') UI._renderQuote();
  };
  UI.curTab = 'props';


  // 重疊警示（狀態列）
  let warnIdx = 0;
  UI.showWarn = function (bad, extra) {
    const el = $('#statusWarn');
    const n = [...bad.values()].filter(b => !extra || b.cab.id !== extra.id).length;
    el.hidden = !n;
    el.textContent = `⚠ ${n} 件櫃體重疊${[...bad.values()].some(b => b.why.has('牆面')) ? '／穿牆' : ''}`;
    el.onclick = () => {
      const list = [...bad.values()].filter(b => App.state.cabinets.includes(b.cab));
      if (!list.length) return;
      const b = list[warnIdx++ % list.length];
      App.select({ type: 'cab', id: b.cab.id });
    };
  };

  UI.refresh = function () {
    const st = App.state;
    if (document.activeElement !== $('#projName')) $('#projName').value = st.name;
    UI.showProps(false);
    const q = P().quote(st);
    $('#quoteBadge').textContent = q.count || '';
    $('#statusTotal').textContent = q.count ? `報價總計 ${P().fmt(q.total)}（${q.multi ? st.floors.length + ' 層 ' : ''}${q.count} 件）` : '';
    $('#dirtyBadge').hidden = !(App.dirty && App.hasContent());
    UI.renderFloors();
    if (UI.curTab === 'quote') UI._renderQuote();
    if (UI.curTab === 'scenes') UI._renderScenes();
    if (UI.curTab === 'pricing') UI._renderPricing();
    UI.syncToolbar();
  };

  /* ---------- 樓層列 ---------- */
  UI.renderFloors = function () {
    const st = App.state, el = $('#floorBar');
    if (!el || !st.floors) return;
    el.innerHTML = st.floors.map((f, i) => `<button class="fl${i === st.floor ? ' on' : ''}" data-fl="${i}" title="點選切換；雙擊重新命名">${esc(f.name)}</button>`).join('') +
      `<button class="fl add" data-fl="add" title="新增樓層（沿用目前樓層的空間外框）">＋ 樓層</button>`;
  };
  function initFloorBar() {
    const el = $('#floorBar');
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-fl]'); if (!b) return;
      if (b.dataset.fl === 'add') App.addFloor(); else App.switchFloor(+b.dataset.fl);
    });
    el.addEventListener('dblclick', async e => {
      const b = e.target.closest('[data-fl]'); if (!b || b.dataset.fl === 'add') return;
      const i = +b.dataset.fl;
      const res = await UI.modal({ title: '樓層名稱', body: `<div class="kv"><label>名稱</label><input name="n" value="${esc(App.state.floors[i].name)}"></div>`,
        buttons: [{ label: '取消', value: null }, { label: '確定', primary: true, value: 'ok' }], validate: d => d.n.trim() ? null : '請輸入名稱' });
      if (res) App.renameFloor(i, res.data.n);
    });
  }

  /* ---------- 共用工具（屬性面板、報價、場景、板材售價、天花面板共用） ---------- */
  function withFocus(el, fn) {
    const a = document.activeElement;
    const key = a && el.contains(a) && a.dataset ? a.dataset.key : null;
    const scroll = el.scrollTop;
    fn();
    el.scrollTop = scroll;
    if (key) { const n = el.querySelector(`[data-key="${key}"]`); if (n) n.focus(); }
  }
  UI._withFocus = withFocus;
  // 數字欄位用文字框，才能直接輸入算式（如 2970/2、600*3+18），Enter 或離開欄位時自動算出
  const num = (key, val, attrs = '') => `<input type="text" inputmode="decimal" class="numf" data-key="${key}" data-f="${key}" value="${val}" ${attrs} title="可輸入算式，如 2970/2">`;
  const evalNum = s => {
    if (typeof s !== 'string') return s;
    const e = s.trim().replace(/[×ｘx]/g, '*').replace(/÷/g, '/');
    if (!/[+\-*/()]/.test(e.slice(1)) || !/^[\d\s.+\-*/()]+$/.test(e)) return s;
    try { const v = Function('"use strict";return (' + e + ')')(); return isFinite(v) ? String(Math.round(v * 100) / 100) : s; } catch (x) { return s; }
  };
  UI._num = num; UI._evalNum = evalNum;

  window.UI = UI;
})();
