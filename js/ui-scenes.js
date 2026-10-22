/* 介面（場景分頁）：自訂場景清單、新增／前往／更新／刪除、匯出全部渲染圖。
   拆自 js/ui.js；需在 js/ui-core.js 之後載入。 */
(function () {
  const V = () => window.Viewer;
  const M = () => window.Model;
  const $ = s => document.querySelector(s);
  const UI = window.UI;
  const esc = UI.esc, icon = UI.icon;
  const withFocus = UI._withFocus;

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
  UI._renderScenes = renderScenes;
  /* 初始化（由 UI.init 呼叫） */
  UI._initScenes = function () {
    $('#tab-scenes').addEventListener('change', onScenesChange);
    $('#tab-scenes').addEventListener('click', onScenesClick);
  };
})();
