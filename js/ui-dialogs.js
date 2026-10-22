/* 介面（對話框）：通用對話框 UI.modal、alert／confirm、地板與塗料選擇視窗、矩形空間／封閉空間／離開專案／操作說明對話框。
   拆自 js/ui.js；需在 js/ui-core.js 之後載入。 */
(function () {
  const D = window.DATA;
  const M = () => window.Model;
  const $ = s => document.querySelector(s);
  const UI = window.UI;
  const esc = UI.esc;

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
  /* ---------- 地板／塗料選擇視窗 ---------- */
  UI.pickFloor = async function () {
    const r = App.state.room; if (!r) return;
    if (window.Lazy && !(await window.Lazy.ensure('floors', '載入品牌木地板型錄…'))) return;
    const cur = r.floor || 'wood-light';
    const groups = [...new Set(D.FLOORS.map(f => f.group))];
    let g = (D.FLOORS.find(f => f.id === cur) || {}).group || groups[0], q = '';
    const render = back => {
      const list = D.FLOORS.filter(f => f.group === g && (!q || (f.name + ' ' + f.id + ' ' + (f.series || '')).toLowerCase().includes(q)));
      back.querySelector('.pick-grid').innerHTML = list.map(f => `<button class="pick-tile${f.id === cur ? ' on' : ''}" data-id="${f.id}" title="${esc((f.series ? f.series + '　' : '') + f.name + (f.note ? '\n' + f.note : ''))}"><span class="pick-img" style="background:${f.color}${f.thumb ? `;background-image:url(${f.thumb});background-size:cover` : ''}"></span><span class="pick-lbl">${esc(f.name)}</span>${f.series ? `<span class="pick-sub">${esc(f.series)}</span>` : ''}</button>`).join('') || '<p class="muted">沒有符合的花色</p>';
      back.querySelectorAll('.pick-chips .chip').forEach(c => c.classList.toggle('active', c.dataset.g === g));
    };
    await UI.modal({
      title: '選擇地板', wide: true, cls: 'pick-modal',
      body: `<div class="pick-chips">${groups.map(x => `<button class="chip small" data-g="${esc(x)}">${esc(x)} ${D.FLOORS.filter(f => f.group === x).length}</button>`).join('')}</div><input class="pick-search" placeholder="搜尋花色名稱／型號" name="q"><div class="pick-grid"></div><p class="muted" style="font-size:11.5px;margin:6px 0 0">品牌地板為原廠實拍花色，依板材尺寸重複貼圖；售價請向經銷商詢價。</p>`,
      buttons: [{ label: '關閉', value: null }],
      onOpen: back => {
        render(back);
        back.querySelector('.pick-chips').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) { g = c.dataset.g; render(back); } });
        back.querySelector('.pick-search').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); render(back); });
        back.querySelector('.pick-grid').addEventListener('click', e => {
          const t = e.target.closest('.pick-tile'); if (!t) return;
          const f = D.FLOORS.find(x => x.id === t.dataset.id);
          App.mutate('地板 ' + f.name, x => { x.room.floor = f.id; }, 'room'); App.toast('地板已改為「' + f.name + '」');
          back.querySelector('.mfoot button').click();
        });
      }
    });
  };
  // target：null＝整體牆面；數字＝第 i 面牆
  UI.pickPaint = async function (target) {
    const r = App.state.room; if (!r) return;
    if (window.Lazy && !(await window.Lazy.ensure('paint', '載入塗料色卡…'))) return;
    const curHex = target === 'ceil' ? (r.ceiling && r.ceiling.color) : target == null ? r.wallColor : (r.walls[target].color || r.wallColor);
    let g = '白／米白', q = '';
    if (curHex) { const p = D.PAINTS.find(x => x.hex.toLowerCase() === String(curHex).toLowerCase()); if (p) g = p.group; }
    const render = back => {
      const list = D.PAINTS.filter(p => (q ? (p.code + ' ' + p.name).toLowerCase().includes(q) : p.group === g)).sort((a2, b2) => b2.light - a2.light);
      back.querySelector('.pick-grid').innerHTML = list.map(p => `<button class="paint-tile${curHex && p.hex.toLowerCase() === String(curHex).toLowerCase() ? ' on' : ''}" data-code="${esc(p.code)}" title="${esc(p.code + ' ' + p.name)}"><span class="pick-img" style="background:${p.hex}"></span><span class="pick-lbl">${esc(p.name)}</span><span class="pick-sub">${esc(p.code)}</span></button>`).join('') || '<p class="muted">沒有符合的顏色</p>';
      back.querySelectorAll('.pick-chips .chip').forEach(c => c.classList.toggle('active', c.dataset.g === g && !q));
    };
    await UI.modal({
      title: target === 'ceil' ? '選擇天花板塗料' : target == null ? '選擇牆面塗料（整體）' : `選擇塗料：${M().wallName(target)}`, wide: true, cls: 'pick-modal',
      body: `<div class="pick-chips">${D.PAINT_GROUPS.map(x => `<button class="chip small" data-g="${x}"><span class="chip-dot" style="background:${(D.PAINTS.find(p => p.group === x) || { hex: '#ccc' }).hex}"></span>${x} ${D.PAINTS.filter(p => p.group === x).length}</button>`).join('')}</div><div class="inline" style="gap:8px"><input class="pick-search" placeholder="搜尋色號／名稱，如 10YY 或 奶茶" name="q"><label class="inline" style="white-space:nowrap">自訂 <input type="color" class="pick-custom" value="${curHex || '#f1efea'}" style="width:44px;height:30px;padding:0"></label></div><div class="pick-grid paint"></div><p class="muted" style="font-size:11.5px;margin:6px 0 0">得利 Dulux 台灣 2079 電腦調色色卡（官網色彩總覽 384 色）；螢幕顯色僅供參考，施工前請以實體色卡確認。</p>`,
      buttons: [{ label: '關閉', value: null }],
      onOpen: back => {
        render(back);
        const apply = (hex, paint) => {
          const label = paint ? paint.code + ' ' + paint.name : hex;
          if (target === 'ceil') App.mutate('天花塗料 ' + label, x => { const c = window.Ceiling.ensure(x.room); c.color = hex; if (paint) c.paint = { brand: paint.brand, code: paint.code, name: paint.name }; else delete c.paint; }, 'room');
          else if (target == null) App.mutate('牆面塗料 ' + label, x => { x.room.wallColor = hex; if (paint) x.room.wallPaint = { brand: paint.brand, code: paint.code, name: paint.name }; else delete x.room.wallPaint; }, 'room');
          else App.mutate(M().wallName(target) + ' 塗料 ' + label, x => { const w = x.room.walls[target]; w.color = hex; if (paint) w.paint = { brand: paint.brand, code: paint.code, name: paint.name }; else delete w.paint; }, 'room');
          App.toast((target === 'ceil' ? '天花板' : target == null ? '牆面' : M().wallName(target)) + '已改為 ' + label);
        };
        back.querySelector('.pick-chips').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) { g = c.dataset.g; q = ''; back.querySelector('.pick-search').value = ''; render(back); } });
        back.querySelector('.pick-search').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); render(back); });
        back.querySelector('.pick-custom').addEventListener('change', e => { apply(e.target.value, null); back.querySelector('.mfoot button').click(); });
        back.querySelector('.pick-grid').addEventListener('click', e => {
          const t = e.target.closest('.paint-tile'); if (!t) return;
          const p = D.PAINTS.find(x => x.code === t.dataset.code); if (!p) return;
          apply(p.hex, p); back.querySelector('.mfoot button').click();
        });
      }
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
        <label>高</label><input name="h" type="number" value="${r ? r.height : 2800}" step="10">
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
        <label>高</label><input name="h" type="number" value="${App.state.room ? App.state.room.height : 2800}" step="10">
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
    UI.modal({ title: '操作說明', wide: true, body: UI._shortcutsHTML() + `<p style="margin-top:12px">流程：① 建立空間（矩形或自由繪製）→ ② 點選牆面放置門窗並鎖定 → ③ 從左側型錄點選或拖曳系統櫃，靠近牆面自動貼齊 → ④ 於右側調整層板、門片、材質 → ⑤ 報價分頁自動計算 → ⑥ 新增場景並由右上角「匯出」產出各式檔案。</p>`, buttons: [{ label: '關閉', primary: true, value: 'ok' }] });
  };
})();
