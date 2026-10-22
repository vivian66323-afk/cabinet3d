/* 介面（色板選擇器）：部位／紋路／廠商／系列／搜尋、色號格子、套用至全部櫃體、延遲載入其他廠商色板、色板 CSS。
   拆自 js/ui.js；需在 js/ui-core.js 之後載入。 */
(function () {
  const $ = s => document.querySelector(s);
  const UI = window.UI;
  const esc = UI.esc;

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
        <select class="field" data-key="swb-${ctx}" data-swb="1" title="廠商"><option value="all">全部廠商</option>${brands.map(x => `<option${x === UI.swBrand ? ' selected' : ''}>${esc(x)}</option>`).join('')}${window.Lazy && !window.Lazy.has('swatches') ? '<option value="__more">更多廠商色板…</option>' : ''}</select>
        <select class="field" data-key="sws-${ctx}" data-sws="1"><option value="all">全部系列</option>${series.map(x => `<option${x === UI.swSeries ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="sw-grid">${swGridHTML(cur)}</div>${swMoreHTML()}
      <div class="btn-row"><button class="btn small" data-a="sw-all">${ctx === 'cab' ? '此部位色號套用至全部櫃體' : '此部位預設色號套用至全部櫃體'}</button></div></div>`;
  }
  // 其他廠商色板（禾邁、富美家、EGGER…，js/swatches-*.js）延遲載入：還沒載時格子下方放按鈕；開始挑色時也會自動抓
  let swError = '';
  function swMoreHTML() {
    const L = window.Lazy; if (!L || L.has('swatches')) return '';
    if (L.loading('swatches')) return '<p class="muted sw-more">載入各廠商色板中…</p>';
    return `<p class="muted sw-more">${swError ? `各廠商色板載入失敗：${esc(swError)} ` : '目前只列出伸保色板與規格色。'}<button class="btn small link" data-a="sw-more">${swError ? '重試' : '載入其他廠商色板（禾邁、富美家、EGGER、威盛亞…）'}</button></p>`;
  }
  // quiet＝只改提示文字、不重繪面板（pointerdown 時重繪會打斷正在點的按鈕／輸入框）
  UI.loadSwatches = function (quiet) {
    const L = window.Lazy; if (!L || L.has('swatches') || L.loading('swatches')) return;
    swError = '';
    L.load('swatches').then(() => { swError = ''; UI.showProps(); }, e => { console.error(e); swError = e.message; UI.showProps(); App.toast('各廠商色板載入失敗：' + e.message); });
    if (quiet) document.querySelectorAll('.sw-more').forEach(p => { p.textContent = '載入各廠商色板中…'; }); else UI.showProps();
  };
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
    UI.loadSwatches(true);
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
  UI._swatchPicker = swatchPicker;
  UI._onSwatchClick = onSwatchClick;
  /* 初始化（由 UI.init 呼叫） */
  UI._initSwatch = function () {
    $('#tab-props').addEventListener('input', onSwatchInput);
    // 開始挑色板（點部位、搜尋、切廠商、點格子）就把其他廠商色板抓回來
    $('#tab-props').addEventListener('pointerdown', e => { if (e.target.closest('.sw-targets,.sw-tools,.sw-grid')) UI.loadSwatches(true); });
    // 色板維護（js/swatchadmin.js）延遲載入：第一次按時先抓模組與各廠商色板；之後由模組自己的事件處理
    document.addEventListener('click', async e => {
      const b = e.target.closest('[data-swadmin]'); if (!b || !window.Lazy || UI.swatchAdmin) return;
      e.preventDefault();
      if (await window.Lazy.ensure(['swatches', 'swatchadmin'], '載入色板維護…')) UI.swatchAdmin();
    });
    UI.injectSwatchCSS();
  };
})();
