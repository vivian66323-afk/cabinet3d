/* 介面（工具列與快捷鍵）：工具列按鈕、同步工具列狀態、UI.action、操作說明快捷鍵表、鍵盤快捷鍵、畫線數值輸入框、數值框（VCB）。
   拆自 js/ui.js；需在 js/ui-core.js 之後載入。 */
(function () {
  const V = () => window.Viewer;
  const M = () => window.Model;
  const $ = s => document.querySelector(s);
  const UI = window.UI;
  const icon = UI.icon;

  const TOOLBAR = [
    [{ tool: 'select', i: 'select', k: '␣', t: '選取（空白鍵）' }, { tool: 'move', i: 'move', k: 'M', t: '移動（M）' }, { tool: 'rotate', i: 'rotate', k: 'Q', t: '旋轉 90°（Q）' },
      { act: 'autowall', i: 'magnet', txt: '靠牆', t: '自動靠牆：移動/放置櫃體時，櫃背離牆 5cm 內自動貼齊牆面（拖曳時按住 Alt 可暫時停用）' },
      { act: 'objsnap', i: 'snap', txt: '吸附', t: '物件吸附：移動/放置時自動對齊鄰近櫃體的邊緣（6cm 內靠齊或邊緣對齊，洋紅虛線提示；按住 Alt 可暫時停用）' },
      { act: 'lamps', i: 'open', txt: '燈光', t: '燈具光源：開啟時所有燈具會打光（燈多時較耗效能，可關閉）' },
      { act: 'dup', i: 'dup', k: '', t: '複製選取櫃體（Ctrl+D）' }, { act: 'delete', i: 'delete', k: '', t: '刪除（Delete）' }],
    [{ act: 'rect', i: 'rect', k: 'R', t: '矩形空間：輸入寬/深/高（R）' }, { tool: 'line', i: 'line', k: 'L', t: '自由繪製多線段空間（L）' }, { act: 'underlay', i: 'image', txt: '底圖', t: '匯入平面圖：JPG／PNG／PDF 當底圖描牆線；DXF（CAD）可自動建立空間' }, { tool: 'tape', i: 'tape', k: 'T', t: '捲尺量測（T）' }],
    [{ tool: 'orbit', i: 'orbit', k: 'O', t: '環轉（O）｜任何時候可用滑鼠中鍵' }, { tool: 'pan', i: 'pan', k: 'H', t: '平移（H）｜Shift+中鍵 或 右鍵' }, { tool: 'zoom', i: 'zoom', k: 'Z', t: '縮放（Z）｜滾輪' }, { act: 'extents', i: 'extents', k: '', t: '充滿視窗（Shift+Z）' }],
    [{ act: 'view:iso', txt: '等角', t: '等角視圖' }, { act: 'view:top', txt: '上', t: '上視圖' }, { act: 'view:front', txt: '前', t: '前視圖' }, { act: 'view:right', txt: '右', t: '右視圖' }, { act: 'view:back', txt: '後', t: '後視圖' }, { act: 'view:left', txt: '左', t: '左視圖' }, { act: 'persp', txt: '透視', t: '切換透視／平行投影' }],
    [{ act: 'walls', i: 'walls', txt: '牆:自動', t: '牆面顯示：自動隱藏靠近鏡頭的牆／顯示／隱藏' }, { act: 'render', i: 'render', txt: '材質', t: '顯示樣式：材質／白模／X光' }, { act: 'open', i: 'open', t: '全部開門預覽（Shift＋快按兩下櫃體可單獨開關）' }, { act: 'dims', i: 'dims', t: '顯示牆長標註' }],
    [{ act: 'undo', i: 'undo', t: '復原（Ctrl+Z）' }, { act: 'redo', i: 'redo', t: '重做（Ctrl+Y）' }, { act: 'help', i: 'help', t: '操作說明' }]
  ];

  /* ================= 初始化（由 UI.init 呼叫） ================= */
  UI._initToolbar = function () {
    $('#toolbar').innerHTML = TOOLBAR.map(g => `<div class="tgroup">${g.map(b => {
      const inner = (b.i ? icon(b.i) : '') + (b.txt ? `<span data-lbl="${b.act || b.tool}">${b.txt}</span>` : '') + (b.k ? `<span class="key">${b.k}</span>` : '');
      return `<button class="tbtn${b.txt ? ' wide' : ''}" ${b.tool ? `data-tool="${b.tool}"` : `data-act="${b.act}"`} title="${b.t}">${inner}</button>`;
    }).join('')}</div>`).join('');
    $('#toolbar').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) V().setTool(b.dataset.tool);
      else UI.action(b.dataset.act);
    });
  };

  UI.syncToolbar = function () {
    const v = V();
    { const la = $('#lineActions'); if (la) la.hidden = v.tool !== 'line'; }
    // 空間提示：已有空間/櫃體、或正在繪製、放置時隱藏
    const st = App.state;
    $('#emptyHint').hidden = !!(st.room || st.cabinets.length || st.underlay) || ['line', 'place'].includes(v.tool) || !!document.querySelector('.modal-back');
    document.querySelectorAll('.tbtn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === v.tool));
    const set = (act, on, label) => {
      const b = document.querySelector(`.tbtn[data-act="${act}"]`); if (!b) return;
      b.classList.toggle('active', !!on);
      if (label) { const l = b.querySelector('[data-lbl]'); if (l) l.textContent = label; }
    };
    set('lamps', v.lampsOn !== false, v.lampsOn !== false ? '燈光' : '燈光:關');
    set('walls', v.wallMode !== 'show', { auto: '牆:自動', show: '牆:顯示', hide: '牆:隱藏' }[v.wallMode]);
    set('render', App.renderMode, { '': '材質', white: '白模', xray: 'X光' }[App.renderMode || '']);
    set('open', v.isOpenAll && v.isOpenAll());
    set('dims', v.showWallDims);
    set('autowall', v.autoWall, v.autoWall ? '靠牆' : '自由');
    set('objsnap', v.objSnap, v.objSnap ? '吸附' : '不吸附');
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
      case 'underlay': window.Underlay.import(); break;
      case 'lamps': v.lampsOn = v.lampsOn === false; try { localStorage.setItem('cab3d.lamps', v.lampsOn ? 'on' : 'off'); } catch (e) { /* 忽略 */ } v.rebuildAll(); UI.syncToolbar(); App.toast(v.lampsOn ? '燈具光源已開啟' : '燈具光源已關閉'); break;
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
      case 'objsnap': v.setObjSnap(!v.objSnap); UI.syncToolbar(); App.toast(v.objSnap ? '已開啟物件吸附（對齊鄰近櫃體邊緣）' : '已關閉物件吸附'); break;
      case 'autowall': v.setAutoWall(!v.autoWall); UI.syncToolbar(); App.toast(v.autoWall ? '已開啟自動靠牆（拖曳時按住 Alt 可暫時停用）' : '已關閉自動靠牆'); break;
      case 'undo': App.undo(); break;
      case 'redo': App.redo(); break;
      case 'help': UI.helpDialog(); break;
    }
  };

  function shortcutsHTML() {
    return `<div class="shortcuts">
      <kbd>中鍵拖曳</kbd><span>環轉視角</span><kbd>Shift+中鍵</kbd><span>平移（或右鍵拖曳）</span><kbd>滾輪</kbd><span>以游標為中心縮放</span>
      <kbd>空白鍵</kbd><span>選取工具</span><kbd>M / Q</kbd><span>移動 / 旋轉 90°</span><kbd>R / L</kbd><span>矩形空間 / 畫線空間</span>
      <kbd>T</kbd><span>捲尺量測</span><kbd>O / H / Z</kbd><span>環轉 / 平移 / 縮放工具</span><kbd>Shift+Z</kbd><span>充滿視窗</span><kbd>快按左鍵兩下</kbd><span>任何位置：縮放至實際空間最適大小</span>
      <kbd>方向鍵</kbd><span>微調 10mm（Shift 100mm）</span><kbd>Ctrl+C / V / D</kbd><span>複製 / 貼上 / 就地複製</span>
      <kbd>Ctrl+Z / Y</kbd><span>復原 / 重做</span><kbd>Shift＋快按兩下櫃體</kbd><span>開門預覽</span><kbd>數值框</kbd><span>畫線或移動時直接輸入數字 + Enter</span>
    </div>`;
  }
  UI._shortcutsHTML = shortcutsHTML;

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
      case 'Delete': case 'Backspace': if (!(v.ceilEdit && v.ceilSel && v.deleteCeilSel())) App.deleteSelected(); e.preventDefault(); break;
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
  UI._initKeys = function () {
    document.addEventListener('keydown', onKey);
    $('#vcb').addEventListener('keydown', e => { if (e.key === 'Enter') { vcbEnter(); e.preventDefault(); } if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); } });
    initLineInput();
  };
})();
