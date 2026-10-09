/* 匯出：a 報價單 PDF / b DAE / c 場景 JPG / d 三視圖 PDF / e 平面立面 PDF */
(function () {
  const Dr = () => window.Drawings;
  const P = () => window.Pricing;
  const D = window.DATA;
  const Ex = {};

  const today = () => { const d = new Date(); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; };
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
  const safe = s => String(s || '專案').replace(/[\\/:*?"<>|]/g, '_');
  const info = extra => ({
    project: App.state.name, client: App.state.client, date: today(),
    designer: App.user ? App.user.name : '', org: App.user ? App.user.org : '', ...extra
  });
  const nextFrame = () => new Promise(r => setTimeout(r, 30));

  Ex.run = async function (kind) {
    const st = App.state;
    const need = { quote: 'cab', views: 'cab', dae: 'any', renders: 'any', plans: 'any', cutlist: 'cab', dxf: 'any' }[kind];
    const allCount = P().floorsOf(st).reduce((a, f) => a + f.cabinets.length, 0);
    if (need === 'cab' && !allCount) { App.ui.alert('無法匯出', '空間中尚無系統櫃，請先從左側型錄取用。'); return; }
    if (need === 'any' && !allCount && !P().floorsOf(st).some((f, i) => i === st.floor ? st.room : (st.floors[i] || {}).room)) { App.ui.alert('無法匯出', '尚未建立空間或放置櫃體。'); return; }
    if ((kind === 'quote' || kind === 'views' || kind === 'plans') && !window.jspdf) { App.ui.alert('PDF 元件未載入', '請確認網路連線（jsPDF 由 CDN 載入）後重新整理頁面。'); return; }
    await window.Drawings.ready();
    // DXF 要先問選項，忙碌遮罩由 Ex.dxf 自己在對話框關掉後才開
    if (kind !== 'dxf') {
      App.busy(true, { quote: '產生報價單…', dae: '輸出 3D 模型…', renders: '渲染場景…', views: '繪製三視圖…', plans: '繪製平面及立面圖…', cutlist: '產生拆料清單…' }[kind]);
      await nextFrame();
    }
    try {
      if (kind === 'quote') await Ex.quotePDF();
      if (kind === 'dae') Ex.dae();
      if (kind === 'renders') await Ex.renders();
      if (kind === 'views') await Ex.viewsPDF();
      if (kind === 'plans') await Ex.plansPDF();
      if (kind === 'cutlist') Ex.cutlistCSV();
      if (kind === 'dxf') await Ex.dxf();
    } catch (e) {
      console.error(e);
      App.ui.alert('匯出失敗', e.message || String(e));
    } finally { App.busy(false); }
  };

  /* 把字串切成塞得進 maxW（mm）的幾行。只在 - ＋ / 之後斷，不會斷在數字中間；
     真的有單一段落就超寬時才退回逐字切。 */
  function wrapText(pg, str, maxW, size, bold) {
    const s = String(str == null ? '' : str);
    if (!s) return [''];
    pg.font(size, bold);
    const w = t => pg.g.measureText(t).width / pg.k;
    if (w(s) <= maxW) return [s];
    const out = [];
    let cur = '';
    s.split(/(?<=[-＋/])/).forEach(tok => {
      if (cur && w(cur + tok) > maxW) { out.push(cur); cur = ''; }
      while (w(tok) > maxW) {                       // 單一段落本身就過寬：逐字切
        let t = tok;
        while (t.length > 1 && w(t) > maxW) t = t.slice(0, -1);
        out.push(t); tok = tok.slice(t.length);
      }
      cur += tok;
    });
    if (cur) out.push(cur);
    return out.length ? out : [s];
  }

  /* 在 3D 圖上畫「數字＋圓」的項次標記。
     marks 是 renderImage 回填過座標的陣列；(ix,iy,iw,ih) 是圖在紙面上的位置（mm）。
     位置太近的會往上挪開，避免圈圈疊在一起。 */
  function drawMarks(pg, marks, ix, iy, iw, ih, imgW, imgH) {
    const R = 2.0, g = pg.g, k = pg.k;
    const placed = [];
    marks.filter(m => m.vis && m.x != null).forEach(m => {
      let x = ix + m.x / imgW * iw, y = iy + m.y / imgH * ih;
      for (let i = 0; i < 12 && placed.some(q => Math.hypot(q.x - x, q.y - y) < R * 2.1); i++) y -= R * 2.1;
      x = Math.max(ix + R, Math.min(ix + iw - R, x));
      y = Math.max(iy + R, Math.min(iy + ih - R, y));
      placed.push({ x, y });
      g.beginPath(); g.arc(x * k, y * k, R * k, 0, Math.PI * 2);
      g.fillStyle = '#ffffff'; g.fill();
      g.strokeStyle = '#1f2328'; g.lineWidth = 0.3 * k; g.stroke();
      pg.text(x, y + 1.15, String(m.n), { size: 6, bold: true, align: 'center' });
    });
  }

  function pagesToPDF(pages, name) {
    const { jsPDF } = window.jspdf;
    const first = pages[0];
    const pdf = new jsPDF({ orientation: first.orient, unit: 'mm', format: 'a4', compress: true });
    pages.forEach((pg, i) => {
      if (i) pdf.addPage('a4', pg.orient);
      pdf.addImage(pg.canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pg.wmm, pg.hmm, undefined, 'FAST');
    });
    pdf.setProperties({ title: name, creator: '系統櫃 3D 設計平台', author: App.user ? App.user.name : '' });
    pdf.save(name + '.pdf');
  }

  /* ---------- a. 報價單 ---------- */
  Ex.quotePDF = async function () {
    const st = App.state, q = P().quote(st);
    const pages = [];
    const u = App.user || {};
    const qno = 'Q' + stamp() + '-' + String(Math.abs(hash(st.name + st.created)) % 1000).padStart(3, '0');
    const V = window.Viewer;
    /* 圖文一致：每個櫃體在 3D 圖上標一個「數字＋圓」，數字就是下方表格的項次。
       標記點取櫃體中心（世界座標），投影由 renderImage 在還原鏡頭前算好。 */
    const IMG_W = 1200, IMG_H = 640;
    const noOf = new Map();
    q.rows.forEach((r, i) => (r.ids || []).forEach(id => noOf.set(id, i + 1)));
    const marks = [];
    P().floorsOf(st).forEach(fl => (fl.cabinets || []).forEach(c2 => {
      const n = noOf.get(c2.id); if (!n) return;
      const hh = c2.kind === 'desk' ? c2.thick : c2.h;
      marks.push({ n, p: new window.THREE.Vector3(c2.x, (c2.y || 0) + hh / 2, c2.z) });
    }));
    const img = V.renderImage(IMG_W, IMG_H, st.scenes[0] || { cam: V.overviewCam(), light: 'day', bg: '#ffffff', wallMode: 'auto' }, marks);
    // 型號欄加寬到 42mm（22→64）：新命名含尺寸與門片，90% 的名稱超過原本的 35mm
    const COL_CODE = 22, COL_CODE_W = 42, COL_SPEC = 66, COL_SPEC_W = 68;
    const cols = [[14, '項次', 'center'], [COL_CODE, '型號'], [COL_SPEC, '品名規格'], [126, '數量', 'right'], [150, '單價', 'right'], [184, '複價', 'right']];
    let pg, y;
    const header = async (first) => {
      pg = Dr().Page('portrait', 200);
      pages.push(pg);
      pg.rect(0, 0, 210, 4, { fill: '#8dbf1a', stroke: false });
      if (window.LOGO_DATA) await pg.image(window.LOGO_DATA, 13, 10.5, 11, 11);
      pg.text(26, 16.2, u.org || '系統櫃 3D 設計平台', { size: 11, bold: true, color: '#8a6a2f' });
      pg.text(26, 20.6, `設計師 ${u.name || ''}${u.tel ? '　電話 ' + u.tel : ''}`, { size: 7.5, color: '#69727d' });
      pg.text(196, 18, '報　價　單', { size: 18, bold: true, align: 'right' });
      pg.line(14, 25, 196, 25, 0.5);
      if (first) {
        const kv = [['專案名稱', st.name], ['客戶', st.client || '—'], ['報價日期', today()], ['報價單號', qno]];
        kv.forEach(([k2, v], i) => { const x = 14 + (i % 2) * 92, yy = 32 + Math.floor(i / 2) * 6; pg.text(x, yy, k2, { size: 8, color: '#69727d' }); pg.text(x + 18, yy, v, { size: 9, bold: true, maxW: 70 }); });
        await pg.image(img, 14, 42, 182, 97);
        pg.rect(14, 42, 182, 97, { w: 0.2, color: '#c9cfd6' });
        drawMarks(pg, marks, 14, 42, 182, 97, IMG_W, IMG_H);
        y = 146;
      } else y = 32;
      pg.rect(14, y, 182, 7, { fill: '#eef1f4', stroke: false });
      cols.forEach(([x, t, al]) => pg.text(al === 'right' ? x + 10 : al === 'center' ? x + 3 : x, y + 4.8, t, { size: 8, bold: true, align: al || 'left' }));
      y += 7;
    };
    await header(true);
    let idx = 0;
    for (const r of q.rows) {
      idx++;
      const c = r.cab;
      const subs = r.price.lines.slice(1).map(l => `${l.name} ${P().fmt(l.amount)}`);
      const noteLine = c.note ? '備註：' + c.note : '';
      const hasDims = c.kind === 'desk' || c.kind === 'appl';   // 這兩種的名稱沒有尺寸，品名規格才要寫
      const lines = [`${r.floor ? '[' + r.floor + '] ' : ''}${hasDims ? `${c.w}×${c.d}×${c.h}mm　` : ''}${P().describe(c)}`, window.Drawings.cabParts(c).map(([k2, v]) => `${k2} ${window.Drawings.matName(v)}`).join('／') + (c.fronts.some(x => x.t !== 'O') ? '／' + ((D.DOOR_STYLES.find(s2 => s2.id === c.doorStyle) || {}).name || '') : ''), ...subs, ...(noteLine ? [noteLine] : [])];
      // 先用 8.5 試；一行放不下才降到 7.5（仍放不下就換行，最多 2 行）
      let nameSize = 8.5, nameLines = wrapText(pg, P().fullCode(c), COL_CODE_W, nameSize, true);
      if (nameLines.length > 1) { nameSize = 7.5; nameLines = wrapText(pg, P().fullCode(c), COL_CODE_W, nameSize, true); }
      const h = 5 + Math.max(lines.length, nameLines.length) * 3.9;
      if (y + h > 262) { await header(false); }
      pg.text(17, y + 4.6, String(idx), { size: 8.5, align: 'center' });
      nameLines.forEach((l, i) => pg.text(COL_CODE, y + 4.6 + i * 3.9, l, { size: nameSize, bold: true }));
      lines.forEach((l, i) => pg.text(COL_SPEC, y + 4.6 + i * 3.9, l, { size: i < 2 ? 7.8 : 7, color: i < 2 ? '#1f2328' : '#69727d', maxW: COL_SPEC_W }));
      pg.text(136, y + 4.6, String(r.qty), { size: 8.5, align: 'right' });
      pg.text(160, y + 4.6, P().fmt(r.price.total).replace('NT$ ', ''), { size: 8.5, align: 'right' });
      pg.text(194, y + 4.6, P().fmt(r.price.total * r.qty).replace('NT$ ', ''), { size: 8.5, align: 'right', bold: true });
      y += h;
      pg.line(14, y, 196, y, 0.1, '#d5d9de');
    }
    if (y + 62 > 280) await header(false);
    y += 4;
    const tot = [['小計', q.subtotal], ['未稅金額', q.afterDisc], [`營業稅（${st.pricing.taxRate}%）`, q.tax]];
    tot.forEach(([k2, v]) => { pg.text(160, y + 4, k2, { size: 8.5, align: 'right', color: '#475467' }); pg.text(194, y + 4, P().fmt(v), { size: 8.5, align: 'right' }); y += 5.5; });
    pg.line(120, y, 196, y, 0.4);
    pg.text(160, y + 6.5, '總計', { size: 11, bold: true, align: 'right' });
    pg.text(194, y + 6.5, P().fmt(q.total), { size: 12, bold: true, align: 'right', color: '#8a6a2f' });
    let ny = y - 22;
    pg.text(14, ny, '備註', { size: 8.5, bold: true });
    String(st.pricing.note || '').split('\n').forEach((l, i) => pg.text(14, ny + 5 + i * 4.2, l, { size: 7.5, color: '#475467', maxW: 100 }));
    y += 20;
    pg.rect(14, y, 85, 22, { w: 0.2 }); pg.text(17, y + 5, '客戶簽認', { size: 8, color: '#69727d' });
    pg.rect(111, y, 85, 22, { w: 0.2 }); pg.text(114, y + 5, '設計師', { size: 8, color: '#69727d' }); pg.text(193, y + 18, u.name || '', { size: 10, align: 'right' });
    pages.forEach((p, i) => { p.text(105, 290, `第 ${i + 1} / ${pages.length} 頁　·　${qno}`, { size: 7, align: 'center', color: '#98a2ad' }); });
    pagesToPDF(pages, `${safe(st.name)}_報價單_${stamp()}`);
  };
  function hash(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; }

  /* ---------- f. 模型拆料清單 CSV ---------- */
  const B = D.BOARD;
  // 單一櫃體拆料：回傳 [類別, 零件, 色號, 厚, 長, 寬, 數量, 單位, 封邊, 備註]
  Ex.cutParts = function (cab) {
    const rows = [];
    const add = (cat, name, code, t, L, W, qty, unit = '片', edge = '', note = '') => {
      if (qty > 0) rows.push([cat, name, code || '', t || '', L ? Math.round(L) : '', W ? Math.round(W) : '', qty, unit, edge, note]);
    };
    if (cab.kind === 'appl') {
      const it = D.byCode[cab.code] || {};
      add(it.group === 'daydayf' ? 'DAY&DAY 龍頭' : it.group === 'daydayb' ? 'DAY&DAY 衛浴' : it.group === 'dayday' ? 'DAY&DAY 廚房' : '廚房設備', `${D.APPL_TYPES[cab.at]}　${it.name || ''}`, cab.code, '', cab.w, cab.d, 1, '台', '', `${it.brand || ''}；${it.spec || ''}${it.cut ? `；檯面開孔 ${it.cut[0]}×${it.cut[1]}` : ''}`);
      if (it.finish === 'panel') add('門片', `${D.APPL_TYPES[cab.at]}嵌門板`, cab.doorColor, 18, cab.h - 10, cab.w, 1, '片', '四邊', `${cab.code} 專用嵌門板`);
      return rows;
    }
    if (cab.kind === 'filler') {
      add('櫃體板材', '補板', cab.bodyColor, B, cab.h, cab.w, 1, '片', '四邊', '補滿櫃體與牆之間的空隙');
      add('櫃體板材', '補板固定條', cab.bodyColor, B, cab.h, Math.min(50, cab.w), 1, '片', '', '鎖於補板背面，固定在牆／櫃側');
      return rows;
    }
    if (cab.kind === 'desk') {
      const g = window.Model.deskGeom(cab);
      const holes = window.Model.deskHoles(cab);
      add('桌面', `桌面板（${D.DESK_SHAPES[cab.shape]}）`, cab.topColor, cab.thick, cab.w, window.Model.footDepth(cab), 1, '片',
        (D.DESK_EDGES.find(e => e.id === cab.edge) || {}).name || '',
        `${P().deskMatName(cab.deskMat)}；${P().deskCai(cab)} 才（面積 ${(g.area / D.CAI).toFixed(2)} 才進位）；外露邊 ${(g.exposed / D.CHI).toFixed(1)} 尺${cab.shape !== 'R' ? `；異形外框尺寸，桌面深 ${cab.d}` : ''}${holes.length ? `；水槽/爐具開孔 ${holes.length} 處` : ''}`);
      return rows;
    }
    const { w, d, h } = cab;
    const body = cab.bodyColor, door = cab.doorColor;
    const nS = cab.shelves.filter(s => !s.fixed).length, nF = cab.shelves.filter(s => s.fixed).length;
    // ---- 櫃體板材
    if (cab.kind === 'corner') {
      add('櫃體板材', '背側板', body, B, h, w, 1, '片', '前緣');
      add('櫃體板材', '左側板', body, B, h, w - B, 1, '片', '前緣');
      add('櫃體板材', '端側板', body, B, h, d - B, 2, '片', '前緣');
      add('櫃體板材', '頂板（L型）', body, B, w - B, w - B, 1, '片', '前緣', `L型，臂深 ${d - B}`);
      add('櫃體板材', '底板（L型）', body, B, w - B, w - B, 1, '片', '前緣', `L型，臂深 ${d - B}`);
      add('櫃體板材', '固定隔板（L型）', body, B, w - B, w - B, nF, '片', '前緣', `L型，臂深 ${d - B}`);
      add('櫃體板材', '活動層板（L型）', body, B, w - B, w - B, nS, '片', '前緣', `L型，臂深 ${d - B}`);
      if (cab.fronts.some(r => !window.Model.OPEN_ROW(r.t))) add('櫃體板材', '封板', body, B, h, w - d, 1, '片', '前緣');
    } else if (cab.kind === 'tri') {
      const shape = { '00': '兩片板', '01': 'A型斜角', '02': 'B型圓弧' }[cab.triType];
      add('櫃體板材', '背板（三角邊櫃）', body, B, h, w, 1, '片', '前緣');
      add('櫃體板材', '側板（三角邊櫃）', body, B, h, d - B, 1, '片', '前緣');
      if (cab.triType !== '00') {
        add('櫃體板材', `頂/底板（${shape}）`, body, B, d, w, 2, '片', '弧/斜邊', '異形板');
        add('櫃體板材', `層板（${shape}）`, body, B, d, w, cab.shelves.length, '片', '弧/斜邊', '異形板');
      }
    } else {
      add('櫃體板材', '側板', body, B, h, d, 2, '片', '前緣');
      if (cab.hoodHang) {
        // 抽油煙機吊櫃：無頂板、無底板、無背板；前檔板上下 2 支＋後檔板上方 1 支（80mm）
        add('櫃體板材', '前檔板（上／下）', body, B, w - 2 * B, 80, 2, '片', '外露邊', '抽油煙機吊櫃，夾在左右側板中間');
        add('櫃體板材', '後檔板（上）', body, B, w - 2 * B, 80, 1, '片', '', '抽油煙機吊櫃，夾在左右側板中間');
        add('櫃體板材', '固定隔板', body, B, w - 2 * B, d, nF, '片', '前緣');
        add('櫃體板材', '活動層板', body, B, w - 2 * B - 4, d - 22, nS, '片', '前緣');
      } else if (cab.sinkBase) {
        // 水槽櫃：無頂板；前上、後上、後下三支 80mm 檔板＋後檔板內 8mm 背板
        add('櫃體板材', '底板', body, B, w - 2 * B, d, 1, '片', '前緣');
        add('櫃體板材', '前檔板（上）', body, B, w - 2 * B, 80, 1, '片', '下緣', '水槽櫃，夾在左右側板中間');
        add('櫃體板材', '後檔板（上／下）', body, B, w - 2 * B, 80, 2, '片', '', '水槽櫃，夾在左右側板中間');
        add('櫃體板材', '背板', body, D.BACK, h - B, w - 2 * B, 1, '片', '', '水槽櫃，釘於後檔板內側');
        add('櫃體板材', '固定隔板', body, B, w - 2 * B, d - B - D.BACK, nF, '片', '前緣');
        add('櫃體板材', '活動層板', body, B, w - 2 * B - 4, d - B - D.BACK - 22, nS, '片', '前緣');
      } else {
      add('櫃體板材', '頂板', body, B, w - 2 * B, d, 1, '片', '前緣');
      add('櫃體板材', '底板', body, B, w - 2 * B, d, 1, '片', '前緣');
      if (!cab.noBack) add('櫃體板材', '背板', body, D.BACK, h - 2 * B + 10, w - 2 * B + 10, 1, '片', '', '入槽');
      add('櫃體板材', '固定隔板', body, B, w - 2 * B, d - B, nF, '片', '前緣');
      add('櫃體板材', '活動層板', body, B, w - 2 * B - 4, d - B - 22, nS, '片', '前緣');
      }
    }
    if (cab.kick && !cab.hanging && cab.kind !== 'tri') {
      const kh = Math.min(D.KICK, cab.y) - 4;
      if (cab.kind === 'corner') { add('踢腳板', '踢腳板', cab.kickColor || body, B, w - d, kh, 1, '片', '上緣'); add('踢腳板', '踢腳板', cab.kickColor || body, B, w - d, kh, 1, '片', '上緣'); }
      else add('踢腳板', '踢腳板', cab.kickColor || body, B, w, kh, 1, '片', '上緣');
    }
    if (cab.top && cab.top !== 'none' && D.PARTS.TOP[cab.top]) {
      const tp = D.PARTS.TOP[cab.top];
      if (cab.kind === 'corner') add('檯面', tp.name, cab.topColor || door, tp.thick, w, w, 1, '片', '前緣', `L型，臂深 ${d + 30}`);
      else add('檯面', tp.name, cab.topColor || door, tp.thick, w, d + 30, 1, '片', '前緣');
    }
    // ---- 門片 / 抽屜
    const st = D.DOOR_STYLES.find(s => s.id === cab.doorStyle) || D.DOOR_STYLES[0];
    const fw = cab.kind === 'corner' ? w - d : w; // 轉角櫃門面寬
    const hd = window.Model.handleOf(cab);
    const handleType = hd.type === 'style' ? hd.style : hd.type;
    let handles = 0, knobs = 0, drawers = 0;
    const hrows = new Map(); // 把手明細：名稱|長度 → 數量
    const addH = (name, len, n, unit, note) => { const k = name + '|' + (len || ''); if (!hrows.has(k)) hrows.set(k, { name, len, n: 0, unit, note }); hrows.get(k).n += n; };
    const edgeLen = (lwmm, rhmm, hinge) => { const e = window.Model.handleEdge(hd.pos, hinge); return e === 'top' || e === 'bottom' ? lwmm : rhmm; };
    const countLeaf = (lwmm, rhmm, hinge, n, glass) => {
      if (glass || handleType === 'bar') { handles += n; return; }
      if (handleType === 'knob') { knobs += n; return; }
      if (hd.type === 'j') addH(hd.name + '（鋁擠）', Math.round(edgeLen(lwmm, rhmm, hinge)), n, '支', '依門片邊長裁切');
      else if (hd.type === 'bev') addH(hd.name, Math.round(edgeLen(lwmm, rhmm, hinge)), n, '處', '門片 45° 斜邊加工');
      else if (hd.type === 'inset') addH(hd.name, '', n, '個', '門片開槽嵌入');
    };
    cab.fronts.forEach((r, ri) => {
      const rh = r.h * 10;
      const lip = window.Model.rowLip(cab, cab.fronts, ri);
      if (r.t === 'E') {
        add('抽屜', `電器抽抽頭（${st.name}）`, door, B, fw - 4, window.Model.E_FRONT - 4, 1, '片', '四邊', '電器抽前方');
        add('櫃體板材', '電器抽托盤', body, B, w - 2 * B - 26, d - 60, 1, '片', '前緣', '電器抽，可拉出');
        add('五金配件', '電器抽滑軌（全展）', '', '', '', '', 1, '組', '', '電器抽托盤用');
        return;
      }
      if (r.t === 'D') {
        drawers++;
        const hk = r.h <= 20 ? 16 : r.h <= 28 ? 24 : 32;
        const wk = [45, 60, 90].reduce((p, c) => Math.abs(c - fw / 10) < Math.abs(p - fw / 10) ? c : p, 45);
        add('抽屜', `屜頭（${st.name}）`, door, B, fw - 4, rh - 4, 1, '片', '四邊');
        add('抽屜', `抽屜組 ${hk}W${cab.dc === 'T' ? 'A' : cab.dc}${wk}`, '', '', '', '', 1, '組', '', '含屜牆、屜底、全展緩衝滑軌');
        countLeaf(fw - 4, rh - 4, null, 1, false);
        return;
      }
      if (r.t === 'O') return;
      const glass = r.t === 'G' || r.t === 'GP';
      const n = r.t === 'P' || r.t === 'GP' ? 2 : r.t === 'F' ? 4 : 1;
      const lw = fw / n;
      const side = r.t === 'L' ? '左開' : r.t === 'R' ? '右開' : r.t === 'F' ? '折疊' : '對開';
      if (glass) add('門片', `鋁框玻璃門（${side}）`, '清玻璃', 18, rh - 4 + lip, lw - 4, n, '片', '', '鋁框＋清玻璃');
      else add('門片', `門片 ${st.name}（${side}）`, door, B, rh - 4 + lip, lw - 4, n, '片', '四邊', lip ? `下緣凸出 ${lip}mm（取手縫）` : '');
      if (r.t === 'P' || r.t === 'GP') { countLeaf(lw - 4, rh - 4, 'L', 1, glass); countLeaf(lw - 4, rh - 4, 'R', 1, glass); }
      else if (r.t === 'F') [0, 1, 2, 3].forEach(i => countLeaf(lw - 4, rh - 4, i % 2 ? 'R' : 'L', 1, glass));
      else countLeaf(lw - 4, rh - 4, r.t === 'R' ? 'R' : 'L', 1, glass);
    });
    // ---- 把手
    add('把手', '一字型把手', '', '', '', '', handles, '支', '', '報價未含把手');
    add('把手', '鈕扣型把手', '', '', '', '', knobs, '顆', '', '報價未含把手');
    hrows.forEach(v => add('把手', v.name, '', '', v.len, '', v.n, v.unit, '', v.note));
    if (!handles && !knobs && !hrows.size && cab.fronts.some(r => !window.Model.OPEN_ROW(r.t))) add('把手', `無外掛把手（${st.name}）`, '', '', '', '', 1, '式', '', '門板一體成型把手');
    // ---- 五金配件
    const hq = P().hingeQty(cab), fq = P().footQty(cab);
    add('五金配件', '西德鉸鍊（緩衝 EHG7）', '', '', '', '', hq, '個');
    add('五金配件', '抽屜滑軌（全展緩衝）', '', '', '', '', drawers, '組', '', '含於抽屜組');
    add('五金配件', '活隔粒（層板粒）', '', '', '', '', nS * 4, '粒', '', '每片活動層板 4 粒');
    add('五金配件', '調整腳 A10', '', '', '', '', fq, '支');
    if (cab.hanging) add('五金配件', '吊櫃五金 SD60', '', '', '', '', 2, '支', '', '吊櫃不附調整腳');
    if (cab.rod) add('五金配件', '吊衣桿（含座）', '', '', w - 2 * B, '', 1, '支');
    return rows;
  };

  Ex.cutlistCSV = function () {
    const st = App.state;
    const esc2 = v => { const s2 = String(v == null ? '' : v); return /[",\n]/.test(s2) ? '"' + s2.replace(/"/g, '""') + '"' : s2; };
    const line = arr => arr.map(esc2).join(',');
    const name = code => { if (!code) return ''; const m = st.pricing.materials.find(x => x.code === code); return m ? (m.tex && m.brand ? `${m.brand} ${m.name}` : m.name) : ''; };   // 色板帶廠商，工廠才分得出板材來源
    const out = [];
    out.push(line(['專案', st.name, '客戶', st.client || '', '設計師', App.user ? App.user.name : '', '日期', today()]));
    out.push('');
    out.push(line(['【拆料明細】']));
    out.push(line(['項次', '櫃體編號', '櫃體型號', '櫃體尺寸 W×D×H', '類別', '零件名稱', '色號', '色號名稱', '厚度(mm)', '長(mm)', '寬(mm)', '數量', '單位', '封邊', '備註', '計價才數（每片進位×數量）']));
    const sum = new Map();
    let n = 0;
    const floors = P().floorsOf(st), multi = floors.length > 1;
    floors.forEach(fl => fl.cabinets.forEach((cab, ci) => {
      const cid = (multi ? fl.name + '-' : '') + 'C' + String(ci + 1).padStart(2, '0');
      Ex.cutParts(cab).forEach(r => {
        const [cat, part, code, t, L, W, qty, unit, edge, note] = r;
        const pc = !code || code === '清玻璃' ? 0 : cat === '桌面' ? P().deskCai(cab) : P().pieceCai(cat, part, L, W, note);
        out.push(line([++n, cid, P().fullCode(cab), `${cab.w}×${cab.d}×${cab.h}`, cat, part, code, name(code), t, L, W, qty, unit, edge, note, pc ? pc * qty : '']));
        const key = [cat, part, code, t, L, W, unit].join('|');
        if (!sum.has(key)) sum.set(key, { r: [cat, part, code, name(code), t, L, W], qty: 0, unit, cabs: new Set(), pc });
        const sm = sum.get(key); sm.qty += qty; sm.cabs.add(cid);
      });
    }));
    out.push('');
    out.push(line(['【彙總】（相同零件、色號、尺寸合併）']));
    out.push(line(['類別', '零件名稱', '色號', '色號名稱', '厚度(mm)', '長(mm)', '寬(mm)', '總數量', '單位', '使用櫃體']));
    const order = ['桌面', '櫃體板材', '檯面', '踢腳板', '門片', '抽屜', '把手', '五金配件', '廚房設備'];
    [...sum.values()].sort((a, b) => order.indexOf(a.r[0]) - order.indexOf(b.r[0]) || String(a.r[1]).localeCompare(String(b.r[1]), 'zh-Hant') || String(a.r[2]).localeCompare(String(b.r[2]))).forEach(sm => {
      out.push(line([...sm.r, sm.qty, sm.unit, [...sm.cabs].join(' ')]));
    });
    // 板材面積統計（依色號、厚度）
    out.push('');
    out.push(line(['【板材用量】（依色號、厚度，不含損耗）']));
    out.push(line(['色號', '色號名稱', '厚度(mm)', '片數', '面積(m²)', '約合 4×8 尺板（1220×2440）片數', '計價才數（板材與桌面，每片進位）']));
    const area = new Map();
    sum.forEach(sm => {
      const [cat, , code, , t, L, W] = sm.r;
      if (!['桌面', '櫃體板材', '檯面', '踢腳板', '門片', '抽屜'].includes(cat) || !L || !W || !code || code === '清玻璃') return;
      const k = code + '|' + t;
      if (!area.has(k)) area.set(k, { code, t, pcs: 0, a: 0, cai: 0 });
      const o = area.get(k); o.pcs += sm.qty; o.a += L * W * sm.qty / 1e6; o.cai += (sm.pc || 0) * sm.qty;
    });
    [...area.values()].sort((a, b) => b.a - a.a).forEach(o => out.push(line([o.code, name(o.code), o.t, o.pcs, o.a.toFixed(2), Math.ceil(o.a / (1.22 * 2.44)), o.cai || ''])));
    const csv = '\ufeff' + out.join('\r\n');
    App.download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${safe(st.name)}_拆料清單_${stamp()}.csv`);
    App.toast(`已匯出拆料清單：${st.cabinets.length} 件櫃體、${n} 筆明細`);
  };

  /* ---------- b. DAE ---------- */
  Ex.dae = function () {
    const THREE = window.THREE;
    const V = window.Viewer;
    const objects = [];
    const room = V.getRoomObject();
    if (room) objects.push({ name: 'Room', obj: room });
    V.getCabGroup().children.forEach(g => {
      const cab = App.state.cabinets.find(c => c.id === g.userData.cabId);
      objects.push({ name: cab ? `${window.Model.cabName(cab)}_${cab.id}` : 'Cabinet', obj: g });
    });
    const mats = new Map();
    const matId = m => {
      if (!mats.has(m.uuid)) {
        const mc = m.userData.matCode && window.UI.matOf(m.userData.matCode);
        const c = mc && mc.hex ? new THREE.Color(mc.hex) : (m.color || new THREE.Color(0xcccccc));
        mats.set(m.uuid, { id: 'mat' + mats.size, name: (m.userData.matCode || m.type).replace(/[^\w-]/g, '_'), color: [c.r, c.g, c.b], alpha: m.transparent && !m.depthWrite && m.opacity > 0.15 ? m.opacity : 1 });
      }
      return mats.get(m.uuid).id;
    };
    const geos = [], nodes = [];
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    objects.forEach((o, oi) => {
      o.obj.updateMatrixWorld(true);
      const pos = [], nor = [], groups = new Map();
      o.obj.traverse(m => {
        if (!m.isMesh || !m.visible || !m.geometry || !m.geometry.attributes.position) return;
        const mat = Array.isArray(m.material) ? m.material[0] : m.material;
        if (mat.opacity === 0) return;
        const id = matId(mat);
        const g = m.geometry, pa = g.attributes.position, na = g.attributes.normal;
        const nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
        const flip = m.matrixWorld.determinant() < 0;
        const base = pos.length / 3;
        for (let i = 0; i < pa.count; i++) {
          v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld);
          pos.push(+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2));
          if (na) { n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor.push(+n.x.toFixed(4), +n.y.toFixed(4), +n.z.toFixed(4)); } else nor.push(0, 1, 0);
        }
        if (!groups.has(id)) groups.set(id, []);
        const tri = groups.get(id);
        const idx = g.index ? g.index.array : null;
        const cnt = idx ? idx.length : pa.count;
        for (let i = 0; i < cnt; i += 3) {
          let a = idx ? idx[i] : i, b = idx ? idx[i + 1] : i + 1, c = idx ? idx[i + 2] : i + 2;
          if (flip) [b, c] = [c, b];
          tri.push(base + a, base + b, base + c);
        }
      });
      if (!pos.length) return;
      const gid = 'geo' + oi;
      const tris = [...groups.entries()].map(([mid, t]) => `<triangles material="${mid}" count="${t.length / 3}"><input semantic="VERTEX" source="#${gid}-v" offset="0"/><input semantic="NORMAL" source="#${gid}-n" offset="0"/><p>${t.join(' ')}</p></triangles>`).join('');
      const acc = (id, count) => `<technique_common><accessor source="#${id}" count="${count}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common>`;
      geos.push(`<geometry id="${gid}" name="${esc(o.name)}"><mesh>
<source id="${gid}-p"><float_array id="${gid}-pa" count="${pos.length}">${pos.join(' ')}</float_array>${acc(gid + '-pa', pos.length / 3)}</source>
<source id="${gid}-n"><float_array id="${gid}-na" count="${nor.length}">${nor.join(' ')}</float_array>${acc(gid + '-na', nor.length / 3)}</source>
<vertices id="${gid}-v"><input semantic="POSITION" source="#${gid}-p"/></vertices>
${tris}</mesh></geometry>`);
      nodes.push(`<node id="node${oi}" name="${esc(o.name)}"><instance_geometry url="#${gid}"><bind_material><technique_common>${[...groups.keys()].map(mid => `<instance_material symbol="${mid}" target="#${mid}"/>`).join('')}</technique_common></bind_material></instance_geometry></node>`);
    });
    const mlist = [...mats.values()];
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><contributor><authoring_tool>系統櫃 3D 設計平台</authoring_tool><author>${esc(App.user ? App.user.name : '')}</author></contributor><created>${new Date().toISOString()}</created><modified>${new Date().toISOString()}</modified><unit name="millimeter" meter="0.001"/><up_axis>Y_UP</up_axis></asset>
<library_effects>${mlist.map(m => `<effect id="${m.id}-fx"><profile_COMMON><technique sid="common"><lambert><diffuse><color>${m.color.map(x => x.toFixed(4)).join(' ')} 1</color></diffuse>${m.alpha < 1 ? `<transparent opaque="A_ONE"><color>0 0 0 ${m.alpha.toFixed(3)}</color></transparent><transparency><float>1</float></transparency>` : ''}</lambert></technique></profile_COMMON></effect>`).join('')}</library_effects>
<library_materials>${mlist.map(m => `<material id="${m.id}" name="${m.name}"><instance_effect url="#${m.id}-fx"/></material>`).join('')}</library_materials>
<library_geometries>${geos.join('\n')}</library_geometries>
<library_visual_scenes><visual_scene id="Scene" name="${esc(App.state.name)}">${nodes.join('')}</visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>`;
    const fn = App.state.floors && App.state.floors.length > 1 ? '_' + App.state.floors[App.state.floor].name : '';
    App.download(new Blob([xml], { type: 'model/vnd.collada+xml' }), `${safe(App.state.name)}${fn}_3D模型.dae`);
    App.toast('已匯出 DAE（單位 mm，Y 軸向上），可匯入 SketchUp');
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- c. 場景渲染 ---------- */
  Ex.renders = async function () {
    const st = App.state;
    const scenes = st.scenes.length ? st.scenes : [{ name: '目前視角', cam: window.Viewer.getCamera(), light: window.Viewer.getLight(), bg: window.Viewer.getBackground(), wallMode: window.Viewer.wallMode }];
    const prevWall = window.Viewer.wallMode, prevFloor = st.floor;
    const files = [];
    for (let i = 0; i < scenes.length; i++) {
      App.busy(true, `渲染場景 ${i + 1} / ${scenes.length}：${scenes[i].name}`);
      if (scenes[i].floor != null && scenes[i].floor !== App.state.floor) App.showFloor(scenes[i].floor);
      await nextFrame();
      const url = window.Viewer.renderImage(1920, 1080, scenes[i]);
      files.push({ name: `${String(i + 1).padStart(2, '0')}_${safe(scenes[i].name)}.jpg`, url });
    }
    window.Viewer.wallMode = prevWall;
    if (App.state.floor !== prevFloor) { App.showFloor(prevFloor); App.ui.refresh(); }
    if (files.length === 1) { App.download(files[0].url, `${safe(st.name)}_${files[0].name}`); }
    else if (window.JSZip) {
      const zip = new window.JSZip();
      files.forEach(f => zip.file(f.name, f.url.split(',')[1], { base64: true }));
      const blob = await zip.generateAsync({ type: 'blob' });
      App.download(blob, `${safe(st.name)}_場景渲染圖.zip`);
    } else {
      for (const f of files) { App.download(f.url, `${safe(st.name)}_${f.name}`); await new Promise(r => setTimeout(r, 400)); }
    }
    if (!st.scenes.length) App.toast('尚未建立場景，已輸出目前視角；可於「場景」分頁新增多個場景');
    else App.toast(`已輸出 ${files.length} 張渲染圖（1920×1080）`);
  };

  /* ---------- d. 三視圖 ---------- */
  Ex.viewsPDF = async function () {
    const st = App.state, q = P().quote(st);
    const pages = [];
    let pi = 0;
    for (const r of q.rows) {
      pi++;
      App.busy(true, `繪製三視圖 ${pi} / ${q.rows.length}`);
      await nextFrame();
      const cab = r.cab;
      const pg = Dr().Page('landscape', 200);
      const box = Dr().frame(pg, (r.floor ? r.floor + ' ' : '') + '三視圖　' + P().fullCode(cab), info({ page: pi, pages: q.rows.length }));
      const dep = cab.kind === 'corner' ? cab.w : cab.d;
      const totalH = cab.y + cab.h + (cab.top && cab.top !== 'none' ? 40 : 0);
      // 版面：左側 正視(下) + 俯視(上)，右側 側視；右上等角圖、右下規格
      const areaW = 175, areaH = box.y1 - box.y0 - 6;
      const s = Dr().fitScale(cab.w + dep + 1300, dep + totalH + 1100, areaW, areaH);
      const f = v => v / s;
      const fx = box.x0 + 18, topY = box.y0 + 10;
      const frontBase = topY + f(dep) + 18 + f(totalH);
      // 俯視
      Dr().cabTop(pg, cab, fx, topY, s);
      pg.text(fx + f(cab.kind === 'corner' ? cab.w : cab.w) + 12, topY + 4, '俯視圖', { size: 8, bold: true });
      Dr().dim(pg, fx, topY, fx + f(cab.w), topY, cab.w + '', -5.5);
      Dr().dim(pg, fx + f(cab.w), topY, fx + f(cab.w), topY + f(dep), dep + '', -5.5);
      // 正視
      Dr().cabFront(pg, cab, fx, frontBase, s);
      pg.line(fx - 5, frontBase, fx + f(cab.w) + 5, frontBase, 0.35);
      pg.text(fx, frontBase - f(totalH) - 3, '正視圖', { size: 8, bold: true });
      Dr().dim(pg, fx, frontBase, fx + f(cab.w), frontBase, cab.w + '', 7);
      Dr().dim(pg, fx, frontBase - f(cab.y), fx, frontBase - f(cab.y + cab.h), cab.h + '', -6);
      if (cab.y > 0) Dr().dim(pg, fx, frontBase, fx, frontBase - f(cab.y), cab.y + '', -6);
      // 門片分段尺寸
      if (cab.kind !== 'tri' && cab.fronts.length) {
        let yy = frontBase - f(cab.y + cab.h);
        M_rows(cab).forEach(rw => { const h = f(rw.h * 10); Dr().dim(pg, fx + f(cab.w), yy + h, fx + f(cab.w), yy, rw.h * 10 + '', -4.5, { size: 5.2 }); yy += h; });
      }
      // 側視
      const sx = fx + f(cab.w) + 22;
      Dr().cabSide(pg, cab, sx, frontBase, s);
      pg.line(sx - 5, frontBase, sx + f(dep) + 8, frontBase, 0.35);
      pg.text(sx, frontBase - f(totalH) - 3, '右側視圖', { size: 8, bold: true });
      Dr().dim(pg, sx, frontBase, sx + f(dep), frontBase, dep + '', 7);
      cab.shelves.slice().sort((a, b) => a.y - b.y).forEach(sh => {
        pg.text(sx + f(dep) + 3.5, frontBase - f(cab.y + sh.y + 9) + 1, `${Math.round(sh.y)}${sh.fixed ? ' 固' : ''}`, { size: 5, color: '#69727d' });
      });
      // 等角圖
      const iso = window.Viewer.renderCabinetIso(cab, 640);
      const ix = box.x1 - 80, iy = box.y0;
      await pg.image(iso, ix, iy, 70, 70);
      // 規格表
      const tx = box.x1 - 88; let ty = iy + 74;
      const stl = D.DOOR_STYLES.find(x => x.id === cab.doorStyle) || {};
      const rowsSpec = [
        ['型號', P().fullCode(cab)], ['尺寸', `W${cab.w} × D${cab.d} × H${cab.h} mm`], ['數量', r.qty + ' 件'],
        ...(cab.fronts.some(x => !window.Model.OPEN_ROW(x.t)) ? [['門板款式', stl.name || ''], ['把手', window.Model.handleOf(cab).name || '款式一體把手']] : []),
        ['門片配置', P().describe(cab)],
        ['層板', `活動 ${cab.shelves.filter(x => !x.fixed).length} 片・固定 ${cab.shelves.filter(x => x.fixed).length} 片${cab.rod ? '・吊衣桿' : ''}`],
        ...(P().hingeQty(cab) || P().footQty(cab) ? [['五金', `西德鉸鍊 ${P().hingeQty(cab)} 個${P().footQty(cab) ? '・調整腳 ' + P().footQty(cab) + ' 個' : ''}`]] : []),
        ['配件', `${cab.kick && !cab.hanging ? '踢腳板 100' : '無踢腳'}${cab.top && cab.top !== 'none' ? '・' + D.PARTS.TOP[cab.top].name : ''}`],
        ['單價', P().fmt(r.price.total)]
      ];
      if (cab.kind === 'appl') {
        const it = D.byCode[cab.code] || {};
        rowsSpec.splice(0, rowsSpec.length,
          ['型號', `${it.brand} ${cab.code}`], ['品名', it.name], ['類別', D.APPL_TYPES[cab.at]], ['尺寸', `W${cab.w} × D${cab.d} × H${cab.h} mm`],
          ...(it.cut ? [['檯面開孔', `${it.cut[0]} × ${it.cut[1]} mm`]] : []), ['規格', it.spec],
          [cab.mount === 'counter' ? '上緣高度' : '離地高度', `${cab.mount === 'counter' ? cab.y + cab.h : cab.y} mm`], ['數量', r.qty + ' 台'], ['單價', P().fmt(r.price.total)]);
      }
      if (cab.kind === 'desk') {
        const gm = window.Model.deskGeom(cab);
        rowsSpec.splice(0, rowsSpec.length,
          ['型號', P().fullCode(cab)], ['形狀', D.DESK_SHAPES[cab.shape] + '桌面'], ['尺寸', `${cab.w} × ${window.Model.footDepth(cab)} mm${cab.shape !== 'R' ? `（深 ${cab.d}）` : ''}`],
          ['材質', `${P().deskMatName(cab.deskMat)} ${cab.thick}mm`], ['端部', (D.DESK_EDGES.find(e => e.id === cab.edge) || {}).name],
          ['桌面高度', `${cab.y + cab.thick} mm（上緣）`], ['才數', `${P().deskCai(cab)} 才（面積 ${(gm.area / D.CAI).toFixed(2)} 才進位）`], ['數量', r.qty + ' 件'], ['單價', P().fmt(r.price.total)]);
      }
      rowsSpec.forEach(([k2, v]) => { pg.line(tx, ty + 1.8, tx + 84, ty + 1.8, 0.1, '#d5d9de'); pg.text(tx, ty, k2, { size: 7, color: '#69727d' }); pg.text(tx + 16, ty, v, { size: 7.2, maxW: 68 }); ty += 5.4; });
      pg.text(tx, ty + 1, '色板', { size: 7.5, bold: true });
      Dr().legend(pg, tx, ty + 3, Dr().cabParts(cab), { maxW: 70 });
      pg.text(box.x0 + 18, box.y1 - 2, `比例 1:${s}　單位 mm　層板高度＝距櫃體底部`, { size: 6.5, color: '#69727d' });
      // 比例寫回標題欄
      Dr().frame(pg, (r.floor ? r.floor + ' ' : '') + '三視圖　' + P().fullCode(cab), info({ page: pi, pages: q.rows.length, scale: '1:' + s }));
      pages.push(pg);
    }
    pagesToPDF(pages, `${safe(st.name)}_櫃體三視圖_${stamp()}`);
  };
  function M_rows(cab) { return window.Model.rowsWithFiller(cab); }

  /* ---------- e. 平面圖及立面圖 ---------- */
  Ex.plansPDF = async function () {
    const st0 = App.state;
    const pages = [];
    const floors = App.floorList(), multi = floors.length > 1;
    const total = floors.reduce((a, f) => a + 1 + (f.room ? f.room.points.length : 0), 0);
    let pno = 0;
    for (const fl of floors) {
    if (!fl.room && !(fl.cabinets || []).length) continue;
    const st = { ...st0, room: fl.room, cabinets: fl.cabinets || [] };
    const pre = multi ? fl.name + ' ' : '';
    const walls = st.room ? st.room.points.map((_, i) => i) : [];
    // 平面
    let pg = Dr().Page('landscape', 200);
    let box = Dr().frame(pg, pre + '平面配置圖', info({ page: ++pno, pages: total }));
    const s = Dr().plan(pg, st, { x0: box.x0 + 6, y0: box.y0 + 4, x1: box.x1 - 58, y1: box.y1 - 2 });
    legendFor(pg, st.cabinets, box.x1 - 50, box.y0 + 4);
    Dr().frame(pg, pre + '平面配置圖', info({ page: pno, pages: total, scale: s ? '1:' + s : '—' }));
    pages.push(pg);
    // 立面
    for (const i of walls) {
      App.busy(true, `繪製 ${pre}立面圖 ${i + 1} / ${walls.length}`);
      await nextFrame();
      pg = Dr().Page('landscape', 200);
      const title = `${pre}立面圖　${window.Model.wallName(i)}（W${i + 1}）`;
      box = Dr().frame(pg, title, info({ page: ++pno, pages: total }));
      const res = Dr().elevation(pg, st, i, { x0: box.x0 + 14, y0: box.y0 + 8, x1: box.x1 - 58, y1: box.y1 - 12 });
      legendFor(pg, res.cabs, box.x1 - 50, box.y0 + 44);
      // 索引小圖
      keyPlan(pg, st, i, box.x1 - 40, box.y0 + 2, 34);
      pg.text(box.x0 + 2, box.y1 - 2, `從室內面向 W${i + 1} 觀看　比例 1:${res.s}　單位 mm　${res.count ? res.count + ' 件櫃體' : '此牆面無靠牆櫃體'}`, { size: 6.5, color: '#69727d' });
      Dr().frame(pg, title, info({ page: pno, pages: total, scale: '1:' + res.s }));
      pages.push(pg);
    }
    }
    if (!pages.length) { App.ui.alert('無法匯出', '各樓層都尚未建立空間或放置櫃體。'); return; }
    pagesToPDF(pages, `${safe(st0.name)}_平面圖及立面圖_${stamp()}`);
  };
  // 本頁使用色板圖例
  function legendFor(pg, cabs, x, y) {
    const used = new Map();
    cabs.forEach(c => Dr().cabParts(c).forEach(([part, code]) => { if (!used.has(code)) used.set(code, new Set()); used.get(code).add(part); }));
    if (!used.size) return;
    pg.text(x, y, '色板', { size: 8, bold: true });
    Dr().legend(pg, x, y + 2.5, [...used.entries()].slice(0, 14).map(([code, parts]) => [[...parts].join('・'), code]), { maxW: 36, sw: 8 });
  }
  function keyPlan(pg, st, idx, x, y, size) {
    const r = st.room; if (!r) return;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    r.points.forEach(([a, b]) => { minx = Math.min(minx, a); maxx = Math.max(maxx, a); minz = Math.min(minz, b); maxz = Math.max(maxz, b); });
    const sc = size / Math.max(maxx - minx, maxz - minz);
    const P2 = ([a, b]) => [x + (a - minx) * sc, y + (b - minz) * sc];
    r.points.forEach((_, i) => {
      const wi = window.Model.wallInfo(r, i);
      const A = P2(wi.p), B = P2(wi.q);
      pg.line(A[0], A[1], B[0], B[1], i === idx ? 1.2 : 0.35, i === idx ? '#d0342c' : '#1f2328');
    });
    const wi = window.Model.wallInfo(r, idx);
    const m = P2(wi.mid);
    pg.text(m[0] + wi.nIn[0] * 5, m[1] + wi.nIn[1] * 5, 'W' + (idx + 1), { size: 6, bold: true, color: '#d0342c', align: 'center', base: 'middle' });
    pg.text(x, y + size + 5, '索引圖', { size: 6, color: '#69727d' });
  }

  /* ---------- g. 施工圖 .DXF（立面＋平面，CAD 向量） ---------- */
  const DXF_KEY = 'aries_dxf_opts';
  const FRAME_KEY = 'aries_dxf_frame';
  const esc3 = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function loadFrame() {
    try { const o = JSON.parse(localStorage.getItem(FRAME_KEY) || 'null'); return o && o.fr && o.fr.ents ? o : null; }
    catch (e) { return null; }
  }
  // DXF 的編碼：R2007 以後一律 UTF-8，但很多檔案的 $DWGCODEPAGE 還留著 ANSI_950，
  // 所以不能看標頭，要先用嚴格 UTF-8 試解碼，失敗才退回 Big5。
  function decodeDXF(buf) {
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), enc: 'UTF-8' }; }
    catch (e) {
      try { return { text: new TextDecoder('big5').decode(buf), enc: 'Big5' }; }
      catch (e2) { return { text: new TextDecoder('utf-8').decode(buf), enc: 'UTF-8（有無法辨識的字元）' }; }
    }
  }
  function frameInfoHTML(st) {
    if (!st) return '<p class="muted" style="margin:6px 0 0;font-size:12px">尚未載入。沒有載入時會用內建圖框。</p>';
    const fr = st.fr;
    const area = fr.area
      ? `繪圖區 ${Math.round(fr.area.x1 - fr.area.x0)}×${Math.round(fr.area.y1 - fr.area.y0)} mm（${fr.areaNamed ? '由圖層指定' : '自動判定'}）`
      : '<b style="color:#b45309">找不到繪圖區矩形，會用整張內縮 5mm</b>';
    return `<p style="margin:6px 0 0;font-size:12px">
      <b>${esc3(st.name)}</b>　${fr.w}×${fr.h} mm　${fr.ents.length} 個圖元　${fr.texts.length} 段文字<br>${area}
      ${fr.warnings && fr.warnings.length ? '<br><span style="color:#b45309">' + fr.warnings.map(esc3).join('；') + '</span>' : ''}</p>`;
  }
  function frameMapHTML(st) {
    if (!st) return '';
    const opts = window.DXFOut.FIELDS;
    const rows = st.fr.texts.slice().sort((a, b) => b.y - a.y).map(t => {
      const cur = (st.map || {})[t.ti] || '';
      const sel = opts.map(([v, lab]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${lab}</option>`).join('');
      return `<tr><td style="padding:2px 6px 2px 0;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc3(t.s)}">${esc3(t.s)}</td>
        <td><select name="fmap_${t.ti}" style="width:110px">${sel}</select></td></tr>`;
    }).join('');
    return `<details style="margin-top:8px"${Object.keys(st.map || {}).length ? '' : ' open'}>
      <summary style="cursor:pointer;font-size:13px">標題欄欄位對應（${Object.keys(st.map || {}).length} 項已對應）</summary>
      <p class="muted" style="margin:6px 0;font-size:12px">左邊是圖框裡現有的文字，選了欄位的會在每張圖被換成該案的實際內容；選「（不替換）」就原樣保留。</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px">${rows}</table>
    </details>`;
  }

  const dxfDefaults = { paper: 'A3', scale: 'auto', walls: 'with-cab', frame: true, plan: true, dims: true, labels: true, swing: true, hidden: true, handles: true, hatch: true, index: true };
  function dxfOpts() {
    try { return Object.assign({}, dxfDefaults, JSON.parse(localStorage.getItem(DXF_KEY) || '{}')); }
    catch (e) { return Object.assign({}, dxfDefaults); }
  }
  Ex.dxf = async function () {
    const st = App.state;
    const o = dxfOpts();
    let frameState = loadFrame();
    const sel = (name, opts, cur) => `<select name="${name}">` +
      opts.map(([v, t]) => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${t}</option>`).join('') + '</select>';
    const chk = (name, label, on, hint) =>
      `<label class="choice"><input type="checkbox" name="${name}"${on ? ' checked' : ''}><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span></label>`;
    const res = await App.ui.modal({
      title: '匯出施工圖 .DXF',
      wide: true,
      body: `<p class="muted" style="margin:0 0 10px;font-size:12px">
          輸出 AutoCAD R12 格式，<b>模型空間 1:1、單位 mm</b>，每個視圖各自帶圖框與標題欄，可直接在 CAD 列印或套用自家圖框。
        </p>
        <div class="grid2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <label>圖紙<br>${sel('paper', [['A4', 'A4 297×210'], ['A3', 'A3 420×297'], ['A2', 'A2 594×420'], ['A1', 'A1 841×594']], o.paper)}</label>
          <label>出圖比例<br>${sel('scale', [['auto', '自動（塞滿圖框）'], ['10', '1:10'], ['15', '1:15'], ['20', '1:20'], ['25', '1:25'], ['30', '1:30'], ['50', '1:50'], ['100', '1:100']], o.scale)}</label>
        </div>
        <label>要出哪些立面<br>${sel('walls', [['with-cab', '只出有靠牆櫃體的牆面'], ['all', '每一面牆都出']], o.walls)}</label>
        <label style="display:block;margin-top:10px">圖框<br>${sel('frame', [['1', '用內建圖框與標題欄'], ['0', '不畫圖框（自己在 CAD 裡套）']], o.frame ? '1' : '0')}</label>
        <div style="margin-top:10px;padding:10px;border:1px solid var(--line,#d8dce1);border-radius:6px">
          <b style="font-size:13px">公司圖框 .dxf</b>
          <p class="muted" style="margin:4px 0 6px;font-size:12px">載入後會自動套到每一張圖，<b>紙張大小與繪圖區都改用圖框實際畫的</b>（上面的「圖紙」與「圖框」兩個選項就不生效）。圖框只需載入一次，會記在這台電腦的瀏覽器裡。</p>
          <input type="file" id="dxfFrameFile" accept=".dxf,application/dxf" style="font-size:12px">
          <button type="button" class="btn small" id="dxfFrameClear" style="margin-left:6px"${frameState ? '' : ' hidden'}>清除</button>
          <div id="dxfFrameInfo">${frameInfoHTML(frameState)}</div>
          <div id="dxfFrameMap">${frameMapHTML(frameState)}</div>
        </div>
        <div style="margin-top:10px">
          ${chk('plan', '一併輸出平面配置圖', o.plan, '含牆體剖面線、門窗、櫃體俯視與立面索引 W1、W2…')}
          ${chk('dims', '尺寸標註', o.dims, '櫃寬鏈、高度鏈、牆淨長與門窗尺寸（打散的線與文字，放在 A-DIM 圖層）')}
          ${chk('labels', '型號與色號標籤', o.labels)}
          ${chk('swing', '門片開啟方向', o.swing)}
          ${chk('hidden', '門後層板用隱藏線', o.hidden)}
          ${chk('handles', '把手符號', o.handles)}
          ${chk('hatch', '平面圖牆體剖面填充', o.hatch)}
        </div>
        <p class="muted" style="margin:10px 0 0;font-size:12px">
          中文以 \\U+ 轉義寫入（AutoCAD 會自動還原）；文字樣式用<b>標楷體 kaiu.ttf</b>，若電腦沒有此字型，CAD 開啟時會提示替代字型。
        </p>`,
      buttons: [{ label: '取消' }, { label: '匯出 DXF', primary: true, value: 'ok' }],
      onOpen: back => {
        const file = back.querySelector('#dxfFrameFile');
        const info = back.querySelector('#dxfFrameInfo');
        const mapEl = back.querySelector('#dxfFrameMap');
        const clear = back.querySelector('#dxfFrameClear');
        const redraw = () => {
          info.innerHTML = frameInfoHTML(frameState);
          mapEl.innerHTML = frameMapHTML(frameState);
          clear.hidden = !frameState;
        };
        clear.addEventListener('click', () => {
          frameState = null;
          try { localStorage.removeItem(FRAME_KEY); } catch (e) { /* 無痕模式 */ }
          file.value = ''; redraw();
        });
        file.addEventListener('change', async () => {
          const f = file.files && file.files[0];
          if (!f) return;
          info.innerHTML = '<p class="muted" style="margin:6px 0 0;font-size:12px">讀取中…</p>';
          try {
            const { text, enc } = decodeDXF(await f.arrayBuffer());
            const fr = window.DXFOut.parseFrame(text);
            if (fr.error) { info.innerHTML = `<p style="margin:6px 0 0;font-size:12px;color:#b91c1c">${esc3(fr.error)}</p>`; return; }
            if (!fr.texts.length && fr.ents.length < 4) { info.innerHTML = '<p style="margin:6px 0 0;font-size:12px;color:#b91c1c">只讀到 ' + fr.ents.length + ' 個圖元，這可能不是圖框檔。</p>'; return; }
            frameState = { name: f.name + '（' + enc + '）', savedAt: Date.now(), fr, map: window.DXFOut.guessMap(fr) };
            redraw();
            try { localStorage.setItem(FRAME_KEY, JSON.stringify(frameState)); }
            catch (e) { info.innerHTML += '<p style="margin:4px 0 0;font-size:12px;color:#b45309">圖框太大，沒辦法記住，這次匯出仍會套用。</p>'; }
          } catch (e) {
            info.innerHTML = `<p style="margin:6px 0 0;font-size:12px;color:#b91c1c">讀取失敗：${esc3(e.message || e)}</p>`;
          }
        });
      }
    });
    if (!res || res.button !== 'ok') return;
    const d = res.data;
    // 收集標題欄欄位對應並記住
    if (frameState) {
      const map = {};
      Object.keys(d).forEach(k => { if (k.indexOf('fmap_') === 0 && d[k]) map[k.slice(5)] = d[k]; });
      frameState.map = map;
      try { localStorage.setItem(FRAME_KEY, JSON.stringify(frameState)); } catch (e) { /* 存不下就算了 */ }
    }
    const opt = {
      paper: d.paper, scale: d.scale === 'auto' ? 'auto' : +d.scale, walls: d.walls,
      frame: d.frame === '1', plan: d.plan, dims: d.dims, labels: d.labels, swing: d.swing,
      hidden: d.hidden, handles: d.handles, hatch: d.hatch, index: true,
      companyFrame: frameState ? frameState.fr : null, frameMap: frameState ? frameState.map : null
    };
    // 圖框另外存在 FRAME_KEY，不要跟著選項再存一份
    const save = Object.assign({}, opt); delete save.companyFrame; delete save.frameMap;
    try { localStorage.setItem(DXF_KEY, JSON.stringify(save)); } catch (e) { /* 無痕模式：不存就算了 */ }

    App.busy(true, '產生施工圖 DXF…');
    await nextFrame();
    const floors = App.floorList().map(fl => ({ name: fl.name, room: fl.room, cabinets: fl.cabinets || [] }));
    // 新專案的預設名稱是「新專案 20261004-2209」，標題欄不需要那串日期時間
    const title = String(st.name || '專案').replace(/\s*\d{8}-\d{4}\s*$/, '').trim() || st.name;
    const built = window.DXFOut.build({ name: title, client: st.client, by: (App.user && App.user.name) || '', floors }, opt);
    if (!built) { App.ui.alert('無法匯出', '各樓層都尚未建立空間或放置櫃體。'); return; }
    App.download(new Blob([built.text], { type: 'application/dxf' }),
      `${safe(st.name)}_施工圖_${stamp()}.dxf`);
    App.toast(`已匯出 ${built.views} 個視圖（比例 1:${built.scale}，${built.entities} 個圖元）`);
    if (built.frameKind === 'company' && built.renamed && built.renamed.length) {
      App.busy(false);
      await App.ui.modal({
        title: '圖框已套用，但有圖層／字型被改名',
        buttons: [{ label: '知道了', primary: true, value: 'ok' }],
        body: `<p>R12 格式的<b>圖層與字型「名稱」不能用 \\U+ 轉義</b>，所以含中文的名稱改成了 ASCII，圖形與文字內容不受影響：</p>
          <ul style="font-size:13px">${built.renamed.map(r => `<li><code>${esc3(r.from)}</code> → <code>${esc3(r.to)}</code></li>`).join('')}</ul>
          <p class="muted" style="font-size:12px">在 CAD 裡可以直接把圖層改回原名。要避免改名的話，把圖框裡的圖層／字型改成英數名稱再上傳即可。</p>`
      });
    }
    if (!built.frame) {
      App.busy(false);
      const rows = built.sheets.map(s => `<tr><td>${s.sheet}</td><td>${s.title}</td><td style="text-align:right">${s.x}</td><td style="text-align:right">${s.y}</td></tr>`).join('');
      await App.ui.modal({
        title: '怎麼套公司圖框',
        wide: true,
        buttons: [{ label: '知道了', primary: true, value: 'ok' }],
        body:
        `<p>已匯出 ${built.views} 張，<b>比例 1:${built.scale}</b>、紙張 <b>${built.paper}</b>（${built.pitch.w}×${built.pitch.h} mm，因為圖是 1:1 畫的，紙張也放大了 ${built.scale} 倍）。</p>
         <p>每張圖的紙張範圍已經畫在 <b>DEFPOINTS</b> 圖層（這層不會列印），用端點抓點就能對齊。把公司圖框 <code>INSERT</code> 進來時<b>比例填 ${built.scale}</b>，左下角對到下列基準點：</p>
         <table style="width:100%;border-collapse:collapse;font-size:12px">
           <thead><tr><th style="text-align:left">圖號</th><th style="text-align:left">圖名</th><th style="text-align:right">X</th><th style="text-align:right">Y</th></tr></thead>
           <tbody>${rows}</tbody>
         </table>
         <p style="margin-top:8px">圖與圖的間距是 X ${built.pitch.x}、Y ${built.pitch.y}，排好之後把 DEFPOINTS 那層關掉即可。</p>`
      });
    }
  };

  window.Exporter = Ex;
})();
