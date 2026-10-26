/* 2D 圖面繪製（三視圖、平面圖、立面圖），輸出至 canvas */
(function () {
  const D = window.DATA;
  const M = () => window.Model;
  const FONT = '"Microsoft JhengHei","PingFang TC","Noto Sans TC","Heiti TC",sans-serif';
  const Dr = { FONT };

  /* ---------- 色板貼圖 ---------- */
  const imgs = {};
  const loading = new Map();   // key → Promise
  const load = (key, src) => {
    if (!loading.has(key)) loading.set(key, new Promise(res => { const im = new Image(); im.onload = () => { imgs[key] = im; res(); }; im.onerror = res; im.src = src; }));
    return loading.get(key);
  };
  // 目前專案用到的色號（各樓層櫃體＋預設值）
  function usedCodes() {
    const st = window.App && App.state, set = new Set();
    if (!st) return set;
    const scan = cabs => (cabs || []).forEach(c => ['bodyColor', 'doorColor', 'topColor', 'kickColor'].forEach(k => c[k] && set.add(c[k])));
    scan(st.cabinets); (st.floors || []).forEach(f => scan(f.cabinets)); Object.values(st.defaults || {}).forEach(v => typeof v === 'string' && set.add(v));
    return set;
  }
  Dr.ready = function () {
    const used = usedCodes();
    const jobs = (window.SWATCHES || []).filter(sw => sw.img && used.has(sw.code)).map(sw => load(sw.code, sw.img));
    jobs.push(load('__logo', window.LOGO_DATA || 'logo-puyu.png'));   // 圖框 Logo：預設用事務所 Logo
    return Promise.all(jobs);
  };
  // 色板庫變更後重新載入貼圖
  Dr.resetSwatches = function () { Object.keys(imgs).forEach(k => { if (k !== '__logo') { delete imgs[k]; loading.delete(k); } }); };
  const matOf = code => ((window.App && App.state && App.state.pricing.materials) || D.MATERIALS).find(m => m.code === code) || { code, name: '', hex: '#e8e2d6' };
  Dr.matName = code => { const m = matOf(code); return `${code} ${m.name || ''}`.trim(); };
  // 取得填色：色板貼圖（依比例 s 縮放，vertical=木紋直向）或色碼
  Dr.fill = function (pg, code, s, vertical) {
    const im = imgs[code];
    if (!im) return matOf(code).hex || '#e8e2d6';
    if (window.Model && Model.imgGrainOf && Model.imgGrainOf(code, im) === 'v') vertical = !vertical;   // 圖片本身是直紋
    const pat = pg.g.createPattern(im, 'repeat');
    const sc = (D.TEX_TILE.u / s) * pg.k / im.width;
    const m = new DOMMatrix();
    pat.setTransform(vertical ? m.rotate(90).scale(sc) : m.scale(sc));
    return pat;
  };
  // 立面上該部位要不要直紋：使用者設定優先，'auto' 時用各圖原本的預設
  Dr.gv = (cab, key, auto) => { const g = window.Model && Model.grainOf ? Model.grainOf(cab, key) : 'auto'; return g === 'v' ? true : g === 'h' ? false : !!auto; };
  // 色板小方塊
  Dr.swatch = function (pg, x, y, w, h, code) {
    const im = imgs[code], g = pg.g, k = pg.k;
    if (im) { const sw = Math.min(im.width * 0.5, im.height * w / h), sh = sw * h / w; g.drawImage(im, 0, 0, sw, sh, x * k, y * k, w * k, h * k); }
    else { g.fillStyle = matOf(code).hex || '#ccc'; g.fillRect(x * k, y * k, w * k, h * k); }
    pg.rect(x, y, w, h, { w: 0.15, color: '#8a8f96' });
  };
  // 材質圖例：items = [[部位, 色號], ...]
  Dr.legend = function (pg, x, y, items, o = {}) {
    const rowH = o.rowH || 6.2, sw = o.sw || 9;
    items.forEach(([label, code], i) => {
      const yy = y + i * rowH;
      Dr.swatch(pg, x, yy, sw, rowH - 1.4, code);
      pg.text(x + sw + 2, yy + 2.7, label, { size: 6, color: '#69727d' });
      pg.text(x + sw + 2, yy + 5.2, Dr.matName(code), { size: 6.8, bold: true, maxW: o.maxW || 60 });
    });
    return y + items.length * rowH;
  };
  Dr.cabParts = function (cab) {
    if (cab.kind === 'desk') return [['桌面', cab.topColor]];
    if (cab.kind === 'filler') return [['補板', cab.bodyColor]];
    if (cab.kind === 'appl') return (D.byCode[cab.code] || {}).finish === 'panel' ? [['嵌門板', cab.doorColor]] : [];
    const hasDoor = cab.fronts && cab.fronts.some(r => !M().OPEN_ROW(r.t));
    const it = [['櫃身', cab.bodyColor]];
    if (hasDoor) it.push(['門片', cab.doorColor]);
    if (cab.top && cab.top !== 'none') it.push(['桌面', cab.topColor || cab.doorColor]);
    if (cab.kick && !cab.hanging && cab.kind !== 'tri') it.push(['踢腳板', cab.kickColor || cab.bodyColor]);
    return it;
  };
  // 文字加白底（貼圖上可讀）
  Dr.tag = function (pg, x, y, text, o = {}) {
    pg.font(o.size || 6, o.bold);
    const w = pg.g.measureText(text).width / pg.k + 2, h = (o.size || 6) * 0.3528 + 1.6;
    pg.g.fillStyle = 'rgba(255,255,255,0.88)';
    pg.g.fillRect((x - w / 2) * pg.k, (y - h / 2) * pg.k, w * pg.k, h * pg.k);
    pg.text(x, y + 0.1, text, { ...o, align: 'center', base: 'middle' });
  };

  // 多行標籤：依可用寬度 maxW(mm) 等比縮字（最小 60%），anchor 為 center／top（往下排）／bottom（往上排）
  Dr.tagLines = function (pg, x, y, lines, maxW, anchor = 'center') {
    lines = lines.filter(l => l && l.t);
    if (!lines.length) return;
    const wOf = l => { pg.font(l.size, l.bold); return pg.g.measureText(l.t).width / pg.k + 2; };
    const f = Math.max(0.6, Math.min(1, maxW / Math.max(...lines.map(wOf))));
    const hs = lines.map(l => l.size * f * 0.3528 + 1.5);
    const tot = hs.reduce((a, b) => a + b, 0);
    let cy = anchor === 'top' ? y : anchor === 'bottom' ? y - tot : y - tot / 2;
    lines.forEach((l, i) => { Dr.tag(pg, x, cy + hs[i] / 2, l.t, { ...l, size: l.size * f }); cy += hs[i]; });
  };
  // 櫃名拆兩行：W…D…H… ／ 門片-S/M
  Dr.nameLines = function (name) {
    const m = /^(W\d+D\d+H\d+)-(.+)$/.exec(name);
    return m ? [m[1], m[2]] : [name];
  };

  /* ---------- 頁面 ---------- */
  // A4：portrait 210x297 / landscape 297x210；px 每 mm
  Dr.Page = function (orient = 'landscape', dpi = 200, size = 'a4') {
    const [L0, S0] = size === 'a3' ? [420, 297] : [297, 210];
    const wmm = orient === 'landscape' ? L0 : S0, hmm = orient === 'landscape' ? S0 : L0;
    const k = dpi / 25.4;
    const c = document.createElement('canvas');
    c.width = Math.round(wmm * k); c.height = Math.round(hmm * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.lineCap = 'round'; g.lineJoin = 'round';
    // 線寬比照施工圖：所有設定的線寬 ×0.42，最細 0.07mm（主線 0.3→約 0.13mm、外框 0.5→約 0.2mm），輕重改用深淺表現
    const lwd = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'lineWidth');
    Object.defineProperty(g, 'lineWidth', { get() { return lwd.get.call(this); }, set(v) { lwd.set.call(this, Math.max(v * Dr.PEN.scale, Dr.PEN.min * k)); } });
    const pg = { canvas: c, g, k, wmm, hmm, orient, size };
    pg.mm = v => v * k;
    pg.font = (size, bold) => { g.font = `${bold ? '700 ' : ''}${size * k * 0.3528}px ${FONT}`; };
    pg.text = (x, y, s, o = {}) => {
      pg.font(o.size || 9, o.bold);
      g.fillStyle = o.color || '#1f2328';
      g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'alphabetic';
      if (o.maxW) { let t = String(s); while (t.length > 1 && g.measureText(t).width > o.maxW * k) t = t.slice(0, -1); s = t === String(s) ? s : t.slice(0, -1) + '…'; }
      g.fillText(s, x * k, y * k);
    };
    pg.line = (x1, y1, x2, y2, w = 0.25, color = '#1f2328', dash) => {
      g.strokeStyle = color; g.lineWidth = w * k; g.setLineDash(dash ? dash.map(v => v * k) : []);
      g.beginPath(); g.moveTo(x1 * k, y1 * k); g.lineTo(x2 * k, y2 * k); g.stroke(); g.setLineDash([]);
    };
    pg.rect = (x, y, w, h, o = {}) => {
      if (o.fill) { g.fillStyle = o.fill; g.fillRect(x * k, y * k, w * k, h * k); }
      if (o.stroke !== false) { g.strokeStyle = o.color || '#1f2328'; g.lineWidth = (o.w || 0.25) * k; g.setLineDash(o.dash ? o.dash.map(v => v * k) : []); g.strokeRect(x * k, y * k, w * k, h * k); g.setLineDash([]); }
    };
    pg.image = (url, x, y, w, h) => new Promise(res => { const im = new Image(); im.onload = () => { g.drawImage(im, x * k, y * k, w * k, h * k); res(); }; im.onerror = res; im.src = url; });
    return pg;
  };

  // 筆：線寬縮放與深淺（比照事務所施工圖：細黑線為主、牆體灰填、次要物件灰線）
  Dr.PEN = { scale: 0.42, min: 0.07, ink: '#000000', mid: '#404040', grey: '#8c8c8c', light: '#bdbdbd', wall: '#8c8c8c', wallLock: '#5c5c5c', gold: '#bd9c6e' };
  // 圖框 + 標題欄：比照事務所現行圖框（A3 實測尺寸，A4 等比縮小）
  // 由左至右：Logo 框｜公司名＋電話 Email｜案名/案號｜圖名/圖號｜設計/繪圖｜比例/單位｜提交日/修正日｜簽名/核准｜修正內容｜附註 a~d
  Dr.FIRM = { name: '菩語國際設計', en: 'Purely interior design', tel: '03-335-8080', email: 'vivian66323@yahoo.com.tw' };
  Dr.frame = function (pg, title, info) {
    const { wmm, hmm } = pg, P = Dr.PEN, u = wmm / 420;   // u：以 A3 為基準的縮放
    const L = 7.8 * u, T = 7 * u, Rr = wmm - 7.6 * u, B = hmm - 7 * u, tbH = 21.9 * u, y0 = B - tbH;
    const X = v => L + (v - 7.8) * u;                     // A3 實測 x（mm）→ 本頁
    const txt = (x, y, t, size, o = {}) => pg.text(x, y, t, { size: size * u, color: o.color || '#000', maxW: o.maxW, align: o.align });
    pg.rect(L, T, Rr - L, B - T, { w: 0.6, color: P.ink });
    pg.rect(L, y0, Rr - L, tbH, { w: 0.6, color: P.ink, fill: '#fff' });
    // Logo 框與公司資料
    const firm = { ...Dr.FIRM, ...(info.firm || {}) };
    const lb = { x: X(10.9), y: y0 + 0.9 * u, w: 33.2 * u, h: tbH - 1.8 * u };
    pg.rect(lb.x, lb.y, lb.w, lb.h, { w: 0.25, color: P.ink });
    if (imgs.__logo) { const im = imgs.__logo, r = Math.min((lb.w - 3 * u) / im.width, (lb.h - 3 * u) / im.height), w = im.width * r, h = im.height * r; pg.g.drawImage(im, (lb.x + (lb.w - w) / 2) * pg.k, (lb.y + (lb.h - h) / 2) * pg.k, w * pg.k, h * pg.k); }
    const cx = X(47.9), cmax = X(93.8) - cx - 1;
    txt(cx, y0 + 7.7 * u, info.org || firm.name, 16, { maxW: cmax });
    txt(cx, y0 + 12.8 * u, firm.en, 12.5, { maxW: cmax });
    if (firm.tel) txt(cx, y0 + 15.9 * u, '電話 : ' + firm.tel, 6.2, { maxW: cmax });
    if (firm.email) txt(cx, y0 + 18.6 * u, 'Email : ' + firm.email, 6.2, { maxW: cmax });
    // 欄位格線
    const cols = [93.8, 128.8, 163.7, 183.5, 203.6, 233.6, 253.7, 350.0].map(X), h2 = tbH / 2;
    cols.forEach(x => pg.line(x, y0, x, B, 0.3, P.ink));
    pg.line(cols[0], y0 + h2, cols[6], y0 + h2, 0.3, P.ink);
    const no = 'ID-' + String(info.page || 1).padStart(2, '0');
    const cell = (ci, row, zh, en, val, vs = 9.5) => {
      const x = cols[ci] + 0.6 * u, y = y0 + row * h2, w = cols[ci + 1] - cols[ci] - 1.2 * u;
      txt(x, y + 2.4 * u, zh + '  ' + en, 5.6, { maxW: w });
      if (val) txt(x, y + 7.9 * u, val, vs, { maxW: w });
    };
    const sc = info.scale && info.scale !== '—' ? `${pg.size.toUpperCase()}=${String(info.scale).replace('1:', '1/')}` : '';
    cell(0, 0, '案名', 'PROJECT', [info.project, info.client].filter(Boolean).join(' ')); cell(0, 1, '案號', 'PROJECT NO', info.projectNo || '');
    cell(1, 0, '圖名', 'DRAWING TITLE', title, 9); cell(1, 1, '圖號', 'DRAWING NO', `${no}${info.pages > 1 ? `（${info.page}/${info.pages}）` : ''}`);
    cell(2, 0, '設計', 'DESIGNED', info.designer || ''); cell(2, 1, '繪圖', 'DRAWN', info.drawn || info.designer || '');
    cell(3, 0, '比例', 'SCALE', sc); cell(3, 1, '單位', 'UNIT', '公釐 ( mm )', 8.5);
    cell(4, 0, '提交日', 'DRAWN DATE', info.date || ''); cell(4, 1, '修正日', 'REVISIONS DATE', info.rev || '');
    cell(5, 0, '簽名', 'SIGN IN', ''); cell(5, 1, '核准', 'APPROVED BY', '');
    txt(cols[6] + 0.6 * u, y0 + 2.4 * u, '修正內容  DESCRIPTION', 5.6);
    ['a.本圖面均有著作權權利', 'b.圖面標註尺寸僅供參考施做均以現場放樣檢討之.', 'c.圖面標註尺寸,材料及文字敘述因版本不同之差異,', '   均以出圖章簽認日期之最後日期為依據 .', 'd.電腦圖檔除由合約訂定外 均不得以任何方式外流.']
      .forEach((t, i) => txt(cols[7] + 1.2 * u, y0 + (4.2 + i * 4.1) * u, t, 6.6, { maxW: Rr - cols[7] - 1.5 * u }));
    // 圖名泡泡（有比例時＝第二次呼叫，畫在圖面區下方中央）
    const box = { x0: L + 4 * u, y0: T + 4 * u, x1: Rr - 4 * u, y1: y0 - 12 * u };
    if (info.scale && info.scale !== '—') Dr.caption(pg, wmm / 2, y0 - 8 * u, 1, no, title, info.scale, u);
    return box;
  };
  // 圖名泡泡：圓圈內上為序號、下為圖號，右側圖名加底線，下方 S=1/xx
  Dr.caption = function (pg, cx, cy, n, no, title, scale, u = 1) {
    const g = pg.g, k = pg.k, z = u * 1.25;   // A3 上放大一些，比照事務所圖面
    pg.font(8.5 * z); const tw = g.measureText(title).width / k;
    const r = 3.2 * z, x = cx - (tw + 3 * r) / 2;
    g.strokeStyle = '#000'; g.lineWidth = 0.3 * k; g.beginPath(); g.arc((x + r) * k, cy * k, r * k, 0, Math.PI * 2); g.stroke();
    pg.line(x, cy, x + 2 * r, cy, 0.2, '#000');
    pg.text(x + r, cy - 0.6 * z, String(n), { size: 6.5 * z, align: 'center', color: '#000' });
    pg.text(x + r, cy + 2.4 * z, no, { size: 3.6 * z, align: 'center', color: '#000' });
    pg.text(x + 2 * r + 1.6 * z, cy - 0.7 * z, title, { size: 8.5 * z, color: '#000' });
    pg.line(x + 2 * r, cy, x + 2 * r + tw + 4 * z, cy, 0.3, '#000');
    pg.text(x + 2 * r + tw + 4 * z, cy + 3.4 * z, 'S=' + String(scale).replace('1:', '1/'), { size: 7 * z, align: 'right', color: '#000' });
  };

  // 尺寸標註（x,y 為 mm 紙面座標）
  Dr.dim = function (pg, x1, y1, x2, y2, text, off = 6, o = {}) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy); if (L < 0.3) return;
    const nx = -dy / L * off, ny = dx / L * off;
    const a1 = [x1 + nx, y1 + ny], a2 = [x2 + nx, y2 + ny];
    const col = o.color || '#1a1a1a';
    pg.line(x1 + nx * 0.15, y1 + ny * 0.15, a1[0] + nx / Math.abs(off) * 1.2, a1[1] + ny / Math.abs(off) * 1.2, 0.13, col);
    pg.line(x2 + nx * 0.15, y2 + ny * 0.15, a2[0] + nx / Math.abs(off) * 1.2, a2[1] + ny / Math.abs(off) * 1.2, 0.13, col);
    pg.line(a1[0], a1[1], a2[0], a2[1], 0.15, col);
    const t = 1.1, ux = dx / L, uy = dy / L;
    [a1, a2].forEach(a => pg.line(a[0] - (ux + uy) * t / 1.4, a[1] - (uy - ux) * t / 1.4, a[0] + (ux + uy) * t / 1.4, a[1] + (uy - ux) * t / 1.4, 0.3, col));
    const g = pg.g, k = pg.k;
    g.save();
    g.translate((a1[0] + a2[0]) / 2 * k, (a1[1] + a2[1]) / 2 * k);
    let ang = Math.atan2(dy, dx); if (ang > Math.PI / 2 + 0.01 || ang < -Math.PI / 2 - 0.01) ang += Math.PI;
    g.rotate(ang);
    pg.font(o.size || 6.5);
    g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillText(text, 0, -0.6 * k);
    g.restore();
  };

  // 剖面斜線（45°，灰細線＋黑外框）
  Dr.hatch = function (pg, x, y, w, h, gap = 1.1) {
    const g = pg.g, k = pg.k;
    g.save(); g.beginPath(); g.rect(x * k, y * k, w * k, h * k); g.clip();
    for (let t = -h; t < w; t += gap) pg.line(x + t, y + h, x + t + h, y, 0.12, Dr.PEN.grey);
    g.restore();
    pg.rect(x, y, w, h, { w: 0.45, color: Dr.PEN.ink });
  };
  const niceScales = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 300];
  Dr.fitScale = function (realW, realH, boxW, boxH) {
    const need = Math.max(realW / boxW, realH / boxH);
    return niceScales.find(s => s >= need) || Math.ceil(need / 50) * 50;
  };


  /* ---------- 廚房設備 ---------- */
  const APPL_FILL = { steel: '#c9cdd1', glass: '#2b2f33', white: '#f3f3f1' };
  Dr.applFill = (pg, cab, s) => { const it = D.byCode[cab.code] || {}; return it.finish === 'panel' ? Dr.fill(pg, cab.doorColor, s, true) : APPL_FILL[it.finish] || '#c9cdd1'; };
  Dr.applFront = function (pg, cab, x, y, s) {
    const f = v => v / s, it = D.byCode[cab.code] || {};
    const W = f(cab.w), y0 = y - f(cab.y), H = f(cab.h), fill = Dr.applFill(pg, cab, s);
    if (cab.at === 'sink') {
      pg.rect(x + f(25), y0 - H, W - f(50), H, { w: 0.2, dash: [1, 0.7], color: '#6b7280' });
      pg.rect(x, y0 - H - f(2), W, f(4), { w: 0.25, fill: APPL_FILL.steel });
      pg.line(x + W / 2, y0 - H, x + W / 2, y0 - H - f(300), 0.5, '#6b7280');
      pg.line(x + W / 2, y0 - H - f(300), x + W / 2 + f(40), y0 - H - f(300), 0.5, '#6b7280');
      return;
    }
    if (cab.at === 'hob') {
      const cut = it.cut || [cab.w - 60];
      pg.rect(x + (W - f(cut[0])) / 2, y0 - H + f(8), f(cut[0]), H - f(8), { w: 0.2, dash: [1, 0.7], color: '#6b7280' });
      pg.rect(x, y0 - H, W, f(8), { w: 0.3, fill });
      [0.25, 0.75].forEach(k => pg.rect(x + W * k - f(70), y0 - H - f(20), f(140), f(20), { w: 0.2, fill: '#2a2a2a' }));
      return;
    }
    pg.rect(x, y0 - H, W, H, { w: 0.3, fill });
    const ln = it.finish === 'glass' ? '#9aa0a6' : '#555';
    if (cab.at === 'dw') { pg.rect(x, y0 - H, W, f(90), { w: 0.2, fill: it.finish === 'panel' ? fill : '#2b2f33' }); pg.line(x + W / 2 - f(150), y0 - H + f(130), x + W / 2 + f(150), y0 - H + f(130), 0.5, ln); }
    else if (cab.at === 'oven') { pg.rect(x, y0 - H, W, f(90), { w: 0.2, fill: APPL_FILL.steel }); pg.rect(x + f(60), y0 - H + f(160), W - f(120), H - f(200), { w: 0.2, fill: '#3d4349' }); pg.line(x + f(70), y0 - H + f(120), x + W - f(70), y0 - H + f(120), 0.5, '#bfc3c7'); }
    else if (cab.at === 'dryer') { pg.line(x + f(10), y0 - H * 0.48, x + W - f(10), y0 - H * 0.48, 0.2, ln); }
    else if (cab.at === 'hood') { pg.rect(x, y0 - f(40), W, f(40), { w: 0.2, fill: '#2a2a2a' }); if (it.style !== 'near') pg.rect(x + W / 2 - f(90), y0 - H - f(200), f(180), f(200), { w: 0.2, fill: APPL_FILL.steel }); }
    pg.text(x + W / 2, y0 - H / 2 + 1, cab.code, { size: 5.5, align: 'center', color: it.finish === 'glass' ? '#ffffff' : '#1f2328' });
  };
  Dr.applTop = function (pg, cab, x, y, s) {
    const f = v => v / s, it = D.byCode[cab.code] || {}, W = f(cab.w), Dd = f(cab.d);
    pg.rect(x, y, W, Dd, { w: 0.3, fill: Dr.applFill(pg, cab, s) });
    if (cab.at === 'sink') { const c = it.cut || [cab.w - 30, cab.d - 30]; pg.rect(x + (W - f(c[0] - 30)) / 2, y + (Dd - f(c[1] - 30)) / 2, f(c[0] - 30), f(c[1] - 30), { w: 0.2, fill: '#e9ecef' }); }
    if (cab.at === 'hob') {
      const g = pg.g, k = pg.k, n = it.burners || 2;
      for (let i = 0; i < n; i++) { g.beginPath(); g.arc((x + W * (i + 0.5) / n) * k, (y + Dd * 0.44) * k, f(68) * k, 0, Math.PI * 2); g.strokeStyle = it.finish === 'glass' ? '#9aa0a6' : '#2a2a2a'; g.lineWidth = 0.3 * k; g.stroke(); }
    }
  };

  // 把手正視符號：(x,y)=門片左上角，w/h=門片寬高（紙面 mm），hinge=null 表抽屜
  Dr.handleMark = function (pg, cab, x, y, w, h, hinge, f, tallY) {
    const hd = M().handleOf(cab), col = '#555';
    if (hd.type === 'j' || hd.type === 'bev') {
      const e = M().handleEdge(hd.pos, hinge), th = hd.type === 'j' ? f(22) : f(14);
      const fill = hd.type === 'j' ? '#bfc3c7' : '#3a3a3a';
      if (e === 'top') pg.rect(x, y, w, th, { w: 0.15, fill });
      else if (e === 'bottom') pg.rect(x, y + h - th, w, th, { w: 0.15, fill });
      else if (e === 'left') pg.rect(x, y, th, h, { w: 0.15, fill });
      else pg.rect(x + w - th, y, th, h, { w: 0.15, fill });
      return;
    }
    if (hd.type === 'inset') {
      const [lx, ly] = M().insetPos(hd.pos, hinge, w * f.s, h * f.s);
      pg.rect(x + w / 2 + f(lx) - f(55), y + h / 2 - f(ly) - f(18), f(110), f(36), { w: 0.15, fill: '#3a3a3a' });
      return;
    }
    const style = hd.type === 'style' ? hd.style : hd.type;
    if (!hinge) {
      const yy = y + Math.min(h / 2, f(50));
      if (style === 'knob') { pg.g.beginPath(); pg.g.arc((x + w / 2) * pg.k, yy * pg.k, f(14) * pg.k, 0, Math.PI * 2); pg.g.fillStyle = col; pg.g.fill(); }
      else if (style === 'bar' || style === 'slot') pg.line(x + w / 2 - f(80), yy, x + w / 2 + f(80), yy, 0.5, col);
      else pg.line(x, y + f(8), x + w, y + f(8), 0.5, style === 'alu' || style === 'channel' ? '#9aa0a6' : col);
      return;
    }
    const hxx = hinge === 'L' ? x + w - f(40) : x + f(40);
    const hy = tallY != null ? tallY : y + h / 2 - f(80);
    if (style === 'knob') { pg.g.beginPath(); pg.g.arc(hxx * pg.k, (hy + f(80)) * pg.k, f(14) * pg.k, 0, Math.PI * 2); pg.g.fillStyle = col; pg.g.fill(); }
    else if (style === 'bar' || style === 'slot') pg.line(hxx, hy, hxx, hy + f(160), 0.5, col);
    else if (style === 'alu') pg.rect(hinge === 'L' ? x + w - f(20) : x, y, f(20), h, { w: 0.12, fill: '#bfc3c7' });
    else pg.line(x, y + f(8), x + w, y + f(8), 0.5, style === 'channel' ? '#9aa0a6' : col);
  };

  /* ---------- 櫃體正視 ---------- */
  function rowsOf(cab) { return M().rowsWithFiller(cab); }
  // 以 (x,y)=紙面左下角（地面），s=比例分母
  Dr.cabFront = function (pg, cab, x, y, s, o = {}) {
    const f = v => v / s; f.s = s;
    const W = f(cab.w), y0 = y - f(cab.y), H = f(cab.h);
    const col = '#1f2328', thin = 0.15, mid = 0.3;
    if (cab.kind === 'desk') { pg.rect(x, y0 - f(cab.thick), W, f(cab.thick), { w: 0.3, fill: Dr.fill(pg, cab.topColor, s) }); return; }
    if (cab.kind === 'appl') { Dr.applFront(pg, cab, x, y, s); return; }
    if (cab.kind === 'filler') { pg.rect(x, y0 - H, W, H, { w: 0.3, fill: Dr.fill(pg, cab.bodyColor, s, true) }); return; }
    const bodyFill = Dr.fill(pg, cab.bodyColor, s, Dr.gv(cab, 'bodyColor', true));
    const doorFill = v => Dr.fill(pg, cab.doorColor, s, Dr.gv(cab, 'doorColor', v));
    if (cab.kind === 'tri') {
      pg.rect(x, y0 - H, W, H, { w: mid, fill: bodyFill });
      cab.shelves.forEach(sh => pg.line(x, y0 - f(sh.y + 9), x + W, y0 - f(sh.y + 9), thin));
      pg.line(x, y0 - f(D.BOARD), x + W, y0 - f(D.BOARD), thin); pg.line(x, y0 - H + f(D.BOARD), x + W, y0 - H + f(D.BOARD), thin);
      return;
    }
    // 踢腳
    if (cab.kick && !cab.hanging && cab.y > 50) pg.rect(x + f(2), y0, W - f(4), f(Math.min(cab.y, D.KICK)), { w: thin, fill: Dr.fill(pg, cab.kickColor || cab.bodyColor, s, Dr.gv(cab, 'kickColor', false)) });
    // 檯面
    if (cab.top && cab.top !== 'none') { const th = D.PARTS.TOP[cab.top].thick; pg.rect(x, y0 - H - f(th), W, f(th), { w: thin, fill: Dr.fill(pg, cab.topColor || cab.doorColor, s, Dr.gv(cab, 'topColor', false)) }); }
    pg.rect(x, y0 - H, W, H, { w: mid, fill: bodyFill });
    pg.rect(x + f(D.BOARD), y0 - H + f(D.BOARD), W - f(2 * D.BOARD), H - f(2 * D.BOARD), { stroke: false, fill: 'rgba(0,0,0,0.10)' });
    let fx = x, fw = W;
    if (cab.kind === 'corner') {
      const dd = f(cab.d);
      pg.rect(x, y0 - H, dd, H, { w: thin, fill: bodyFill });
      fx = x + dd; fw = W - dd;
    } else {
      pg.line(x + f(D.BOARD), y0 - H, x + f(D.BOARD), y0, thin, '#9aa1a9');
      pg.line(x + W - f(D.BOARD), y0 - H, x + W - f(D.BOARD), y0, thin, '#9aa1a9');
    }
    // 層板（被門擋住者以虛線表示）
    const rows = rowsOf(cab);
    const covered = yy => { let top = cab.h; for (const r of rows) { const lo = top - r.h * 10; if (yy >= lo && yy <= top) return !M().OPEN_ROW(r.t); top = lo; } return false; };
    cab.shelves.forEach(sh => {
      const yy = sh.y + D.BOARD / 2;
      const hid = covered(yy);
      pg.line(fx + f(D.BOARD), y0 - f(yy), fx + fw - f(D.BOARD), y0 - f(yy), sh.fixed ? 0.25 : 0.15, hid ? '#98a2ad' : col, hid ? [1.2, 0.8] : null);
    });
    // 門片
    let top = y0 - H;
    const gap = f(2);
    rows.forEach((r, ri) => {
      const rh = f(r.h * 10), lipF = f(M().rowLip(cab, rows, ri));
      const leaf = (lx, lw, hinge, glass) => {
        pg.rect(lx + gap, top + gap, lw - 2 * gap, rh - 2 * gap + lipF, { w: 0.22, fill: glass ? 'rgba(210,232,238,0.85)' : doorFill(rh > lw) });
        const hx = hinge === 'L' ? lx + gap : lx + lw - gap, fxx = hinge === 'L' ? lx + lw - gap : lx + gap;
        [['rgba(255,255,255,0.8)', 0.3, null], ['#3a3a3a', 0.13, [1.2, 0.8]]].forEach(([c, w, d]) => {
          pg.line(fxx, top + gap, hx, top + rh / 2, w, c, d);
          pg.line(fxx, top + rh - gap, hx, top + rh / 2, w, c, d);
        });
        const hy = rh > f(900) ? top + rh - f(Math.min(1000, r.h * 10 * 0.45)) - f(80) : null;
        Dr.handleMark(pg, glass ? { ...cab, handle: 'bar' } : cab, lx + gap, top + gap, lw - 2 * gap, rh - 2 * gap, hinge, f, hy);
        if (glass) { pg.line(lx + lw * 0.3, top + rh * 0.3, lx + lw * 0.5, top + rh * 0.18, 0.12, '#6c98a6'); pg.line(lx + lw * 0.35, top + rh * 0.55, lx + lw * 0.65, top + rh * 0.38, 0.12, '#6c98a6'); }
      };
      if (r.t === 'E') {
        // 電器抽：底部 H50 抽頭（門片色），上方為開放格
        pg.rect(fx + gap, top + rh - f(M().E_FRONT) + gap, fw - 2 * gap, f(M().E_FRONT) - 2 * gap, { w: 0.22, fill: doorFill(false) });
      } else if (r.t === 'D') {
        pg.rect(fx + gap, top + gap, fw - 2 * gap, rh - 2 * gap, { w: 0.22, fill: doorFill(false) });
        Dr.handleMark(pg, cab, fx + gap, top + gap, fw - 2 * gap, rh - 2 * gap, null, f);
      } else if (r.t === 'L' || r.t === 'R') leaf(fx, fw, r.t);
      else if (r.t === 'G') leaf(fx, fw, 'L', true);
      else if (r.t === 'P') { leaf(fx, fw / 2, 'L'); leaf(fx + fw / 2, fw / 2, 'R'); }
      else if (r.t === 'GP') { leaf(fx, fw / 2, 'L', true); leaf(fx + fw / 2, fw / 2, 'R', true); }
      else if (r.t === 'F') [0, 1, 2, 3].forEach(i => leaf(fx + i * fw / 4, fw / 4, i % 2 ? 'R' : 'L'));
      top += rh;
    });
    if (cab.rod) { const ry = y0 - H + f(80); pg.line(fx + f(20), ry, fx + fw - f(20), ry, 0.5, '#777'); }
  };

  /* ---------- 側視（右側，前面朝右） ---------- */
  Dr.cabSide = function (pg, cab, x, y, s) {
    const f = v => v / s;
    const dep = M().footDepth(cab);
    const Dd = f(dep), y0 = y - f(cab.y), H = f(cab.h);
    if (cab.kind === 'desk') { pg.rect(x, y0 - f(cab.thick), Dd, f(cab.thick), { w: 0.3, fill: Dr.fill(pg, cab.topColor, s) }); return; }
    if (cab.kind === 'appl') { pg.rect(x, y0 - H, Dd, H, { w: 0.3, fill: Dr.applFill(pg, cab, s) }); return; }
    if (cab.kind === 'filler') { pg.rect(x + Dd - f(D.BOARD), y0 - H, f(D.BOARD), H, { w: 0.3, fill: Dr.fill(pg, cab.bodyColor, s, true) }); pg.rect(x, y0 - H, Dd - f(D.BOARD), H, { w: 0.15, color: '#98a2ad', dash: [1.2, 0.8] }); return; }
    if (cab.kick && !cab.hanging && cab.kind !== 'tri' && cab.y > 50) pg.rect(x + Dd - f(40 + 18), y0, f(18), f(Math.min(cab.y, D.KICK)), { w: 0.15, fill: Dr.fill(pg, cab.kickColor || cab.bodyColor, s) });
    if (cab.top && cab.top !== 'none') { const th = D.PARTS.TOP[cab.top].thick; pg.rect(x, y0 - H - f(th), Dd + f(30), f(th), { w: 0.15, fill: Dr.fill(pg, cab.topColor || cab.doorColor, s) }); }
    pg.rect(x, y0 - H, Dd, H, { w: 0.3, fill: Dr.fill(pg, cab.bodyColor, s, Dr.gv(cab, 'bodyColor', H > Dd)) });
    if (cab.hoodHang) {
      // 抽油煙機吊櫃：無頂底板、無背板；前上、前下、後上檔板（80mm）
      const R = f(80), t = f(D.BOARD);
      pg.rect(x, y0 - H, t, R, { w: 0.15 }); pg.rect(x + Dd - t, y0 - H, t, R, { w: 0.15 }); pg.rect(x + Dd - t, y0 - R, t, R, { w: 0.15 });
    } else if (cab.sinkBase) {
      // 水槽櫃：無頂板；前上、後上、後下檔板（80mm）＋後檔板內背板
      const R = f(80), t = f(D.BOARD);
      pg.line(x + t + f(D.BACK), y0 - H, x + t + f(D.BACK), y0 - t, 0.15, '#98a2ad');
      pg.rect(x, y0 - H, t, R, { w: 0.15 }); pg.rect(x, y0 - t - R, t, R, { w: 0.15 }); pg.rect(x + Dd - t, y0 - H, t, R, { w: 0.15 });
      pg.line(x, y0 - t, x + Dd, y0 - t, 0.15);
    } else {
    if (!cab.noBack && cab.kind !== 'tri') pg.line(x + f(14), y0 - H + f(D.BOARD), x + f(14), y0 - f(D.BOARD), 0.15, '#98a2ad');
    pg.line(x, y0 - f(D.BOARD), x + Dd, y0 - f(D.BOARD), 0.15);
    pg.line(x, y0 - H + f(D.BOARD), x + Dd, y0 - H + f(D.BOARD), 0.15);
    }
    cab.shelves.forEach(sh => {
      const inset = sh.fixed ? 0 : 20;
      pg.rect(x + f(18), y0 - f(sh.y + D.BOARD), Dd - f(18 + inset), f(D.BOARD), { w: 0.12, fill: sh.fixed ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.35)' });
    });
    // 門片厚度
    if (cab.kind !== 'tri') {
      let top = y0 - H;
      rowsOf(cab).forEach(r => {
        const rh = f(r.h * 10);
        if (!M().OPEN_ROW(r.t)) pg.rect(x + Dd, top + f(2), f(18), rh - f(4), { w: 0.18, fill: r.t === 'G' || r.t === 'GP' ? '#e3f0f3' : Dr.fill(pg, cab.doorColor, s, Dr.gv(cab, 'doorColor', true)) });
        if (r.t === 'D') pg.rect(x + Dd - f(Math.min(cab.d - 80, 520)), top + rh - f(Math.max(60, r.h * 10 - 70)) - f(20), f(Math.min(cab.d - 80, 520)), f(Math.max(60, r.h * 10 - 70)), { w: 0.12, dash: [1, 0.8], color: '#98a2ad' });
        top += rh;
      });
    }
  };

  /* ---------- 俯視（前面朝下） ---------- */
  Dr.cabTop = function (pg, cab, x, y, s) {
    // (x,y) = 紙面左上角
    const f = v => v / s;
    const g = pg.g, k = pg.k;
    if (cab.kind === 'appl') { Dr.applTop(pg, cab, x, y, s); return; }
    if (cab.kind === 'desk') {
      const gm = M().deskGeom(cab), ox = cab.w / 2, oz = M().footDepth(cab) / 2;
      g.beginPath(); gm.pts.forEach(([a, b], i) => i ? g.lineTo((x + f(a + ox)) * k, (y + f(b + oz)) * k) : g.moveTo((x + f(a + ox)) * k, (y + f(b + oz)) * k));
      g.closePath(); g.fillStyle = Dr.fill(pg, cab.topColor, s); g.fill(); g.strokeStyle = '#1f2328'; g.lineWidth = 0.3 * k; g.stroke();
      return;
    }
    if (cab.kind === 'corner') {
      const W = f(cab.w), d = f(cab.d);
      g.beginPath();
      [[0, 0], [W, 0], [W, d], [d, d], [d, W], [0, W]].forEach(([a, b], i) => i ? g.lineTo((x + a) * k, (y + b) * k) : g.moveTo((x + a) * k, (y + b) * k));
      g.closePath(); g.fillStyle = Dr.fill(pg, cab.top && cab.top !== 'none' ? cab.topColor : cab.bodyColor, s); g.fill(); g.strokeStyle = '#1f2328'; g.lineWidth = 0.3 * k; g.stroke();
      if (cab.fronts.some(r => !M().OPEN_ROW(r.t))) pg.rect(x + d, y + d, W - d, f(18), { w: 0.2, fill: Dr.fill(pg, cab.doorColor, s) });
      return;
    }
    if (cab.kind === 'tri') {
      const pts = M().triShape(cab).map(([a, b]) => [a + cab.w / 2, b + cab.d / 2]);
      g.beginPath();
      (cab.triType === '00' ? [[0, 0], [cab.w, 0], [cab.w, cab.d]] : pts).forEach(([a, b], i) => i ? g.lineTo((x + f(a)) * k, (y + f(b)) * k) : g.moveTo((x + f(a)) * k, (y + f(b)) * k));
      if (cab.triType !== '00') { g.closePath(); g.fillStyle = Dr.fill(pg, cab.bodyColor, s); g.fill(); }
      g.strokeStyle = '#1f2328'; g.lineWidth = (cab.triType === '00' ? 0.8 : 0.3) * k; g.stroke();
      return;
    }
    const W = f(cab.w), Dd = f(cab.d);
    pg.rect(x, y, W, Dd, { w: 0.3, fill: Dr.fill(pg, cab.top && cab.top !== 'none' ? cab.topColor : cab.bodyColor, s) });
    pg.line(x + f(D.BOARD), y, x + f(D.BOARD), y + Dd, 0.12, '#98a2ad');
    pg.line(x + W - f(D.BOARD), y, x + W - f(D.BOARD), y + Dd, 0.12, '#98a2ad');
    if (!cab.noBack) pg.line(x, y + f(14), x + W, y + f(14), 0.12, '#98a2ad');
    if (cab.fronts.some(r => !M().OPEN_ROW(r.t))) pg.rect(x, y + Dd, W, f(18), { w: 0.2, fill: Dr.fill(pg, cab.doorColor, s) });
    if (cab.top && cab.top !== 'none') pg.rect(x, y, W, Dd + f(30), { w: 0.15, dash: [1.5, 1], color: '#8a7a66', stroke: true });
  };

  /* ---------- 空間幾何 ---------- */
  Dr.cabWorldPoly = function (cab) {
    let pts;
    if (cab.kind === 'desk') pts = M().deskGeom(cab).pts;
    else if (cab.kind === 'corner') { const L = -cab.w / 2, d = cab.d, W = cab.w / 2; pts = [[L, L], [W, L], [W, L + d], [L + d, L + d], [L + d, W], [L, W]]; }
    else if (cab.kind === 'tri') pts = M().triShape(cab);
    else pts = [[-cab.w / 2, -cab.d / 2], [cab.w / 2, -cab.d / 2], [cab.w / 2, cab.d / 2], [-cab.w / 2, cab.d / 2]];
    const r = cab.rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), m = cab.mirror ? -1 : 1;
    // 旋轉 y：local (x,z) → world (x c + z s, -x s + z c)
    return pts.map(([x, z]) => [cab.x + m * x * c + z * s, cab.z - m * x * s + z * c]);
  };
  Dr.cabFrontEdge = function (cab) {
    if (cab.kind === 'corner') { const L = -cab.w / 2; return [[L + cab.d, L + cab.d], [cab.w / 2, L + cab.d]]; }
    return [[-cab.w / 2, cab.d / 2], [cab.w / 2, cab.d / 2]];
  };

  // 平面圖
  Dr.plan = function (pg, st, box, opts = {}) {
    const room = st.room, CEIL = !!opts.ceiling, LAYER = opts.layer || 'ceiling';
    const pts = [];
    if (room) room.points.forEach((_, i) => { const wi = M().wallInfo(room, i); pts.push(wi.p, [wi.p[0] + wi.nOut[0] * room.thickness, wi.p[1] + wi.nOut[1] * room.thickness]); });
    st.cabinets.forEach(c => Dr.cabWorldPoly(c).forEach(p => pts.push(p)));
    if (!pts.length) return null;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    pts.forEach(([x, z]) => { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); });
    const margin = 900;
    const s = Dr.fitScale(maxx - minx + 2 * margin, maxz - minz + 2 * margin, box.x1 - box.x0, box.y1 - box.y0);
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    const mx = (minx + maxx) / 2, mz = (minz + maxz) / 2;
    const P = (x, z) => [cx + (x - mx) / s, cy + (z - mz) / s];
    const g = pg.g, k = pg.k;
    const poly = (arr, fill, stroke, w, dash) => {
      g.beginPath(); arr.forEach((p, i) => { const q = P(p[0], p[1]); i ? g.lineTo(q[0] * k, q[1] * k) : g.moveTo(q[0] * k, q[1] * k); }); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = w * k; g.setLineDash(dash ? dash.map(v => v * k) : []); g.stroke(); g.setLineDash([]); }
    };
    if (room) {
      const fl = M().floorDef(room);
      poly(room.points, '#ffffff', null);   // 施工圖慣例：地坪留白
      if (CEIL && window.Ceiling) window.Ceiling.drawPlan(pg, room, P, poly, s, LAYER);
      if (fl.type === 'tile' && !CEIL) {
        // 磁磚格線（裁切在室內）
        g.save();
        g.beginPath(); room.points.forEach((p, i) => { const q = P(p[0], p[1]); i ? g.lineTo(q[0] * k, q[1] * k) : g.moveTo(q[0] * k, q[1] * k); }); g.closePath(); g.clip();
        const xs = room.points.map(p => p[0]), zs = room.points.map(p => p[1]);
        const x0 = Math.floor(Math.min(...xs) / fl.size) * fl.size, x1 = Math.max(...xs), z0 = Math.floor(Math.min(...zs) / fl.size) * fl.size, z1 = Math.max(...zs);
        for (let x = x0; x <= x1; x += fl.size) { const a = P(x, z0), b = P(x, z1); pg.line(a[0], a[1], b[0], b[1], 0.08, Dr.PEN.light); }
        for (let z = z0; z <= z1; z += fl.size) { const a = P(x0, z), b = P(x1, z); pg.line(a[0], a[1], b[0], b[1], 0.08, Dr.PEN.light); }
        g.restore();
      }
      // 牆：先全部填灰，再只描室內面與室外面輪廓（牆與轉角之間不出現接縫線），最後才畫門窗開口
      { const T = room.thickness, n = room.points.length;
        room.points.forEach((_, i) => {
          const wi = M().wallInfo(room, i), prev = M().wallInfo(room, (i - 1 + n) % n), wf = room.walls[i].locked ? Dr.PEN.wallLock : Dr.PEN.wall;
          const o = (p, t) => [p[0] + wi.nOut[0] * t, p[1] + wi.nOut[1] * t];
          poly([wi.p, o(wi.p, T), [wi.p[0] + (wi.nOut[0] + prev.nOut[0]) * T, wi.p[1] + (wi.nOut[1] + prev.nOut[1]) * T], [wi.p[0] + prev.nOut[0] * T, wi.p[1] + prev.nOut[1] * T]], wf, null);
          poly([wi.p, wi.q, o(wi.q, T), o(wi.p, T)], wf, null);
        });
        poly(room.points, null, Dr.PEN.ink, 0.35);
        poly(room.points.map((p, j) => { const a2 = M().wallInfo(room, j), b2 = M().wallInfo(room, (j - 1 + n) % n); return [p[0] + (a2.nOut[0] + b2.nOut[0]) * T, p[1] + (a2.nOut[1] + b2.nOut[1]) * T]; }), null, Dr.PEN.ink, 0.35);
      }
      room.points.forEach((_, i) => {
        const wi = M().wallInfo(room, i), T = room.thickness;
        const o = (p, t) => [p[0] + wi.nOut[0] * t, p[1] + wi.nOut[1] * t];
        // 門窗
        room.walls[i].openings.forEach(op => {
          const a = [wi.p[0] + wi.dir[0] * op.offset, wi.p[1] + wi.dir[1] * op.offset];
          const b = [a[0] + wi.dir[0] * op.width, a[1] + wi.dir[1] * op.width];
          poly([a, b, o(b, T), o(a, T)], '#ffffff', null);
          const A = P(...a), Bp = P(...b), Ao = P(...o(a, T)), Bo = P(...o(b, T));
          pg.line(A[0], A[1], Ao[0], Ao[1], 0.3); pg.line(Bp[0], Bp[1], Bo[0], Bo[1], 0.3);
          if (op.type === 'window') {
            [0.2, 0.5, 0.8].forEach(t => { const u = o(a, T * t), v = o(b, T * t); const U = P(...u), W2 = P(...v); pg.line(U[0], U[1], W2[0], W2[1], 0.2); });
          } else {
            // 門扇與開啟弧線（開向室內）
            const r = op.width / s;
            const leafEnd = [a[0] + wi.nIn[0] * op.width, a[1] + wi.nIn[1] * op.width];
            const L2 = P(...leafEnd);
            pg.line(A[0], A[1], L2[0], L2[1], 0.35);
            const a0 = Math.atan2(L2[1] - A[1], L2[0] - A[0]), a1 = Math.atan2(Bp[1] - A[1], Bp[0] - A[0]);
            g.strokeStyle = Dr.PEN.grey; g.lineWidth = 0.15 * k; g.setLineDash([1 * k, 0.7 * k]);
            g.beginPath();
            let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
            g.arc(A[0] * k, A[1] * k, r * k, a0, a0 + d, d < 0); g.stroke(); g.setLineDash([]);
          }
        });
        // 牆長標註
        const offMM = (T + 420) / s;
        const A = P(...wi.p), Bq = P(...wi.q);
        const sgn = (() => { const dx = Bq[0] - A[0], dy = Bq[1] - A[1]; const nx = -dy, ny = dx; const on = [wi.nOut[0], wi.nOut[1]]; return nx * on[0] + ny * on[1] > 0 ? 1 : -1; })();
        Dr.dim(pg, A[0], A[1], Bq[0], Bq[1], Math.round(wi.len) + '', sgn * offMM, { size: 7 });
        const lab = P(wi.mid[0] + wi.nOut[0] * (T + 420 + 7.5 * s), wi.mid[1] + wi.nOut[1] * (T + 420 + 7.5 * s));
        pg.rect(lab[0] - 3.2, lab[1] - 2.2, 6.4, 4.4, { fill: '#fff', color: '#d0342c', w: 0.25 });
        pg.text(lab[0], lab[1] + 0.1, 'W' + (i + 1), { size: 6.5, bold: true, color: '#d0342c', align: 'center', base: 'middle' });
      });
    }
    // 櫃體：先地櫃後吊櫃
    const lay = c => c.hanging ? 3 : c.kind === 'appl' ? 2 : c.kind === 'desk' ? 1 : 0;
    const cabs = (CEIL ? [] : st.cabinets.slice()).sort((a, b) => lay(a) - lay(b));
    cabs.forEach(c => {
      const wp = Dr.cabWorldPoly(c);
      if (c.hanging) { poly(wp, null, Dr.PEN.mid, 0.3, [1.6, 1]); const q = wp.map(p => P(...p)); pg.line(q[0][0], q[0][1], q[2][0], q[2][1], 0.15, Dr.PEN.grey, [1.6, 1]); pg.line(q[1][0], q[1][1], q[3][0], q[3][1], 0.15, Dr.PEN.grey, [1.6, 1]); }   // 吊櫃：虛線框＋交叉
      else if (c.kind === 'appl') {
        poly(wp, '#ffffff', Dr.PEN.ink, 0.3);
        if (c.at === 'sink') { const cut = (D.byCode[c.code] || {}).cut || [c.w - 30, c.d - 30]; poly([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => M().toWorld(c, a * (cut[0] - 30) / 2, b * (cut[1] - 30) / 2)), '#ffffff', Dr.PEN.ink, 0.2); }
        if (c.at === 'hob') [-0.25, 0.25].forEach(kx => { const q = P(...M().toWorld(c, kx * c.w, -c.d * 0.06)); g.beginPath(); g.arc(q[0] * k, q[1] * k, 68 / s * k, 0, Math.PI * 2); g.strokeStyle = '#9aa0a6'; g.lineWidth = 0.3 * k; g.stroke(); });
      }
      else poly(wp, '#ffffff', Dr.PEN.ink, 0.3);   // 施工圖慣例：櫃體白底細線（色板留在立面與三視圖）
      if (c.kind !== 'tri') {
        const fe = Dr.cabFrontEdge(c).map(([x, z]) => {
          const r = c.rot * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
          return [c.x + x * cs + z * sn, c.z - x * sn + z * cs];
        });
        const A = P(...fe[0]), Bq = P(...fe[1]);
        if (!c.hanging && c.kind !== 'appl' && c.fronts.some(r => !M().OPEN_ROW(r.t))) { const ix = (P(c.x, c.z)[0] - (A[0] + Bq[0]) / 2), iy = (P(c.x, c.z)[1] - (A[1] + Bq[1]) / 2), il = Math.hypot(ix, iy) || 1, d = Math.min(0.6, il * 0.15); pg.line(A[0] + ix / il * d, A[1] + iy / il * d, Bq[0] + ix / il * d, Bq[1] + iy / il * d, 0.25, Dr.PEN.ink); }   // 門片線：前緣內側細線
      }
    });
    // 型號標籤最後繪製，避免被吊櫃虛線覆蓋
    cabs.forEach(c => {
      const wp = Dr.cabWorldPoly(c);
      const under = c.hanging && st.cabinets.some(o => !o.hanging && Math.hypot(o.x - c.x, o.z - c.z) < 300);
      const ctr = wp.reduce((a, p) => [a[0] + p[0] / wp.length, a[1] + p[1] / wp.length], [0, 0]);
      const C = P(...ctr);
      const xs = wp.map(p => P(...p)[0]), maxW = Math.max(...xs) - Math.min(...xs) - 1;
      const col = c.hanging ? Dr.PEN.mid : '#000', sub = { size: 4.6, color: '#555' };
      const lines = Dr.nameLines(M().cabName(c)).map(t => ({ t, size: 5.8, bold: true, color: col }));
      if (c.kind === 'appl') lines.push({ ...sub, t: `${D.APPL_TYPES[c.at]}　${c.w}×${c.d}` });
      else if (c.kind === 'desk') lines.push({ ...sub, t: `${c.w}×${M().footDepth(c)}　${c.topColor}　${window.Pricing.deskMatName(c.deskMat)}${c.thick}` });
      else if (!c.hanging) lines.push({ ...sub, t: `${c.bodyColor}${c.fronts.some(r => !M().OPEN_ROW(r.t)) ? '/' + c.doorColor : ''}` });
      if (c.kind === 'desk') {
        // 桌面蓋在櫃體上方：標籤移到後緣（靠牆側），避免壓到櫃體標籤
        const fe = Dr.cabFrontEdge(c).map(([x, z]) => { const r = c.rot * Math.PI / 180; return P(c.x + x * Math.cos(r) + z * Math.sin(r), c.z - x * Math.sin(r) + z * Math.cos(r)); });
        const F = [(fe[0][0] + fe[1][0]) / 2, (fe[0][1] + fe[1][1]) / 2], vx = C[0] - F[0], vy = C[1] - F[1], L = Math.hypot(vx, vy) || 1;
        const t = Math.max(0, L - 3.2) / L;
        Dr.tagLines(pg, C[0] + vx * t, C[1] + vy * t, [{ ...lines[0], t: `${lines[0].t}　${lines[1].t}` }], maxW);
        return;
      }
      // 吊櫃在其他櫃體正上方：標籤移到下方櫃體前緣外側（地板上），避免和下方櫃體標籤重疊
      const base = c.hanging ? st.cabinets.find(o => !o.hanging && o.kind !== 'desk' && o.kind !== 'appl' && Math.hypot(o.x - c.x, o.z - c.z) < 400) : null;
      if (base) {
        const r = base.rot * Math.PI / 180, fe = Dr.cabFrontEdge(base).map(([x, z]) => P(base.x + x * Math.cos(r) + z * Math.sin(r), base.z - x * Math.sin(r) + z * Math.cos(r)));
        const F = [(fe[0][0] + fe[1][0]) / 2, (fe[0][1] + fe[1][1]) / 2], Cb = P(base.x, base.z), vx = F[0] - Cb[0], vy = F[1] - Cb[1], L = Math.hypot(vx, vy) || 1;
        Dr.tagLines(pg, F[0] + vx / L * 4.5, F[1] + vy / L * 4.5, lines, maxW * 1.4);
        return;
      }
      Dr.tagLines(pg, C[0], C[1] + (c.hanging && under ? 5.2 : 0), lines, maxW);
    });
    if (CEIL) { if (room && window.Ceiling) window.Ceiling.drawLegend(pg, room, box.x1 - 50, box.y0 + 4, LAYER); pg.text(box.x0 + 2, box.y1 - 3, `${{ ceiling: '天花板配置圖', lights: '燈具配置圖', hvac: '空調配置圖', power: '插座配置圖' }[LAYER]}　比例 1:${s}　單位 mm${LAYER === 'ceiling' ? '（標註高度 cm）' : ''}`, { size: 6.5, color: '#69727d' }); return s; }
    // 圖例
    const lx = box.x0 + 2, ly = box.y1 - 12;
    pg.rect(lx, ly, 6, 3.5, { fill: '#ffffff', w: 0.3, color: Dr.PEN.ink }); pg.text(lx + 8, ly + 3, '地櫃 / 高櫃', { size: 6.5 });
    pg.rect(lx + 44, ly, 6, 3.5, { w: 0.3, color: Dr.PEN.mid, dash: [1.2, 0.8] }); pg.line(lx + 44, ly, lx + 50, ly + 3.5, 0.15, Dr.PEN.grey); pg.line(lx + 44, ly + 3.5, lx + 50, ly, 0.15, Dr.PEN.grey); pg.text(lx + 52, ly + 3, '吊櫃（虛線）', { size: 6.5 });
    pg.rect(lx + 76, ly, 6, 3.5, { fill: Dr.PEN.wallLock, w: 0.25 }); pg.text(lx + 84, ly + 3, '已鎖定牆面', { size: 6.5 });
    pg.text(lx, ly + 9, `比例 1:${s}　單位 mm${room ? '　地板：' + M().floorDef(room).name : ''}`, { size: 6.5, color: '#69727d' });
    return s;
  };

  // 取得靠此牆的櫃體與其左側位置
  Dr.wallCabinets = function (st, i) {
    const room = st.room, wi = M().wallInfo(room, i);
    const right = [-wi.nOut[1], wi.nOut[0]];
    const sP = 0, sQ = (wi.q[0] - wi.p[0]) * right[0] + (wi.q[1] - wi.p[1]) * right[1];
    const base = Math.min(sP, sQ);
    const faceRot = Math.atan2(wi.nIn[0], wi.nIn[1]) * 180 / Math.PI;
    const list = [];
    st.cabinets.forEach(c => {
      const dr = ((c.rot - faceRot) % 360 + 540) % 360 - 180;
      if (Math.abs(dr) > 2) return;
      const fd = c.kind === 'corner' ? c.w : c.d;
      const dist = (c.x - wi.p[0]) * wi.nIn[0] + (c.z - wi.p[1]) * wi.nIn[1] - fd / 2;
      if (dist < -60 || dist > 250) return;
      const sc = (c.x - wi.p[0]) * right[0] + (c.z - wi.p[1]) * right[1] - base;
      const left = sc - c.w / 2;
      if (left > wi.len + 10 || left + c.w < -10) return;
      list.push({ cab: c, left });
    });
    return { wi, list, base, right };
  };

  Dr.elevation = function (pg, st, i, box) {
    const room = st.room;
    const { wi, list, base, right } = Dr.wallCabinets(st, i);
    const L = wi.len, H = room.height;
    const s = Dr.fitScale(L + 1400, H + 900, box.x1 - box.x0, box.y1 - box.y0 - 6);
    const W = L / s, Hh = H / s;
    const x0 = (box.x0 + box.x1) / 2 - W / 2, y0 = (box.y0 + box.y1) / 2 + Hh / 2;
    pg.rect(x0, y0 - Hh, W, Hh, { w: 0.5, fill: '#ffffff' });
    // 剖切：兩側牆與樓板以斜線表示（比照施工圖），地坪線加粗
    { const T = Math.max(2, room.thickness / s), slab = Math.max(2, 150 / s);
      Dr.hatch(pg, x0 - T, y0 - Hh - slab, T, Hh + slab); Dr.hatch(pg, x0 + W, y0 - Hh - slab, T, Hh + slab); Dr.hatch(pg, x0, y0 - Hh - slab, W, slab); }
    pg.line(x0 - 8, y0, x0 + W + 8, y0, 0.6);
    // 門窗
    room.walls[i].openings.forEach(o => {
      const sA = (wi.dir[0] * right[0] + wi.dir[1] * right[1]) > 0 ? o.offset : L - o.offset - o.width;
      const ox = x0 + sA / s, ow = o.width / s, oy = y0 - (o.sill + o.height) / s, oh = o.height / s;
      pg.rect(ox, oy, ow, oh, { w: 0.35, fill: '#ffffff' });
      if (o.type === 'window') { pg.line(ox + ow / 2, oy, ox + ow / 2, oy + oh, 0.15); pg.line(ox, oy + oh / 2, ox + ow, oy + oh / 2, 0.15); }
      else { pg.line(ox, oy, ox + ow, oy + oh / 2, 0.12, '#8a7a66', [1.2, 0.8]); pg.line(ox, oy + oh, ox + ow, oy + oh / 2, 0.12, '#8a7a66', [1.2, 0.8]); }
      pg.text(ox + ow / 2, oy - 1.2, `${o.type === 'door' ? '門' : '窗'} ${o.width}×${o.height}${o.sill ? ' 抬高' + o.sill : ''}`, { size: 5.5, align: 'center', color: '#69727d' });
    });
    const lay = c => c.hanging ? 3 : c.kind === 'appl' ? 2 : c.kind === 'desk' ? 1 : 0;
    list.sort((a, b) => lay(a.cab) - lay(b.cab));
    list.forEach(({ cab, left }) => {
      Dr.cabFront(pg, cab, x0 + left / s, y0, s);
      const lx = x0 + (left + cab.w / 2) / s;
      const ly = cab.hanging ? y0 - (cab.y + cab.h) / s - 2.2 : y0 + 3.4;
      if (cab.kind === 'appl') { const up = cab.mount === 'counter' || cab.hanging; Dr.tag(pg, lx, up ? y0 - (cab.y + cab.h) / s - (cab.at === 'sink' ? 9 : 2.8) : y0 - cab.y / s + 3.4, `${cab.code} ${D.APPL_TYPES[cab.at]}`, { size: 5.2, bold: true, color: '#7a4b00' }); return; }
      if (cab.kind === 'desk') { Dr.tag(pg, lx, y0 - (cab.y + cab.thick) / s - 2.2, `${window.Pricing.describe(cab).split('　')[0]}  ${cab.topColor}`, { size: 5.4, bold: true }); return; }
      const col = cab.hanging ? '#1f5fd6' : '#1f2328';
      const lines = Dr.nameLines(M().cabName(cab)).map(t => ({ t, size: 5.6, bold: true, color: col }));
      lines.push({ t: `${cab.bodyColor}${cab.fronts.some(r => !M().OPEN_ROW(r.t)) ? '/' + cab.doorColor : ''}`, size: 4.6, color: '#3d4550' });
      Dr.tagLines(pg, lx, cab.hanging ? y0 - cab.y / s + 1.4 : ly - 1.4, lines, cab.w / s - 0.6, 'top');   // 吊櫃標籤放在櫃底下方，避免和頂部尺寸線重疊
    });
    // 標註
    Dr.dim(pg, x0, y0 - Hh, x0 + W, y0 - Hh, Math.round(L) + '', -7 - Math.max(2, 150 / s), { size: 7 });
    Dr.dim(pg, x0 + W, y0, x0 + W, y0 - Hh, H + '', 7, { size: 7 });
    const floor = list.filter(l => !l.cab.hanging && l.cab.kind !== 'desk' && (l.cab.kind !== 'appl' || l.cab.mount === 'floor')).sort((a, b) => a.left - b.left);
    if (floor.length) {
      let cur = 0;
      floor.forEach(({ cab, left }) => {
        if (left - cur > 5) Dr.dim(pg, x0 + cur / s, y0, x0 + left / s, y0, Math.round(left - cur) + '', 16, { size: 5.8 });
        Dr.dim(pg, x0 + left / s, y0, x0 + (left + cab.w) / s, y0, cab.w + '', 16, { size: 5.8 });
        cur = Math.max(cur, left + cab.w);
      });
      if (L - cur > 5) Dr.dim(pg, x0 + cur / s, y0, x0 + W, y0, Math.round(L - cur) + '', 16, { size: 5.8 });
    }
    const hs = [...new Set(list.map(l => l.cab))];
    const tallest = hs.filter(c => !c.hanging).sort((a, b) => (b.y + b.h) - (a.y + a.h))[0];
    if (tallest) Dr.dim(pg, x0, y0, x0, y0 - (tallest.y + tallest.h) / s, (tallest.y + tallest.h) + '', -7, { size: 5.8 });
    void base;
    return { s, count: list.length, cabs: list.map(l => l.cab) };
  };

  window.Drawings = Dr;
})();
