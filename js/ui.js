/* 介面：工具列、型錄、屬性面板、報價、場景、板材售價、對話框 */
(function () {
  const D = window.DATA;
  const P = () => window.Pricing;
  const V = () => window.Viewer;
  const M = () => window.Model;
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
    door: 'M5 21V3h11v18M16 21h3M12 12h.01', window: 'M4 4h16v16H4zM12 4v16M4 12h16'
  };
  const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24"><path d="${ICON[n]}"/></svg>`;
  UI.icon = icon;

  const TOOLBAR = [
    [{ tool: 'select', i: 'select', k: '␣', t: '選取（空白鍵）' }, { tool: 'move', i: 'move', k: 'M', t: '移動（M）' }, { tool: 'rotate', i: 'rotate', k: 'Q', t: '旋轉 90°（Q）' },
      { act: 'autowall', i: 'magnet', txt: '靠牆', t: '自動靠牆：移動/放置櫃體時，櫃背離牆 5cm 內自動貼齊牆面（拖曳時按住 Alt 可暫時停用）' },
      { act: 'dup', i: 'dup', k: '', t: '複製選取櫃體（Ctrl+D）' }, { act: 'delete', i: 'delete', k: '', t: '刪除（Delete）' }],
    [{ act: 'rect', i: 'rect', k: 'R', t: '矩形空間：輸入寬/深/高（R）' }, { tool: 'line', i: 'line', k: 'L', t: '自由繪製多線段空間（L）' }, { tool: 'tape', i: 'tape', k: 'T', t: '捲尺量測（T）' }],
    [{ tool: 'orbit', i: 'orbit', k: 'O', t: '環轉（O）｜任何時候可用滑鼠中鍵' }, { tool: 'pan', i: 'pan', k: 'H', t: '平移（H）｜Shift+中鍵 或 右鍵' }, { tool: 'zoom', i: 'zoom', k: 'Z', t: '縮放（Z）｜滾輪' }, { act: 'extents', i: 'extents', k: '', t: '充滿視窗（Shift+Z）' }],
    [{ act: 'view:iso', txt: '等角', t: '等角視圖' }, { act: 'view:top', txt: '上', t: '上視圖' }, { act: 'view:front', txt: '前', t: '前視圖' }, { act: 'view:right', txt: '右', t: '右視圖' }, { act: 'view:back', txt: '後', t: '後視圖' }, { act: 'view:left', txt: '左', t: '左視圖' }, { act: 'persp', txt: '透視', t: '切換透視／平行投影' }],
    [{ act: 'walls', i: 'walls', txt: '牆:自動', t: '牆面顯示：自動隱藏靠近鏡頭的牆／顯示／隱藏' }, { act: 'render', i: 'render', txt: '材質', t: '顯示樣式：材質／白模／X光' }, { act: 'open', i: 'open', t: '全部開門預覽（Shift＋快按兩下櫃體可單獨開關）' }, { act: 'dims', i: 'dims', t: '顯示牆長標註' }],
    [{ act: 'undo', i: 'undo', t: '復原（Ctrl+Z）' }, { act: 'redo', i: 'redo', t: '重做（Ctrl+Y）' }, { act: 'help', i: 'help', t: '操作說明' }]
  ];

  /* ================= 初始化 ================= */
  UI.init = function () {
    // 工具列
    $('#toolbar').innerHTML = TOOLBAR.map(g => `<div class="tgroup">${g.map(b => {
      const inner = (b.i ? icon(b.i) : '') + (b.txt ? `<span data-lbl="${b.act || b.tool}">${b.txt}</span>` : '') + (b.k ? `<span class="key">${b.k}</span>` : '');
      return `<button class="tbtn${b.txt ? ' wide' : ''}" ${b.tool ? `data-tool="${b.tool}"` : `data-act="${b.act}"`} title="${b.t}">${inner}</button>`;
    }).join('')}</div>`).join('');
    $('#toolbar').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) V().setTool(b.dataset.tool);
      else UI.action(b.dataset.act);
    });
    $('#viewCube').hidden = true;
    initFloorBar();
    // 選取物件浮動工具列：手動旋轉 90°
    $('#miniBar').addEventListener('pointerdown', e => e.stopPropagation());
    $('#miniBar').addEventListener('click', e => {
      const b = e.target.closest('[data-mini]'); if (!b) return;
      const a = b.dataset.mini;
      if (a === 'rotl') App.rotateSelected(-90);
      else if (a === 'rotr') App.rotateSelected(90);
      else if (a === 'dup') App.duplicateSelected();
      else if (a === 'del') App.deleteSelected();
    });
    document.querySelectorAll('#emptyHint [data-act]').forEach(b => b.addEventListener('click', () => UI.action(b.dataset.act === 'line' ? 'line' : 'rect')));

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
    if (bg) bg.addEventListener('click', () => { $('#exportMenu').hidden = true; window.AIRender.open(); });
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

    // 型錄
    buildFilters();
    $('#catSearch').addEventListener('input', renderCatalog);
    renderCatalog();

    // 右側面板事件（委派）
    $('#tab-props').addEventListener('change', onPropsChange);
    $('#tab-props').addEventListener('click', onPropsClick);
    $('#tab-props').addEventListener('input', onSwatchInput);
    UI.injectSwatchCSS();
    $('#tab-quote').addEventListener('change', onQuoteChange);
    $('#tab-quote').addEventListener('click', onQuoteClick);
    $('#tab-scenes').addEventListener('change', onScenesChange);
    $('#tab-scenes').addEventListener('click', onScenesClick);
    $('#tab-pricing').addEventListener('change', onPricingChange);
    $('#tab-pricing').addEventListener('click', onPricingClick);

    // 鍵盤
    document.addEventListener('keydown', onKey);
    $('#vcb').addEventListener('keydown', e => { if (e.key === 'Enter') { vcbEnter(); e.preventDefault(); } if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); } });
    initLineInput();

    V().setTool('select');
  };

  UI.showTab = function (name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    ['props', 'quote', 'scenes', 'pricing'].forEach(n => { $('#tab-' + n).hidden = n !== name; });
    UI.curTab = name;
    if (name === 'pricing') renderPricing();
    if (name === 'scenes') renderScenes();
    if (name === 'quote') renderQuote();
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
    if (UI.curTab === 'quote') renderQuote();
    if (UI.curTab === 'scenes') renderScenes();
    if (UI.curTab === 'pricing') renderPricing();
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
  UI.syncToolbar = function () {
    const v = V();
    // 空間提示：已有空間/櫃體、或正在繪製、放置時隱藏
    const st = App.state;
    $('#emptyHint').hidden = !!(st.room || st.cabinets.length) || ['line', 'place'].includes(v.tool) || !!document.querySelector('.modal-back');
    document.querySelectorAll('.tbtn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === v.tool));
    const set = (act, on, label) => {
      const b = document.querySelector(`.tbtn[data-act="${act}"]`); if (!b) return;
      b.classList.toggle('active', !!on);
      if (label) { const l = b.querySelector('[data-lbl]'); if (l) l.textContent = label; }
    };
    set('walls', v.wallMode !== 'show', { auto: '牆:自動', show: '牆:顯示', hide: '牆:隱藏' }[v.wallMode]);
    set('render', App.renderMode, { '': '材質', white: '白模', xray: 'X光' }[App.renderMode || '']);
    set('open', v.isOpenAll && v.isOpenAll());
    set('dims', v.showWallDims);
    set('autowall', v.autoWall, v.autoWall ? '靠牆' : '自由');
    set('persp', v.isOrtho && v.isOrtho(), v.isOrtho && v.isOrtho() ? '平行' : '透視');
    const lbl = { line: '長度', move: '距離', rotate: '角度' }[v.tool] || (App.selectedCab() ? '位移 x,z' : '尺寸');
    $('#vcbLabel').textContent = lbl;
    syncLineInput();
  };

  UI.action = function (a) {
    const v = V();
    if (a.startsWith('view:')) { v.setView(a.slice(5)); return; }
    switch (a) {
      case 'rect': UI.roomDialog(); break;
      case 'line':
        v.setTool('line');
        if (App.state.room) App.toast('完成繪製後將取代目前空間（櫃體保留）');
        break;
      case 'delete': App.deleteSelected(); break;
      case 'dup': App.duplicateSelected(); break;
      case 'extents': v.zoomExtents(); break;
      case 'persp': v.setProjection(!v.isOrtho()); break;
      case 'walls': v.wallMode = { auto: 'show', show: 'hide', hide: 'auto' }[v.wallMode]; UI.syncToolbar(); break;
      case 'render': { const next = { '': 'white', white: 'xray', xray: 'shaded' }[App.renderMode || '']; v.setRenderMode(next); UI.syncToolbar(); break; }
      case 'open': v.toggleOpenAll(); UI.syncToolbar(); break;
      case 'dims': v.showWallDims = !v.showWallDims; UI.syncToolbar(); break;
      case 'autowall': v.setAutoWall(!v.autoWall); UI.syncToolbar(); App.toast(v.autoWall ? '已開啟自動靠牆（拖曳時按住 Alt 可暫時停用）' : '已關閉自動靠牆'); break;
      case 'undo': App.undo(); break;
      case 'redo': App.redo(); break;
      case 'help': UI.helpDialog(); break;
    }
  };

  // 把手選項：空值＝依門板款式預設
  function handleOptions(cur, styleId) {
    const st = D.DOOR_STYLES.find(s => s.id === styleId) || D.DOOR_STYLES[0];
    const def = D.HANDLE_BY_ID[(st.visual || {}).handle || 'bar'];
    return `<option value=""${!cur ? ' selected' : ''}>依門板款式（${def ? def.name : '款式一體把手'}）</option>` +
      D.HANDLES.map(h => `<option value="${h.id}"${h.id === cur ? ' selected' : ''}>${h.name}${h.pair ? '（雙門片適用）' : ''}</option>`).join('');
  }
  /* ================= 型錄 ================= */
  const FILTERS = [['all', '全部'], ['A', 'D580mm'], ['B', 'D408mm'], ['C', 'D360mm'], ['T', '電視空櫃 D500'], ['K', '電器櫃'], ['corner', '轉角櫃'], ['hang', '吊櫃'], ['double', '雙開隔間'], ['tri', '三角邊櫃'], ['filler', '補板'], ['desk', '桌面'], ['appl', '廚房設備'], ['dayday', 'DAY&DAY 廚房'], ['daydayb', 'DAY&DAY 衛浴'], ['daydayf', 'DAY&DAY 龍頭'], ['toto', 'TOTO'], ['hcg', '和成 HCG'], ['furn', '家具']];
  let curFilter = 'all', curBrand = 'all', curType = 'all', curColor = 'all';
  let subCollapsed = (() => { try { return localStorage.getItem('cab3d_subfilters') === '0'; } catch (e) { return false; } })();
  const COLOR_NAME = { steel: '不鏽鋼／絲光', gold: '金色', gray: '暮灰色', black: '黑色', white: '白色陶瓷' };
  let pickedCode = null;
  function buildFilters() {
    $('#catFilters').innerHTML = FILTERS.map(([k, n]) => `<button class="chip${k === curFilter ? ' active' : ''}" data-f="${k}">${n}</button>`).join('') +
      (curFilter === 'appl' ? `<div class="brand-chips">${[['all', '全部品牌'], ...D.APPL_BRANDS.map(b => [b, b.split(' ')[0]])].map(([k, n]) => `<button class="chip small${k === curBrand ? ' active' : ''}" data-b="${k}">${n}</button>`).join('')}</div>` : '') +
      subFilters();
    $('#catFilters').onclick = e => {
      const tg = e.target.closest('[data-sub-toggle]'); if (tg) { subCollapsed = !subCollapsed; try { localStorage.setItem('cab3d_subfilters', subCollapsed ? '0' : '1'); } catch (e2) { /* 忽略 */ } buildFilters(); return; }
      const bb = e.target.closest('[data-b]'); if (bb) { curBrand = bb.dataset.b; curType = 'all'; buildFilters(); renderCatalog(); return; }
      const bt = e.target.closest('[data-t]'); if (bt) { curType = bt.dataset.t; buildFilters(); renderCatalog(); return; }
      const bc = e.target.closest('[data-c]'); if (bc) { curColor = bc.dataset.c; buildFilters(); renderCatalog(); return; }
      const b = e.target.closest('[data-f]'); if (!b) return; curFilter = b.dataset.f; curType = 'all'; curColor = 'all'; buildFilters(); renderCatalog();
    };
  }
  // 第二、三列可收合；收起時標題顯示目前選的分類與色系
  function subFilters() {
    const body = typeChips() + colorChips();
    if (!body) return '';
    const cur = [curType === 'all' ? '全部分類' : D.APPL_TYPES[curType], curColor !== 'all' ? COLOR_NAME[curColor] : ''].filter(Boolean).join(' · ');
    return `<div class="sub-filters${subCollapsed ? ' collapsed' : ''}"><button class="sub-toggle" data-sub-toggle title="${subCollapsed ? '展開分類篩選' : '收起分類篩選'}"><span class="caret">${subCollapsed ? '▸' : '▾'}</span>分類篩選<small>${esc(cur)}</small></button><div class="sub-body">${body}</div></div>`;
  }
  // 第二列：品項分類（廚房設備、DAY&DAY 廚房／衛浴／龍頭）；第三列：色系（DAY&DAY 衛浴／龍頭）
  function typeChips() {
    if (!['appl', 'dayday', 'daydayb', 'daydayf', 'toto', 'hcg', 'furn'].includes(curFilter)) return '';
    const its = D.items.filter(it => it.group === curFilter && (curFilter !== 'appl' || curBrand === 'all' || it.brand === curBrand));
    const cnt = {}; its.forEach(it => { cnt[it.at] = (cnt[it.at] || 0) + 1; });
    const types = AORDER.filter(t => cnt[t]);
    return `<div class="brand-chips type-chips">${[['all', `全部分類 ${its.length}`], ...types.map(t => [t, `${D.APPL_TYPES[t]} ${cnt[t]}`])].map(([k, n]) => `<button class="chip small${k === curType ? ' active' : ''}" data-t="${k}">${n}</button>`).join('')}</div>`;
  }
  function colorChips() {
    if (curFilter !== 'daydayb' && curFilter !== 'daydayf') return '';
    const its = D.items.filter(it => it.group === curFilter && (curType === 'all' || it.at === curType));
    const cnt = {}; its.forEach(it => { const c = it.finish || 'steel'; cnt[c] = (cnt[c] || 0) + 1; });
    const cols = ['steel', 'gold', 'gray', 'black'].filter(c => cnt[c]);
    if (cols.length < 2) return '';
    return `<div class="brand-chips color-chips">${[['all', '全部色系'], ...cols.map(c => [c, `${COLOR_NAME[c]} ${cnt[c]}`])].map(([k, n]) => `<button class="chip small${k === curColor ? ' active' : ''}" data-c="${k}">${n}</button>`).join('')}</div>`;
  }
  const AORDER = ['sink', 'hob', 'dw', 'dryer', 'oven', 'hood', 'rack', 'rod', 'spice', 'knife', 'cup', 'util', 'basket', 'bath', 'towel', 'paper', 'mirror', 'mshelf', 'toothcup', 'soap', 'brush', 'hairdryer', 'grab', 'hook', 'bathacc', 'faucet', 'wallfaucet', 'basin', 'shower', 'showercol', 'slidebar', 'bidet', 'toilet', 'seat', 'washbasin', 'vanity', 'mirrorcab', 'showerdoor', 'urinal', 'bathtub', 'flushvalve', 'dryerfan', 'handdryer', 'bed', 'nightstand', 'sofa', 'armchair', 'coffeetable', 'sidetable', 'tvstand', 'diningtable', 'chair', 'barstool', 'studydesk', 'wardrobe'];
  const HORDER = ['1', '15', '2', '21', '22', '3', '4', '5', '6', '65', '7', '75', '8'];
  const GORDER = ['desk', 'appl', 'dayday', 'daydayb', 'daydayf', 'toto', 'hcg', 'furn', 'A', 'B', 'C', 'T', 'K', 'corner', 'hang', 'double', 'tri', 'filler'];
  const GNAME = { A: 'A深', B: 'B深', C: 'C深', T: 'T深 電視空櫃', corner: '轉角櫃', hang: '吊櫃', double: 'C深雙開隔間櫃', tri: '三角邊櫃' };
  // 以 H/W/D 直接寫出尺寸，不用再背型號代碼
  const GROUP_SUFFIX = { K: '電器櫃', corner: '轉角櫃', hang: '吊櫃', double: '雙開隔間櫃 D360', tri: '三角邊櫃' };
  // 分組標題：高度＋深度（T 深為電視空櫃）
  function groupTitle(g, hc) {
    const h = D.HEIGHTS[hc];
    if (g === 'T') return `D500 H${h}mm 電視空櫃`;
    if (GROUP_SUFFIX[g]) return `H${h}mm ${GROUP_SUFFIX[g]}`;
    return `D${D.DEPTHS[g]} H${h}mm`;
  }
  // 卡片標題：櫃體用 W寬度H高度；桌面與廚房設備維持原本的名稱／型號
  // 卡片很窄，名稱會換行；只允許斷在 - ＋ / 這些有意義的位置，不要斷在數字中間
  const wbrName = s => esc(s).replace(/([-+＋/])/g, '$1<wbr>');
  function catName(it) {
    if (it.kind === 'desk') return D.DESK_SHAPES[it.shape] + '桌面';
    if (it.kind === 'appl') return it.group === 'furn' ? it.name : it.code;
    return M().cabName(it, true);   // 型錄都是標準款，固定 -S
  }
  // 卡片規格：W×D×H（和 3D 標籤、屬性面板同一個順序）
  function catDims(it) {
    if (it.kind === 'desk') return `${it.w}×${it.shape === 'R' ? it.d : it.l2}×18mm`;
    return `W${it.w} x D${it.d} x H${it.h}`;
  }
  /* 同一組裡高寬相同、只差在門片配置的型號很多（例如 W450D580H320 的開放／左開／抽屜×2），
     光看 H320W450 分不出來，所以小字那行把門片配置一起列出來 */
  const FRONT_SHORT = { O: '開放', L: '左開', R: '右開', P: '對開', G: '玻璃', GP: '玻璃對開', D: '抽屜', F: '折疊', E: '電器抽' };
  function frontLabel(it) {
    if (it.kind === 'tri') return D.TRI_TYPE_NAME[it.triType] || '';
    const fs = it.fronts || [];
    if (!fs.length) return '開放';
    const parts = [];
    fs.forEach(r => {
      const n = FRONT_SHORT[r.t] || r.t;
      const last = parts[parts.length - 1];
      if (last && last.n === n) last.c++; else parts.push({ n, c: 1 });
    });
    return parts.map(p => p.n + (p.c > 1 ? '×' + p.c : '')).join('＋');
  }
  // 小字那行：門片配置（不顯示舊型號代碼；設備顯示類別）
  function catSubline(it) {
    if (it.kind === 'desk') return '';
    if (it.kind === 'appl') return it.group === 'furn' ? `W${it.w} × D${it.d} × H${it.h}` : esc(D.APPL_TYPES[it.at] || '');
    return esc(frontLabel(it));
  }
  // 卡片售價：櫃體以「110 白」每才單價 × 單櫃體總才數；桌面與設備維持原本的
  function catPrice(it) {
    if (it.kind === 'desk') return '依才數';
    if (it.kind === 'appl') return `<b class="brand">${esc(it.brand.split(' ')[0])}</b> $${it.price.toLocaleString()}`;
    const c = window.Pricing.catalogCai(it.code, App.state.pricing);
    if (!c) return '$' + it.price.toLocaleString();
    return `${c.cai} 才 · $${c.price.toLocaleString()}`;
  }
  // 色板單價或預設單價改了之後，型錄卡片的才數售價要跟著重算
  UI.refreshCatalog = function () { window.Pricing.clearCatalogCai(); renderCatalog(); };
  function renderCatalog() {
    const q = $('#catSearch').value.trim().toUpperCase();
    // 搜尋比對完整名稱（含櫃型，如「水槽」「吊」）與尺寸；設備可用型號、品牌搜尋
    // 尺寸搜尋不分順序：H320W300、W300H320、W600 D580 都可以（W 寬、D 深、H 高，單位 mm）
    const dimQ = /^(\s*[WDH]\s*\d+\s*)+$/.test(q) ? [...q.matchAll(/([WDH])\s*(\d+)/g)].map(m => [m[1], +m[2]]) : null;
    const dimOk = it => it.kind !== 'appl' && dimQ.every(([k, v]) => (k === 'W' ? it.w : k === 'D' ? it.d : it.h) === v);
    const match = it => !q || (dimQ ? dimOk(it) : it.code.toUpperCase().includes(q) || catName(it).toUpperCase().includes(q) || catDims(it).toUpperCase().includes(q)
      || (it.kind === 'appl' && (it.name.includes(q) || D.APPL_TYPES[it.at].includes(q) || it.brand.toUpperCase().includes(q))));
    const list = D.items.filter(it => (curFilter === 'all' || it.group === curFilter) && match(it) && (curFilter !== 'appl' || curBrand === 'all' || it.brand === curBrand)
      && (curType === 'all' || it.at === curType) && (curColor === 'all' || (it.finish || 'steel') === curColor));
    $('#catCount').textContent = `${list.length} / ${D.items.length} 項`;
    const groups = new Map();
    list.forEach(it => {
      const key = it.group + '|' + (it.kind === 'appl' ? it.at : it.hc);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    });
    const keys = [...groups.keys()].sort((a, b) => {
      const [ga, ha] = a.split('|'), [gb, hb] = b.split('|');
      return GORDER.indexOf(ga) - GORDER.indexOf(gb) || (ga === 'appl' ? AORDER.indexOf(ha) - AORDER.indexOf(hb) : HORDER.indexOf(ha) - HORDER.indexOf(hb));
    });
    const openAll = !!q || keys.length <= 3;
    $('#catList').innerHTML = keys.length ? keys.map((k, i) => {
      const [g, hc] = k.split('|');
      const its = groups.get(k);
      const title = /^(dayday|toto|hcg|furn)/.test(g) ? D.APPL_TYPES[hc] : g === 'appl' ? '廚房設備｜' + D.APPL_TYPES[hc] : g === 'desk' ? '桌面' : g === 'filler' ? '補板' : groupTitle(g, hc);
      const sub = /^(dayday|toto|hcg|furn)/.test(g) ? '' : g === 'appl' ? `${[...new Set(its.map(x => x.brand.split(' ')[0]))].join('、')} · ${its.length} 款` : g === 'desk' ? `${its.length} 款 · 依材質每才計價，尺寸可自訂` : g === 'filler' ? `${its.length} 款 · 補滿櫃體與牆之間的空隙，寬高深可自訂` : `${its.length} 款 · ${esc(g === 'K' ? '廚房電器櫃（電器抽可拉出）' : D.HEIGHT_USE[hc] || '')}`;
      return `<details class="cat-group"${openAll || i < 2 ? ' open' : ''}><summary><b>${esc(title)}</b><span>${sub}</span></summary>
        <div class="cat-grid">${its.map(it => `<div class="cat-item${it.code === pickedCode ? ' picked' : ''}" draggable="true" data-code="${it.code}" title="${esc(tipOf(it))}">
          ${UI.thumb(it)}<span class="code">${wbrName(catName(it))}</span>${it.kind === 'desk' ? `<span class="dims">${catDims(it)}</span>` : `<span class="oldcode">${catSubline(it)}</span>`}<span class="price">${catPrice(it)}</span></div>`).join('')}</div></details>`;
    }).join('') : '<p class="muted" style="padding:12px">找不到符合的型號</p>';
    $('#catList').onclick = e => {
      const it = e.target.closest('.cat-item'); if (!it) return;
      pickedCode = it.dataset.code;
      document.querySelectorAll('.cat-item.picked').forEach(x => x.classList.remove('picked'));
      it.classList.add('picked');
      V().startPlace(pickedCode);
    };
    $('#catList').ondragstart = e => {
      const it = e.target.closest('.cat-item'); if (!it) return;
      e.dataTransfer.setData('text/plain', it.dataset.code);
      e.dataTransfer.effectAllowed = 'copy';
      V().startPlace(it.dataset.code);
    };
  }
  function tipOf(it) {
    if (it.kind === 'appl') return `${it.brand} ${it.code}\n${it.name}\n${it.spec}\n${it.est ? '估計價' : '建議售價'} NT$ ${it.price.toLocaleString()}`;
    if (it.kind === 'desk') return `${D.DESK_SHAPES[it.shape]}桌面\n預設 ${it.w} × ${it.shape === 'R' ? it.d : it.l2} mm，深 ${it.d}\n系統板 18mm，依才數計價`;
    const f = it.fronts.map(r => (D.FRONT_NAME[r.t] || r.t) + r.h).join('／') || (it.kind === 'tri' ? D.TRI_TYPE_NAME[it.triType] : '開放櫃');
    const c = window.Pricing.catalogCai(it.code, App.state.pricing);
    const cai = c ? `\n板材 ${c.cai} 才 × ${c.unit} 元/才（110 白${c.set ? '' : '，預設單價'}）＝ NT$ ${c.price.toLocaleString()}\n※ 僅板材，不含五金與款式加價` : '';
    return `${catName(it)}\nW${it.w} × D${it.d} × H${it.h} mm\n${f}${cai}`;
  }

  // 廚房設備縮圖
  const ST = '#c9cdd2', DK = '#2b2f33', LN = '#3b4450';
  const APPL_SVG = {
    sink: it => `<rect x="4" y="${it.w > 700 ? 18 : 16}" width="56" height="${it.w > 700 ? 28 : 32}" rx="3" fill="${ST}" stroke="${LN}"/><rect x="9" y="${it.w > 700 ? 22 : 21}" width="46" height="${it.w > 700 ? 20 : 22}" rx="4" fill="#e9ecef" stroke="${LN}" stroke-width=".7"/><circle cx="32" cy="32" r="2.6" fill="${DK}"/><text x="32" y="60" font-size="8" text-anchor="middle" fill="#69727d">${Math.round(it.w / 10)}cm</text>`,
    hob: it => `<rect x="3" y="14" width="58" height="36" rx="3" fill="${it.finish === 'glass' ? DK : ST}" stroke="${LN}"/>${[20, 44].map(x => `<circle cx="${x}" cy="30" r="9" fill="none" stroke="${it.finish === 'glass' ? '#9aa0a6' : DK}" stroke-width="1.4"/><circle cx="${x}" cy="30" r="3.5" fill="#5b6168"/>`).join('')}${[24, 40].map(x => `<circle cx="${x}" cy="45" r="2" fill="#bfc3c7"/>`).join('')}`,
    dw: it => `<rect x="10" y="4" width="44" height="56" fill="${it.finish === 'panel' ? '#f6efe3' : ST}" stroke="${LN}"/><rect x="10" y="4" width="44" height="7" fill="${DK}"/><rect x="26" y="15" width="12" height="2.4" rx="1" fill="#8a9097"/>`,
    dryer: it => it.mount === 'wall' ? `<rect x="3" y="16" width="58" height="30" fill="#f4f4f2" stroke="${LN}"/><rect x="3" y="38" width="58" height="8" fill="#e0e2e4" stroke="${LN}" stroke-width=".6"/><circle cx="54" cy="22" r="1.8" fill="#5a8f00"/>`
      : `<rect x="12" y="6" width="40" height="52" fill="${it.finish === 'panel' ? '#f6efe3' : DK}" stroke="${LN}"/><line x1="12" y1="30" x2="52" y2="30" stroke="#8a9097"/><rect x="26" y="12" width="12" height="2" fill="#8a9097"/><rect x="26" y="36" width="12" height="2" fill="#8a9097"/>`,
    oven: () => `<rect x="7" y="7" width="50" height="50" fill="${DK}" stroke="${LN}"/><rect x="7" y="7" width="50" height="9" fill="#5b6168"/><rect x="13" y="22" width="38" height="28" rx="2" fill="#3d4349" stroke="#8a9097"/><rect x="18" y="18" width="28" height="2" fill="#bfc3c7"/>`,
    rack: it => { const t = it.tiers || 1; let o = ''; for (let i = 0; i < t; i++) { const y = t > 1 ? 8 + i * 42 / (t - 1) : 28; o += `<rect x="6" y="${y}" width="52" height="10" fill="none" stroke="${DK}" stroke-width="1.2"/>` + [14, 22, 30, 38, 46].map(x => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 10}" stroke="${DK}" stroke-width=".8"/>`).join(''); } if (t > 1) o += `<line x1="6" y1="8" x2="6" y2="60" stroke="${DK}" stroke-width="1.4"/><line x1="58" y1="8" x2="58" y2="60" stroke="${DK}" stroke-width="1.4"/>`; return o; },
    rod: () => `<rect x="4" y="30" width="56" height="4" rx="2" fill="${ST}" stroke="${LN}"/><rect x="8" y="26" width="5" height="12" rx="1" fill="${DK}"/><rect x="51" y="26" width="5" height="12" rx="1" fill="${DK}"/>`,
    spice: () => `<rect x="8" y="24" width="48" height="28" fill="none" stroke="${DK}" stroke-width="1.2"/>${[16, 28, 40].map(x => `<rect x="${x}" y="12" width="9" height="30" rx="2" fill="#e9ecef" stroke="${LN}"/>`).join('')}${[20, 32, 44].map(x => `<line x1="${x}" y1="24" x2="${x}" y2="52" stroke="${DK}" stroke-width=".6"/>`).join('')}`,
    knife: () => `<rect x="10" y="22" width="44" height="32" fill="none" stroke="${DK}" stroke-width="1.2"/><path d="M20 8 L23 44 M29 6 L31 44" stroke="${DK}" stroke-width="1.6"/><rect x="38" y="6" width="10" height="40" rx="1" fill="#e7d9bf" stroke="${LN}"/>`,
    cup: () => `<rect x="6" y="10" width="52" height="4" fill="${ST}" stroke="${LN}"/>${[14, 32, 50].map(x => `<path d="M${x - 6} 18h12v12a6 6 0 0 1-12 0z" fill="#f4f4f2" stroke="${DK}"/>`).join('')}`,
    util: () => `<path d="M18 18H46L43 54H21Z" fill="none" stroke="${DK}" stroke-width="1.2"/>${[26, 32, 38].map(x => `<line x1="${x}" y1="18" x2="${x}" y2="54" stroke="${DK}" stroke-width=".6"/>`).join('')}<line x1="26" y1="6" x2="26" y2="18" stroke="${DK}" stroke-width="1.6"/><line x1="36" y1="4" x2="36" y2="18" stroke="${DK}" stroke-width="1.6"/>`,
    basket: () => `<rect x="2" y="26" width="60" height="4" fill="${ST}" stroke="${LN}"/><rect x="6" y="30" width="52" height="14" fill="none" stroke="${DK}" stroke-width="1.2"/>${[14, 22, 30, 38, 46].map(x => `<line x1="${x}" y1="30" x2="${x}" y2="44" stroke="${DK}" stroke-width=".7"/>`).join('')}`,
    bath: it => APPL_SVG.rack(it), mshelf: it => APPL_SVG.rack(it), toothcup: it => APPL_SVG.rack(it), soap: it => APPL_SVG.rack(it), brush: it => APPL_SVG.util(it), hairdryer: it => APPL_SVG.util(it), bathacc: it => APPL_SVG.rack(it), paper: it => APPL_SVG.rod(it),
    bed: () => `<rect x="6" y="14" width="52" height="40" rx="3" fill="#f6efe3" stroke="${DK}"/><rect x="6" y="8" width="52" height="8" rx="2" fill="${DK}"/><rect x="10" y="18" width="18" height="10" rx="3" fill="#fff" stroke="${LN}"/><rect x="36" y="18" width="18" height="10" rx="3" fill="#fff" stroke="${LN}"/>`,
    nightstand: () => `<rect x="14" y="16" width="36" height="40" rx="2" fill="#f6efe3" stroke="${DK}"/><line x1="14" y1="34" x2="50" y2="34" stroke="${DK}"/><circle cx="32" cy="25" r="2" fill="${DK}"/>`,
    sofa: () => `<rect x="6" y="22" width="52" height="24" rx="4" fill="#d9c7b0" stroke="${DK}"/><rect x="10" y="14" width="44" height="12" rx="3" fill="#e7d9bf" stroke="${DK}"/><rect x="4" y="26" width="8" height="20" rx="3" fill="#cdb89c" stroke="${DK}"/><rect x="52" y="26" width="8" height="20" rx="3" fill="#cdb89c" stroke="${DK}"/>`,
    armchair: () => `<rect x="14" y="22" width="36" height="24" rx="4" fill="#d9c7b0" stroke="${DK}"/><rect x="18" y="12" width="28" height="14" rx="3" fill="#e7d9bf" stroke="${DK}"/>`,
    coffeetable: () => `<rect x="8" y="26" width="48" height="8" rx="2" fill="#e7d9bf" stroke="${DK}"/><line x1="12" y1="34" x2="12" y2="50" stroke="${DK}" stroke-width="2"/><line x1="52" y1="34" x2="52" y2="50" stroke="${DK}" stroke-width="2"/>`,
    sidetable: () => `<rect x="18" y="22" width="28" height="6" rx="2" fill="#e7d9bf" stroke="${DK}"/><line x1="22" y1="28" x2="22" y2="52" stroke="${DK}" stroke-width="2"/><line x1="42" y1="28" x2="42" y2="52" stroke="${DK}" stroke-width="2"/>`,
    tvstand: () => `<rect x="4" y="30" width="56" height="18" rx="2" fill="#f6efe3" stroke="${DK}"/><line x1="24" y1="30" x2="24" y2="48" stroke="${DK}"/><line x1="40" y1="30" x2="40" y2="48" stroke="${DK}"/><rect x="18" y="10" width="28" height="18" fill="${DK}"/>`,
    diningtable: () => `<rect x="6" y="20" width="52" height="8" rx="2" fill="#e7d9bf" stroke="${DK}"/><line x1="12" y1="28" x2="12" y2="54" stroke="${DK}" stroke-width="2.5"/><line x1="52" y1="28" x2="52" y2="54" stroke="${DK}" stroke-width="2.5"/>`,
    chair: () => `<rect x="20" y="8" width="24" height="22" rx="3" fill="#e7d9bf" stroke="${DK}"/><rect x="18" y="30" width="28" height="8" rx="2" fill="#d9c7b0" stroke="${DK}"/><line x1="22" y1="38" x2="22" y2="56" stroke="${DK}" stroke-width="2"/><line x1="42" y1="38" x2="42" y2="56" stroke="${DK}" stroke-width="2"/>`,
    barstool: () => `<ellipse cx="32" cy="14" rx="14" ry="5" fill="#d9c7b0" stroke="${DK}"/><line x1="32" y1="19" x2="32" y2="48" stroke="${DK}" stroke-width="3"/><ellipse cx="32" cy="52" rx="12" ry="4" fill="none" stroke="${DK}" stroke-width="2"/>`,
    studydesk: () => `<rect x="6" y="18" width="52" height="7" rx="2" fill="#e7d9bf" stroke="${DK}"/><rect x="38" y="25" width="18" height="26" fill="#f6efe3" stroke="${DK}"/><line x1="10" y1="25" x2="10" y2="52" stroke="${DK}" stroke-width="2"/>`,
    wardrobe: () => `<rect x="12" y="4" width="40" height="56" rx="2" fill="#f6efe3" stroke="${DK}"/><line x1="32" y1="4" x2="32" y2="60" stroke="${DK}"/><circle cx="29" cy="32" r="1.6" fill="${DK}"/><circle cx="35" cy="32" r="1.6" fill="${DK}"/>`,
    vanity: () => `<rect x="6" y="20" width="52" height="36" rx="2" fill="#f6efe3" stroke="${DK}"/><path d="M14 20h36a18 10 0 0 1-36 0z" fill="#f4f4f2" stroke="${DK}"/><line x1="32" y1="34" x2="32" y2="56" stroke="${DK}"/>`,
    mirrorcab: () => `<rect x="10" y="6" width="44" height="52" rx="2" fill="#dfe6ec" stroke="${DK}" stroke-width="1.2"/><line x1="32" y1="6" x2="32" y2="58" stroke="${DK}"/><line x1="16" y1="50" x2="30" y2="14" stroke="#fff" stroke-width="3" opacity=".8"/>`,
    showerdoor: () => `<rect x="8" y="4" width="48" height="56" fill="#e3ecf2" stroke="${DK}" stroke-width="1.2" opacity=".9"/><line x1="32" y1="4" x2="32" y2="60" stroke="${DK}"/><rect x="26" y="30" width="4" height="10" fill="${DK}"/>`,
    toilet: () => `<path d="M14 30h36v8a18 10 0 0 1-36 0z" fill="#f4f4f2" stroke="${DK}"/><rect x="36" y="8" width="16" height="22" rx="2" fill="#f4f4f2" stroke="${DK}"/><path d="M22 48v10h20V48" fill="none" stroke="${DK}"/>`,
    seat: () => `<path d="M12 22h40a20 14 0 0 1-40 0z" fill="#f4f4f2" stroke="${DK}" stroke-width="1.5"/><rect x="24" y="18" width="16" height="6" rx="2" fill="${DK}"/>`,
    washbasin: () => `<path d="M8 22h48a24 16 0 0 1-48 0z" fill="#f4f4f2" stroke="${DK}" stroke-width="1.5"/><circle cx="32" cy="34" r="2.5" fill="${DK}"/><rect x="29" y="8" width="6" height="14" rx="2" fill="${ST}"/>`,
    urinal: () => `<path d="M18 8h28v24a14 16 0 0 1-28 0z" fill="#f4f4f2" stroke="${DK}" stroke-width="1.5"/><rect x="28" y="4" width="8" height="6" fill="${ST}"/>`,
    bathtub: () => `<rect x="4" y="22" width="56" height="26" rx="8" fill="#f4f4f2" stroke="${DK}" stroke-width="1.5"/><rect x="10" y="27" width="44" height="16" rx="6" fill="#e3e8ec"/>`,
    flushvalve: () => `<rect x="24" y="8" width="16" height="22" rx="3" fill="${ST}" stroke="${LN}"/><rect x="30" y="30" width="4" height="26" fill="${ST}"/><rect x="18" y="14" width="6" height="6" fill="${DK}"/>`,
    dryerfan: () => `<rect x="6" y="18" width="52" height="28" rx="3" fill="#f4f4f2" stroke="${DK}"/>${[14, 24, 34, 44].map(x => `<line x1="${x}" y1="24" x2="${x}" y2="40" stroke="#9aa0a6"/>`).join('')}`,
    handdryer: () => `<path d="M16 8h32v30l-10 18H26L16 38z" fill="#f4f4f2" stroke="${DK}"/><rect x="26" y="40" width="12" height="4" fill="${DK}"/>`,
    towel: it => APPL_SVG.rod(it), grab: it => APPL_SVG.rod(it), slidebar: () => `<rect x="29" y="6" width="6" height="52" rx="3" fill="${ST}" stroke="${LN}"/><rect x="24" y="10" width="16" height="5" fill="${DK}"/><rect x="24" y="49" width="16" height="5" fill="${DK}"/>`,
    faucet: () => `<rect x="26" y="40" width="12" height="18" rx="2" fill="${ST}" stroke="${LN}"/><path d="M32 40V14a10 10 0 0 1 10 10v6" fill="none" stroke="${DK}" stroke-width="5" stroke-linecap="round"/>`,
    wallfaucet: it => APPL_SVG.faucet(it), basin: it => APPL_SVG.faucet(it),
    shower: () => `<rect x="10" y="26" width="44" height="10" rx="5" fill="${ST}" stroke="${LN}"/><rect x="28" y="20" width="8" height="6" fill="${DK}"/><path d="M48 36v14" stroke="${DK}" stroke-width="2"/><ellipse cx="48" cy="54" rx="6" ry="3" fill="${DK}"/>`,
    showercol: () => `<rect x="30" y="8" width="4" height="50" fill="${ST}" stroke="${LN}"/><rect x="18" y="6" width="28" height="6" rx="3" fill="${DK}"/><rect x="22" y="30" width="20" height="8" rx="2" fill="${ST}" stroke="${LN}"/>`,
    bidet: () => `<rect x="28" y="8" width="8" height="30" rx="4" fill="${ST}" stroke="${LN}"/><rect x="24" y="4" width="16" height="8" rx="3" fill="${DK}"/><path d="M32 38q0 14 -10 20" fill="none" stroke="${DK}" stroke-width="2"/>`,
    mirror: () => `<rect x="12" y="6" width="40" height="52" rx="2" fill="#dfe6ec" stroke="${DK}" stroke-width="1.2"/><line x1="18" y1="50" x2="46" y2="12" stroke="#fff" stroke-width="3" opacity=".8"/>`,
    hook: () => `<rect x="26" y="8" width="12" height="6" rx="1" fill="${DK}"/><path d="M32 14v22a8 8 0 0 0 16 0" fill="none" stroke="${DK}" stroke-width="3"/>`,
    hood: it => it.style === 'deep' ? `<path d="M8 12H40L58 34V44H8Z" fill="${ST}" stroke="${LN}"/><rect x="18" y="4" width="14" height="8" fill="${ST}" stroke="${LN}"/><line x1="8" y1="40" x2="58" y2="40" stroke="#8a9097"/>`
      : it.style === 'std' ? `<rect x="3" y="24" width="58" height="16" fill="${ST}" stroke="${LN}"/><rect x="26" y="40" width="12" height="4" fill="#f3f3f1" stroke="${LN}" stroke-width=".6"/><rect x="25" y="12" width="14" height="12" fill="#dfe2e5" stroke="${LN}" stroke-width=".7"/>`
      : it.style === 'near' ? `<path d="M6 10H58V38L50 54H14L6 38Z" fill="${DK}" stroke="${LN}"/><rect x="24" y="4" width="16" height="6" fill="${ST}" stroke="${LN}"/><line x1="10" y1="40" x2="54" y2="40" stroke="#8a9097"/>`
      : `<rect x="3" y="22" width="58" height="22" fill="${ST}" stroke="${LN}"/><rect x="3" y="40" width="58" height="4" fill="#9aa0a6"/><rect x="24" y="10" width="16" height="12" fill="#dfe2e5" stroke="${LN}" stroke-width=".7"/>`
  };
  // 型錄縮圖（正視圖）
  UI.thumb = function (it, big) {
    const S = 64, pad = 4;
    if (it.kind === 'appl' && it.img) return `<span class="thumb photo"><img src="${it.img}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('nophoto')"><svg class="thumb" viewBox="0 0 64 64">${APPL_SVG[it.at](it)}</svg></span>`;
    if (it.kind === 'appl') return `<svg class="thumb" viewBox="0 0 64 64">${APPL_SVG[it.at](it)}</svg>`;
    if (it.kind === 'desk') {
      const d = { R: 'M6 22H58V42H6Z', L: 'M6 8H58V24H22V56H6Z', U: 'M4 8H60V56H46V24H18V56H4Z' }[it.shape];
      return `<svg class="thumb" viewBox="0 0 64 64"><path d="${d}" fill="#e7d9bf" stroke="#3b4450"/></svg>`;
    }
    if (it.kind === 'corner' || it.kind === 'hangcorner') {
      const a = 8, b = 56, t = 26;
      return `<svg class="thumb" viewBox="0 0 64 64"><path d="M${a} ${a}H${b}V${a + t}H${a + t}V${b}H${a}Z" fill="#f6efe3" stroke="#3b4450"/>${it.fronts.length ? `<path d="M${a + t} ${a + t}H${b}" stroke="#b98a57" stroke-width="3"/>` : ''}<text x="40" y="54" font-size="9" fill="#69727d" stroke="none" text-anchor="middle">L</text></svg>`;
    }
    if (it.kind === 'tri') {
      const d = it.triType === '00' ? 'M10 10H54M54 10V54' : it.triType === '01' ? 'M10 10H54V36L32 54H10Z' : 'M10 10H54V30Q54 54 30 54H10Z';
      return `<svg class="thumb" viewBox="0 0 64 64"><path d="${d}" fill="${it.triType === '00' ? 'none' : '#f6efe3'}" stroke="#3b4450" stroke-width="${it.triType === '00' ? 2.5 : 1}"/></svg>`;
    }
    const kick = it.hanging ? 0 : 100;
    const tw = it.w, th = it.h + kick;
    const sc = Math.min((S - 2 * pad) / tw, (S - 2 * pad) / th);
    const W = tw * sc, H = it.h * sc, K = kick * sc;
    const x0 = (S - W) / 2, y0 = (S - (H + K)) / 2;
    let s = `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#f6efe3" stroke="#3b4450"/>`;
    if (K) s += `<rect x="${x0 + 1}" y="${y0 + H}" width="${W - 2}" height="${K}" fill="#ddd3c3" stroke="#3b4450" stroke-width=".6"/>`;
    const rows = rowsOf(it);
    let y = y0;
    rows.forEach(r => {
      const rh = r.h * 10 * sc;
      s += frontSvg(r, x0, y, W, rh);
      y += rh;
    });
    return `<svg class="thumb" viewBox="0 0 64 64">${s}</svg>`;
  };
  function rowsOf(it) {
    const sum = it.fronts.reduce((a, r) => a + r.h, 0);
    const rows = it.fronts.map(r => ({ ...r }));
    const rest = Math.round(it.h / 10 - sum);
    if (rest > 0) rows.unshift({ t: 'O', h: rest });
    return rows;
  }
  function frontSvg(r, x, y, w, h) {
    const g = 0.8;
    const box = (xx, ww, fill) => `<rect x="${xx + g}" y="${y + g}" width="${ww - 2 * g}" height="${h - 2 * g}" fill="${fill}" stroke="#3b4450" stroke-width=".7"/>`;
    const door = (xx, ww, hinge, glass) => {
      let s = box(xx, ww, glass ? '#dcecf0' : '#efe2cc');
      const hx = hinge === 'L' ? xx + g : xx + ww - g, fx = hinge === 'L' ? xx + ww - g : xx + g;
      s += `<path d="M${fx} ${y + g}L${hx} ${y + h / 2}L${fx} ${y + h - g}" fill="none" stroke="#8a7a66" stroke-width=".5" stroke-dasharray="1.5 1"/>`;
      if (glass) s += `<path d="M${xx + ww * .3} ${y + h * .25}l${ww * .25} ${-h * .12}M${xx + ww * .35} ${y + h * .55}l${ww * .3} ${-h * .15}" stroke="#7fa7b3" stroke-width=".6"/>`;
      return s;
    };
    switch (r.t) {
      case 'O': return h > 6 ? `<path d="M${x + 1} ${y + h}H${x + w - 1}" stroke="#b7ada0" stroke-width=".5"/>` : '';
      case 'D': return box(x, w, '#efe2cc') + `<path d="M${x + w / 2 - 4} ${y + Math.min(h / 2, 3.5)}h8" stroke="#3b4450" stroke-width="1"/>`;
      case 'L': case 'R': return door(x, w, r.t === 'R' ? 'R' : 'L');
      case 'G': return door(x, w, 'L', true);
      case 'P': return door(x, w / 2, 'L') + door(x + w / 2, w / 2, 'R');
      case 'GP': return door(x, w / 2, 'L', true) + door(x + w / 2, w / 2, 'R', true);
      case 'F': return [0, 1, 2, 3].map(i => box(x + i * w / 4, w / 4, '#efe2cc')).join('');
      default: return '';
    }
  }

  /* ================= 屬性面板 ================= */
  function withFocus(el, fn) {
    const a = document.activeElement;
    const key = a && el.contains(a) && a.dataset ? a.dataset.key : null;
    const scroll = el.scrollTop;
    fn();
    el.scrollTop = scroll;
    if (key) { const n = el.querySelector(`[data-key="${key}"]`); if (n) n.focus(); }
  }
  UI.showProps = function (switchTab) {
    const el = $('#tab-props');
    const s = App.sel;
    if (switchTab && s) UI.showTab('props');
    withFocus(el, () => {
      if (s && s.type === 'cab' && App.selectedCab()) el.innerHTML = cabPanel(App.selectedCab());
      else if (s && s.type === 'wall' && App.state.room) el.innerHTML = wallPanel(s.index);
      else el.innerHTML = projectPanel();
    });
    UI.syncToolbar();
  };

  /* ---------- 色板選擇器 ---------- */
  const SW_TARGETS = [['bodyColor', '櫃身'], ['doorColor', '門片'], ['topColor', '桌面'], ['kickColor', '踢腳板']];
  UI.swTarget = 'bodyColor'; UI.swSeries = 'all'; UI.swBrand = 'all'; UI.swQuery = '';
  const matOf = code => App.state.pricing.materials.find(m => m.code === code) || { code, name: '', hex: '#ccc' };
  UI.matOf = matOf;
  UI.chip = function (code, size = '') {
    const m = matOf(code);
    return `<span class="sw-img ${size}" data-sw="${esc(code)}"${m.tex ? '' : ` style="background:${m.hex}"`}></span>`;
  };
  // 色板廠商：貼圖色板依 brand（伸保、禾邁…），其餘為型錄規格色
  const brandOf = m => m.tex ? (m.brand || '自訂') : '規格色';
  UI.brandOf = brandOf;
  function swList() {
    const q = UI.swQuery.trim().toUpperCase();
    return App.state.pricing.materials.filter(m => (UI.swBrand === 'all' || brandOf(m) === UI.swBrand) && (UI.swSeries === 'all' || m.series === UI.swSeries) &&
      (!q || (m.code + m.name + (m.en || '')).toUpperCase().includes(q))).sort((a, b) => (b.tex ? 1 : 0) - (a.tex ? 1 : 0));
  }
  function swGridHTML(cur) {
    const list = swList();
    return list.length ? list.map(m => `<button class="sw${m.code === cur ? ' on' : ''}" data-swc="${esc(m.code)}" title="${esc(m.code + ' ' + m.name + (m.en ? '\n' + m.en : '') + '\n' + brandOf(m) + '｜' + m.series)}">${UI.chip(m.code)}<b>${esc(m.code)}</b><small>${esc(m.name)}</small></button>`).join('')
      : '<p class="muted" style="grid-column:1/-1;margin:4px 0">找不到色號</p>';
  }
  // 紋路方向（針對目前選的部位）：自動＝沿板材長邊；直紋／橫紋＝立面上的方向（桌面：直紋＝沿深度）
  const GRAINS = [['auto', '自動', '沿板材長邊（預設）'], ['v', '直紋', '紋路上下方向；桌面為前後方向'], ['h', '橫紋', '紋路左右方向']];
  function grainRow(obj) {
    const cur = (obj.grain && obj.grain[UI.swTarget]) || 'auto';
    return `<div class="sw-grain"><span>紋路</span>${GRAINS.map(([k, n, t]) => `<button class="chip${k === cur ? ' active' : ''}" data-swg="${k}" title="${t}">${n}</button>`).join('')}</div>`;
  }
  const setGrain = (o, key, g) => { const m = { ...(o.grain || {}) }; if (g === 'auto') delete m[key]; else m[key] = g; if (Object.keys(m).length) o.grain = m; else delete o.grain; };
  function swatchPicker(obj, ctx, targets = SW_TARGETS) {
    if (!targets.some(t => t[0] === UI.swTarget)) UI.swTarget = targets[0][0];
    const mats = App.state.pricing.materials.slice().sort((a, b) => (b.tex ? 1 : 0) - (a.tex ? 1 : 0));
    const brands = [...new Set(mats.map(brandOf))];
    if (UI.swBrand !== 'all' && !brands.includes(UI.swBrand)) UI.swBrand = 'all';
    const series = [...new Set(mats.filter(m => UI.swBrand === 'all' || brandOf(m) === UI.swBrand).map(m => m.series))];
    if (UI.swSeries !== 'all' && !series.includes(UI.swSeries)) UI.swSeries = 'all';
    const cur = obj[UI.swTarget];
    return `<div class="sec"><div class="sec-title">色板 <small>先選部位，再點色號套用　<button class="btn small link sw-admin-btn" data-swadmin="1">色板維護</button></small></div>
      <div class="sw-targets">${targets.map(([k, n]) => { const m = matOf(obj[k]); return `<button class="sw-target${k === UI.swTarget ? ' on' : ''}" data-swt="${k}">${UI.chip(obj[k], 'lg')}<span><em>${n}</em><b>${esc(obj[k] || '')}</b><small>${esc(m.name || '')}</small></span></button>`; }).join('')}</div>
      ${grainRow(obj)}
      <div class="sw-tools"><input class="field" data-key="swq-${ctx}" data-swq="1" placeholder="搜尋色號 / 名稱" value="${esc(UI.swQuery)}">
        <select class="field" data-key="swb-${ctx}" data-swb="1" title="廠商"><option value="all">全部廠商</option>${brands.map(x => `<option${x === UI.swBrand ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <select class="field" data-key="sws-${ctx}" data-sws="1"><option value="all">全部系列</option>${series.map(x => `<option${x === UI.swSeries ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="sw-grid">${swGridHTML(cur)}</div>
      <div class="btn-row"><button class="btn small" data-a="sw-all">${ctx === 'cab' ? '此部位色號套用至全部櫃體' : '此部位預設色號套用至全部櫃體'}</button></div></div>`;
  }
  UI.injectSwatchCSS = function () {
    let st = document.getElementById('swatchCSS');
    if (!st) { st = document.createElement('style'); st.id = 'swatchCSS'; document.head.appendChild(st); }
    st.textContent = (window.SWATCHES || []).filter(sw => sw.img).map(sw => `[data-sw="${CSS.escape(sw.code)}"]{background-image:url("${sw.thumb || sw.img}")}`).join('\n');   // 有縮圖用縮圖（禾邁色板貼圖是獨立檔案）
  };
  function swObj() { return App.selectedCab() || (!App.sel ? App.state.defaults : null); }
  function onSwatchInput(e) {
    const t = e.target;
    if (!t.dataset.swq) return;
    UI.swQuery = t.value;
    const g = t.closest('.sec').querySelector('.sw-grid'), obj = swObj();
    if (g && obj) g.innerHTML = swGridHTML(obj[UI.swTarget]);
  }
  function onSwatchClick(b) {
    const obj = swObj(); if (!obj) return false;
    const isCab = obj !== App.state.defaults;
    if (b.dataset.swt) { UI.swTarget = b.dataset.swt; UI.showProps(); return true; }
    const key = UI.swTarget, label = (SW_TARGETS.find(x => x[0] === key) || [0, '桌面'])[1];
    if (b.dataset.swg) {
      const g = b.dataset.swg, gn = GRAINS.find(x => x[0] === g)[1];
      if (isCab) App.updateCab(obj.id, `${label}紋路 ${gn}`, c => setGrain(c, key, g));
      else App.mutate(`預設${label}紋路 ${gn}`, s2 => setGrain(s2.defaults, key, g));
      return true;
    }
    if (b.dataset.swc) {
      const code = b.dataset.swc;
      if (isCab) App.updateCab(obj.id, `${label}色號 ${code}`, c => { c[key] = code; });
      else App.mutate(`預設${label}色號`, s2 => { s2.defaults[key] = code; });
      if (isCab && key === 'topColor' && (!obj.top || obj.top === 'none')) App.toast('已設定桌面色號；請於下方「檯面」選擇檯面種類才會顯示');
      return true;
    }
    if (b.dataset.a === 'sw-all') {
      const code = obj[key];
      if (!App.state.cabinets.length) { App.toast('尚無櫃體'); return true; }
      const g = (obj.grain && obj.grain[key]) || 'auto';   // 紋路一併套用
      App.mutate(`全部櫃體${label}套用 ${code}`, s2 => s2.cabinets.forEach(c => { if (c.kind !== 'desk' || key === 'topColor') { c[key] = code; setGrain(c, key, g); } }), 'all');
      App.toast(`已將${label} ${code} 套用至 ${App.state.cabinets.length} 件櫃體`);
      return true;
    }
    return false;
  }

  const matOptions = (use, cur) => App.state.pricing.materials.filter(m => m.use === use || m.use === 'both').map(m => `<option value="${m.code}"${m.code === cur ? ' selected' : ''}>${m.code}　${esc(m.name)}${m.cat !== '規格色' ? '（' + m.cat + '）' : ''}</option>`).join('');
  const styleOptions = cur => D.DOOR_STYLES.map(s => `<option value="${s.id}"${s.id === cur ? ' selected' : ''}>${s.name}</option>`).join('');
  const num = (key, val, attrs = '') => `<input type="number" data-key="${key}" data-f="${key}" value="${val}" ${attrs}>`;

  function projectPanel() {
    const st = App.state, r = st.room;
    let html = `<div class="sec"><div class="sec-title">樓層 <small>目前：${esc(st.floors[st.floor].name)}</small></div>
      <div class="list">${st.floors.map((f, i) => {
        const n = i === st.floor ? st.cabinets.length : (f.cabinets || []).length, hasRoom = i === st.floor ? !!st.room : !!f.room;
        return `<div class="lrow floor-row${i === st.floor ? ' on' : ''}"><input data-key="fn${i}" data-fn="${i}" value="${esc(f.name)}"><span class="muted">${hasRoom ? '有空間' : '無空間'} · ${n} 件</span>
          ${i === st.floor ? '<span class="muted">目前</span>' : `<button class="btn small" data-a="floor-go" data-i="${i}">切換</button>`}
          <button class="icon-btn del" data-a="floor-del" data-i="${i}" title="刪除樓層"${st.floors.length <= 1 ? ' disabled' : ''}>${icon('x')}</button></div>`;
      }).join('')}</div>
      <div class="btn-row"><button class="btn small" data-a="floor-add">${icon('plus')}新增樓層</button></div>
      <p class="muted" style="font-size:11.5px;margin:6px 0 0">新樓層會沿用目前樓層的空間外框（不含門窗與櫃體）；報價、拆料清單、平立面圖會包含全部樓層。</p></div>`;
    html += '<div class="sec"><div class="sec-title">空間 <small>模型空間由使用者自訂</small></div>';
    if (!r) {
      html += `<p class="note">尚未建立空間。可輸入矩形寬／深／高，或以多線段自由繪製後封閉並輸入高度。</p>
        <div class="btn-row"><button class="btn primary" data-a="room-rect">${icon('rect')}矩形空間</button><button class="btn" data-a="room-line">${icon('line')}自由繪製</button></div>`;
    } else {
      const area = Math.abs(M().polyArea(r.points)) / 1e6;
      let per = 0; r.points.forEach((_, i) => { per += M().wallInfo(r, i).len; });
      html += `<div class="kv">
        <label>面積</label><span><b>${area.toFixed(2)}</b> m²（約 ${(area * 0.3025).toFixed(2)} 坪）</span>
        <label>周長</label><span>${Math.round(per).toLocaleString()} mm · ${r.points.length} 面牆</span>
        <label>牆高</label><div class="inline">${num('room-height', r.height, 'min="1800" max="6000" step="10"')}<span class="unit">mm</span></div>
        <label>牆厚</label><div class="inline">${num('room-thick', r.thickness, 'min="50" max="400" step="5"')}<span class="unit">mm</span></div>
        <label>地板</label><div class="inline"><span class="floor-chip" style="background:${M().floorDef(r).color}"></span><select data-key="room-floor" data-f="room-floor">${['木地板', '磁磚', '素面'].map(gp => `<optgroup label="${gp}">${D.FLOORS.filter(f => f.group === gp).map(f => `<option value="${f.id}"${f.id === (r.floor || 'wood-light') ? ' selected' : ''}>${f.name}${f.id === 'wood-light' ? '（預設）' : ''}</option>`).join('')}</optgroup>`).join('')}</select></div>
      </div>
      <div class="list wall-list" style="margin-top:10px">${r.points.map((_, i) => {
        const w = r.walls[i], wi = M().wallInfo(r, i);
        return `<div class="lrow" data-a="wall" data-i="${i}"><span>${M().wallName(i)}　<span class="muted">${Math.round(wi.len)} mm</span></span><span class="muted">${w.openings.length ? w.openings.length + ' 門窗' : ''}</span><span title="${w.locked ? '已鎖定' : '未鎖定'}" style="color:${w.locked ? '#5f6368' : '#b0b7bf'}">${icon(w.locked ? 'lock' : 'unlock')}</span></div>`;
      }).join('')}</div>
      <p class="muted" style="font-size:11.5px;margin:6px 0 0">點選牆面（清單或 3D 視窗）即可放置門／窗並鎖定。</p>
      <div class="btn-row"><button class="btn small" data-a="room-rect">重建矩形</button><button class="btn small" data-a="room-line">重新繪製</button><button class="btn small danger" data-a="room-del">刪除空間</button></div>`;
    }
    html += '</div>';
    const df = st.defaults;
    html += `<div class="sec"><div class="sec-title">新櫃體預設 <small>之後放置的櫃體套用</small></div><div class="kv">
      <label>門板款式</label><select data-key="def-style" data-f="def-style">${styleOptions(df.doorStyle)}</select>
      <label>把手</label><select data-key="def-handle" data-f="def-handle">${handleOptions(df.handle, df.doorStyle)}</select>
    </div><div class="btn-row"><button class="btn small" data-a="apply-all">預設色號與款式套用至所有櫃體</button></div></div>` + swatchPicker(df, 'def');
    const q = P().quote(st);
    html += `<div class="sec"><div class="sec-title">專案</div><div class="kv">
      <label>客戶名稱</label><input data-key="client" data-f="client" value="${esc(st.client)}" placeholder="選填，顯示於報價單">
      <label>櫃體數量</label><span>${st.cabinets.length} 件</span>
      <label>報價總計</label><span class="price-big">${P().fmt(q.total)}</span>
    </div></div>
    <div class="sec"><div class="sec-title">操作方式（同 SketchUp）</div>${shortcutsHTML()}</div>`;
    return html;
  }
  function shortcutsHTML() {
    return `<div class="shortcuts">
      <kbd>中鍵拖曳</kbd><span>環轉視角</span><kbd>Shift+中鍵</kbd><span>平移（或右鍵拖曳）</span><kbd>滾輪</kbd><span>以游標為中心縮放</span>
      <kbd>空白鍵</kbd><span>選取工具</span><kbd>M / Q</kbd><span>移動 / 旋轉 90°</span><kbd>R / L</kbd><span>矩形空間 / 畫線空間</span>
      <kbd>T</kbd><span>捲尺量測</span><kbd>O / H / Z</kbd><span>環轉 / 平移 / 縮放工具</span><kbd>Shift+Z</kbd><span>充滿視窗</span><kbd>快按左鍵兩下</kbd><span>任何位置：縮放至實際空間最適大小</span>
      <kbd>方向鍵</kbd><span>微調 10mm（Shift 100mm）</span><kbd>Ctrl+C / V / D</kbd><span>複製 / 貼上 / 就地複製</span>
      <kbd>Ctrl+Z / Y</kbd><span>復原 / 重做</span><kbd>Shift＋快按兩下櫃體</kbd><span>開門預覽</span><kbd>數值框</kbd><span>畫線或移動時直接輸入數字 + Enter</span>
    </div>`;
  }

  // 鎖定按鈕（型號旁）：鎖定後不能移動、旋轉、改尺寸、換型號或刪除；色號與備註仍可改
  const lockBtn = cab => `<button class="btn small lock-btn${cab.locked ? ' on' : ''}" data-a="lock-toggle" title="${cab.locked ? '已鎖定：無法移動、旋轉、改尺寸或刪除，點一下解鎖' : '鎖定位置與尺寸，避免誤動'}">${icon(cab.locked ? 'lock' : 'unlock')}${cab.locked ? '已鎖定' : '鎖定'}</button>`;
  function deskPanel(cab) {
    const it = D.byCode[cab.code];
    const pr = P().cabinetPrice(cab, App.state.pricing);
    const g = M().deskGeom(cab), dz = M().footDepth(cab);
    const ov = window.Viewer.overlaps && window.Viewer.overlaps.get(cab.id);
    let html = `<div class="hero">${UI.thumb(it)}<div><h3>${esc(D.DESK_SHAPES[cab.shape])}桌面 ${lockBtn(cab)}</h3>
      <p>${cab.w} × ${dz} mm${cab.shape !== 'R' ? `，深 ${cab.d}` : ''}，厚 ${cab.thick}mm</p>
      <p>${P().deskCai(cab)} 才（面積 ${(g.area / D.CAI).toFixed(2)} 才，無條件進位）　外露邊 ${(g.exposed / D.CHI).toFixed(1)} 尺</p></div></div>
      ${ov ? `<p class="note danger">⚠ 此桌面與 ${esc([...ov.why].join('、'))} 重疊，請調整位置（紅色線框）。</p>` : ''}
      <div class="sec"><div class="sec-title">報價 <small>依才數計價</small></div>
      <div class="price-big">${P().fmt(pr.total)}</div>
      <table class="qt">${pr.lines.map(l => `<tr><td>${esc(l.name)}</td><td class="num">${P().fmt(l.amount)}</td></tr>`).join('')}</table></div>
      <div class="sec"><div class="sec-title">尺寸 <small>mm</small></div><div class="kv">
        <label>${cab.shape === 'R' ? '寬' : '總寬'}</label>${num('dw', cab.w, 'step="10" min="300"')}
        ${cab.shape === 'R' ? `<label>深</label>${num('dd', cab.d, 'step="10" min="200"')}` : `<label>${cab.shape === 'L' ? '側翼長' : '兩側長'}</label>${num('dl2', cab.l2, 'step="10"')}<label>桌面深</label>${num('dd', cab.d, 'step="10" min="200"')}`}
        <label>桌面高度</label><div class="inline">${num('dtop', cab.y + cab.thick, 'step="10" min="0"')}<span class="unit">上緣離地</span></div>
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">3D 中拖曳桌面兩側<b style="color:#5a8f00">綠色掣點</b>調整寬度、前緣<b style="color:#1e88e5">藍色掣點</b>調整深度（背面固定，可吸附櫃體前緣／前緣＋20mm）。</p></div>
      <div class="sec"><div class="sec-title">材質 / 加工</div><div class="kv">
        <label>材質</label><select data-key="deskMat" data-f="deskMat">${D.DESK_MATS.map(m => `<option value="${m.id}"${m.id === cab.deskMat ? ' selected' : ''}>${m.name}${m.id === 'SYS' ? '（預設）' : ''}　${(App.state.pricing.desk.prices[m.id] || {})[cab.thick] || '-'} 元/才</option>`).join('')}</select>
        <label>厚度</label><select data-key="thick" data-f="thick">${D.DESK_THICK.map(t => `<option value="${t}"${t === cab.thick ? ' selected' : ''}>${t} mm${t === 18 ? '（預設）' : ''}</option>`).join('')}</select>
        <label>端部</label><select data-key="edge" data-f="edge">${D.DESK_EDGES.map(e => `<option value="${e.id}"${e.id === cab.edge ? ' selected' : ''}>${e.name}${e.id === 'none' ? '（預設）' : ''}</option>`).join('')}</select>
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">每才單價與端部加工單價可於「板材售價」分頁修改。</p></div>
      <div class="sec"><div class="sec-title">位置 <small>mm</small></div><div class="kv">
        <label>X</label>${num('x', cab.x, 'step="10"')}
        <label>Z</label>${num('z', cab.z, 'step="10"')}
        <label>旋轉</label><div class="inline"><select data-key="rot" data-f="rot">${[0, 90, 180, 270].map(a => `<option value="${a}"${a === Math.round(cab.rot) ? ' selected' : ''}>${a}°</option>`).join('')}</select><button class="btn small" data-a="rot90">${icon('rotate')}90°</button></div>
        <label></label><div class="inline"><button class="btn small" data-a="snapwall">${icon('magnet')}靠最近牆面</button></div>
      </div></div>`;
    html += swatchPicker(cab, 'cab', [['topColor', '桌面']]);
    html += `<div class="kv" style="margin-bottom:10px"><label>備註</label><input data-key="note" data-f="note" value="${esc(cab.note || '')}" placeholder="顯示於報價單"></div>
      <div class="btn-row"><button class="btn" data-a="dup">${icon('dup')}複製</button><button class="btn danger" data-a="del">${icon('delete')}刪除</button></div>`;
    return html;
  }

  function applPanel(cab) {
    const it = D.byCode[cab.code];
    const pr = P().cabinetPrice(cab, App.state.pricing);
    const ov = window.Viewer.overlaps && window.Viewer.overlaps.get(cab.id);
    const same = D.items.filter(a => a.kind === 'appl' && a.at === cab.at);
    const mountTxt = { counter: '嵌入檯面（放在櫃體上方自動對齊、桌面自動開孔）', floor: '落地嵌入（置於櫃體之間）', builtin: '嵌入櫃內', wall: '壁掛／掛桿掛式（可調離地高度）', top: cab.y === 0 ? '落地放置' : '放置於檯面或地面（不開孔，可調離地高度）' }[cab.mount];
    let html = `<div class="hero">${UI.thumb(it)}<div><h3>${esc(cab.code)} ${lockBtn(cab)}</h3>
      <p>${esc(D.APPL_TYPES[cab.at])}｜${esc(it.brand)}</p><p>${esc(it.name)}</p></div></div>
      ${ov ? `<p class="note danger">⚠ 與 ${esc([...ov.why].join('、'))} 重疊，請調整位置（紅色線框）。</p>` : ''}
      <div class="sec"><div class="sec-title">報價 <small>設備單價</small></div>
      <div class="price-big">${P().fmt(pr.total)}</div>
      <div class="kv"><label>設備售價</label><div class="inline"><input type="number" data-key="override" data-f="override" value="${App.state.pricing.codeOverrides[cab.code] != null ? App.state.pricing.codeOverrides[cab.code] : ''}" placeholder="${it.price}"><span class="unit">空白＝${it.est ? '估計價' : '建議售價'} ${it.price.toLocaleString()}</span></div></div></div>
      <div class="sec"><div class="sec-title">型號規格</div><div class="kv">
        <label>型號</label><select data-key="applCode" data-f="applCode">${[...new Set(same.map(a => a.brand))].map(b => { const l = same.filter(a => a.brand === b); return l.length ? `<optgroup label="${esc(b)}">${l.map(a => `<option value="${a.code}"${a.code === cab.code ? ' selected' : ''}>${a.code}　${esc(a.name)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select>
        <label>品牌</label><div>${esc(it.brand)}</div>
        <label>規格</label><div>${esc(it.spec)}</div>
        <label>尺寸</label>${it.group === 'furn' ? `<div class="inline">${num('cw', cab.w, 'step="10" min="200" max="4000"')}<span class="unit">W</span>${num('cd', cab.d, 'step="10" min="200" max="3000"')}<span class="unit">D</span>${num('ch', cab.h, 'step="10" min="100" max="2600"')}<span class="unit">H</span></div>` : `<div>W${cab.w} × D${cab.d} × H${cab.h} mm</div>`}
        ${it.cut ? `<label>檯面開孔</label><div>${it.cut[0]} × ${it.cut[1]} mm</div>` : ''}
        <label>安裝方式</label><div>${mountTxt}</div>
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">參考 ${esc(it.brand)} 官方／通路公開規格${it.est ? '；此型號查無公開售價，目前為估計價，請依實際報價修改' : ''}。實際尺寸、開孔與售價以原廠最新資料為準。</p></div>
      <div class="sec"><div class="sec-title">位置 <small>mm</small></div><div class="kv">
        <label>X</label>${num('x', cab.x, 'step="10"')}
        <label>Z</label>${num('z', cab.z, 'step="10"')}
        <label>${cab.mount === 'counter' ? '上緣高度' : '離地高度'}</label><div class="inline">${num(cab.mount === 'counter' ? 'atop' : 'y', cab.mount === 'counter' ? cab.y + cab.h : cab.y, 'step="10" min="0"')}<span class="unit">${cab.mount === 'counter' ? '＝檯面高' : '底部離地'}</span></div>
        <label>旋轉</label><div class="inline"><select data-key="rot" data-f="rot">${[0, 90, 180, 270].map(a => `<option value="${a}"${a === Math.round(cab.rot) ? ' selected' : ''}>${a}°</option>`).join('')}</select><button class="btn small" data-a="rot90">${icon('rotate')}90°</button></div>
        <label></label><div class="inline"><button class="btn small" data-a="snapwall">${icon('magnet')}靠最近牆面</button></div>
      </div></div>`;
    if (it.finish === 'panel') html += swatchPicker(cab, 'cab', [['doorColor', '嵌門板']]);
    html += `<div class="kv" style="margin-bottom:10px"><label>備註</label><input data-key="note" data-f="note" value="${esc(cab.note || '')}" placeholder="顯示於報價單"></div>
      <div class="btn-row"><button class="btn" data-a="dup">${icon('dup')}複製</button><button class="btn danger" data-a="del">${icon('delete')}刪除</button></div>`;
    return html;
  }

  // 補板：寬、高、深自訂，色號只有一個部位
  function fillerPanel(cab) {
    const pr = P().cabinetPrice(cab, App.state.pricing);
    let html = `<div class="hero"><div class="filler-ico" style="width:56px;height:56px;border:1px solid var(--line);border-radius:6px;background:var(--panel-2)"></div><div>
      <h3>${esc(M().cabName(cab))} ${lockBtn(cab)}</h3><p>補板 W${cab.w} × H${cab.h} mm，前緣到牆 ${cab.d} mm</p><p class="muted">前方補板＋後方 50mm 固定條</p></div></div>
      <div class="sec"><div class="sec-title">報價 <small>色板才數計價</small></div><div class="price-big">${P().fmt(pr.total)}</div>
      <table class="qt">${pr.lines.map(l => `<tr><td>${esc(l.name)}</td><td class="num">${P().fmt(l.amount)}</td></tr>`).join('')}</table></div>
      <div class="sec"><div class="sec-title">位置 <small>mm</small></div><div class="kv">
      <label>X</label>${num('x', cab.x, 'step="10"')}<label>Z</label>${num('z', cab.z, 'step="10"')}
      <label>離地高度</label>${num('y', cab.y, 'step="10" min="0"')}
      <label>旋轉</label><select data-key="rot" data-f="rot">${[0, 90, 180, 270].map(a => `<option value="${a}"${a === Math.round(cab.rot) ? ' selected' : ''}>${a}°</option>`).join('')}</select>
      <label></label><div class="inline"><button class="btn small" data-a="snapwall">${icon('magnet')}靠最近牆面</button></div></div></div>
      <div class="sec"><div class="sec-title">尺寸 <small>依現場空隙輸入</small></div><div class="kv">
        <label>寬 W</label><div class="inline">${num('cw', cab.w, 'step="5" min="20" max="600"')}<span class="unit">mm（空隙寬）</span></div>
        <label>高 H</label><div class="inline">${num('ch', cab.h, 'step="10" min="100" max="2800"')}<span class="unit">mm</span></div>
        <label>深 D</label><div class="inline">${num('cd', cab.d, 'step="10" min="50" max="900"')}<span class="unit">mm（牆面到補板前緣，通常＝櫃深＋門片 18）</span></div>
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">放在櫃體旁邊會自動靠齊；前緣請對齊相鄰櫃體的門片面。</p></div>`;
    html += swatchPicker(cab, 'cab', [['bodyColor', '補板']]);
    html += `<div class="kv" style="margin-bottom:10px"><label>備註</label><input data-key="note" data-f="note" value="${esc(cab.note || '')}" placeholder="顯示於報價單"></div>
      <div class="btn-row"><button class="btn" data-a="dup">${icon('dup')}複製</button><button class="btn danger" data-a="del">${icon('delete')}刪除</button></div>`;
    return html;
  }
  function cabPanel(cab) {
    if (cab.kind === 'filler') return fillerPanel(cab);
    if (cab.kind === 'appl') return applPanel(cab);
    if (cab.kind === 'desk') return deskPanel(cab);
    const it = D.byCode[cab.code];
    const pr = P().cabinetPrice(cab, App.state.pricing);
    const rows = cab.fronts;
    const sum = rows.reduce((a, r) => a + r.h, 0);
    const Hc = Math.round(cab.h / 10);
    const isTri = cab.kind === 'tri';
    const frontsEditable = !isTri;
    let html = `<div class="hero">${UI.thumb({ ...it, fronts: cab.fronts, hanging: cab.hanging })}<div>
      <h3>${esc(M().cabName(cab))} ${lockBtn(cab)}</h3>
      <p>W${cab.w} × D${cab.d} × H${cab.h} mm${cab.hanging ? '　吊櫃' : ''}</p>
      <p>${esc(isTri ? '三角邊櫃 · ' + D.TRI_TYPE_NAME[cab.triType] : P().describe(cab))}</p></div></div>
      ${window.Viewer.overlaps && window.Viewer.overlaps.get(cab.id) ? `<p class="note danger">⚠ 此櫃體與 ${esc([...window.Viewer.overlaps.get(cab.id).why].join('、'))} 重疊，請調整位置（紅色線框）。</p>` : ''}
      <div class="sec"><div class="sec-title">報價 <small>色板才數計價</small></div>
      <div class="price-big">${P().fmt(pr.total)}</div>
      <table class="qt">${pr.lines.map(l => `<tr><td>${esc(l.name)}</td><td class="num">${P().fmt(l.amount)}</td></tr>`).join('')}</table></div>`;

    html += `<div class="sec"><div class="sec-title">位置 <small>mm</small></div><div class="kv">
      <label>X</label>${num('x', cab.x, 'step="10"')}
      <label>Z</label>${num('z', cab.z, 'step="10"')}
      <label>離地高度</label><div class="inline">${num('y', cab.y, 'step="10" min="0"')}<span class="unit">${cab.hanging ? '吊櫃底' : '櫃體底（含踢腳）'}</span></div>
      <label>旋轉</label><div class="inline"><select data-key="rot" data-f="rot">${[0, 90, 180, 270].map(a => `<option value="${a}"${a === Math.round(cab.rot) ? ' selected' : ''}>${a}°</option>`).join('')}${[0, 90, 180, 270].includes(Math.round(cab.rot)) ? '' : `<option selected>${Math.round(cab.rot)}°</option>`}</select><button class="btn small" data-a="rot90">${icon('rotate')}90°</button></div>
      <label></label><div class="inline"><button class="btn small" data-a="snapwall">${icon('magnet')}靠最近牆面</button></div>
      ${isTri ? `<label>方向</label><label class="inline"><input type="checkbox" data-f="mirror" data-key="mirror"${cab.mirror ? ' checked' : ''} style="width:auto"> 左右鏡射</label>` : ''}
    </div></div>`;

    if (['std', 'tv', 'double', 'hang'].includes(cab.kind)) {
      const custom = P().isCustom(cab);
      html += `<div class="sec"><div class="sec-title">尺寸 <small>${custom ? '非規格尺寸（板材才數依實際尺寸重算）' : '型錄規格'}</small></div><div class="kv">
        <label>寬 W</label><div class="inline">${num('cw', cab.w, 'step="10" min="200" max="1200"')}<span class="unit">mm（型錄 ${it.w}）</span></div>
        <label>高 H</label><div class="inline">${num('ch', cab.h, 'step="10" min="200" max="2800"')}<span class="unit">mm（型錄 ${it.h}）</span></div>
        <label>深 D</label><div class="inline">${num('cd', cab.d, 'step="10" min="150" max="900"')}<span class="unit">mm（型錄 ${it.d}）</span></div>
        ${custom ? `<label></label><div class="inline"><button class="btn small" data-a="size-reset">還原型錄尺寸</button></div>` : ''}
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">改了尺寸後名稱結尾會從「-S」變成「-M」（已修改，板材才數依實際尺寸重算）。改高度時門片/抽屜依比例調整，層板重新排列；改深度時層板與背板跟著變，五金仍以型錄深度碼計價。</p></div>`;
    }
    html += swatchPicker(cab, 'cab');
    if (frontsEditable) {
      const isPair = cab.fronts.some(r => ['P', 'GP', 'F'].includes(r.t));
      html += `<div class="sec"><div class="sec-title">門板款式 / 把手</div><div class="kv">
      <label>款式</label><select data-key="doorStyle" data-f="doorStyle">${styleOptions(cab.doorStyle)}</select>
      <label>把手</label><select data-key="handle" data-f="handle">${handleOptions(cab.handle, cab.doorStyle)}</select></div>
      ${(D.HANDLE_BY_ID[cab.handle] || {}).pair && !isPair ? '<p class="note">「中間」把手為雙門片（對開）適用；單門片會放在開啟側、抽屜放在上緣。</p>' : ''}</div>`;
    }

    if (frontsEditable) {
      const typeOpts = cur => Object.entries(D.FRONT_NAME).filter(([t]) => cab.kind !== 'corner' || ['O', 'L', 'R'].includes(t)).map(([t, n]) => `<option value="${t}"${t === cur ? ' selected' : ''}>${n}</option>`).join('');
      const hOpts = cur => { const hs = [...new Set([...D.FRONT_HEIGHTS, cur])].filter(h => h <= Hc).sort((a, b) => a - b); return hs.map(h => `<option value="${h}"${h === cur ? ' selected' : ''}>${h * 10} mm</option>`).join(''); };
      html += `<div class="sec"><div class="sec-title">門片 / 抽屜 <small>由上而下</small></div>
        <div class="list">${Math.round(Hc - sum) > 0 ? `<div class="lrow fronts" style="background:var(--panel-2)"><span class="muted">開放空間（自動）</span><span class="muted">${(Hc - sum) * 10} mm</span><span></span><span></span><span></span><span></span></div>` : ''}
        ${rows.map((r, i) => `<div class="lrow fronts"><select data-key="rt${i}" data-rf="t" data-i="${i}">${typeOpts(r.t)}</select><select data-key="rh${i}" data-rf="h" data-i="${i}">${hOpts(r.h)}</select>
          ${r.t === 'L' || r.t === 'R' ? `<button class="btn small flip" data-ra="flip" data-i="${i}" title="左開 ⇄ 右開">⇄ 換邊</button>` : '<span></span>'}
          <button class="icon-btn" data-ra="up" data-i="${i}" title="上移">${icon('up')}</button><button class="icon-btn" data-ra="down" data-i="${i}" title="下移">${icon('down')}</button><button class="icon-btn del" data-ra="del" data-i="${i}" title="移除">${icon('x')}</button></div>`).join('')}</div>
        <div class="rows-meter${sum > Hc ? ' err' : ''}">已配置 ${sum * 10} / ${cab.h} mm${sum > Hc ? '（超過櫃高）' : ''}</div>
        <div class="btn-row"><button class="btn small" data-a="row-add-door">${icon('plus')}加門片</button><button class="btn small" data-a="row-add-drawer">${icon('plus')}加抽屜</button><button class="btn small" data-a="row-reset">還原型錄配置</button></div>
        <p class="muted" style="font-size:11.5px;margin:6px 0 0">變更門片配置後，層板會依新配置自動重排；門片、屜頭的板材才數會自動重算。</p></div>`;
    }

    const shelves = cab.shelves.slice().sort((a, b) => b.y - a.y);
    if (!(isTri && cab.triType === '00')) {
      html += `<div class="sec"><div class="sec-title">層板 <small>高度＝距櫃體底部 mm</small></div>
        <div class="list">${shelves.length ? shelves.map((s, i) => {
          const idx = cab.shelves.indexOf(s);
          return `<div class="lrow shelf"><span class="muted">${shelves.length - i}</span>${`<input type="number" data-key="sy${idx}" data-sf="y" data-i="${idx}" value="${Math.round(s.y)}" step="10" min="${D.BOARD}" max="${cab.h - 2 * D.BOARD}">`}
          <select data-key="sfx${idx}" data-sf="fixed" data-i="${idx}"${isTri ? ' disabled' : ''}><option value="0"${!s.fixed ? ' selected' : ''}>活動層板</option><option value="1"${s.fixed ? ' selected' : ''}>固定隔板</option></select>
          <button class="icon-btn del" data-sa="del" data-i="${idx}" title="移除">${icon('x')}</button></div>`;
        }).join('') : '<p class="muted" style="margin:0">無層板</p>'}</div>
        <div class="btn-row"><button class="btn small" data-a="shelf-add">${icon('plus')}加層板</button><button class="btn small" data-a="shelf-even">平均分配</button><button class="btn small" data-a="shelf-reset">預設層板</button></div>
        ${!isTri ? `<label class="inline" style="margin-top:8px"><input type="checkbox" data-f="rod" data-key="rod"${cab.rod ? ' checked' : ''}> 加裝吊衣桿</label>` : ''}</div>`;
    }

    const hw = (key, label, autoN) => `<label>${label}</label><div class="inline"><input type="number" min="0" step="1" data-key="${key}" data-f="${key}" value="${cab[key] != null ? cab[key] : autoN}">
      <span class="unit">個 ${cab[key] != null ? `（自動 ${autoN}）` : '自動'}</span>${cab[key] != null ? `<button class="btn small" data-a="hw-auto" data-k="${key}">還原自動</button>` : ''}</div>`;
    if (P().hasDoor(cab) || cab.hingeQty || cab.footQty) {
      html += `<div class="sec"><div class="sec-title">五金 <small>依門片自動帶入，可修改數量</small></div><div class="kv">
        ${hw('hingeQty', '西德鉸鍊', P().autoHinges(cab))}
        ${!cab.hanging && cab.kind !== 'tri' ? hw('footQty', '調整腳', P().autoFeet(cab)) : ''}
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">鉸鍊：門高 ≤80cm 2 個、81–150 3 個、151–220 4 個、221–265 5 個（每片門）。調整腳：櫃寬 ≤90cm 4 個、>90–120cm 6 個。</p></div>`;
    }
    html += `<div class="sec"><div class="sec-title">配件</div><div class="kv">
      ${!cab.hanging && !isTri ? `<label>踢腳板</label><label class="inline"><input type="checkbox" data-f="kick" data-key="kick"${cab.kick ? ' checked' : ''} style="width:auto"> 100mm 踢腳板</label>` : ''}
      ${!isTri ? `<label>檯面</label><select data-key="top" data-f="top">${Object.entries(D.PARTS.TOP).map(([k2, t]) => `<option value="${k2}"${k2 === cab.top ? ' selected' : ''}>${t.name}</option>`).join('')}</select>` : ''}
      <label>備註</label><input data-key="note" data-f="note" value="${esc(cab.note || '')}" placeholder="顯示於報價單">
    </div></div>
    <div class="btn-row"><button class="btn" data-a="toggle-open">${icon('open')}開門預覽</button><button class="btn" data-a="dup">${icon('dup')}複製</button><button class="btn danger" data-a="del">${icon('delete')}刪除</button></div>`;
    return html;
  }

  function pIsLeft(wi) { const right = [-wi.nOut[1], wi.nOut[0]]; return wi.dir[0] * right[0] + wi.dir[1] * right[1] > 0; }
  function leftOffset(wi, o) { return pIsLeft(wi) ? o.offset : wi.len - o.offset - o.width; }
  function fromLeft(wi, left, width) { return pIsLeft(wi) ? left : wi.len - left - width; }

  function wallPanel(i) {
    const r = App.state.room, w = r.walls[i], wi = M().wallInfo(r, i);
    const dis = w.locked ? ' disabled' : '';
    let html = `<div class="hero"><svg class="thumb" viewBox="0 0 64 64"><rect x="6" y="14" width="52" height="40" fill="${w.locked ? '#bdbdbd' : '#f1efea'}" stroke="#3b4450"/>${w.openings.map(o => {
      const x = 6 + 52 * leftOffset(wi, o) / wi.len, ww = 52 * o.width / wi.len, y = 54 - 40 * (o.sill + o.height) / r.height, hh = 40 * o.height / r.height;
      return `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${o.type === 'door' ? '#c9a57a' : '#cfe6ec'}" stroke="#3b4450" stroke-width=".7"/>`;
    }).join('')}</svg><div><h3>${M().wallName(i)}</h3><p>長 ${Math.round(wi.len)} mm × 高 ${r.height} mm</p><p>${w.locked ? '已鎖定（灰色）' : '未鎖定'}</p></div></div>`;
    if (w.locked) html += `<p class="note lock">${icon('lock')} 此牆面已確認並鎖定，門窗無法修改。需要調整請先解鎖。</p>`;
    html += `<div class="sec"><div class="sec-title">門 / 窗 <small>從室內面向此牆，尺寸 mm</small></div>`;
    html += w.openings.length ? w.openings.map((o, j) => `<div class="opening"><div class="opening-head"><span>${icon(o.type === 'door' ? 'door' : 'window')} ${o.type === 'door' ? '門' : '窗'} ${j + 1}</span>${w.locked ? '' : `<button class="icon-btn del" data-oa="del" data-j="${j}" title="刪除">${icon('x')}</button>`}</div>
      <div class="kv"><label>寬</label><input type="number" data-key="ow${j}" data-of="width" data-j="${j}" value="${o.width}" step="10"${dis}>
      <label>高</label><input type="number" data-key="oh${j}" data-of="height" data-j="${j}" value="${o.height}" step="10"${dis}>
      <label>抬高</label><input type="number" data-key="os${j}" data-of="sill" data-j="${j}" value="${o.sill}" step="10"${dis}>
      <label>距左</label><input type="number" data-key="ol${j}" data-of="left" data-j="${j}" value="${Math.round(leftOffset(wi, o))}" step="10"${dis}></div></div>`).join('') : '<p class="muted" style="margin:0 0 6px">此牆面尚無門窗</p>';
    if (!w.locked) html += `<div class="btn-row"><button class="btn small" data-a="add-door">${icon('door')}加門 900×2100</button><button class="btn small" data-a="add-window">${icon('window')}加窗 1200×1200</button></div>`;
    html += `</div><div class="btn-row">${w.locked ? `<button class="btn" data-a="unlock">${icon('unlock')}解鎖牆面</button>` : `<button class="btn primary" data-a="lock">${icon('lock')}確認並鎖定牆面</button>`}
      <button class="btn" data-a="back">返回專案</button></div>`;
    return html;
  }

  function clampOpening(r, wi, o) {
    o.width = Math.max(300, Math.min(Math.round(o.width), Math.round(wi.len - 20)));
    o.height = Math.max(200, Math.min(Math.round(o.height), r.height - 10));
    o.sill = Math.max(0, Math.min(Math.round(o.sill), r.height - o.height - 10));
    if (o.type === 'door') o.sill = 0;
    o.offset = Math.max(10, Math.min(Math.round(o.offset), Math.round(wi.len - o.width - 10)));
  }

  function onPropsChange(e) {
    const t = e.target;
    const st = App.state;
    const s = App.sel;
    const val = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.swq) return;
    if (t.dataset.fn != null) { App.renameFloor(+t.dataset.fn, val); return; }
    if (t.dataset.sws) { UI.swSeries = val; UI.showProps(); return; }
    if (t.dataset.swb) { UI.swBrand = val; UI.swSeries = 'all'; UI.showProps(); return; }
    // 專案層級
    if (t.dataset.f === 'room-height') { const v = Math.max(1800, Math.min(6000, +val || 2600)); App.mutate('牆高', x => { x.room.height = v; x.room.walls.forEach(w => w.openings.forEach(o => { o.height = Math.min(o.height, v - o.sill - 10); })); }, 'room'); return; }
    if (t.dataset.f === 'room-floor') { const f = D.FLOORS.find(x => x.id === val); App.mutate('地板 ' + (f ? f.name : val), x => { x.room.floor = val; }, 'room'); App.toast('地板已改為「' + (f ? f.name : val) + '」'); return; }
    if (t.dataset.f === 'room-thick') { const v = Math.max(50, Math.min(400, +val || 120)); App.mutate('牆厚', x => { x.room.thickness = v; }, 'room'); return; }
    if (t.dataset.f === 'def-body') { App.mutate('預設櫃體色', x => { x.defaults.bodyColor = val; }); return; }
    if (t.dataset.f === 'def-door') { App.mutate('預設門板色', x => { x.defaults.doorColor = val; }); return; }
    if (t.dataset.f === 'def-style') { App.mutate('預設門板款式', x => { x.defaults.doorStyle = val; }); return; }
    if (t.dataset.f === 'def-handle') { App.mutate('預設把手', x => { x.defaults.handle = val; }); return; }
    if (t.dataset.f === 'client') { App.mutate('客戶名稱', x => { x.client = val; }); return; }
    // 牆面門窗
    if (s && s.type === 'wall' && t.dataset.of) {
      const r = st.room, wi = M().wallInfo(r, s.index);
      const j = +t.dataset.j;
      App.mutate('修改門窗', x => {
        const o = x.room.walls[s.index].openings[j];
        const left = leftOffset(wi, o);
        if (t.dataset.of === 'left') o.offset = fromLeft(wi, +val, o.width);
        else { o[t.dataset.of] = +val; if (t.dataset.of === 'width') o.offset = fromLeft(wi, left, o.width); }
        clampOpening(x.room, wi, o);
      }, 'room');
      return;
    }
    const cab = App.selectedCab(); if (!cab) return;
    const f = t.dataset.f;
    if (cab.locked && ['x', 'z', 'y', 'atop', 'rot', 'cw', 'ch', 'cd', 'applCode', 'dw', 'dd', 'dl2', 'dtop', 'thick', 'mirror'].includes(f)) { App.toast('此物件已鎖定，請先解鎖再修改位置或尺寸'); UI.showProps(); return; }
    if (cab.kind === 'desk' && ['dw', 'dd', 'dl2', 'dtop', 'deskMat', 'thick', 'edge'].includes(f)) {
      const v = +val;
      App.updateCab(cab.id, '修改桌面', c => {
        const top = c.y + c.thick;
        if (f === 'dw') c.w = Math.max(c.shape === 'U' ? 2 * c.d + 200 : c.shape === 'L' ? c.d + 200 : 300, Math.round(v));
        if (f === 'dd') c.d = Math.max(200, Math.min(Math.round(v), c.shape === 'U' ? (c.w - 200) / 2 : c.shape === 'L' ? Math.min(c.w, c.l2) - 200 : 3000));
        if (f === 'dl2') c.l2 = Math.max(c.d + 200, Math.round(v));
        if (f === 'dtop') c.y = Math.max(0, Math.round(v) - c.thick);
        if (f === 'thick') { c.thick = v; c.h = v; c.y = top - v; }
        if (f === 'deskMat' || f === 'edge') c[f] = val;
      });
      return;
    }
    if (f === 'applCode') {
      const nx = D.byCode[val]; if (!nx) return;
      App.updateCab(cab.id, '更換設備型號', c => {
        const top = c.y + c.h;
        Object.assign(c, { code: nx.code, w: nx.w, d: nx.d, h: nx.h, mount: nx.mount, hanging: nx.hanging });
        if (nx.mount === 'counter') c.y = top - nx.h;
      });
      return;
    }
    if (f === 'atop') { App.updateCab(cab.id, '修改設備高度', c => { c.y = Math.round(+val || 0) - c.h; }); return; }
    if ((f === 'cw' || f === 'ch' || f === 'cd') && cab.kind === 'appl') {
      const v = Math.max(100, Math.min(4000, Math.round(+val || 0)));
      App.updateCab(cab.id, '修改家具尺寸', c => { c[f === 'cw' ? 'w' : f === 'ch' ? 'h' : 'd'] = v; });
      return;
    }
    if (f === 'cw' || f === 'ch' || f === 'cd') {
      const v = Math.round(+val || 0);
      const fl = cab.kind === 'filler';   // 補板可以很窄
      const w = f === 'cw' ? Math.max(fl ? 20 : 200, Math.min(fl ? 600 : 1200, v)) : cab.w;
      const h = f === 'ch' ? Math.max(fl ? 100 : 200, Math.min(2800, v)) : cab.h;
      const d = f === 'cd' ? Math.max(fl ? 50 : 150, Math.min(900, v)) : cab.d;
      App.updateCab(cab.id, '修改櫃體尺寸', c => M().resizeCabinet(c, w, h, d));
      return;
    }
    if (f === 'override') {
      App.mutate('設備售價', x => { if (val === '') delete x.pricing.codeOverrides[cab.code]; else x.pricing.codeOverrides[cab.code] = Math.max(0, +val); });
      return;
    }
    if (f) {
      const numF = ['x', 'z', 'y'];
      App.updateCab(cab.id, '修改櫃體', c => {
        if (numF.includes(f)) c[f] = Math.round(+val || 0);
        else if (f === 'rot') c.rot = parseInt(val, 10) || 0;
        else if (f === 'hingeQty' || f === 'footQty') c[f] = Math.max(0, Math.round(+val || 0));
        else if (f === 'kick') { c.kick = val; if (!c.hanging) c.y = val ? Math.max(c.y, D.KICK) : (c.y === D.KICK ? 0 : c.y); }
        else c[f] = val;
      });
      return;
    }
    if (t.dataset.rf) {
      const i = +t.dataset.i;
      const next = cab.fronts.map(r => ({ ...r }));
      next[i][t.dataset.rf] = t.dataset.rf === 'h' ? +val : val;
      if (next.reduce((a, r) => a + r.h, 0) * 10 > cab.h) { App.toast('門片總高超過櫃體高度，請先縮小其他列'); UI.showProps(); return; }
      setFronts(cab, next);
      return;
    }
    if (t.dataset.sf) {
      const i = +t.dataset.i;
      App.updateCab(cab.id, '修改層板', c => {
        if (t.dataset.sf === 'y') c.shelves[i].y = Math.max(D.BOARD, Math.min(c.h - 2 * D.BOARD, Math.round(+val)));
        else c.shelves[i].fixed = val === '1';
        c.shelves.sort((a, b) => a.y - b.y);
      });
    }
  }
  function setFronts(cab, next) {
    App.updateCab(cab.id, '修改門片', c => {
      c.fronts = next;
      c.shelves = M().genShelves(c);
    });
  }

  async function onPropsClick(e) {
    const sb = e.target.closest('[data-swt],[data-swc],[data-swg],[data-a="sw-all"]');
    if (sb && onSwatchClick(sb)) return;
    const b = e.target.closest('[data-a],[data-ra],[data-sa],[data-oa]'); if (!b) return;
    const st = App.state, s = App.sel;
    const a = b.dataset.a;
    if (a === 'floor-add') { App.addFloor(); return; }
    if (a === 'floor-go') { App.switchFloor(+b.dataset.i); return; }
    if (a === 'floor-del') {
      const i = +b.dataset.i, f = App.state.floors[i];
      if (await UI.confirm('刪除樓層', `刪除「${f.name}」與該層所有空間、櫃體？（可用 Ctrl+Z 復原）`)) App.deleteFloor(i);
      return;
    }
    if (a === 'room-rect') { UI.roomDialog(); return; }
    if (a === 'room-line') { UI.action('line'); return; }
    if (a === 'room-del') { if (await UI.confirm('刪除空間', '刪除牆面與門窗（櫃體保留）？')) { App.sel = null; App.mutate('刪除空間', x => { x.room = null; }, 'room'); } return; }
    if (a === 'wall') { App.select({ type: 'wall', index: +b.dataset.i }); return; }
    if (a === 'apply-all') {
      if (!st.cabinets.length) return;
      App.mutate('套用材質', x => x.cabinets.forEach(c => { ['bodyColor', 'doorColor', 'topColor', 'kickColor', 'doorStyle'].forEach(k2 => { c[k2] = x.defaults[k2]; }); }), 'all');
      App.toast('已套用至 ' + st.cabinets.length + ' 件櫃體'); return;
    }
    if (a === 'back') { App.select(null); return; }
    if (s && s.type === 'wall') {
      const r = st.room, wi = M().wallInfo(r, s.index);
      if (a === 'add-door' || a === 'add-window') {
        const o = a === 'add-door' ? { id: M().uid('o'), type: 'door', width: 900, height: 2100, sill: 0 } : { id: M().uid('o'), type: 'window', width: 1200, height: 1200, sill: 900 };
        o.offset = (wi.len - o.width) / 2;
        clampOpening(r, wi, o);
        App.mutate('新增' + (o.type === 'door' ? '門' : '窗'), x => x.room.walls[s.index].openings.push(o), 'room');
      } else if (b.dataset.oa === 'del') App.mutate('刪除門窗', x => x.room.walls[s.index].openings.splice(+b.dataset.j, 1), 'room');
      else if (a === 'lock') { App.mutate('鎖定牆面', x => { x.room.walls[s.index].locked = true; }, 'room'); App.toast(M().wallName(s.index) + ' 已鎖定'); }
      else if (a === 'unlock') App.mutate('解鎖牆面', x => { x.room.walls[s.index].locked = false; }, 'room');
      return;
    }
    const cab = App.selectedCab(); if (!cab) return;
    if (a === 'hw-auto') { App.updateCab(cab.id, '五金數量還原自動', c => { c[b.dataset.k] = null; }); return; }
    if (a === 'lock-toggle') {
      const cab = App.selectedCab(); if (!cab) return;
      App.updateCab(cab.id, cab.locked ? '解鎖' : '鎖定', c => { c.locked = !c.locked; });
      App.toast(M().cabName(cab) + (cab.locked ? ' 已鎖定' : ' 已解鎖'));
      return;
    }
    if (['snapwall', 'rot90', 'del', 'size-reset'].includes(a)) { const cab = App.selectedCab(); if (cab && cab.locked) { App.toast('此物件已鎖定，請先解鎖'); return; } }
    if (a === 'snapwall') {
      if (!App.state.room) { App.toast('尚未建立空間'); return; }
      const s2 = V().snap(cab, cab.x, cab.z, cab.id, { force: true });
      App.updateCab(cab.id, '靠牆', c => { Object.assign(c, { x: s2.x, z: s2.z, rot: s2.rot }); });
      App.toast(s2.info || '已靠牆'); return;
    }
    if (a === 'size-reset') {
      const it0 = D.byCode[cab.code];
      App.updateCab(cab.id, '還原型錄尺寸', c => { c.w = it0.w; c.h = it0.h; c.d = it0.d; c.fronts = c.base.fronts.map(r => ({ ...r })); c.shelves = M().genShelves(c); });
      return;
    }
    if (a === 'rot90') App.rotateSelected(90);
    else if (a === 'dup') App.duplicateSelected();
    else if (a === 'del') App.deleteSelected();
    else if (a === 'toggle-open') V().toggleOpen(cab.id);
    else if (a === 'row-add-door' || a === 'row-add-drawer') {
      const next = cab.fronts.map(r => ({ ...r }));
      const drawer = a === 'row-add-drawer';
      const t = drawer ? 'D' : (cab.w >= 900 ? 'P' : 'L');
      let rest = Math.round(cab.h / 10 - next.reduce((x, r) => x + r.h, 0));
      if (rest < 16) {
        // 無剩餘高度：由最高的門片列讓出空間
        const donor = next.filter(r => r.t !== 'D').sort((p, q) => q.h - p.h)[0];
        const need = drawer ? 16 : Math.floor((donor ? donor.h : 0) / 2);
        if (!donor || donor.h - need < 16) { App.toast('沒有足夠高度，請先縮小或移除其他列'); return; }
        donor.h -= need; rest += need;
        const i = next.indexOf(donor);
        next.splice(drawer ? next.length : i, 0, { t: drawer ? 'D' : donor.t, h: need });
        setFronts(cab, next);
        return;
      }
      const hs = drawer ? [16, 24, 32].filter(h => h <= rest) : D.FRONT_HEIGHTS.filter(h => h <= rest);
      const h = drawer ? hs[hs.length - 1] : (hs.includes(rest) ? rest : hs[hs.length - 1]);
      setFronts(cab, [{ t, h }, ...next]);
    } else if (a === 'row-reset') setFronts(cab, cab.base.fronts.map(r => ({ ...r })));
    else if (b.dataset.ra === 'flip') {
      const i = +b.dataset.i;
      App.updateCab(cab.id, '門片換邊', c => { c.fronts[i].t = c.fronts[i].t === 'L' ? 'R' : 'L'; });
    } else if (b.dataset.ra) {
      const i = +b.dataset.i, next = cab.fronts.map(r => ({ ...r }));
      if (b.dataset.ra === 'del') next.splice(i, 1);
      if (b.dataset.ra === 'up' && i > 0) [next[i - 1], next[i]] = [next[i], next[i - 1]];
      if (b.dataset.ra === 'down' && i < next.length - 1) [next[i + 1], next[i]] = [next[i], next[i + 1]];
      setFronts(cab, next);
    } else if (a === 'shelf-add') {
      App.updateCab(cab.id, '加層板', c => {
        const lo = D.BOARD, hi = c.h - D.BOARD;
        const ys = [lo - D.BOARD, ...c.shelves.map(x => x.y), hi].sort((p, q) => p - q);
        let best = [0, 0];
        for (let i = 0; i < ys.length - 1; i++) { const gap = ys[i + 1] - (ys[i] + D.BOARD); if (gap > best[1]) best = [i, gap]; }
        if (best[1] < 80) { App.toast('空間不足以再加層板'); return; }
        c.shelves.push({ y: Math.round(ys[best[0]] + D.BOARD + best[1] / 2 - D.BOARD / 2), fixed: false });
        c.shelves.sort((p, q) => p.y - q.y);
      });
    } else if (a === 'shelf-even') {
      App.updateCab(cab.id, '平均分配層板', c => {
        const n = c.shelves.length; const lo = D.BOARD, hi = c.h - D.BOARD;
        c.shelves.sort((p, q) => p.y - q.y).forEach((x, i) => { x.y = Math.round(lo + (hi - lo) * (i + 1) / (n + 1) - D.BOARD / 2); });
      });
    } else if (a === 'shelf-reset') App.updateCab(cab.id, '預設層板', c => { c.shelves = M().genShelves(c); });
    else if (b.dataset.sa === 'del') App.updateCab(cab.id, '移除層板', c => c.shelves.splice(+b.dataset.i, 1));
  }

  /* ================= 報價 ================= */
  function renderQuote() {
    const el = $('#tab-quote');
    const st = App.state, q = P().quote(st);
    withFocus(el, () => {
      el.innerHTML = `<div class="sec"><div class="sec-title">自動報價 <small>${q.multi ? st.floors.length + ' 層、' : ''}${q.count} 件</small></div>
      ${q.rows.length ? `<table class="qt"><thead><tr><th>型號 / 規格</th><th class="num">數量</th><th class="num">複價</th></tr></thead><tbody>
      ${q.rows.map((r, i) => `<tr class="qrow" data-q="${i}"><td>${r.floor ? `<span class="floor-tag">${esc(r.floor)}</span>` : ''}<b>${esc(P().fullCode(r.cab))}</b><br><span class="muted">${r.cab.w}×${r.cab.d}×${r.cab.h}　${esc(P().describe(r.cab))}</span></td><td class="num">${r.qty}</td><td class="num">${P().fmt(r.price.total * r.qty)}</td></tr>
        ${r.price.lines.length > 1 ? `<tr class="sub"><td colspan="3">${r.price.lines.map(l => `${esc(l.name)} ${P().fmt(l.amount)}`).join('　·　')}</td></tr>` : ''}`).join('')}
      </tbody></table>` : '<p class="note">空間中尚無系統櫃。從左側型錄取用後，報價會自動計算。</p>'}
      <div class="totals"><span>小計</span><b>${P().fmt(q.subtotal)}</b>
        <span class="inline">折數 <input type="number" class="field" style="width:64px" data-key="q-disc" data-qf="discount" value="${st.pricing.discount}" min="1" max="100"> %</span><span>${q.disc ? '−' + P().fmt(q.disc) : '—'}</span>
        <span class="inline">營業稅 <input type="number" class="field" style="width:64px" data-key="q-tax" data-qf="taxRate" value="${st.pricing.taxRate}" min="0" max="20"> %</span><span>${P().fmt(q.tax)}</span>
        <span class="grand">總計</span><span class="grand">${P().fmt(q.total)}</span></div></div>
      <div class="sec"><div class="sec-title">報價單備註</div><textarea class="field" rows="4" data-key="q-note" data-qf="note">${esc(st.pricing.note)}</textarea></div>
      <div class="btn-row"><button class="btn primary" data-qa="pdf">匯出報價單 PDF</button></div>`;
    });
  }
  function onQuoteChange(e) {
    const f = e.target.dataset.qf; if (!f) return;
    const v = f === 'note' ? e.target.value : Math.max(0, Math.min(f === 'discount' ? 100 : 30, +e.target.value || 0));
    App.mutate('報價設定', s => { s.pricing[f] = f === 'discount' && !v ? 100 : v; });
  }
  function onQuoteClick(e) {
    if (e.target.closest('[data-qa="pdf"]')) { window.Exporter.run('quote'); return; }
    const r = e.target.closest('[data-q]'); if (!r) return;
    const q = P().quote(App.state);
    const id = q.rows[+r.dataset.q].ids[0];
    App.select({ type: 'cab', id });
    UI.showTab('quote');
  }

  /* ================= 場景 ================= */
  function renderScenes() {
    const el = $('#tab-scenes'), st = App.state;
    withFocus(el, () => {
      el.innerHTML = `<div class="sec"><div class="sec-title">自訂場景 <small>${st.scenes.length} 個</small></div>
        <p class="muted" style="margin:0 0 8px;font-size:12px">調整好視角後新增場景；每個場景可設定燈光、背景與牆面顯示，匯出時會逐一渲染成 JPG。</p>
        <div class="btn-row" style="margin:0 0 10px"><button class="btn primary" data-sc="add">${icon('camera')}新增場景（目前視角）</button>${st.scenes.length ? '<button class="btn" data-sc="export">匯出全部渲染圖</button>' : ''}</div>
        ${st.scenes.map((s, i) => `<div class="scene-card">${s.thumb ? `<img src="${s.thumb}" alt="" data-sc="go" data-i="${i}" title="前往此場景">` : ''}
          <div class="body"><div class="inline"><input class="field" data-key="sn${i}" data-sf="name" data-i="${i}" value="${esc(s.name)}"></div>
          <div class="inline"><select class="field" data-key="sl${i}" data-sf="light" data-i="${i}">${Object.entries(V().LIGHT_NAMES).map(([k, n]) => `<option value="${k}"${k === s.light ? ' selected' : ''}>${n}</option>`).join('')}</select>
          <select class="field" data-key="sw${i}" data-sf="wallMode" data-i="${i}">${[['auto', '牆:自動'], ['show', '牆:顯示'], ['hide', '牆:隱藏']].map(([k, n]) => `<option value="${k}"${k === (s.wallMode || 'auto') ? ' selected' : ''}>${n}</option>`).join('')}</select>
          <input type="color" data-key="sb${i}" data-sf="bg" data-i="${i}" value="${s.bg || '#eef1f4'}" title="背景色"></div>
          <div class="btn-row" style="margin:0"><button class="btn small" data-sc="go" data-i="${i}">前往</button><button class="btn small" data-sc="update" data-i="${i}">更新為目前視角</button><button class="btn small danger" data-sc="del" data-i="${i}">刪除</button></div></div></div>`).join('')}
      </div>`;
    });
  }
  function onScenesChange(e) {
    const t = e.target, f = t.dataset.sf; if (!f) return;
    const i = +t.dataset.i;
    App.mutate('修改場景', s => { s.scenes[i][f] = t.value; });
    if (f !== 'name') V().applyScene(App.state.scenes[i], false);
  }
  function onScenesClick(e) {
    const b = e.target.closest('[data-sc]'); if (!b) return;
    const a = b.dataset.sc, i = +b.dataset.i, st = App.state;
    if (a === 'add') {
      const s = { id: M().uid('s'), name: (st.floors.length > 1 ? st.floors[st.floor].name + ' ' : '') + '場景 ' + (st.scenes.length + 1), cam: V().getCamera(), light: V().getLight(), bg: V().getBackground(), wallMode: V().wallMode, floor: st.floor };
      s.thumb = V().renderImage(320, 180);
      App.mutate('新增場景', x => x.scenes.push(s));
    } else if (a === 'go') { const sc = st.scenes[i]; if (sc.floor != null && sc.floor !== st.floor && st.floors[sc.floor]) App.switchFloor(sc.floor); V().applyScene(sc); }
    else if (a === 'update') {
      const cam = V().getCamera(), thumb = V().renderImage(320, 180);
      App.mutate('更新場景', x => { Object.assign(x.scenes[i], { cam, thumb, light: V().getLight(), bg: V().getBackground(), wallMode: V().wallMode }); });
    } else if (a === 'del') App.mutate('刪除場景', x => x.scenes.splice(i, 1));
    else if (a === 'export') window.Exporter.run('renders');
  }

  /* ================= 板材售價 ================= */
  function renderPricing() {
    const el = $('#tab-pricing'), pr = App.state.pricing;
    const useName = { body: '櫃體', door: '門板', both: '皆可' };
    withFocus(el, () => {
      el.innerHTML = `<div class="sec"><div class="sec-title">計價方式</div>
          <p class="muted" style="font-size:12px;margin:0 0 6px">櫃體售價＝各色號板材才數 × 色板單價（1 才＝303mm×303mm，每片板材無條件進位到整數才）；另加五金、抽屜組、玻璃門、檯面。桌面依材質每才單價計（整片進位）。</p>
          <div class="kv" style="margin-top:8px"><label>預設單價</label><div class="inline"><input type="number" min="0" data-key="pcai" data-pc="caiDefault" value="${pr.caiDefault != null ? pr.caiDefault : 100}"><span class="unit">元/才（未設定單價的色板 × 材質係數）</span></div></div>
          <div class="btn-row"><button class="btn small primary" data-swadmin="1">色板單價維護</button></div></div>
        <div class="sec"><div class="sec-title">板材材質係數 <small>未設定單價的色號＝預設單價 × 係數</small></div>
        <table class="pt mat"><colgroup><col style="width:26px"><col style="width:58px"><col><col style="width:50px"><col style="width:62px"><col style="width:50px"><col style="width:22px"></colgroup>
        <thead><tr><th></th><th>型號</th><th>名稱</th><th>用途</th><th>類別</th><th>係數%</th><th></th></tr></thead><tbody>
        ${pr.materials.map((m, i) => `<tr><td>${m.tex ? UI.chip(m.code) : `<input type="color" data-key="mc${i}" data-mf="hex" data-i="${i}" value="${m.hex}">`}</td>
          <td><input data-key="mk${i}" data-mf="code" data-i="${i}" value="${esc(m.code)}"${D.MATERIALS.some(x => x.code === m.code) ? ' disabled' : ''}></td>
          <td><input data-key="mn${i}" data-mf="name" data-i="${i}" value="${esc(m.name)}"></td>
          <td><select data-key="mu${i}" data-mf="use" data-i="${i}">${Object.entries(useName).map(([k, n]) => `<option value="${k}"${k === m.use ? ' selected' : ''}>${n}</option>`).join('')}</select></td>
          <td><select data-key="mt${i}" data-mf="cat" data-i="${i}">${['規格色', '訂製色', '色板'].map(c => `<option${c === m.cat ? ' selected' : ''}>${c}</option>`).join('')}</select></td>
          <td><input type="number" data-key="mf${i}" data-mf="factor" data-i="${i}" value="${m.factor}" min="10" max="500"></td>
          <td>${D.MATERIALS.some(x => x.code === m.code) ? '' : `<button class="icon-btn del" data-pa="mdel" data-i="${i}" title="刪除">${icon('x')}</button>`}</td></tr>`).join('')}
        </tbody></table><div class="btn-row"><button class="btn small" data-pa="madd">${icon('plus')}新增材質</button><button class="btn small" data-swadmin="1">色板維護（貼圖）</button></div></div>

        <div class="sec"><div class="sec-title">門板款式加價 <small>門片才數金額 × 款式價差 × 係數</small></div>
        <table class="pt"><tbody>${D.DOOR_STYLES.map(s => `<tr><td>${s.name}</td><td style="width:80px"><input type="number" data-key="st${s.id}" data-stf="${s.id}" value="${pr.styles[s.id] || 100}" min="10" max="500"></td><td class="unit">%</td></tr>`).join('')}</tbody></table></div>

        <div class="sec"><div class="sec-title">桌面每才單價 <small>元 / 才（303×303mm，整片進位）</small></div>
        <table class="pt"><thead><tr><th>材質</th>${D.DESK_THICK.map(t => `<th>${t}mm</th>`).join('')}</tr></thead><tbody>
        ${D.DESK_MATS.map(m => `<tr><td>${m.name}</td>${D.DESK_THICK.map(t => `<td><input type="number" data-key="dp${m.id}${t}" data-dpm="${m.id}" data-dpt="${t}" value="${pr.desk.prices[m.id][t]}"></td>`).join('')}</tr>`).join('')}
        </tbody></table>
        <div class="sec-title" style="margin-top:10px">桌面端部加工 <small>元 / 尺（外露邊長）</small></div>
        <table class="pt"><tbody>${D.DESK_EDGES.map(e => `<tr><td>${e.name}</td><td style="width:90px"><input type="number" data-key="de${e.id}" data-dpe="${e.id}" value="${pr.desk.edge[e.id] || 0}"></td></tr>`).join('')}</tbody></table></div>

        <div class="sec"><div class="sec-title">廚房設備售價 <small>元 / 台（空白＝參考價）</small></div>
        <table class="pt"><tbody>${D.APPLIANCES.map(a => `<tr><td>${esc(a.brand.split(' ')[0])}｜${D.APPL_TYPES[a.at]}｜${a.code}${a.est ? ' <small style="color:#b45309">估</small>' : ''}<br><small class="muted">${esc(a.name)}</small></td><td style="width:100px"><input type="number" data-key="ap${a.code}" data-apc="${a.code}" value="${pr.codeOverrides[a.code] != null ? pr.codeOverrides[a.code] : ''}" placeholder="${a.price}"></td></tr>`).join('')}</tbody></table></div>

        <div class="sec"><div class="sec-title">DAY&DAY／TOTO／和成／家具 售價 <small>元 / 個（空白＝官網訂價）</small></div>
        <table class="pt"><tbody>${[...D.DAYDAY, ...D.TOTO, ...D.HCG, ...D.FURN].map(a => `<tr><td>${a.brand === 'TOTO' ? 'TOTO｜' : a.brand === '和成 HCG' ? 'HCG｜' : a.group === 'furn' ? '家具｜' : ''}${D.APPL_TYPES[a.at]}｜${a.code}${a.est ? ' <small style="color:#b45309">估</small>' : ''}<br><small class="muted">${esc(a.name)}　${a.w}×${a.d}×${a.h}</small></td><td style="width:100px"><input type="number" data-key="ap${a.code}" data-apc="${a.code}" value="${pr.codeOverrides[a.code] != null ? pr.codeOverrides[a.code] : ''}" placeholder="${a.price}"></td></tr>`).join('')}</tbody></table></div>

        <div class="sec"><div class="sec-title">其他配件</div><div class="kv">
          <label>吊衣桿</label><div class="inline"><input type="number" data-key="prod" data-po="ROD" value="${pr.parts.ROD}"><span class="unit">元 / 支</span></div>
          <label>西德鉸鍊</label><div class="inline"><input type="number" data-key="phinge" data-po="HINGE" value="${pr.parts.HINGE}"><span class="unit">元 / 個</span></div>
          <label>調整腳</label><div class="inline"><input type="number" data-key="pfoot" data-po="FOOT" value="${pr.parts.FOOT}"><span class="unit">元 / 個</span></div>
          <label>電器抽滑軌</label><div class="inline"><input type="number" data-key="peslide" data-po="ESLIDE" value="${pr.parts.ESLIDE != null ? pr.parts.ESLIDE : D.PARTS.ESLIDE}"><span class="unit">元 / 組（電器抽托盤）</span></div>
        </div></div>
        <div class="btn-row"><button class="btn danger small" data-pa="reset">全部恢復預設售價</button></div>`;
    });
  }
  function onPricingChange(e) {
    const t = e.target, d = t.dataset;
    if (d.mf) {
      const i = +d.i;
      const v = d.mf === 'factor' ? Math.max(10, +t.value || 100) : t.value;
      App.mutate('修改材質', s => { s.pricing.materials[i][d.mf] = v; }, d.mf === 'hex' ? 'all' : null);
      if (d.mf === 'hex') { M().clearMatCache(); V().rebuildAll(); }
    } else if (d.stf) App.mutate('款式係數', s => { s.pricing.styles[d.stf] = Math.max(10, +t.value || 100); });
    else if (d.pk) App.mutate('層板單價', s => { s.pricing.parts[d.pk][d.dc][d.w] = Math.max(0, +t.value || 0); });
    else if (d.apc) App.mutate('設備售價', s => { if (t.value === '') delete s.pricing.codeOverrides[d.apc]; else s.pricing.codeOverrides[d.apc] = Math.max(0, +t.value || 0); });
    else if (d.dpm) App.mutate('桌面每才單價', s => { s.pricing.desk.prices[d.dpm][d.dpt] = Math.max(0, +t.value || 0); });
    else if (d.dpe) App.mutate('桌面端部單價', s => { s.pricing.desk.edge[d.dpe] = Math.max(0, +t.value || 0); });
    else if (d.pc) { App.mutate(d.pc === 'caiDefault' ? '預設單價' : '訂製加工 %', s => { s.pricing[d.pc] = Math.max(0, +t.value || 0); }); if (d.pc === 'caiDefault') UI.refreshCatalog(); }
    else if (d.po) App.mutate('配件單價', s => { s.pricing.parts[d.po] = Math.max(0, +t.value || 0); });
  }
  async function onPricingClick(e) {
    const b = e.target.closest('[data-pa]'); if (!b) return;
    const a = b.dataset.pa;
    if (a === 'madd') {
      App.mutate('新增材質', s => s.pricing.materials.push({ code: 'NEW' + (s.pricing.materials.length + 1), name: '自訂材質', hex: '#c8b89a', use: 'both', cat: '訂製色', factor: 110, grain: false }));
    } else if (a === 'mdel') {
      const m = App.state.pricing.materials[+b.dataset.i];
      if (App.state.cabinets.some(c => c.bodyColor === m.code || c.doorColor === m.code)) { App.toast('此材質仍被櫃體使用中'); return; }
      App.mutate('刪除材質', s => s.pricing.materials.splice(+b.dataset.i, 1));
    } else if (a === 'reset') {
      if (await UI.confirm('恢復預設', '預設單價、材質係數、款式係數、桌面與配件單價、設備售價都將恢復為預設值（色板維護裡的色板單價不受影響）。')) {
        App.mutate('恢復預設售價', s => { const d = window.Pricing.defaultPricing(); d.discount = s.pricing.discount; d.taxRate = s.pricing.taxRate; d.note = s.pricing.note; s.pricing = d; }, 'all');
        M().clearMatCache(); V().rebuildAll();
      }
    }
  }

  /* ================= 對話框 ================= */
  UI._modals = new Set();
  UI.closeAllModals = () => [...UI._modals].forEach(c => c(null));
  // page：全頁畫面
  const PAGE_BRAND = `<div class="auth-brand"><img class="logo-img" src="logo-puyu.png" alt="菩語國際設計 PURELY DESIGN"><div><b>系統櫃</b><small>3D 設計平台</small></div></div>`;
  UI.modal = function ({ title, body, buttons, wide, onOpen, validate, cls, page }) {
    return new Promise(resolve => {
      const back = document.createElement('div');
      back.className = 'modal-back' + (page ? ' auth-page' : '');
      back.innerHTML = `${page ? '<div class="auth-bg"></div>' : ''}<div class="modal${wide ? ' wide' : ''}${cls ? ' ' + cls : ''}" role="dialog" aria-modal="true">${page ? PAGE_BRAND : ''}<h3>${title}</h3><div class="mbody">${body}<div class="err"></div></div>
        <div class="mfoot">${buttons.map((b, i) => `<button class="btn${b.primary ? ' primary' : ''}${b.cls ? ' ' + b.cls : ''}" data-i="${i}">${b.label}</button>`).join('')}</div></div>`;
      $('#modalRoot').appendChild(back);
      UI.syncToolbar();
      const close = v => { back.remove(); document.removeEventListener('keydown', key, true); UI._modals.delete(close); UI.syncToolbar(); resolve(v); };
      UI._modals.add(close);
      const form = () => { const o = {}; back.querySelectorAll('[name]').forEach(n => { if (n.type === 'radio') { if (n.checked) o[n.name] = n.value; } else o[n.name] = n.type === 'checkbox' ? n.checked : n.value; }); return o; };
      let busy = false;
      const fire = async b => {
        if (busy) return;
        if (b.value == null) { close(null); return; }
        const data = form();
        if (validate && b.primary) {
          busy = true; back.classList.add('busy'); back.querySelector('.err').textContent = '';
          back.querySelectorAll('.mfoot button').forEach(x => { x.disabled = true; });
          let err;
          try { err = await validate(data); } catch (e) { err = String(e.message || e); }
          busy = false; back.classList.remove('busy');
          back.querySelectorAll('.mfoot button').forEach(x => { x.disabled = false; });
          if (err) { back.querySelector('.err').textContent = err; return; }
        }
        close({ button: b.value, data });
      };
      back.querySelectorAll('.mfoot button').forEach(btn => btn.addEventListener('click', () => fire(buttons[+btn.dataset.i])));
      const key = e => {
        if (e.key === 'Escape' && buttons.some(b => b.value == null)) { e.stopPropagation(); close(null); }
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { const p = buttons.find(b => b.primary); if (p) { e.preventDefault(); e.stopPropagation(); fire(p); } }
      };
      document.addEventListener('keydown', key, true);
      const first = back.querySelector('input,select');
      if (first) setTimeout(() => { first.focus(); if (first.select) first.select(); }, 30);
      if (onOpen) onOpen(back);
    });
  };
  UI.alert = (title, msg) => UI.modal({ title, body: `<p>${esc(msg).replace(/\n/g, '<br>')}</p>`, buttons: [{ label: '確定', primary: true, value: 'ok' }] });
  UI.confirm = async (title, msg) => !!(await UI.modal({ title, body: `<p>${esc(msg).replace(/\n/g, '<br>')}</p>`, buttons: [{ label: '取消', value: null }, { label: '確定', primary: true, value: 'ok' }] }));

  UI.roomDialog = async function () {
    const r = App.state.room;
    const res = await UI.modal({
      title: '矩形空間',
      body: `<p>輸入空間內淨尺寸（mm）。${r ? '<br><b>將取代目前空間與門窗</b>，櫃體會保留。' : ''}</p><div class="kv">
        <label>寬（X 向）</label><input name="w" type="number" value="4000" step="10">
        <label>深（Z 向）</label><input name="d" type="number" value="3500" step="10">
        <label>高</label><input name="h" type="number" value="${r ? r.height : 2600}" step="10">
        <label>牆厚</label><input name="t" type="number" value="${r ? r.thickness : 120}" step="5"></div>`,
      buttons: [{ label: '取消', value: null }, { label: '建立空間', primary: true, value: 'ok' }],
      validate: d => (+d.w < 600 || +d.d < 600) ? '寬、深至少 600 mm' : (+d.h < 1800 || +d.h > 6000) ? '高度需介於 1800–6000 mm' : (+d.t < 50 || +d.t > 400) ? '牆厚需介於 50–400 mm' : null
    });
    if (!res) return;
    App.setRoom(M().rectRoom(+res.data.w, +res.data.d, +res.data.h, +res.data.t));
  };
  UI.askHeight = async function (pts) {
    const res = await UI.modal({
      title: '封閉空間',
      body: `<p>已繪製 ${pts.length} 段牆。請輸入空間高度。${App.state.room ? '<br><b>將取代目前空間</b>，櫃體會保留。' : ''}</p><div class="kv">
        <label>高</label><input name="h" type="number" value="${App.state.room ? App.state.room.height : 2600}" step="10">
        <label>牆厚</label><input name="t" type="number" value="120" step="5"></div>`,
      buttons: [{ label: '取消', value: null }, { label: '建立空間', primary: true, value: 'ok' }],
      validate: d => (+d.h < 1800 || +d.h > 6000) ? '高度需介於 1800–6000 mm' : null
    });
    if (!res) return;
    App.setRoom(M().createRoom(pts, +res.data.h, +res.data.t));
  };
  // 離開目前專案前詢問：1 不儲存直接開新專案　2 匯出專案檔（之後可匯入繼續編輯）
  UI.leaveDialog = async function (title, action = '開立新專案') {
    if (!App.hasContent()) return true;
    const st = App.state;
    const res = await UI.modal({
      title,
      body: `<p>目前專案「<b>${esc(st.name)}</b>」有 ${st.cabinets.length} 件櫃體${st.room ? '、已建立空間' : ''}${st.scenes.length ? `、${st.scenes.length} 個場景` : ''}。請選擇：</p>
        <div class="choice-list">
          <label class="choice"><input type="radio" name="how" value="discard"><span><b>1. ${action}，不儲存目前專案</b><small>目前的空間、櫃體與場景將被清除，無法復原。</small></span></label>
          <label class="choice"><input type="radio" name="how" value="export" checked><span><b>2. 先匯出本專案檔（.json），再${action}</b><small>下載「${esc(st.name)}.json」，之後可按上方「匯入專案 .json」繼續編輯。</small></span></label>
        </div>`,
      buttons: [{ label: '取消', value: null }, { label: '確定', primary: true, value: 'ok' }]
    });
    if (!res) return false;
    if (res.data.how === 'export') { App.exportJSON(); App.toast('已匯出「' + st.name + '.json」'); }
    return true;
  };
  UI.helpDialog = function () {
    UI.modal({ title: '操作說明', wide: true, body: shortcutsHTML() + `<p style="margin-top:12px">流程：① 建立空間（矩形或自由繪製）→ ② 點選牆面放置門窗並鎖定 → ③ 從左側型錄點選或拖曳系統櫃，靠近牆面自動貼齊 → ④ 於右側調整層板、門片、材質 → ⑤ 報價分頁自動計算 → ⑥ 新增場景並由右上角「匯出」產出各式檔案。</p>`, buttons: [{ label: '關閉', primary: true, value: 'ok' }] });
  };

  /* ================= 鍵盤 / 數值框 ================= */
  let clipboard = null;
  function onKey(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    if (document.querySelector('.modal-back')) return;
    if (tag === 'input' || tag === 'textarea' || tag === 'select') { if (e.key === 'Escape') e.target.blur(); return; }
    const v = V(), k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl) {
      const kk = k.toLowerCase();
      if (kk === 'z' && !e.shiftKey) { App.undo(); e.preventDefault(); }
      else if (kk === 'y' || (kk === 'z' && e.shiftKey)) { App.redo(); e.preventDefault(); }
      else if (kk === 's') { App.exportJSON(); e.preventDefault(); }
      else if (kk === 'd') { App.duplicateSelected(); e.preventDefault(); }
      else if (kk === 'c') { const c = App.selectedCab(); if (c) { clipboard = JSON.parse(JSON.stringify(c)); App.toast('已複製 ' + M().cabName(c)); } }
      else if (kk === 'v' && clipboard) {
        const c = JSON.parse(JSON.stringify(clipboard)); c.id = M().uid();
        const r = c.rot * Math.PI / 180; c.x = Math.round(c.x + Math.cos(r) * c.w); c.z = Math.round(c.z - Math.sin(r) * c.w);
        clipboard = JSON.parse(JSON.stringify(c));
        App.mutate('貼上 ' + M().cabName(c), s => s.cabinets.push(c), [c.id]); App.select({ type: 'cab', id: c.id });
      }
      return;
    }
    if (/^[0-9.,\-]$/.test(k)) {
      const box = v.tool === 'line' ? $('#lineInput') : $('#vcb');
      box.focus(); box.value = k; e.preventDefault(); return;
    }
    if (v.tool === 'line' && k === 'Enter') { if (v.linePointCount()) v.lineFinish(); e.preventDefault(); return; }
    if (v.tool === 'line' && k === 'Backspace' && v.linePointCount()) { v.lineUndoPoint(); syncLineInput(); e.preventDefault(); return; }
    switch (k) {
      case ' ': v.setTool('select'); e.preventDefault(); break;
      case 'm': case 'M': v.setTool('move'); break;
      case 'q': case 'Q': { const dq = e.shiftKey ? -90 : 90; if (v.tool === 'place') v.rotatePlace(dq); else if (App.selectedCab() && v.tool !== 'rotate') App.rotateSelected(dq); else v.setTool('rotate'); break; }
      case 'o': case 'O': v.setTool('orbit'); break;
      case 'h': case 'H': v.setTool('pan'); break;
      case 'z': v.setTool('zoom'); break;
      case 'Z': v.zoomExtents(); break;
      case 'r': case 'R': UI.roomDialog(); break;
      case 'l': case 'L': UI.action('line'); break;
      case 't': case 'T': v.setTool('tape'); break;
      case 'Delete': case 'Backspace': App.deleteSelected(); e.preventDefault(); break;
      case 'Escape': v.escape(); break;
      case 'Enter': if (v.tool === 'line') { /* 雙擊或回到起點完成 */ } break;
      case 'ArrowLeft': App.nudge(e.shiftKey ? -100 : -10, 0); e.preventDefault(); break;
      case 'ArrowRight': App.nudge(e.shiftKey ? 100 : 10, 0); e.preventDefault(); break;
      case 'ArrowUp': App.nudge(0, e.shiftKey ? -100 : -10); e.preventDefault(); break;
      case 'ArrowDown': App.nudge(0, e.shiftKey ? 100 : 10); e.preventDefault(); break;
    }
  }
  /* ---------- 畫牆線：跟著滑鼠的數據輸入框 ---------- */
  let lineMouse = null;
  function initLineInput() {
    const vp = $('#viewport');
    const wrap = document.createElement('div');
    wrap.className = 'line-input'; wrap.id = 'lineInputWrap'; wrap.hidden = true;
    wrap.innerHTML = `<input id="lineInput" autocomplete="off" spellcheck="false" placeholder="長度 或 長度,角度" aria-label="輸入牆線長度與角度">
      <small id="lineInputHint">例：3000　或　3000,90（0°右、90°上）　Enter 確定</small>`;
    vp.appendChild(wrap);
    const inp = $('#lineInput');
    // 點輸入框不要變成在 3D 畫面上點一下
    ['mousedown', 'pointerdown', 'click', 'dblclick'].forEach(t => wrap.addEventListener(t, e => e.stopPropagation()));
    vp.addEventListener('mousemove', e => {
      const r = vp.getBoundingClientRect();
      lineMouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      placeLineInput();
    });
    inp.addEventListener('keydown', e => {
      const v = V();
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        const raw = inp.value.trim();
        if (!raw) { if (v.linePointCount()) v.lineFinish(); inp.blur(); syncLineInput(); return; }
        const err = v.lineInput(raw);
        if (err) { App.toast(err); inp.select(); return; }
        inp.value = '';                           // 保持焦點，可以接著輸入下一段
        syncLineInput();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (inp.value) inp.value = ''; else { inp.blur(); v.escape(); }
        syncLineInput();
      } else if (e.key === 'Backspace' && !inp.value) {
        e.preventDefault();
        v.lineUndoPoint(); syncLineInput();
      }
    });
  }
  function placeLineInput() {
    const wrap = $('#lineInputWrap'); if (!wrap || wrap.hidden) return;
    const vp = $('#viewport');
    const m = lineMouse || { x: vp.clientWidth / 2, y: vp.clientHeight / 2 };
    const w = wrap.offsetWidth || 220, h = wrap.offsetHeight || 50;
    // 只在滑鼠正下方或正上方擺放（左右可平移），保證不會蓋住游標、擋到點擊
    const x = Math.max(6, Math.min(m.x + 18, vp.clientWidth - w - 6));
    const y = m.y + 22 + h <= vp.clientHeight - 6 ? m.y + 22 : m.y - h - 22;
    wrap.style.left = x + 'px'; wrap.style.top = Math.max(6, y) + 'px';
  }
  UI.syncLineInput = () => syncLineInput();
  function syncLineInput() {
    const wrap = $('#lineInputWrap'); if (!wrap) return;
    const v = V(), on = v.tool === 'line';
    wrap.hidden = !on;
    if (!on) { $('#lineInput').value = ''; return; }
    const n = v.linePointCount();
    $('#lineInputHint').textContent = n
      ? `第 ${n} 點之後：輸入長度 或 長度,角度（0°右、90°上）Enter　·　空白 Enter 完成　·　Backspace 退一點`
      : '先點起點；或直接輸入「長度,角度」從滑鼠位置開始畫';
    placeLineInput();
  }

  function vcbEnter() {
    const el = $('#vcb'), raw = el.value.trim();
    el.value = ''; el.blur();
    if (!raw) return;
    const v = V();
    const parts = raw.split(/[,，\s]+/).map(Number);
    if (v.tool !== 'line' && parts.some(isNaN)) { App.toast('請輸入數字，例如 1200 或 300,0'); return; }
    if (v.tool === 'line') { const err = v.lineInput(raw); if (err) App.toast(err); syncLineInput(); return; }
    if (v.isMoving()) { v.moveBy(parts[0]); return; }
    const cab = App.selectedCab();
    if (v.tool === 'rotate' && cab) { App.rotateSelected(parts[0]); return; }
    if (cab) { App.nudge(parts[0] || 0, parts[1] || 0); return; }
    App.toast('畫線時輸入長度、移動時輸入距離；選取櫃體後可輸入「x,z」位移');
  }

  window.UI = UI;
})();
