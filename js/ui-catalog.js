/* 介面（型錄）：我的最愛、分類／品牌／類別／色系篩選、型錄清單與搜尋、延遲載入型錄、卡片縮圖（UI.thumb）。
   拆自 js/ui.js；需在 js/ui-core.js 之後載入。 */
(function () {
  const D = window.DATA;
  const V = () => window.Viewer;
  const M = () => window.Model;
  const $ = s => document.querySelector(s);
  const UI = window.UI;
  const esc = UI.esc;

  /* ================= 型錄 ================= */
  /* ================= 型錄 ================= */
  // 我的最愛（型錄收藏，存在瀏覽器）
  let favs = new Set(); try { favs = new Set(JSON.parse(localStorage.getItem('cab3d.favs') || '[]')); } catch (e) { favs = new Set(); }
  const saveFavs = () => { try { localStorage.setItem('cab3d.favs', JSON.stringify([...favs])); } catch (e) { /* 忽略 */ } };
  UI.isFav = code => favs.has(code);
  UI.toggleFav = code => { if (favs.has(code)) favs.delete(code); else favs.add(code); saveFavs(); };
  const FILTERS = [['all', '全部'], ['fav', '★ 我的最愛'], ['A', 'D580mm'], ['B', 'D408mm'], ['C', 'D360mm'], ['T', '電視空櫃 D500'], ['K', '電器櫃'], ['corner', '轉角櫃'], ['hang', '吊櫃'], ['double', '雙開隔間'], ['tri', '三角邊櫃'], ['filler', '補板'], ['desk', '桌面'], ['appl', '廚房／浴室設備'], ['furn', '家具'], ['lamp', '燈具']];
  const APPL_GROUPS = ['appl', 'dayday', 'daydayb', 'daydayf', 'toto', 'hcg'];
  const applBrands = () => { const seen = [...D.APPL_BRANDS]; D.items.forEach(it => { if (APPL_GROUPS.includes(it.group) && !seen.includes(it.brand)) seen.push(it.brand); }); return seen; };
  const FURN_GROUPS = ['furn', 'ikea', 'muji'];
  const inGroup = (it, f) => f === 'fav' ? favs.has(it.code) : f === 'furn' ? FURN_GROUPS.includes(it.group) : f === 'appl' ? APPL_GROUPS.includes(it.group) : it.group === f;
  const furnBrands = () => [...new Set(D.items.filter(it => FURN_GROUPS.includes(it.group)).map(it => it.brand))];
  const lampBrands = () => [...new Set(D.items.filter(it => it.group === 'lamp').map(it => it.brand))];
  let curFilter = 'all', curBrand = 'all', curType = 'all', curColor = 'all';
  let subCollapsed = (() => { try { return localStorage.getItem('cab3d_subfilters') === '0'; } catch (e) { return false; } })();
  const COLOR_NAME = { steel: '不鏽鋼／絲光', gold: '金色', gray: '暮灰色', black: '黑色', white: '白色陶瓷' };
  let pickedCode = null;
  function buildFilters() {
    $('#catFilters').innerHTML = FILTERS.map(([k, n]) => `<button class="chip${k === curFilter ? ' active' : ''}${k === 'fav' ? ' fav-chip' : ''}" data-f="${k}" title="${k === 'fav' ? '按型錄卡片右上角的 ☆ 加入收藏' : ''}">${k === 'fav' ? n + (favs.size ? ' ' + favs.size : '') : n}</button>`).join('') +
      (curFilter === 'appl' ? `<div class="brand-chips">${[['all', '全部品牌'], ...applBrands().map(b => [b, b.split(' ')[0]])].map(([k, n]) => `<button class="chip small${k === curBrand ? ' active' : ''}" data-b="${k}">${n}</button>`).join('')}</div>` : '') +
      (curFilter === 'furn' ? `<div class="brand-chips">${[['all', '全部品牌'], ...furnBrands().map(b => [b, b])].map(([k, n]) => `<button class="chip small${k === curBrand ? ' active' : ''}" data-b="${k}">${n}</button>`).join('')}</div>` : '') +
      (curFilter === 'lamp' ? `<div class="brand-chips">${[['all', '全部品牌'], ...lampBrands().map(b => [b, b])].map(([k, n]) => `<button class="chip small${k === curBrand ? ' active' : ''}" data-b="${k}">${n}</button>`).join('')}</div>` : '') +
      subFilters();
    $('#catFilters').onclick = e => {
      const tg = e.target.closest('[data-sub-toggle]'); if (tg) { subCollapsed = !subCollapsed; try { localStorage.setItem('cab3d_subfilters', subCollapsed ? '0' : '1'); } catch (e2) { /* 忽略 */ } buildFilters(); return; }
      const bb = e.target.closest('[data-b]'); if (bb) { curBrand = bb.dataset.b; curType = 'all'; buildFilters(); renderCatalog(); return; }
      const bt = e.target.closest('[data-t]'); if (bt) { curType = bt.dataset.t; buildFilters(); renderCatalog(); return; }
      const bc = e.target.closest('[data-c]'); if (bc) { curColor = bc.dataset.c; buildFilters(); renderCatalog(); return; }
      const b = e.target.closest('[data-f]'); if (!b) return; curFilter = b.dataset.f; curBrand = 'all'; curType = 'all'; curColor = 'all'; catError = ''; buildFilters(); renderCatalog();
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
    if (!['appl', 'dayday', 'daydayb', 'daydayf', 'toto', 'hcg', 'furn', 'ikea', 'lamp'].includes(curFilter)) return '';
    const its = D.items.filter(it => inGroup(it, curFilter) && (!['appl', 'furn', 'lamp'].includes(curFilter) || curBrand === 'all' || it.brand === curBrand));
    const cnt = {}; its.forEach(it => { cnt[it.at] = (cnt[it.at] || 0) + 1; });
    const types = AORDER.filter(t => cnt[t]);
    return `<div class="brand-chips type-chips">${[['all', `全部分類 ${its.length}`], ...types.map(t => [t, `${D.APPL_TYPES[t]} ${cnt[t]}`])].map(([k, n]) => `<button class="chip small${k === curType ? ' active' : ''}" data-t="${k}">${n}</button>`).join('')}</div>`;
  }
  function colorChips() {
    if (curFilter !== 'appl') return '';
    const its = D.items.filter(it => inGroup(it, curFilter) && (curBrand === 'all' || it.brand === curBrand) && (curType === 'all' || it.at === curType));
    const cnt = {}; its.forEach(it => { const c = it.finish || 'steel'; cnt[c] = (cnt[c] || 0) + 1; });
    const cols = ['steel', 'gold', 'gray', 'black'].filter(c => cnt[c]);
    if (cols.length < 2) return '';
    return `<div class="brand-chips color-chips">${[['all', '全部色系'], ...cols.map(c => [c, `${COLOR_NAME[c]} ${cnt[c]}`])].map(([k, n]) => `<button class="chip small${k === curColor ? ' active' : ''}" data-c="${k}">${n}</button>`).join('')}</div>`;
  }
  const AORDER = ['lamp_pendant', 'lamp_table', 'lamp_floor', 'lamp_wall', 'lamp_ceiling', 'lamp_portable', 'sink', 'hob', 'dw', 'dryer', 'oven', 'hood', 'rack', 'rod', 'spice', 'knife', 'cup', 'util', 'basket', 'bath', 'towel', 'paper', 'mirror', 'mshelf', 'toothcup', 'soap', 'brush', 'hairdryer', 'grab', 'hook', 'bathacc', 'faucet', 'wallfaucet', 'basin', 'shower', 'showercol', 'slidebar', 'bidet', 'toilet', 'seat', 'washbasin', 'vanity', 'mirrorcab', 'showerdoor', 'urinal', 'bathtub', 'flushvalve', 'dryerfan', 'handdryer', 'bed', 'nightstand', 'sofa', 'armchair', 'coffeetable', 'sidetable', 'tvstand', 'diningtable', 'chair', 'barstool', 'studydesk', 'wardrobe', 'sofabed', 'daybed', 'footstool', 'bench', 'stool', 'bartable', 'officechair', 'dresser', 'drawers', 'bookcase', 'shelf', 'shoecab', 'kidsbed', 'bunkbed', 'cot', 'kidsdesk', 'kidstable', 'kidschair', 'highchair', 'kidsstorage', 'changingtable'];
  const HORDER = ['1', '15', '2', '21', '22', '3', '4', '5', '6', '65', '7', '75', '8'];
  const GORDER = ['desk', 'appl', 'dayday', 'daydayb', 'daydayf', 'toto', 'hcg', 'furn', 'ikea', 'muji', 'A', 'B', 'C', 'T', 'K', 'corner', 'hang', 'double', 'tri', 'filler', 'lamp'];
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
    if (it.kind === 'appl') return /^(furn|ikea|muji|lamp)$/.test(it.group) ? it.name : it.code;
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
    if (it.kind === 'appl') return it.group === 'lamp' ? `${esc(D.APPL_TYPES[it.at] || '')}　${it.dia === it.w ? 'Ø' + it.dia : 'W' + it.w} × H${it.h}` : /^(furn|ikea|muji)$/.test(it.group) ? `W${it.w} × D${it.d} × H${it.h}` : esc(D.APPL_TYPES[it.at] || '');
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
  /* 延遲載入的型錄（IKEA／無印良品／大吉熊／燈具，js/lazy.js）：
     點「家具」「燈具」「廚房／浴室設備」或搜尋時自動抓；「全部」不自動抓，清單上方放「載入完整型錄」按鈕 */
  function catalogMissing(q) {
    const L = window.Lazy; if (!L) return [];
    let need = [];
    if (q) need = L.CATALOG;
    else if (curFilter === 'furn') need = ['ikea', 'muji'];
    else if (curFilter === 'lamp') need = ['lamps'];
    else if (curFilter === 'appl') need = ['bear'];
    else if (curFilter === 'fav' && [...favs].some(c => !D.byCode[c])) need = L.CATALOG;
    return need.filter(n => !L.has(n));
  }
  let catError = '';
  // force＝使用者按「重試」；載入失敗後不自動重抓（避免 renderCatalog 失敗→重繪→再抓的迴圈），換分頁時會再試一次
  function loadCatalog(names, force) {
    const L = window.Lazy, list = (names || []).filter(n => !L.has(n) && !L.loading(n));
    if (!list.length || (catError && !force)) return;
    catError = '';
    L.load(list).then(() => { catError = ''; buildFilters(); UI.refreshCatalog(); if (UI.curTab === 'pricing') UI._renderPricing(); },
      e => { console.error(e); catError = e.message; renderCatalog(); });
  }
  UI.loadCatalog = () => loadCatalog(window.Lazy ? window.Lazy.CATALOG : []);
  function catalogNotice(q) {
    const L = window.Lazy; if (!L) return '';
    const loading = L.CATALOG.filter(n => L.loading(n)), notLoaded = L.CATALOG.filter(n => !L.has(n));
    if (catError) return `<div class="cat-lazy error">型錄載入失敗：${esc(catError)} <button class="btn small" data-lazy="1">重試</button></div>`;
    if (loading.length) return `<div class="cat-lazy">載入${loading.map(L.label).join('、')}中…</div>`;
    if (curFilter === 'all' && !q && notLoaded.length) return `<div class="cat-lazy">尚未載入：${notLoaded.map(L.label).join('、')} <button class="btn small" data-lazy="1">載入完整型錄</button></div>`;
    return '';
  }
  function renderCatalog() {
    const q = $('#catSearch').value.trim().toUpperCase();
    loadCatalog(catalogMissing(q));
    // 搜尋比對完整名稱（含櫃型，如「水槽」「吊」）與尺寸；設備可用型號、品牌搜尋
    // 尺寸搜尋不分順序：H320W300、W300H320、W600 D580 都可以（W 寬、D 深、H 高，單位 mm）
    const dimQ = /^(\s*[WDH]\s*\d+\s*)+$/.test(q) ? [...q.matchAll(/([WDH])\s*(\d+)/g)].map(m => [m[1], +m[2]]) : null;
    const dimOk = it => it.kind !== 'appl' && dimQ.every(([k, v]) => (k === 'W' ? it.w : k === 'D' ? it.d : it.h) === v);
    const match = it => !q || (dimQ ? dimOk(it) : it.code.toUpperCase().includes(q) || catName(it).toUpperCase().includes(q) || catDims(it).toUpperCase().includes(q)
      || (it.kind === 'appl' && (it.name.includes(q) || D.APPL_TYPES[it.at].includes(q) || it.brand.toUpperCase().includes(q))));
    const list = D.items.filter(it => (curFilter === 'all' || inGroup(it, curFilter)) && match(it) && (!['appl', 'furn', 'lamp'].includes(curFilter) || curBrand === 'all' || it.brand === curBrand)
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
      return GORDER.indexOf(ga) - GORDER.indexOf(gb) || (ga === 'appl' || ga === 'lamp' ? AORDER.indexOf(ha) - AORDER.indexOf(hb) : HORDER.indexOf(ha) - HORDER.indexOf(hb));
    });
    const openAll = !!q || keys.length <= 3;
    $('#catList').innerHTML = catalogNotice(q) + (keys.length ? keys.map((k, i) => {
      const [g, hc] = k.split('|');
      const its = groups.get(k);
      const title = /^(dayday|toto|hcg|furn|ikea|muji|lamp)/.test(g) ? D.APPL_TYPES[hc] : g === 'appl' ? '廚房設備｜' + D.APPL_TYPES[hc] : g === 'desk' ? '桌面' : g === 'filler' ? '補板' : groupTitle(g, hc);
      const sub = /^(dayday|toto|hcg|furn|ikea|muji)/.test(g) ? '' : g === 'appl' ? `${[...new Set(its.map(x => x.brand.split(' ')[0]))].join('、')} · ${its.length} 款` : g === 'desk' ? `${its.length} 款 · 依材質每才計價，尺寸可自訂` : g === 'filler' ? `${its.length} 款 · 補滿櫃體與牆之間的空隙，寬高深可自訂` : `${its.length} 款 · ${esc(g === 'K' ? '廚房電器櫃（電器抽可拉出）' : D.HEIGHT_USE[hc] || '')}`;
      return `<details class="cat-group"${openAll || i < 2 ? ' open' : ''}><summary><b>${esc(title)}</b><span>${sub}</span></summary>
        <div class="cat-grid">${its.map(it => `<div class="cat-item${it.code === pickedCode ? ' picked' : ''}${favs.has(it.code) ? ' is-fav' : ''}" draggable="true" data-code="${it.code}" title="${esc(tipOf(it))}"><button class="fav-btn" data-fav="${it.code}" title="${favs.has(it.code) ? '移出我的最愛' : '加入我的最愛'}">${favs.has(it.code) ? '★' : '☆'}</button>
          ${UI.thumb(it)}<span class="code">${wbrName(catName(it))}</span>${it.kind === 'desk' ? `<span class="dims">${catDims(it)}</span>` : `<span class="oldcode">${catSubline(it)}</span>`}<span class="price">${catPrice(it)}</span></div>`).join('')}</div></details>`;
    }).join('') : (catalogMissing(q).length ? '' : '<p class="muted" style="padding:12px">找不到符合的型號</p>'));
    $('#catList').onclick = e => {
      const lz = e.target.closest('[data-lazy]'); if (lz) { loadCatalog(window.Lazy.CATALOG, true); renderCatalog(); return; }
      const fb = e.target.closest('[data-fav]');
      if (fb) { e.stopPropagation(); UI.toggleFav(fb.dataset.fav); const on = favs.has(fb.dataset.fav); fb.textContent = on ? '★' : '☆'; fb.title = on ? '移出我的最愛' : '加入我的最愛'; fb.closest('.cat-item').classList.toggle('is-fav', on); const chip = document.querySelector('.chip[data-f="fav"]'); if (chip) chip.textContent = '★ 我的最愛' + (favs.size ? ' ' + favs.size : ''); App.toast(on ? '已加入我的最愛' : '已移出我的最愛'); if (curFilter === 'fav' && !on) renderCatalog(); return; }
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
    kidsbed: it => APPL_SVG.bed(it), cot: it => APPL_SVG.bed(it), kidsdesk: it => APPL_SVG.studydesk(it), kidstable: it => APPL_SVG.diningtable(it), kidschair: it => APPL_SVG.chair(it), highchair: it => APPL_SVG.barstool(it), kidsstorage: it => APPL_SVG.bookcase(it), changingtable: it => APPL_SVG.drawers(it),
    bunkbed: () => `<rect x="8" y="8" width="48" height="8" rx="2" fill="#f6efe3" stroke="${DK}"/><rect x="8" y="34" width="48" height="8" rx="2" fill="#f6efe3" stroke="${DK}"/><line x1="10" y1="4" x2="10" y2="60" stroke="${DK}" stroke-width="3"/><line x1="54" y1="4" x2="54" y2="60" stroke="${DK}" stroke-width="3"/><line x1="44" y1="16" x2="44" y2="60" stroke="${DK}"/><line x1="48" y1="16" x2="48" y2="60" stroke="${DK}"/>`,
    sofabed: it => APPL_SVG.sofa(it), daybed: it => APPL_SVG.bed(it), bartable: it => APPL_SVG.diningtable(it), dresser: it => APPL_SVG.studydesk(it), shoecab: it => APPL_SVG.nightstand(it),
    footstool: () => `<rect x="12" y="24" width="40" height="18" rx="4" fill="#d9c7b0" stroke="${DK}"/><line x1="16" y1="42" x2="16" y2="54" stroke="${DK}" stroke-width="2"/><line x1="48" y1="42" x2="48" y2="54" stroke="${DK}" stroke-width="2"/>`,
    stool: () => `<rect x="14" y="22" width="36" height="8" rx="3" fill="#e7d9bf" stroke="${DK}"/><line x1="18" y1="30" x2="16" y2="54" stroke="${DK}" stroke-width="2"/><line x1="46" y1="30" x2="48" y2="54" stroke="${DK}" stroke-width="2"/>`,
    bench: () => `<rect x="4" y="26" width="56" height="8" rx="2" fill="#e7d9bf" stroke="${DK}"/><line x1="10" y1="34" x2="10" y2="52" stroke="${DK}" stroke-width="2"/><line x1="54" y1="34" x2="54" y2="52" stroke="${DK}" stroke-width="2"/>`,
    officechair: () => `<rect x="20" y="8" width="24" height="22" rx="4" fill="#4a4a4a" stroke="${DK}"/><rect x="18" y="30" width="28" height="8" rx="3" fill="#4a4a4a" stroke="${DK}"/><line x1="32" y1="38" x2="32" y2="48" stroke="${DK}" stroke-width="3"/><path d="M14 56 L32 48 L50 56 M22 58 L32 48 L42 58" fill="none" stroke="${DK}" stroke-width="2"/>`,
    drawers: () => `<rect x="10" y="10" width="44" height="46" rx="2" fill="#f6efe3" stroke="${DK}"/><line x1="10" y1="25" x2="54" y2="25" stroke="${DK}"/><line x1="10" y1="40" x2="54" y2="40" stroke="${DK}"/><circle cx="32" cy="18" r="1.6" fill="${DK}"/><circle cx="32" cy="33" r="1.6" fill="${DK}"/><circle cx="32" cy="48" r="1.6" fill="${DK}"/>`,
    bookcase: () => `<rect x="12" y="4" width="40" height="56" fill="#f6efe3" stroke="${DK}"/><line x1="12" y1="18" x2="52" y2="18" stroke="${DK}"/><line x1="12" y1="32" x2="52" y2="32" stroke="${DK}"/><line x1="12" y1="46" x2="52" y2="46" stroke="${DK}"/><rect x="16" y="8" width="5" height="10" fill="${DK}"/><rect x="23" y="7" width="4" height="11" fill="${LN}"/><rect x="30" y="22" width="6" height="10" fill="${LN}"/>`,
    shelf: () => `<rect x="8" y="6" width="4" height="52" fill="${DK}"/><rect x="52" y="6" width="4" height="52" fill="${DK}"/><rect x="8" y="18" width="48" height="3" fill="${DK}"/><rect x="8" y="32" width="48" height="3" fill="${DK}"/><rect x="8" y="46" width="48" height="3" fill="${DK}"/>`,
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
    lamp_pendant: () => `<line x1="32" y1="4" x2="32" y2="22" stroke="${DK}"/><path d="M12 44 L32 22 L52 44 Z" fill="#f2f1ed" stroke="${DK}"/><circle cx="32" cy="48" r="4" fill="#ffd27a"/>`,
    lamp_table: () => `<rect x="24" y="54" width="16" height="4" fill="${DK}"/><line x1="32" y1="54" x2="32" y2="30" stroke="${DK}" stroke-width="2"/><path d="M14 30 L50 30 L42 10 L22 10 Z" fill="#f2f1ed" stroke="${DK}"/>`,
    lamp_floor: () => `<rect x="22" y="58" width="20" height="3" fill="${DK}"/><line x1="32" y1="58" x2="32" y2="22" stroke="${DK}" stroke-width="2"/><path d="M18 22 L46 22 L40 6 L24 6 Z" fill="#f2f1ed" stroke="${DK}"/>`,
    lamp_wall: () => `<rect x="6" y="26" width="6" height="14" fill="${DK}"/><line x1="12" y1="32" x2="30" y2="32" stroke="${DK}" stroke-width="2"/><path d="M30 20 A14 14 0 0 1 58 20 L58 36 L30 36 Z" fill="#f2f1ed" stroke="${DK}"/>`,
    lamp_ceiling: () => `<rect x="6" y="8" width="52" height="4" fill="${DK}"/><path d="M12 12 L52 12 L46 26 L18 26 Z" fill="#f2f1ed" stroke="${DK}"/>`,
    lamp_portable: () => `<rect x="26" y="50" width="12" height="6" fill="${DK}"/><line x1="32" y1="50" x2="32" y2="34" stroke="${DK}" stroke-width="2"/><path d="M16 34 A16 10 0 0 1 48 34 Z" fill="#f2f1ed" stroke="${DK}"/>`,
    slidedoor: () => `<rect x="6" y="6" width="52" height="4" fill="${DK}"/><rect x="8" y="10" width="26" height="46" fill="#f6efe3" stroke="${DK}"/><rect x="30" y="13" width="26" height="43" fill="#e8dcc8" stroke="${DK}"/><rect x="6" y="56" width="52" height="3" fill="${DK}"/><line x1="30" y1="28" x2="30" y2="38" stroke="${DK}" stroke-width="2"/>`,
    partition: () => `<rect x="22" y="4" width="20" height="56" fill="#f2f0eb" stroke="${DK}"/><line x1="22" y1="4" x2="42" y2="4" stroke="${DK}" stroke-width="2"/><path d="M26 10v44M38 10v44" stroke="${DK}" stroke-width=".4" opacity=".4"/>`,
    curtain: (it) => {
      const st = (it && it.cstyle) || 'wave', rail = `<rect x="6" y="5" width="52" height="4" rx="1" fill="${DK}"/>`;
      if (st === 'wave' || st === 'pleat' || st === 'sheer') { const fill = st === 'sheer' ? '#f4f6f8' : '#e6ddcc', op = st === 'sheer' ? ' opacity=".75"' : '', p = st === 'pleat' ? 5 : 8, top = [], bot = [], folds = []; for (let x = 8; x <= 56; x += 2) { const dy = 2.5 * Math.sin((x - 8) / p * Math.PI); top.push(`${x},${(11 + dy).toFixed(1)}`); bot.push(`${x},${(59 + dy).toFixed(1)}`); } for (let x = 8 + p; x < 56; x += 2 * p) folds.push(`<line x1="${x}" y1="12" x2="${x}" y2="58" stroke="${DK}" stroke-width=".5" opacity=".45"/>`); return rail + `<polygon points="${top.join(' ')} ${bot.reverse().join(' ')}" fill="${fill}"${op} stroke="${DK}" stroke-width=".8"/>` + folds.join(''); }
      if (st === 'roller') return rail + `<rect x="8" y="9" width="48" height="38" fill="#e6ddcc" stroke="${DK}" stroke-width=".8"/><rect x="8" y="47" width="48" height="3" fill="${DK}"/>`;
      if (st === 'zebra') return rail + `<rect x="8" y="9" width="48" height="40" fill="#e6ddcc" stroke="${DK}" stroke-width=".8"/>` + [14, 24, 34, 44].map(y => `<rect x="8" y="${y}" width="48" height="5" fill="#fff" opacity=".9"/>`).join('') + `<rect x="8" y="49" width="48" height="3" fill="${DK}"/>`;
      if (st === 'venetian') return rail + [...Array(10)].map((_, k) => `<rect x="8" y="${11 + k * 4.4}" width="48" height="2.4" rx="1" fill="#d9ccb5" stroke="${DK}" stroke-width=".4"/>`).join('') + `<line x1="52" y1="9" x2="52" y2="56" stroke="${DK}" stroke-width=".6"/>`;
      if (st === 'vertical') return rail + [...Array(7)].map((_, k) => `<rect x="${9 + k * 6.8}" y="9" width="5.5" height="50" fill="#e6ddcc" stroke="${DK}" stroke-width=".5"/>`).join('');
      if (st === 'roman') return rail + [9, 21, 33].map(y => `<path d="M8 ${y}h48v10q-24 4 -48 0z" fill="#e6ddcc" stroke="${DK}" stroke-width=".8"/>`).join('') + `<rect x="8" y="45" width="48" height="3" fill="${DK}"/>`;
      return rail + `<rect x="8" y="9" width="48" height="40" fill="#f1ebe0" stroke="${DK}" stroke-width=".8"/>` + [...Array(8)].map((_, k) => `<path d="M8 ${12 + k * 4.6}l4 1.5 4 -1.5 4 1.5 4 -1.5 4 1.5 4 -1.5 4 1.5 4 -1.5 4 1.5 4 -1.5 4 1.5 4 -1.5" fill="none" stroke="${DK}" stroke-width=".5"/>`).join('');
    },
    doorleaf: () => `<rect x="14" y="4" width="36" height="58" fill="#c9a27a" stroke="${DK}"/><rect x="18" y="8" width="28" height="50" fill="#d9b48c" stroke="${DK}" stroke-width=".8"/><circle cx="44" cy="34" r="2" fill="${DK}"/>`,
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
  UI._buildFilters = buildFilters;
  UI._renderCatalog = renderCatalog;
  /* 初始化（由 UI.init 呼叫） */
  UI._initCatalog = function () {
    buildFilters();
    $('#catSearch').addEventListener('input', renderCatalog);
    renderCatalog();
  };
})();
