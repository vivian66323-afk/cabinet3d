/* 延遲載入器：型錄資料、各廠商色板與少用模組不在首頁一開始載入，第一次用到時才抓。
   - 同一檔只抓一次、同一組（pack）只套用一次；檔名沿用 ?v= 版本字串（版本表在下方 FILES）
   - 以 fetch 取得原始碼後依序同步執行，確保一組多個檔（例如十個 swatches-*.js）之間不會穿插其他程式
   - 用法：Lazy.load('ikea').then(...)、await Lazy.ensure(['floors'], '載入品牌地板型錄…')（含忙碌遮罩與錯誤視窗）
   - Lazy.needsFor(state)：專案資料用到哪些尚未載入的資料組（匯入／雲端開啟／F5 還原前先載） */
(function () {
  const FILES = {
    'js/swatches-hemai.js': '20261022a',
    'js/swatches-silestone.js': '20261022a',
    'js/swatches-beihuaan.js': '20261022a',
    'js/swatches-gindiing.js': '20261022a',
    'js/swatches-lavi.js': '20261022a',
    'js/swatches-formica.js': '20261022a',
    'js/swatches-wilsonart.js': '20261022a',
    'js/swatches-egger.js': '20261022a',
    'js/swatches-solid.js': '20261022a',
    'js/swatches-quartz.js': '20261022a',
    'js/catalog-ikea.js': '20261012b',
    'js/catalog-muji.js': '20261012r',
    'js/catalog-bear.js': '20261012t',
    'js/catalog-lamps.js': '20261022a',
    'js/catalog-floors.js': '20261022a',
    'js/catalog-paint.js': '20261018b',
    'js/dxf.js': '20261022a',
    'js/dxfin.js': '20261022a',
    'js/airender.js': '20261007x',
    'js/swatchadmin.js': '20261007x'
  };
  // 資料組：files 依序執行；after 在全部執行完後呼叫（併入 DATA／色板庫）；isolate＝執行期間暫時清空該全域變數，只收集這組新增的內容
  const PACKS = {
    ikea: { label: 'IKEA 家具型錄', files: ['js/catalog-ikea.js'], after: () => window.DATA.addPack('ikea') },
    muji: { label: '無印良品家具型錄', files: ['js/catalog-muji.js'], after: () => window.DATA.addPack('muji') },
    bear: { label: '大吉熊水槽／龍頭型錄', files: ['js/catalog-bear.js'], after: () => window.DATA.addPack('bear') },
    lamps: { label: '燈具型錄', files: ['js/catalog-lamps.js'], after: () => window.DATA.addPack('lamps') },
    floors: { label: '品牌木地板型錄', files: ['js/catalog-floors.js'], after: () => window.DATA.addPack('floors') },
    paint: { label: '塗料色卡', files: ['js/catalog-paint.js'], after: () => window.DATA.addPack('paint') },
    swatches: {
      label: '各廠商色板', isolate: 'SWATCHES',
      files: ['js/swatches-hemai.js', 'js/swatches-silestone.js', 'js/swatches-beihuaan.js', 'js/swatches-gindiing.js', 'js/swatches-lavi.js', 'js/swatches-formica.js', 'js/swatches-wilsonart.js', 'js/swatches-egger.js', 'js/swatches-solid.js', 'js/swatches-quartz.js'],
      after: added => window.SwatchLib.addBuiltin(added)
    },
    airender: { label: '3D 渲染模組', files: ['js/airender.js'] },
    dxf: { label: 'DXF 施工圖模組', files: ['js/dxf.js'] },
    dxfin: { label: 'DXF 底圖模組', files: ['js/dxf.js', 'js/dxfin.js'] },
    swatchadmin: { label: '色板維護模組', files: ['js/swatchadmin.js'] }
  };
  const CATALOG = ['ikea', 'muji', 'bear', 'lamps'];   // 左側型錄面板用到的四組

  const Lazy = { PACKS, CATALOG };
  const texts = new Map();      // file → Promise<string>
  const executed = new Set();   // 已執行過的檔
  const done = new Set();       // 已套用的 pack
  const pending = new Map();    // pack → Promise

  const urlOf = file => file + (FILES[file] ? '?v=' + FILES[file] : '');
  function fetchText(file) {
    if (!texts.has(file)) {
      const p = fetch(urlOf(file), { credentials: 'same-origin' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .catch(e => { texts.delete(file); throw new Error(`無法下載 ${file}（${e.message}），請確認網路連線後再試`); });
      texts.set(file, p);
    }
    return texts.get(file);
  }
  function run(file, code) {
    if (executed.has(file)) return;
    try { (0, eval)(code + '\n//# sourceURL=' + new URL(urlOf(file), location.href).href); }
    catch (e) { console.error(file, e); throw new Error(`${file} 執行錯誤：${e.message}`); }
    executed.add(file);
  }

  Lazy.has = name => done.has(name);
  Lazy.loading = name => pending.has(name);
  Lazy.label = name => (PACKS[name] || {}).label || name;
  // 載入一組或多組；回傳 Promise（失敗時可重試）
  Lazy.load = function (names) {
    const list = (Array.isArray(names) ? names : [names]).filter(n => n && !done.has(n));
    return Promise.all(list.map(name => {
      const p = PACKS[name];
      if (!p) return Promise.reject(new Error('未定義的資料組：' + name));
      if (!pending.has(name)) {
        const job = Promise.all(p.files.map(fetchText)).then(codes => {
          const files = p.files.filter(f => !executed.has(f));
          let added = null;
          if (p.isolate) {
            const prev = window[p.isolate]; window[p.isolate] = [];
            try { files.forEach(f => run(f, codes[p.files.indexOf(f)])); added = window[p.isolate]; }
            finally { window[p.isolate] = prev; }
          } else files.forEach(f => run(f, codes[p.files.indexOf(f)]));
          if (p.after) p.after(added);
          done.add(name); pending.delete(name);
        }).catch(e => { pending.delete(name); throw e; });
        pending.set(name, job);
      }
      return pending.get(name);
    })).then(() => undefined);
  };
  // UI 用：顯示忙碌遮罩、失敗時跳出可讀的錯誤視窗；回傳 true＝已載好
  Lazy.ensure = async function (names, text) {
    const list = (Array.isArray(names) ? names : [names]).filter(n => n && !done.has(n));
    if (!list.length) return true;
    const App = window.App, busy = !!(App && App.busy && document.getElementById('busy'));
    if (busy) App.busy(true, text || '載入資料…');
    try { await Lazy.load(list); return true; }
    catch (e) {
      console.error(e);
      const msg = `${list.map(Lazy.label).join('、')}載入失敗：${e.message}`;
      if (App && App.ui && App.ui.alert) App.ui.alert('載入失敗', msg); else alert(msg);
      return false;
    } finally { if (busy) App.busy(false); }
  };
  // 專案資料會用到、但還沒載入的資料組（設備型號→型錄；色號→廠商色板；地板→品牌地板）
  Lazy.needsFor = function (st) {
    const D = window.DATA, need = new Set();
    if (!st || !D) return [];
    const cabs = [...(st.cabinets || []), ...(st.floors || []).flatMap(f => (f && f.cabinets) || [])];
    const COLOR_KEYS = ['bodyColor', 'doorColor', 'topColor', 'kickColor'];
    const mats = new Set();
    cabs.forEach(c => {
      if (!c) return;
      COLOR_KEYS.forEach(k => { if (c[k]) mats.add(String(c[k])); });
      if (c.kind === 'appl' && !D.byCode[c.code]) {
        const code = String(c.code || '');
        if (/^IK\d/.test(code)) need.add('ikea');
        else if (/^MJ\d/.test(code)) need.add('muji');
        else CATALOG.forEach(n => need.add(n));   // 大吉熊、燈具的型號沒有固定前綴：四組都載，確定不會漏
      }
    });
    COLOR_KEYS.forEach(k => { const v = (st.defaults || {})[k]; if (v) mats.add(String(v)); });
    const plain = new Set(((st.pricing || {}).materials || []).filter(m => m && !m.tex).map(m => m.code));
    const known = c => D.SWATCH_BY_CODE[c] || plain.has(c) || D.MATERIALS.some(m => m.code === c);
    if ([...mats].some(c => !known(c))) need.add('swatches');
    [st.room, ...(st.floors || []).map(f => f && f.room)].forEach(r => { if (r && r.floor && !D.FLOORS.some(f => f.id === r.floor)) need.add('floors'); });
    return [...need].filter(n => !done.has(n));
  };

  window.Lazy = Lazy;
})();
