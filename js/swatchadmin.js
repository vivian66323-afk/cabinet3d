/* 色板維護介面：新增 / 修改 / 刪除色板、Excel／CSV／ZIP／圖片批次匯入、匯出、匯入範本 */
(function () {
  const UI = window.UI, Lib = window.SwatchLib;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = n => UI.icon(n);
  const BRAND = s => s.brand || '自訂';
  const BADGE = s => s.builtin ? (s.modified ? '<span class="swb mod">已修改</span>' : '<span class="swb">內建</span>') : '<span class="swb own">自訂</span>';

  // 入口：畫面上任何 [data-swadmin] 按鈕
  document.addEventListener('click', e => { const b = e.target.closest('[data-swadmin]'); if (b) { e.preventDefault(); UI.swatchAdmin(); } });

  // 純色 → 貼圖（沒有圖片時使用）
  function solidImg(hex) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 40;
    const g = c.getContext('2d'); g.fillStyle = hex; g.fillRect(0, 0, 64, 40);
    return c.toDataURL('image/png');
  }

  /* ---------- 主畫面 ---------- */
  UI.swatchAdmin = async function () {
    await Lib.init();
    let q = '', series = 'all', brand = 'all', view = 'list';
    await UI.modal({
      title: '色板維護', cls: 'swadm',
      body: `<p class="muted" style="margin:0 0 8px;font-size:12px">色板存在這台電腦的瀏覽器，關閉網站後仍會保留；儲存專案時，專案用到的自訂色板會一併寫入 .json。</p>
        <div class="swadm-bar">
          <input class="swadm-q" placeholder="搜尋色號 / 名稱">
          <select class="swadm-b" title="廠商"></select>
          <select class="swadm-s"></select>
          <button class="btn small primary" data-sa="add">${icon('plus')}新增色板</button>
          <button class="btn small" data-sa="import">批次匯入（Excel／圖片）</button>
          <button class="btn small" data-sa="export">匯出（Excel＋圖片 ZIP）</button>
          <button class="btn small" data-sa="batch">批次設定單價</button>
          <button class="btn small link" data-sa="template">下載匯入範本</button>
        </div>
        <div class="swadm-sub"></div>
        <div class="swadm-grid"></div>`,
      buttons: [{ label: '關閉', primary: true, value: 'ok' }],
      onOpen: back => {
        const grid = back.querySelector('.swadm-grid'), sub = back.querySelector('.swadm-sub'), sel = back.querySelector('.swadm-s'), selB = back.querySelector('.swadm-b');
        const render = () => {
          const all = Lib.list(), hidden = Lib.hidden();
          const bs = [...new Set(all.map(BRAND))];
          if (brand !== 'all' && !bs.includes(brand)) brand = 'all';
          selB.innerHTML = `<option value="all">全部廠商</option>${bs.map(b => `<option${b === brand ? ' selected' : ''}>${esc(b)}</option>`).join('')}`;
          const ss = [...new Set(all.filter(s => brand === 'all' || BRAND(s) === brand).map(s => s.series || '自訂色板'))];
          if (series !== 'all' && !ss.includes(series)) series = 'all';
          sel.innerHTML = `<option value="all">全部系列</option>${ss.map(s => `<option${s === series ? ' selected' : ''}>${esc(s)}</option>`).join('')}`;
          const kw = q.trim().toUpperCase();
          const nOwn = all.filter(s => !s.builtin).length, nMod = all.filter(s => s.modified).length, nPr = all.filter(s => s.price != null).length;
          const def = App.state.pricing.caiDefault != null ? App.state.pricing.caiDefault : 100;
          sub.innerHTML = `<span>共 <b>${all.length}</b> 色（自訂 ${nOwn}、已修改 ${nMod}）　已設定單價 <b>${nPr}</b>／${all.length}，未設定者用預設單價 ${def} 元/才</span>
            <button class="chip${view === 'list' ? ' active' : ''}" data-sv="list">色板</button>
            <button class="chip${view === 'hidden' ? ' active' : ''}" data-sv="hidden">已刪除的內建色板 ${hidden.length}</button>
            ${nOwn + nMod + hidden.length ? '<button class="btn small link danger-link" data-sa="reset">全部還原為原始色板</button>' : ''}`;
          const list = view === 'hidden' ? hidden.map(s => ({ ...s, builtin: true })) : filtered(all);
          grid.innerHTML = list.length ? list.map(s => `<div class="swadm-card${view === 'hidden' ? ' gone' : ''}">
              <div class="swadm-img" style="background-image:url('${s.thumb || s.img || solidImg(s.hex || '#ccc')}')"></div>
              <div class="swadm-info"><div class="swadm-t"><b>${esc(s.code)}</b>${BADGE(s)}</div><span>${esc(s.name)}</span><small>${esc(BRAND(s))}｜${esc(s.series || '')}　${esc(s.hex || '')}</small></div>
              ${view === 'hidden' ? '' : `<label class="swadm-price">單價<input type="number" min="0" step="1" data-price="${esc(s.code)}" value="${s.price != null ? s.price : ''}" placeholder="${def}">元/才</label>`}
              <div class="swadm-acts">${view === 'hidden' ? `<button class="btn small" data-sa="restore" data-c="${esc(s.code)}">還原</button>`
                : `<button class="btn small" data-sa="edit" data-c="${esc(s.code)}">修改</button>${s.modified ? `<button class="btn small" data-sa="restore" data-c="${esc(s.code)}" title="還原為內建原始色板">還原</button>` : ''}<button class="btn small danger" data-sa="del" data-c="${esc(s.code)}">刪除</button>`}</div></div>`).join('')
            : `<p class="muted" style="padding:16px">${view === 'hidden' ? '沒有被刪除的內建色板。' : '找不到色板。'}</p>`;
        };
        const filtered = all => { const kw = q.trim().toUpperCase(); return all.filter(s => (brand === 'all' || BRAND(s) === brand) && (series === 'all' || (s.series || '自訂色板') === series) && (!kw || (s.code + s.name + (s.en || '')).toUpperCase().includes(kw))); };
        back.querySelector('.swadm-q').addEventListener('input', e => { q = e.target.value; render(); });
        selB.addEventListener('change', e => { brand = e.target.value; series = 'all'; render(); });
        sel.addEventListener('change', e => { series = e.target.value; render(); });
        // 卡片上直接修改單價
        back.addEventListener('change', async e => {
          const inp = e.target.closest('[data-price]'); if (!inp) return;
          const v = inp.value.trim();
          if (v !== '' && Lib.priceOf(v) == null) { App.toast('單價需為 0 以上的數字'); return; }
          await Lib.setPrices({ [inp.dataset.price]: v });
          App.toast(v === '' ? `${inp.dataset.price} 改用預設單價` : `${inp.dataset.price} 單價 ${Lib.priceOf(v)} 元/才`);
          const pos = grid.scrollTop; render(); grid.scrollTop = pos;
        });
        back.addEventListener('click', async e => {
          const sv = e.target.closest('[data-sv]'); if (sv) { view = sv.dataset.sv; render(); return; }
          const b = e.target.closest('[data-sa]'); if (!b) return;
          const code = b.dataset.c, a = b.dataset.sa;
          if (a === 'add') { if (await UI.swatchEdit(null, brand !== 'all' ? brand : '')) render(); }
          else if (a === 'edit') { if (await UI.swatchEdit(Lib.get(code))) render(); }
          else if (a === 'del') {
            const s = Lib.get(code);
            const usedHere = isUsed(code);
            if (await UI.confirm('刪除色板', `刪除「${code} ${s.name}」？${s.builtin ? '（內建色板可在「已刪除的內建色板」還原）' : '自訂色板刪除後無法復原。'}${usedHere ? '\n目前專案有櫃體使用此色號，刪除後這些櫃體會改以色碼顯示。' : ''}`)) { await Lib.remove(code); App.toast(`已刪除色板 ${code}`); render(); }
          } else if (a === 'restore') { await Lib.restore(code); App.toast(`已還原色板 ${code}`); render(); }
          else if (a === 'reset') {
            if (await UI.confirm('全部還原', '刪除所有自訂色板、還原所有已修改或已刪除的內建色板？此動作無法復原（建議先按「匯出」備份）。')) { await Lib.resetAll(); App.toast('已還原為原始色板'); render(); }
          } else if (a === 'import') { if (await UI.swatchImport()) render(); }
          else if (a === 'export') exportZip();
          else if (a === 'batch') {
            const target = filtered(Lib.list());
            const res = await UI.modal({ title: '批次設定單價', body: `<p>套用到目前畫面篩選出的 <b>${target.length}</b> 個色板${brand !== 'all' ? `（廠商：${esc(brand)}）` : ''}${series !== 'all' ? `（系列：${esc(series)}）` : ''}。</p><div class="kv"><label>單價</label><div class="inline"><input type="number" name="price" min="0" step="1" placeholder="空白＝清除，改用預設單價"><span class="unit">元/才</span></div></div>`,
              buttons: [{ label: '取消', value: null }, { label: '套用', primary: true, value: 'ok' }],
              validate: d => d.price.trim() !== '' && Lib.priceOf(d.price) == null ? '單價需為 0 以上的數字' : null });
            if (res) { const m = {}; target.forEach(s => { m[s.code] = res.data.price.trim(); }); await Lib.setPrices(m); App.toast(`已設定 ${target.length} 個色板單價`); render(); }
          }
          else if (a === 'template') downloadTemplate();
        });
        render();
      }
    });
  };
  function isUsed(code) {
    const st = App.state; let hit = false;
    const scan = cabs => (cabs || []).forEach(c => { if ([c.bodyColor, c.doorColor, c.topColor, c.kickColor].includes(code)) hit = true; });
    scan(st.cabinets); (st.floors || []).forEach(f => scan(f.cabinets));
    return hit;
  }

  /* ---------- 新增 / 修改 ---------- */
  UI.swatchEdit = async function (sw, brandHint) {
    const isNew = !sw;
    sw = sw || { code: '', name: '', brand: brandHint || '', series: '', hex: '#c8b89a', img: '' };
    const seriesList = [...new Set(Lib.list().map(s => s.series).filter(Boolean))];
    const brandList = [...new Set(Lib.list().map(BRAND))];
    let img = sw.img, hex = sw.hex || '#cccccc';
    const res = await UI.modal({
      title: isNew ? '新增色板' : `修改色板 ${esc(sw.code)}`, cls: 'swedit-m',
      body: `<div class="swedit">
          <div class="swedit-pic" title="點選或拖曳圖片到這裡"><div class="swedit-img"></div><span>點選或拖曳圖片<br><small>JPG / PNG，自動裁成 640×400</small></span><input type="file" accept="image/*" hidden></div>
          <div class="kv">
            <label>色號</label><input name="code" value="${esc(sw.code)}"${isNew ? '' : ' readonly class="ro"'} placeholder="例如 A101" autocomplete="off">
            <label>名稱</label><input name="name" value="${esc(sw.name)}" placeholder="例如 雪白橡木">
            <label>廠商</label><input name="brand" value="${esc(sw.brand || '')}" list="swBrandList" placeholder="例如 伸保、禾邁"><datalist id="swBrandList">${brandList.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
            <label>系列</label><input name="series" value="${esc(sw.series || '')}" list="swSeriesList" placeholder="例如 木紋系列"><datalist id="swSeriesList">${seriesList.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
            <label>單價</label><div class="inline"><input type="number" name="price" min="0" step="1" value="${sw.price != null ? sw.price : ''}" placeholder="${App.state.pricing.caiDefault != null ? App.state.pricing.caiDefault : 100}"><span class="unit">元/才（1 才＝303mm×303mm；空白＝預設單價）</span></div>
            <label>圖片紋路</label><div class="inline"><select name="imgGrain" style="width:auto">${[['', '自動偵測'], ['h', '橫向（紋路左右走）'], ['v', '直向（紋路上下走）']].map(([k, n]) => `<option value="${k}"${(sw.imgGrain || '') === k ? ' selected' : ''}>${n}</option>`).join('')}</select><span class="unit">圖片本身的紋路方向；櫃體的直紋／橫紋在右側色板區設定</span></div>
            <label>色碼</label><div class="inline"><input type="color" name="hexpick" value="${esc(hex)}" style="width:44px;padding:0 2px"><input name="hex" value="${esc(hex)}" style="width:100px"><span class="unit">無圖片時以色碼顯示</span></div>
            <label>圖片網址</label><div class="inline"><input name="url" placeholder="或貼上圖片網址 https://…"><button type="button" class="btn small" data-url="1">載入</button></div>
          </div></div>`,
      buttons: [{ label: '取消', value: null }, { label: isNew ? '新增' : '儲存', primary: true, value: 'ok' }],
      onOpen: back => {
        const pic = back.querySelector('.swedit-pic'), box = back.querySelector('.swedit-img'), file = pic.querySelector('input');
        const hexIn = back.querySelector('[name=hex]'), hexPick = back.querySelector('[name=hexpick]');
        const show = () => { box.style.backgroundImage = img ? `url(${img})` : 'none'; box.style.backgroundColor = hex; pic.classList.toggle('has', !!img); };
        const load = async src => {
          try { back.querySelector('.err').textContent = '處理圖片中…'; const r = await Lib.processImage(src); img = r.img; hex = r.hex; hexIn.value = hex; hexPick.value = hex; back.querySelector('.err').textContent = ''; show(); }
          catch (e) { back.querySelector('.err').textContent = e.message; }
        };
        pic.addEventListener('click', () => file.click());
        file.addEventListener('change', () => { if (file.files[0]) load(file.files[0]); });
        pic.addEventListener('dragover', e => { e.preventDefault(); pic.classList.add('drag'); });
        pic.addEventListener('dragleave', () => pic.classList.remove('drag'));
        pic.addEventListener('drop', e => { e.preventDefault(); pic.classList.remove('drag'); const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (f) load(f); });
        back.querySelector('[data-url]').addEventListener('click', () => { const u = back.querySelector('[name=url]').value.trim(); if (u) load(u); });
        hexPick.addEventListener('input', () => { hex = hexPick.value; hexIn.value = hex; show(); });
        hexIn.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(hexIn.value)) { hex = hexIn.value; hexPick.value = hex; show(); } });
        show();
      },
      validate: d => {
        const code = d.code.trim();
        if (!code) return '請輸入色號';
        if (/[\s"'<>]/.test(code)) return '色號不可包含空白或引號';
        if (isNew && Lib.get(code)) return `色號 ${code} 已存在`;
        if (isNew && window.DATA.MATERIALS.some(m => m.code === code && !m.tex)) return `色號 ${code} 與型錄規格色重複`;
        if (!d.name.trim()) return '請輸入名稱';
        if (!/^#[0-9a-f]{6}$/i.test(d.hex.trim())) return '色碼格式應為 #RRGGBB';
        if (d.price.trim() !== '' && Lib.priceOf(d.price) == null) return '單價需為 0 以上的數字';
        return null;
      }
    });
    if (!res) return false;
    const d = res.data;
    await Lib.save({ imgGrain: d.imgGrain, code: d.code.trim(), name: d.name.trim(), brand: d.brand.trim() || '自訂', series: d.series.trim() || '自訂色板', hex: d.hex.trim().toLowerCase(), img: img || solidImg(d.hex.trim()), en: sw.en || '', price: d.price.trim() });
    App.toast(isNew ? `已新增色板 ${d.code.trim()}` : `已儲存色板 ${d.code.trim()}`);
    return true;
  };

  /* ---------- Excel / CSV / ZIP / 圖片 匯入 ---------- */
  const COLS = { code: /^(色號|色板編號|編號|代號|code|no\.?)$/i, name: /^(名稱|色名|品名|name)$/i, img: /^(圖片|圖檔|照片|檔名|圖片檔名|image|img|picture|file)$/i, series: /^(系列|分類|類別|series|category)$/i, brand: /^(廠商|品牌|供應商|板材廠商|brand|vendor|supplier)$/i, hex: /^(色碼|顏色|hex|color)$/i, price: /^(單價|價格|售價|每才單價|每才售價|price|單價\(元\/才\)|單價（元\/才）|每才單價（元）)$/i };
  const HEAD = ['廠商', '色號', '名稱', '系列', '色碼', '單價', '圖片'];
  const baseName = s => String(s).split(/[\\/]/).pop().trim().toLowerCase();
  const isImg = n => /\.(jpe?g|png|webp|gif|bmp)$/i.test(n);
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; };

  // SheetJS 用到才載入（約 900KB）
  let xlsxP = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return xlsxP || (xlsxP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => res(window.XLSX);
      s.onerror = () => { xlsxP = null; rej(new Error('Excel 元件載入失敗，請確認網路連線（或改用 CSV）')); };
      document.head.appendChild(s);
    }));
  }
  async function readXLSX(buf) {
    const X = await loadXLSX();
    const wb = X.read(buf, { type: 'array' });
    const ws = wb.Sheets['色板'] || wb.Sheets[wb.SheetNames[0]];
    return X.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).filter(r => r.some(c => String(c).trim() !== ''));
  }
  async function writeXLSX(rows, extraSheets = []) {
    const X = await loadXLSX();
    const wb = X.utils.book_new();
    const ws = X.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 26 }, { wch: 14 }];
    X.utils.book_append_sheet(wb, ws, '色板');
    extraSheets.forEach(([name, aoa, cols]) => { const s = X.utils.aoa_to_sheet(aoa); if (cols) s['!cols'] = cols; X.utils.book_append_sheet(wb, s, name); });
    return new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  async function readSources(files) {
    const images = new Map(), imgFiles = []; let table = null, tableName = '';
    const addImg = (name, blob) => {
      const k = baseName(name);
      if (images.has(k)) return;
      images.set(k, blob); images.set(k.replace(/\.[^.]+$/, ''), blob);
      imgFiles.push({ name: String(name).split(/[\\/]/).pop(), blob });
    };
    const addTable = async (name, buf) => {
      if (table) return;
      const n = name.toLowerCase();
      table = /\.xlsx?$/.test(n) ? await readXLSX(buf) : Lib.parseCSV(Lib.decodeText(buf));
      tableName = name.split(/[\\/]/).pop();
    };
    for (const f of files) {
      const n = f.name.toLowerCase();
      if (/\.(csv|xlsx|xls)$/.test(n)) await addTable(f.name, await f.arrayBuffer());
      else if (n.endsWith('.zip')) {
        if (!window.JSZip) throw new Error('無法讀取 ZIP（JSZip 未載入）');
        const zip = await window.JSZip.loadAsync(f);
        for (const [path, ent] of Object.entries(zip.files)) {
          if (ent.dir || /__MACOSX|(^|\/)\.|~\$/.test(path)) continue;
          if (/\.(csv|xlsx|xls)$/i.test(path)) await addTable(path, await ent.async('arraybuffer'));
          else if (isImg(path)) addImg(path, await ent.async('blob'));
        }
      } else if (f.type.startsWith('image/') || isImg(n)) addImg(f.name, f);
    }
    return { table, tableName, images, imgFiles };
  }
  function mapRows(rows) {
    if (!rows.length) throw new Error('表格沒有資料');
    const head = rows[0].map(h => String(h).trim());
    const idx = {}; Object.entries(COLS).forEach(([k, re]) => { idx[k] = head.findIndex(h => re.test(h)); });
    let body = rows.slice(1);
    if (idx.code < 0) { idx.code = 0; idx.name = 1; idx.img = 2; idx.series = -1; idx.hex = -1; idx.price = -1; idx.brand = -1; body = rows; } // 無標題列：色號,名稱,圖片
    const cell = (r, k) => idx[k] >= 0 ? String(r[idx[k]] == null ? '' : r[idx[k]]).trim() : '';
    return body.map((r, i) => ({ line: i + (body === rows ? 1 : 2), brand: cell(r, 'brand'), code: cell(r, 'code'), name: cell(r, 'name'), img: cell(r, 'img'), series: cell(r, 'series'), hex: cell(r, 'hex'), price: cell(r, 'price').replace(/[,$元\s]/g, '') }));
  }
  // 只有圖片：檔名「色號.jpg」或「色號_名稱.jpg」（底線或空白分隔）
  function rowsFromImages(imgFiles, opt) {
    return imgFiles.map((f, i) => {
      const stem = f.name.replace(/\.[^.]+$/, '').trim();
      const m = /^([^_\s]+)(?:[_\s]+(.+))?$/.exec(stem) || [stem, stem, ''];
      const isNew = !Lib.get(m[1]);   // 系列／單價只套用到新色板
      return { line: i + 1, brand: '', code: m[1], name: (m[2] || '').trim(), img: f.name, series: isNew ? opt.series || '' : '', hex: '', price: isNew ? opt.price || '' : '', fromImg: true };
    });
  }

  UI.swatchImport = async function () {
    let parsed = null, srcs = null;
    const res = await UI.modal({
      title: '匯入色板（Excel／CSV／圖片）', cls: 'swimp',
      body: `<div class="swimp-help">
          <p><b>方法一：填表＋圖片</b>　先按「下載匯入範本」，在 Excel 填好 <code>廠商</code>、<code>色號</code>、<code>名稱</code>、<code>系列</code>、<code>單價</code>（元/才），把圖片放進同一個資料夾，再把<b>整個資料夾</b>（或壓成 ZIP）拖進來。</p>
          <p><b>方法二：只有圖片</b>　圖片檔名取成 <code>色號.jpg</code> 或 <code>色號_名稱.jpg</code>（例 <code>A101_雪白橡木.jpg</code>），整批拖進來即可；已存在的色號只換圖片。</p>
          <p><b>不同廠商</b>　整批匯入某廠商（例 禾邁）時，在下方「廠商」填一次即可；色號和其他廠商重複時會自動改成 <code>禾邁-110</code>，不會覆蓋伸保的 110。</p>
          <p><b>只改單價</b>　按「匯出」得到的 Excel 改「單價」欄後直接匯入（不必附圖片，原圖保留）。</p>
          <p class="muted">「圖片」欄可填檔名、網址 https://…，或留空（自動找與色號同名的圖片，找不到就保留原圖或用色碼）。圖片會自動裁成 640×400。1 才＝303mm×303mm（1 台尺見方），每片板材無條件進位。</p></div>
        <div class="swimp-drop"><input type="file" class="f-files" multiple accept=".xlsx,.xls,.csv,.zip,image/*" hidden><input type="file" class="f-dir" webkitdirectory multiple hidden>
          <b>拖曳檔案或資料夾到這裡</b><br><small>Excel／CSV＋圖片、整個資料夾、ZIP，或只有圖片</small>
          <div class="swimp-pick"><button type="button" class="btn small" data-pick="files">選擇檔案</button><button type="button" class="btn small" data-pick="dir">選擇資料夾</button></div></div>
        <div class="swimp-opts"><label class="inline">廠商 <input name="brand" list="swImpBrands" placeholder="例 禾邁（表格沒填廠商時使用）" style="width:230px"><datalist id="swImpBrands">${[...new Set(Lib.list().map(BRAND))].map(b => `<option value="${esc(b)}">`).join('')}</datalist></label>
          <label class="inline"><input type="checkbox" name="overwrite" checked style="width:auto"> 同廠商色號已存在時覆蓋（修改）</label>
          <label class="inline"><input type="checkbox" name="prefix" checked style="width:auto"> 與其他廠商色號重複時，色號前加「廠商-」</label>
          <span class="swimp-imgopt" hidden>只有圖片時，新色板的　系列 <input name="imgSeries" placeholder="自訂色板" style="width:110px">　單價 <input name="imgPrice" type="number" min="0" step="1" placeholder="預設" style="width:80px"> 元/才</span></div>
        <div class="swimp-preview"></div>`,
      buttons: [{ label: '取消', value: null }, { label: '匯入', primary: true, value: 'ok' }],
      onOpen: back => {
        const drop = back.querySelector('.swimp-drop'), pv = back.querySelector('.swimp-preview');
        const fFiles = back.querySelector('.f-files'), fDir = back.querySelector('.f-dir'), imgOpt = back.querySelector('.swimp-imgopt');
        const val = n => back.querySelector(`[name=${n}]`);
        const draw = () => {
          if (!srcs) return;
          const raw = srcs.imgOnly ? rowsFromImages(srcs.imgFiles, { series: val('imgSeries').value.trim(), price: val('imgPrice').value.trim() }) : srcs.rows;
          parsed = resolveRows(raw, { brand: val('brand').value.trim(), prefix: val('prefix').checked });
          let ok = 0;
          const nImg = srcs.imgFiles.length;
          pv.innerHTML = `<p><b>${esc(srcs.imgOnly ? '只有圖片（依檔名建立）' : srcs.tableName)}</b>：${parsed.length} 筆、圖片 ${nImg} 張</p><table class="swimp-table"><thead><tr><th>列</th><th>廠商</th><th>色號</th><th>名稱</th><th>系列</th><th>單價</th><th>圖片</th><th>狀態</th></tr></thead><tbody>${parsed.map(r => {
            const st = rowStatus(r, srcs.images, val('overwrite').checked);
            if (st.ok) ok++;
            return `<tr class="${st.ok ? '' : 'bad'}"><td>${r.line}</td><td>${esc(r.brand)}</td><td>${esc(r.code)}</td><td>${esc(r.name || (Lib.get(r.code) || {}).name || '')}</td><td>${esc(r.series)}</td><td>${esc(r.price)}</td><td>${esc(st.imgText)}</td><td>${st.text}</td></tr>`;
          }).join('')}</tbody></table>`;
          back.querySelector('.mfoot .btn.primary').textContent = `匯入 ${ok} 筆`;
        };
        const handle = async files => {
          pv.innerHTML = '<p class="muted">讀取中…</p>';
          try {
            srcs = await readSources([...files]);
            if (srcs.table) { srcs.imgOnly = false; srcs.rows = mapRows(srcs.table); }
            else if (srcs.imgFiles.length) srcs.imgOnly = true;
            else throw new Error('沒有找到 Excel／CSV 或圖片檔');
            imgOpt.hidden = !srcs.imgOnly;
            draw();
          } catch (e) { parsed = null; srcs = null; pv.innerHTML = `<p class="note danger">${esc(e.message)}</p>`; }
        };
        ['brand', 'imgSeries', 'imgPrice'].forEach(n => val(n).addEventListener('input', draw));
        ['overwrite', 'prefix'].forEach(n => val(n).addEventListener('change', draw));
        back.querySelector('[data-pick=files]').addEventListener('click', e => { e.stopPropagation(); fFiles.click(); });
        back.querySelector('[data-pick=dir]').addEventListener('click', e => { e.stopPropagation(); fDir.click(); });
        [fFiles, fDir].forEach(inp => inp.addEventListener('change', () => inp.files.length && handle(inp.files)));
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
        drop.addEventListener('drop', async e => {
          e.preventDefault(); drop.classList.remove('drag');
          const files = await droppedFiles(e.dataTransfer);
          if (files.length) handle(files);
        });
      },
      validate: async d => {
        if (!parsed) return '請先選擇檔案';
        const todo = parsed.filter(r => rowStatus(r, srcs.images, d.overwrite).ok);
        if (!todo.length) return '沒有可匯入的資料';
        const out = [], errs = [], priceOnly = {};
        const err = document.querySelector('.modal.swimp .err');
        for (let i = 0; i < todo.length; i++) {
          const r = todo[i], old = Lib.get(r.code), src = imageSource(r, srcs.images);
          err.textContent = `處理 ${i + 1} / ${todo.length}…`;
          if (old && !src && !changedInfo(r, old)) { priceOnly[r.code] = r.price; continue; }   // 只改單價：不動圖片、不把內建色板標成已修改
          try {
            let img = '', hex = /^#[0-9a-f]{6}$/i.test(r.hex) ? r.hex.toLowerCase() : '';
            const o = old || {};
            if (src) { const p = await Lib.processImage(src); img = p.img; hex = hex || p.hex; }
            else if (o.img && !(hex && hex !== o.hex)) img = o.img;
            else img = solidImg(hex || o.hex || '#cccccc');
            out.push({ code: r.code, name: r.name || o.name || r.srcCode || r.code, brand: r.brand, series: r.series || o.series || '自訂色板', hex: hex || o.hex || '#cccccc', img, en: o.en || '', price: r.price !== '' ? r.price : o.price });
          } catch (e) { errs.push(`第 ${r.line} 列 ${r.code}：${e.message}`); }
        }
        err.textContent = '';
        if (out.length) await Lib.saveMany(out);
        if (Object.keys(priceOnly).length) await Lib.setPrices(priceOnly);
        d.result = { n: out.length + Object.keys(priceOnly).length, errs };
        return null;
      }
    });
    if (!res) return false;
    const { n, errs } = res.data.result;
    if (errs.length) await UI.alert(`已匯入 ${n} 筆，${errs.length} 筆失敗`, errs.slice(0, 12).join('\n') + (errs.length > 12 ? `\n…另 ${errs.length - 12} 筆` : ''));
    else App.toast(`已匯入 ${n} 筆色板`);
    return n > 0;
  };
  // 拖曳進來的資料夾要逐層展開
  async function droppedFiles(dt) {
    const items = [...(dt.items || [])].map(it => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
    if (!items.length) return [...dt.files];
    const out = [];
    const walk = async ent => {
      if (ent.isFile) out.push(await new Promise((res, rej) => ent.file(res, rej)));
      else if (ent.isDirectory) {
        const rd = ent.createReader();
        for (;;) { const batch = await new Promise((res, rej) => rd.readEntries(res, rej)); if (!batch.length) break; for (const e of batch) await walk(e); }
      }
    };
    for (const e of items) await walk(e);
    return out;
  }
  /* 決定每列的廠商與實際色號：
     廠商＝表格「廠商」欄 → 匯入視窗指定的廠商 → 既有色板的廠商 → 自訂
     不同廠商色號重複（例 伸保 110 與 禾邁 110）時，新色板色號改為「廠商-色號」 */
  function resolveRows(rows, opt) {
    return rows.map(r0 => {
      const r = { ...r0, srcCode: r0.code };
      const want = r.brand || opt.brand || '';
      const old = r.code ? Lib.get(r.code) : null;
      r.brand = want || (old ? BRAND(old) : '自訂');
      if (old && BRAND(old) !== r.brand) {
        if (opt.prefix) { r.code = `${r.brand}-${r.code}`; r.renamed = true; }
        else r.conflict = BRAND(old);
      }
      return r;
    });
  }
  // 圖片來源：圖片欄（檔名／網址）→ 留空時找與色號同名的圖片
  function imageSource(r, images) {
    const v = r.img;
    if (v && (/^data:image\//i.test(v) || /^https?:\/\//i.test(v))) return v;
    const find = k => images.get(baseName(k)) || images.get(baseName(k).replace(/\.[^.]+$/, '')) || null;
    return (v && find(v)) || (r.code && find(r.code)) || (r.srcCode && find(r.srcCode)) || null;
  }
  // 名稱／系列／色碼是否和現有色板不同（空白視為不變）
  const changedInfo = (r, old) => (r.name && r.name !== old.name) || (r.brand && r.brand !== BRAND(old)) || (r.series && r.series !== (old.series || '')) || (/^#[0-9a-f]{6}$/i.test(r.hex) && r.hex.toLowerCase() !== (old.hex || '').toLowerCase());
  function rowStatus(r, images, overwrite) {
    const old = Lib.get(r.code), src = imageSource(r, images);
    const imgText = src ? (typeof src === 'string' ? (/^https?:/i.test(src) ? '網址' : '圖片') : (r.img || (r.srcCode || r.code) + '（同色號）')) : old ? '（保留原圖）' : (/^#[0-9a-f]{6}$/i.test(r.hex) ? '（色碼 ' + r.hex + '）' : '');
    const bad = text => ({ ok: false, text, imgText });
    if (!r.code) return bad('缺少色號');
    if (r.conflict) return bad(`與「${esc(r.conflict)}」色號重複`);
    if (/[\s"'<>]/.test(r.code)) return bad('色號含空白或引號');
    if (r.price !== '' && Lib.priceOf(r.price) == null) return bad('單價格式錯誤');
    if (window.DATA.MATERIALS.some(m => m.code === r.code && !m.tex)) return bad('與規格色重複');
    if (!old) {
      if (!r.name && !r.fromImg) return bad('缺少名稱');
      if (!src && !/^#[0-9a-f]{6}$/i.test(r.hex)) return bad(r.img && !/^https?:/i.test(r.img) ? '找不到圖片檔' : '缺少圖片');
      return { ok: true, text: r.renamed ? `新增（與其他廠商重複，色號改為 ${esc(r.code)}）` : '新增', imgText };
    }
    if (!overwrite) return bad('已存在（略過）');
    if (!src && !changedInfo(r, old)) {
      if (r.price === '' || Lib.priceOf(r.price) === old.price) return bad('無變更（略過）');
      return { ok: true, text: '更新單價', imgText };
    }
    return { ok: true, text: src ? '覆蓋（換圖）' : '覆蓋', imgText };
  }

  /* ---------- 匯出 ---------- */
  async function exportZip() {
    if (!window.JSZip) { UI.alert('匯出失敗', 'JSZip 未載入'); return; }
    App.busy && App.busy(true, '匯出色板…');
    try {
      const list = Lib.list(), zip = new window.JSZip();
      const rows = [[...HEAD, '來源']];
      list.forEach(s => {
        const ext = /^data:image\/png/.test(s.img) ? 'png' : 'jpg', file = `images/${s.code}.${ext}`;
        if (s.img && s.img.startsWith('data:')) zip.file(file, s.img.split(',')[1], { base64: true });
        else if (s.img) zip.file(file, fetch(s.img).then(r => r.ok ? r.blob() : Promise.reject(new Error(r.status))).catch(() => new Blob([])));   // 內建貼圖檔（禾邁…）
        rows.push([BRAND(s), s.code, s.name, s.series || '', s.hex || '', s.price != null ? s.price : '', s.img ? file : '', s.builtin ? (s.modified ? '內建（已修改）' : '內建') : '自訂']);
      });
      zip.file('色板.csv', Lib.toCSV(rows));
      try { zip.file('色板.xlsx', await writeXLSX(rows.map((r, i) => i ? r.map((v, j) => j === 5 && v !== '' ? +v : v) : r), [['說明', GUIDE.map(t => [t]), [{ wch: 90 }]]])); } catch (e) { /* 沒網路時只附 CSV */ }
      const blob = await zip.generateAsync({ type: 'blob' });
      App.download(blob, `色板_${stamp()}.zip`);
      App.toast(`已匯出 ${list.length} 個色板（含 Excel；改好單價可直接匯入）`);
    } finally { App.busy && App.busy(false); }
  }

  /* ---------- 匯入範本 ---------- */
  const GUIDE = [
    '【色板匯入說明】',
    '1. 在「色板」工作表填寫，一列一個色板；第一列標題請勿修改。',
    '2. 廠商：板材廠商（例 伸保、禾邁），挑色板時可依廠商篩選；空白時用匯入視窗填的廠商。',
    '3. 色號：必填，不可有空白（例 A101）。同廠商已存在的色號會被修改；與其他廠商重複時自動改成「廠商-色號」。',
    '4. 名稱：新色板必填（例 雪白橡木）。',
    '5. 系列：選填，色板選單依系列分組（空白＝自訂色板）。',
    '6. 色碼：選填，#RRGGBB；沒有圖片時以此顏色顯示。有圖片時會自動取平均色。',
    '7. 單價：每才售價（元），1 才＝303mm×303mm（1 台尺見方），每片板材才數無條件進位。空白＝使用預設單價。',
    '8. 圖片：填圖片檔名（例 A101.jpg）或網址；留空時會自動找「與色號同名」的圖片（A101.jpg / A101.png）。',
    '',
    '【圖片怎麼一起上傳】',
    '・把本 Excel 和所有圖片放在同一個資料夾（可放在 images 子資料夾），',
    '  在「色板維護 → 匯入」把整個資料夾拖進去，或壓成 ZIP 再拖進去。',
    '・圖片 JPG / PNG 皆可，會自動裁成 640×400，建議原圖寬 800px 以上。',
    '',
    '【只有圖片、不想填表】',
    '・圖片檔名取成「色號.jpg」或「色號_名稱.jpg」（例 A101_雪白橡木.jpg），整批拖進匯入視窗即可。',
    '',
    '【只改單價】',
    '・色板維護 →「匯出」得到 ZIP，裡面的 色板.xlsx 改「單價」欄後直接匯入（不必附圖片，原圖保留）。'
  ];
  async function demoImg(c1, c2, label) {
    const c = document.createElement('canvas'); c.width = 800; c.height = 500;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 800, 500);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(0, 0, 800, 500);
    g.globalAlpha = 0.15; g.strokeStyle = '#000';
    for (let y = 10; y < 500; y += 14) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(260, y + 8, 540, y - 8, 800, y + 4); g.stroke(); }
    g.globalAlpha = 0.6; g.fillStyle = '#000'; g.font = 'bold 48px sans-serif'; g.fillText(label, 30, 470);
    return new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
  }
  async function downloadTemplate() {
    if (!window.JSZip) { UI.alert('下載失敗', 'JSZip 未載入'); return; }
    const rows = [HEAD,
      ['禾邁', 'A101', '雪白橡木', '木紋系列', '', 120, 'A101.jpg'],
      ['禾邁', 'A102', '胡桃木', '木紋系列', '', 135, ''],
      ['禾邁', 'A103', '霧面白', '素色系列', '#f2f1ec', 100, '']];
    const zip = new window.JSZip();
    try { zip.file('色板匯入範本.xlsx', await writeXLSX(rows, [['說明', GUIDE.map(t => [t]), [{ wch: 90 }]]])); }
    catch (e) { App.toast('Excel 元件載入失敗，範本只附 CSV'); }
    zip.file('色板匯入範本.csv', Lib.toCSV(rows));
    zip.file('images/A101.jpg', await demoImg('#efe6d6', '#d9c7a6', 'A101'));
    zip.file('images/A102.jpg', await demoImg('#7a5a3c', '#4e3622', 'A102'));
    zip.file('填寫說明.txt', '﻿' + GUIDE.join('\r\n'));
    App.download(await zip.generateAsync({ type: 'blob' }), '色板匯入範本.zip');
    App.toast('已下載範本：解壓縮後填 Excel、圖片放 images 資料夾，再整個資料夾拖進「匯入」');
  }
})();
