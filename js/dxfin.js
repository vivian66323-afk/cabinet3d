/* DXF 匯入：讀 CAD 平面圖（ASCII 或二進位 DXF），由牆線自動找出封閉空間建立房間；或把圖線轉成已知比例的底圖描圖
   內建解析器（X.parse）：LINE／LWPOLYLINE／POLYLINE／ARC／CIRCLE／ELLIPSE／SPLINE／HATCH 邊界／MLINE／3DFACE／TEXT／MTEXT／
   INSERT 圖塊展開（縮放、旋轉、鏡射、陣列、巢狀）；自動判斷編碼（UTF-8／Big5／GBK…）與單位（$INSUNITS） */
(function () {
  const X = {};
  const UI = () => window.UI, M = () => window.Model, V = () => window.Viewer;
  const UNIT = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 7: 1e6, 10: 914.4, 14: 100 };   // $INSUNITS → mm
  const Q = 2;   // 端點吸附格（mm）

  /* ---------- 讀檔：編碼、二進位 DXF、群組碼 ----------
     自含的 DXF 解析器（不依賴 dxf.js），輸出與 DXFOut.parseFrame() 相同的結構：
     { ents:[{k:'L'|'A'|'C'|'T'|'S', l:圖層, …}], texts, layers, bbox, w, h, warnings, error }
     另外多帶 header（$ACADVER／$INSUNITS／$DWGCODEPAGE）、unit（推測的 $INSUNITS）、encoding、counts（各圖元數量）。
     ELLIPSE／SPLINE／HATCH 邊界／MLINE／3DFACE 會攤平成線段（k:'L'），e.e 記原本的圖元名稱。 */
  const BIN_SENTINEL = 'AutoCAD Binary DXF\r\n\x1a\0';
  X.isBinary = function (u8) {
    if (!u8 || u8.length < 22) return false;
    for (let i = 0; i < 22; i++) if (u8[i] !== BIN_SENTINEL.charCodeAt(i)) return false;
    return true;
  };
  // $DWGCODEPAGE → TextDecoder 編碼名
  const CODEPAGES = { 950: 'big5', 936: 'gbk', 932: 'shift_jis', 949: 'euc-kr', 1252: 'windows-1252', 1250: 'windows-1250', 1251: 'windows-1251', 874: 'windows-874', 1253: 'windows-1253', 1254: 'windows-1254', 1257: 'windows-1257', 1258: 'windows-1258' };
  const CODEPAGE_NAMES = { big5: 'Big5（繁體中文）', gbk: 'GBK（簡體中文）', shift_jis: 'Shift-JIS（日文）', 'euc-kr': 'EUC-KR（韓文）' };
  function codepageOf(s) {
    const m = String(s || '').trim().match(/(\d{3,4})/);
    if (!m) return /utf-?8/i.test(s) ? 'utf-8' : null;
    return CODEPAGES[+m[1]] || null;
  }
  function decoderOf(enc) { try { return new TextDecoder(enc); } catch (e) { return null; } }
  // 位元組 → 文字。回傳 { text, encoding, warnings }
  X.decode = function (u8) {
    const warnings = [];
    if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) u8 = u8.subarray(3);
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(u8), encoding: 'utf-8', warnings }; } catch (e) { /* 不是 UTF-8 */ }
    // 不是 UTF-8（AutoCAD 2004 以前的檔都是以系統字碼頁存的）：看 $DWGCODEPAGE
    const head = new TextDecoder('windows-1252').decode(u8.subarray(0, Math.min(u8.length, 65536)));
    const m = head.match(/\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n([^\r\n]*)/i);
    let enc = m ? codepageOf(m[1]) : null;
    if (!enc) {
      enc = 'big5';
      warnings.push(m ? `不認得的字碼頁 ${m[1].trim()}，已改以 Big5 解碼` : '檔案不是 UTF-8 也沒有標示字碼頁（$DWGCODEPAGE），已以 Big5 解碼；若中文圖層名或文字是亂碼，請在 CAD 另存為 AutoCAD 2007 以後版本的 DXF');
    } else if (enc !== 'utf-8') warnings.push(`檔案以 ${CODEPAGE_NAMES[enc] || enc} 編碼，已轉換`);
    const dec = decoderOf(enc);
    if (!dec) { warnings.push(`這個瀏覽器不支援 ${enc} 解碼，中文可能顯示為亂碼`); return { text: new TextDecoder('utf-8').decode(u8), encoding: 'utf-8', warnings }; }
    return { text: dec.decode(u8), encoding: enc, warnings };
  };
  // AutoCAD 的 \U+XXXX（Unicode）與 \M+NXXXX（多位元組字碼頁：1=Big5 2=GBK 3=Shift-JIS 4=EUC-KR 5=Big5）轉義還原
  const MIF = { 1: 'big5', 2: 'gbk', 3: 'shift_jis', 4: 'euc-kr', 5: 'big5' };
  function unesc(s) {
    return String(s)
      .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\M\+([1-5])([0-9A-Fa-f]{4})/g, (all, n, h) => { const d = decoderOf(MIF[n]); return d ? d.decode(new Uint8Array([parseInt(h.slice(0, 2), 16), parseInt(h.slice(2), 16)])) : all; });
  }

  // DXF 是「代碼一行、值一行」；遇到對不齊時只前進一行自動重新同步
  function asciiPairs(text) {
    const L = String(text).split(/\r\n|\r|\n/), P = [];
    for (let i = 0; i + 1 < L.length; i++) {
      const t = L[i].trim();
      if (!/^-?\d+$/.test(t)) continue;
      P.push([parseInt(t, 10), L[i + 1]]);
      i++;
    }
    return P;
  }
  // 二進位 DXF：22 位元組識別字串後接「群組碼＋值」；R12 用 1 位元組群組碼（255 表示後面接 2 位元組），R13 起一律 2 位元組
  const inR = (c, a, b) => c >= a && c <= b;
  const binType = c => {
    if (inR(c, 310, 319) || c === 1004) return 'bin';
    if (inR(c, 60, 79) || inR(c, 170, 179) || inR(c, 270, 289) || inR(c, 370, 389) || inR(c, 400, 409) || inR(c, 1060, 1070)) return 'i16';
    if (inR(c, 10, 59) || inR(c, 110, 149) || inR(c, 210, 239) || inR(c, 460, 469) || inR(c, 1010, 1059)) return 'f64';
    if (inR(c, 90, 99) || inR(c, 420, 429) || inR(c, 440, 459) || c === 1071) return 'i32';
    if (inR(c, 160, 169)) return 'i64';
    if (inR(c, 290, 299)) return 'bool';
    return 'str';
  };
  function binaryPairs(u8) {
    const P = [], dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), n = u8.length;
    const two = !(u8[22] === 0 && u8[23] !== 0);   // 第一組一定是 0／SECTION：1 位元組碼時 23 是 'S'
    let cp = null, i = 22, lastName = '';
    const utf8 = new TextDecoder('utf-8', { fatal: true });
    const str = b => { try { return utf8.decode(b); } catch (e) { const d = decoderOf(cp || 'big5'); return d ? d.decode(b) : new TextDecoder('utf-8').decode(b); } };
    while (i < n) {
      let c;
      if (two) { if (i + 2 > n) break; c = dv.getUint16(i, true); i += 2; }
      else { c = u8[i++]; if (c === 255) { if (i + 2 > n) break; c = dv.getUint16(i, true); i += 2; } }
      const t = binType(c); let v;
      try {
        if (t === 'str') { let j = i; while (j < n && u8[j] !== 0) j++; v = str(u8.subarray(i, j)); i = j + 1; }
        else if (t === 'f64') { v = String(dv.getFloat64(i, true)); i += 8; }
        else if (t === 'i16') { v = String(dv.getInt16(i, true)); i += 2; }
        else if (t === 'i32') { v = String(dv.getInt32(i, true)); i += 4; }
        else if (t === 'i64') { v = String(dv.getBigInt64(i, true)); i += 8; }
        else if (t === 'bool') { v = String(u8[i]); i += 1; }
        else { const len = u8[i]; i += 1 + len; v = ''; }
      } catch (e) { break; }
      if (c === 9) lastName = v;
      else if (c === 3 && lastName === '$DWGCODEPAGE') cp = codepageOf(v);
      P.push([c, v]);
    }
    return P;
  }
  function sectionsOf(P) {
    const sec = {};
    for (let i = 0; i < P.length; i++) {
      if (P[i][0] !== 0 || P[i][1].trim() !== 'SECTION' || !P[i + 1] || P[i + 1][0] !== 2) continue;
      const name = P[i + 1][1].trim().toUpperCase();
      let j = i + 2;
      while (j < P.length && !(P[j][0] === 0 && P[j][1].trim() === 'ENDSEC')) j++;
      sec[name] = (sec[name] || []).concat(P.slice(i + 2, j));
      i = j;
    }
    return sec;
  }
  function recsOf(body) {
    const out = []; let cur = null, skip = false;
    for (const [c, v] of body || []) {
      if (c === 0) { cur = { t: String(v).trim().toUpperCase(), g: [] }; out.push(cur); skip = false; }
      // 內嵌物件（MTEXT 分欄資料）、應用程式群組與 XDATA 會重複用到 10/11/40/50… 這些群組碼
      else if (c === 102) skip = String(v).trim() !== '}';
      else if (c === 101 || c >= 1000) skip = true;
      else if (cur && !skip) cur.g.push([c, v]);
    }
    return out;
  }
  const gv = (r, c) => { for (const [a, b] of r.g) if (a === c) return b; return undefined; };
  const gs = (r, c, d) => { const v = gv(r, c); return v === undefined ? d : String(v).trim(); };
  const gn = (r, c, d) => { const v = gv(r, c); if (v === undefined) return d; const f = parseFloat(v); return isNaN(f) ? d : f; };
  const gcat = (r, c) => r.g.filter(x => x[0] === c).map(x => String(x[1])).join('');
  const gall = (r, c) => r.g.filter(x => x[0] === c).map(x => parseFloat(x[1]) || 0);
  // HEADER：$NAME 後面接它的值
  function headerOf(body) {
    const h = {}; let name = null;
    for (const [c, v] of body || []) {
      if (c === 9) { name = String(v).trim(); h[name] = {}; }
      else if (name) h[name][c] = String(v).trim();
    }
    return h;
  }
  // MTEXT 的格式碼拿掉，只留純文字
  function mtextPlain(s) {
    return String(s === undefined ? '' : s)
      .replace(/\\P/g, '\n').replace(/\\~/g, ' ')
      .replace(/\\[fF][^;]*;/g, '')
      .replace(/\\[HWQACTSpaKkLlOo][^;]*;/g, '')
      .replace(/[{}]/g, '')
      .replace(/\\(.)/g, '$1')
      .replace(/[ \t]+$/gm, '');
  }
  // 圓弧：由 bulge（= tan(夾角/4)）求出圓心、半徑與起訖角（逆時針）
  function bulgeArc(x1, y1, x2, y2, b) {
    const dx = x2 - x1, dy = y2 - y1, c = Math.hypot(dx, dy);
    if (!c || !b) return null;
    const th = 4 * Math.atan(b);
    const R = c / (2 * Math.sin(th / 2));
    const hh = R * Math.cos(th / 2);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const cx = mx - hh * dy / c, cy = my + hh * dx / c;
    let a1 = Math.atan2(y1 - cy, x1 - cx), a2 = Math.atan2(y2 - cy, x2 - cx);
    if (b < 0) { const t = a1; a1 = a2; a2 = t; }
    return { cx, cy, r: Math.abs(R), a1: a1 * 180 / Math.PI, a2: a2 * 180 / Math.PI };
  }
  // NURBS 取點（de Boor）：Pw = [[x·w, y·w, w]]，U = 節點向量，p = 次數
  function deBoor(p, u, U, Pw) {
    const n = Pw.length - 1;
    let k;
    if (u >= U[n + 1]) k = n; else { k = p; while (k < n && !(u < U[k + 1])) k++; }
    const d = []; for (let j = 0; j <= p; j++) d[j] = Pw[k - p + j].slice();
    for (let r = 1; r <= p; r++) for (let j = p; j >= r; j--) {
      const i = k - p + j, den = U[i + p - r + 1] - U[i], a = den ? (u - U[i]) / den : 0;
      for (let c = 0; c < 3; c++) d[j][c] = (1 - a) * d[j - 1][c] + a * d[j][c];
    }
    return d[p][2] ? [d[p][0] / d[p][2], d[p][1] / d[p][2]] : [d[p][0], d[p][1]];
  }
  // 雲形線 → 折線點：有控制點＋節點就用 NURBS；只有擬合點就用 Catmull-Rom 穿過各點
  function splinePoints(deg, knots, ctrl, weights, fit, closed) {
    let pts = [];
    const p = Math.max(1, Math.min(deg || 3, Math.max(1, ctrl.length - 1)));
    if (ctrl.length >= 2 && knots.length >= ctrl.length + p + 1) {
      const Pw = ctrl.map((c, i) => { const w = weights[i] || 1; return [c[0] * w, c[1] * w, w]; });
      const u0 = knots[p], u1 = knots[ctrl.length], N = Math.min(2000, Math.max(16, ctrl.length * 8));
      for (let i = 0; i <= N; i++) pts.push(deBoor(p, u0 + (u1 - u0) * i / N, knots, Pw));
    } else if (fit.length >= 2) {
      const F = fit.slice(); if (closed) F.push(F[0]);
      const P = i => F[Math.max(0, Math.min(F.length - 1, i))];
      for (let i = 0; i + 1 < F.length; i++) {
        const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
        for (let s = 0; s < 8; s++) {
          const t = s / 8, t2 = t * t, t3 = t2 * t;
          pts.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
            0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
        }
      }
      pts.push(F[F.length - 1]);
    } else if (ctrl.length >= 2) pts = ctrl.slice();
    if (closed && pts.length > 2) pts.push(pts[0]);
    return pts;
  }
  // 橢圓（弧）→ 折線點：中心 c、長軸向量 M、短軸比 ratio、參數 a0～a1（弧度）、minor 方向正負（擠出方向 Z）
  function ellipsePoints(cx, cy, mx, my, ratio, a0, a1, sgn) {
    while (a1 <= a0 + 1e-9) a1 += Math.PI * 2;
    const sw = Math.min(a1 - a0, Math.PI * 2), N = Math.max(8, Math.ceil(sw / (Math.PI * 2) * 64));
    const nx = -my * ratio * sgn, ny = mx * ratio * sgn, pts = [];
    for (let i = 0; i <= N; i++) { const t = a0 + sw * i / N; pts.push([cx + mx * Math.cos(t) + nx * Math.sin(t), cy + my * Math.cos(t) + ny * Math.sin(t)]); }
    return pts;
  }

  const UNIT_NAME = { 1: 'inch（英吋）', 2: 'ft（英呎）', 4: 'mm', 5: 'cm', 6: 'm', 14: 'dm' };
  const MT_ALIGN = { 1: ['l', 't'], 2: ['c', 't'], 3: ['r', 't'], 4: ['l', 'mid'], 5: ['c', 'mid'], 6: ['r', 'mid'], 7: ['l', 'b'], 8: ['c', 'b'], 9: ['r', 'b'] };
  const TX_ALIGN = { 0: 'l', 1: 'c', 2: 'r', 3: 'l', 4: 'c', 5: 'l' };
  const TX_VALIGN = { 0: 'base', 1: 'b', 2: 'mid', 3: 't' };
  // 擠出方向 Z 為負（AutoCAD MIRROR 過的圓／弧／多段線／圖塊）：OCS 的 x 要反向
  const mirrored = r => gn(r, 230, 1) < 0;

  /* 主解析：input 可以是 Uint8Array／ArrayBuffer（自動判斷二進位與編碼）或已解碼的字串 */
  X.parse = function (input) {
    const warn = [], skipped = {}, counts = {};
    const addWarn = s => { if (!warn.includes(s)) warn.push(s); };
    let P, encoding = 'utf-8', binary = false;
    if (typeof input === 'string') P = asciiPairs(input);
    else {
      const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
      if (X.isBinary(u8)) { binary = true; encoding = 'binary'; P = binaryPairs(u8); }
      else { const d = X.decode(u8); encoding = d.encoding; warn.push(...d.warnings); P = asciiPairs(d.text); }
    }
    const sec = sectionsOf(P);
    const hdr = headerOf(sec.HEADER);
    const header = { ver: (hdr.$ACADVER && hdr.$ACADVER[1]) || '', units: hdr.$INSUNITS ? parseInt(hdr.$INSUNITS[70], 10) || 0 : null, codepage: (hdr.$DWGCODEPAGE && hdr.$DWGCODEPAGE[3]) || '', measurement: hdr.$MEASUREMENT ? parseInt(hdr.$MEASUREMENT[70], 10) : null };
    if (!sec.ENTITIES) {
      const err = P.length < 4 || !Object.keys(sec).length
        ? '這不是 DXF 檔（找不到 SECTION／ENTITIES 結構）。若是 .dwg 檔，請先在 AutoCAD 或免費的 DWG TrueView 另存為 DXF 再匯入。'
        : '這個 DXF 沒有 ENTITIES 區段，裡面沒有任何圖形。';
      return { error: err, ents: [], texts: [], layers: [], warnings: warn, header, encoding };
    }
    const tbl = { layers: [], styles: [] };
    recsOf(sec.TABLES).forEach(r => {
      if (r.t === 'LAYER' && gs(r, 2)) tbl.layers.push({ name: unesc(gs(r, 2)), color: Math.abs(gn(r, 62, 7)) || 7, lt: gs(r, 6, 'CONTINUOUS') });
      if (r.t === 'STYLE' && gs(r, 2)) tbl.styles.push({ name: gs(r, 2), font: gs(r, 3, ''), big: gs(r, 4, ''), wf: gn(r, 41, 1) || 1 });
    });
    // 圖塊定義
    const blocks = {}; let cb = null;
    recsOf(sec.BLOCKS).forEach(r => {
      if (r.t === 'BLOCK') { cb = { base: [gn(r, 10, 0), gn(r, 20, 0)], recs: [] }; blocks[gs(r, 2, '')] = cb; }
      else if (r.t === 'ENDBLK') cb = null;
      else if (cb) cb.recs.push(r);
    });

    const ents = [], texts = [];
    const bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const grow = (x, y) => {
      if (!isFinite(x) || !isFinite(y)) return;
      if (x < bb.x0) bb.x0 = x; if (y < bb.y0) bb.y0 = y;
      if (x > bb.x1) bb.x1 = x; if (y > bb.y1) bb.y1 = y;
    };
    const tp = (T, x, y) => { const X2 = x * T.sx, Y2 = y * T.sy; return [T.tx + X2 * T.c - Y2 * T.s, T.ty + X2 * T.s + Y2 * T.c]; };
    const uniform = T => Math.abs(Math.abs(T.sx) - Math.abs(T.sy)) < 1e-6 * Math.max(1, Math.abs(T.sx));
    let paperOnly = 0;

    function walk(recs, T0, depth) {
      if (depth > 8) { addWarn('圖塊巢狀超過 8 層，更深的沒有展開'); return; }
      for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        if (depth === 0 && gn(r, 67, 0) === 1) { paperOnly++; continue; }   // 配置（圖紙空間）的圖元
        counts[r.t] = (counts[r.t] || 0) + 1;
        const lay = unesc(gs(r, 8, '0') || '0');
        const lt = gs(r, 6, '');
        // 鏡射過的圖元（擠出方向 Z < 0）：OCS x 反向
        const T = mirrored(r) && /^(CIRCLE|ARC|LWPOLYLINE|POLYLINE|INSERT|TEXT|MTEXT|HATCH|SOLID|TRACE)$/.test(r.t) ? Object.assign({}, T0, { sx: -T0.sx }) : T0;
        const put = e => { ents.push(Object.assign({ l: lay }, lt && lt !== 'BYLAYER' ? { lt } : null, e)); };
        const line = (x1, y1, x2, y2, src) => { if (!isFinite(x1 + y1 + x2 + y2)) return; const a = tp(T, x1, y1), b2 = tp(T, x2, y2); grow(a[0], a[1]); grow(b2[0], b2[1]); put(src ? { k: 'L', p: [a[0], a[1], b2[0], b2[1]], e: src } : { k: 'L', p: [a[0], a[1], b2[0], b2[1]] }); };
        const polyPts = (pts, src) => { for (let k = 0; k + 1 < pts.length; k++) if (Math.abs(pts[k][0] - pts[k + 1][0]) > 1e-9 || Math.abs(pts[k][1] - pts[k + 1][1]) > 1e-9) line(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], src); };
        // 圓弧（逆時針 a1→a2，度）。等比例縮放：轉成 A；不等比例：攤平成線段
        const arcOf = (cx, cy, rr, a1, a2, src) => {
          if (!uniform(T)) {
            let sw = ((a2 - a1) % 360 + 360) % 360 || 360; const N = Math.max(8, Math.ceil(sw / 360 * 64)), pts = [];
            for (let k = 0; k <= N; k++) { const a = (a1 + sw * k / N) * Math.PI / 180; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
            polyPts(pts, src || 'ARC'); return;
          }
          const c0 = tp(T, cx, cy), R = rr * Math.abs(T.sx);
          const ang = a => Math.atan2(T.sy * Math.sin(a * Math.PI / 180), T.sx * Math.cos(a * Math.PI / 180)) * 180 / Math.PI + T.rot * 180 / Math.PI;
          const flip = T.sx * T.sy < 0;
          grow(c0[0] - R, c0[1] - R); grow(c0[0] + R, c0[1] + R);
          put(Object.assign({ k: 'A', c: [c0[0], c0[1]], r: R, a1: flip ? ang(a2) : ang(a1), a2: flip ? ang(a1) : ang(a2) }, src ? { e: src } : null));
        };
        const circleOf = (cx, cy, rr, src) => {
          if (!uniform(T)) { arcOf(cx, cy, rr, 0, 360, src || 'CIRCLE'); return; }
          const c0 = tp(T, cx, cy), R = rr * Math.abs(T.sx);
          grow(c0[0] - R, c0[1] - R); grow(c0[0] + R, c0[1] + R);
          put(Object.assign({ k: 'C', c: [c0[0], c0[1]], r: R }, src ? { e: src } : null));
        };
        const polyline = (pts, closed, src) => {
          const n = pts.length;
          for (let k = 0; k < (closed ? n : n - 1); k++) {
            const a = pts[k], b2 = pts[(k + 1) % n];
            if (a.b) { const ar = bulgeArc(a.x, a.y, b2.x, b2.y, a.b); if (ar) { arcOf(ar.cx, ar.cy, ar.r, ar.a1, ar.a2, src); continue; } }
            if (a.x === b2.x && a.y === b2.y) continue;
            line(a.x, a.y, b2.x, b2.y, src);
          }
        };
        const putText = (raw, x, y, h, rot, align, valign, style, wf, refW) => {
          const s = unesc(raw).replace(/\s+$/, '');
          if (!s) return;
          const q = tp(T, x, y), H = Math.abs(h * T.sy) || 2.5;
          grow(q[0], q[1]);   // 只用插入點撐範圍：文字寬度是估的
          const ti = texts.length;
          texts.push({ ti, s, x: q[0], y: q[1], h: H });
          put({ k: 'T', ti, x: q[0], y: q[1], h: H, s, rot: (rot || 0) + T.rot * 180 / Math.PI, align, valign, style, wf, w: refW || 0 });
        };
        // 直書中文（@ 開頭字型）：拆成一個字一個 TEXT 沿方向排下去
        const putVertical = (lines, x, y, h, dirDeg, style) => {
          const rad = dirDeg * Math.PI / 180, dir = [Math.cos(rad), Math.sin(rad)], perp = [-dir[1], dir[0]], step = h * 1.6;
          lines.forEach((ln, k) => {
            [...ln].forEach((ch, j) => {
              if (ch === ' ') return;
              const px = x - perp[0] * k * step + dir[0] * (j + 0.5) * h, py = y - perp[1] * k * step + dir[1] * (j + 0.5) * h;
              const q = tp(T, px, py), H = Math.abs(h * T.sy) || 2.5;
              grow(q[0], q[1]);
              put({ k: 'T', x: q[0], y: q[1], h: H, s: ch, rot: T.rot * 180 / Math.PI, align: 'c', valign: 'mid', style });
            });
          });
        };
        const insert = (nm, blk, x, y, sx, sy, rotDeg) => {
          // 外層若是鏡射（sx·sy < 0），內層的旋轉方向要反過來：diag(-1,1)·R(θ) = R(-θ)·diag(-1,1)
          if (!uniform(T)) addWarn('圖塊「' + nm + '」放在 X/Y 比例不同的圖塊裡，巢狀旋轉只能近似');
          const rot = (T.sx * T.sy < 0 ? -rotDeg : rotDeg) * Math.PI / 180;
          const q = tp(T, x, y);
          const c = Math.cos(T.rot + rot), s = Math.sin(T.rot + rot);
          // 圖塊自己的縮放要先做，再套外層的旋轉：T2 = T ∘ (平移到 q、旋轉 rot、縮放 sx sy、減去基準點)
          const T2 = { sx: T.sx * sx, sy: T.sy * sy, rot: T.rot + rot, c, s, tx: 0, ty: 0 };
          const b0 = tp(T2, blk.base[0], blk.base[1]);
          T2.tx = q[0] - b0[0]; T2.ty = q[1] - b0[1];
          const hasAttrib = recs[i + 1] && recs[i + 1].t === 'ATTRIB';
          walk(blk.recs.filter(x2 => !(hasAttrib && x2.t === 'ATTDEF')), T2, depth + 1);
        };

        switch (r.t) {
          case 'LINE': line(gn(r, 10, 0), gn(r, 20, 0), gn(r, 11, 0), gn(r, 21, 0)); break;
          case 'XLINE': case 'RAY': skipped[r.t] = (skipped[r.t] || 0) + 1; break;
          case 'LWPOLYLINE': {
            const pts = []; let cur = null;
            for (const [c, v] of r.g) {
              if (c === 10) { cur = { x: parseFloat(v) || 0, y: 0, b: 0 }; pts.push(cur); }
              else if (c === 20 && cur) cur.y = parseFloat(v) || 0;
              else if (c === 42 && cur) cur.b = parseFloat(v) || 0;
            }
            polyline(pts, (gn(r, 70, 0) & 1) === 1, 'LWPOLYLINE');
            break;
          }
          case 'POLYLINE': {
            const flags = gn(r, 70, 0);
            const pts = []; let j = i + 1;
            for (; j < recs.length && recs[j].t === 'VERTEX'; j++) {
              const vf = gn(recs[j], 70, 0);
              if (vf & 128 && !(vf & 64)) continue;   // 多面網格的面記錄（沒有座標）
              if (vf & 16 && !(flags & 8)) continue;   // 曲線擬合產生的控制點（原始頂點）只留擬合後的
              pts.push({ x: gn(recs[j], 10, 0), y: gn(recs[j], 20, 0), b: gn(recs[j], 42, 0) });
            }
            if (recs[j] && recs[j].t === 'SEQEND') j++;
            i = j - 1;
            if (flags & 16 || flags & 64) { skipped['POLYLINE（3D 網格）'] = (skipped['POLYLINE（3D 網格）'] || 0) + 1; break; }
            polyline(pts, (flags & 1) === 1, 'POLYLINE');
            break;
          }
          case 'CIRCLE': circleOf(gn(r, 10, 0), gn(r, 20, 0), gn(r, 40, 0)); break;
          case 'ARC': arcOf(gn(r, 10, 0), gn(r, 20, 0), gn(r, 40, 0), gn(r, 50, 0), gn(r, 51, 0)); break;
          case 'ELLIPSE': {
            const cx = gn(r, 10, 0), cy = gn(r, 20, 0), mx = gn(r, 11, 1), my = gn(r, 21, 0), ratio = gn(r, 40, 1);
            polyPts(ellipsePoints(cx, cy, mx, my, ratio, gn(r, 41, 0), gn(r, 42, Math.PI * 2), gn(r, 230, 1) < 0 ? -1 : 1), 'ELLIPSE');
            break;
          }
          case 'SPLINE': {
            const ctrl = [], fit = []; let cur = null, cf = null;
            for (const [c, v] of r.g) {
              if (c === 10) { cur = [parseFloat(v) || 0, 0]; ctrl.push(cur); } else if (c === 20 && cur) cur[1] = parseFloat(v) || 0;
              else if (c === 11) { cf = [parseFloat(v) || 0, 0]; fit.push(cf); } else if (c === 21 && cf) cf[1] = parseFloat(v) || 0;
            }
            polyPts(splinePoints(gn(r, 71, 3), gall(r, 40), ctrl, gall(r, 42), fit, (gn(r, 70, 0) & 1) === 1), 'SPLINE');
            break;
          }
          case 'SOLID': case 'TRACE': {
            const q = [[10, 20], [11, 21], [12, 22], [13, 23]].map(([a, b2]) => tp(T, gn(r, a, 0), gn(r, b2, 0)));
            q.forEach(([x, y]) => grow(x, y));
            put({ k: 'S', pts: q });
            break;
          }
          case '3DFACE': {
            const q = [[10, 20], [11, 21], [12, 22], [13, 23]].map(([a, b2]) => [gn(r, a, 0), gn(r, b2, 0)]);
            const inv = gn(r, 70, 0);
            for (let k = 0; k < 4; k++) { if (inv & (1 << k)) continue; const a = q[k], b2 = q[(k + 1) % 4]; if (Math.hypot(b2[0] - a[0], b2[1] - a[1]) > 1e-9) line(a[0], a[1], b2[0], b2[1], '3DFACE'); }
            break;
          }
          case 'HATCH': {
            // 只畫邊界（填充線條對描牆沒有用）；群組碼要照順序讀
            const g = r.g; let p = g.findIndex(x => x[0] === 91); if (p < 0) break;
            const num = (c) => { if (p < g.length && g[p][0] === c) return parseFloat(g[p++][1]) || 0; return undefined; };
            const nPaths = parseInt(g[p++][1], 10) || 0;
            for (let pi = 0; pi < nPaths && p < g.length; pi++) {
              if (g[p][0] !== 92) break;
              const flags = parseInt(g[p++][1], 10) || 0;
              if (flags & 2) {   // 多段線邊界
                const hasB = num(72), closed = num(73), n = num(93) || 0, pts = [];
                for (let k = 0; k < n && p < g.length && g[p][0] === 10; k++) { const pt = { x: parseFloat(g[p++][1]) || 0, y: 0, b: 0 }; if (g[p] && g[p][0] === 20) pt.y = parseFloat(g[p++][1]) || 0; if (hasB && g[p] && g[p][0] === 42) pt.b = parseFloat(g[p++][1]) || 0; pts.push(pt); }
                polyline(pts, !!closed, 'HATCH');
              } else {
                const nEdges = num(93) || 0;
                for (let k = 0; k < nEdges && p < g.length; k++) {
                  if (g[p][0] !== 72) break;
                  const et = parseInt(g[p++][1], 10);
                  if (et === 1) { const x1 = num(10), y1 = num(20), x2 = num(11), y2 = num(21); line(x1, y1, x2, y2, 'HATCH'); }
                  else if (et === 2) { const cx = num(10), cy = num(20), rr = num(40); let a1 = num(50), a2 = num(51); const ccw = num(73); if (!ccw) { const t = a1; a1 = -a2; a2 = -t; } arcOf(cx, cy, rr, a1, a2, 'HATCH'); }
                  else if (et === 3) { const cx = num(10), cy = num(20), mx = num(11), my = num(21), ratio = num(40); let a1 = num(50), a2 = num(51); const ccw = num(73); if (!ccw) { const t = a1; a1 = -a2; a2 = -t; } polyPts(ellipsePoints(cx, cy, mx, my, ratio, a1 * Math.PI / 180, a2 * Math.PI / 180, 1), 'HATCH'); }
                  else if (et === 4) {
                    const deg = num(94), rational = num(73), periodic = num(74), nK = num(95) || 0, nC = num(96) || 0, knots = [], ctrl = [], w = [];
                    for (let q = 0; q < nK && g[p] && g[p][0] === 40; q++) knots.push(parseFloat(g[p++][1]) || 0);
                    for (let q = 0; q < nC && g[p] && g[p][0] === 10; q++) { const c2 = [parseFloat(g[p++][1]) || 0, 0]; if (g[p] && g[p][0] === 20) c2[1] = parseFloat(g[p++][1]) || 0; if (g[p] && g[p][0] === 42) w.push(parseFloat(g[p++][1]) || 1); ctrl.push(c2); }
                    const nF = num(97) || 0, fit = [];
                    for (let q = 0; q < nF && g[p] && g[p][0] === 11; q++) { const f = [parseFloat(g[p++][1]) || 0, 0]; if (g[p] && g[p][0] === 21) f[1] = parseFloat(g[p++][1]) || 0; fit.push(f); }
                    while (g[p] && (g[p][0] === 12 || g[p][0] === 22 || g[p][0] === 13 || g[p][0] === 23)) p++;
                    polyPts(splinePoints(deg, knots, ctrl, w, fit, !!periodic), 'HATCH');
                    void rational;
                  } else break;
                }
              }
              const nSrc = num(97) || 0; for (let q = 0; q < nSrc && g[p] && g[p][0] === 330; q++) p++;
            }
            break;
          }
          case 'MLINE': {
            // 每個頂點：10/20 位置、11/21 方向、12/22 斜接方向；每個元素：74 參數數、41×n（第一個＝沿斜接方向到元素線的距離）
            const g = r.g, closed = (gn(r, 70, 0) & 2) === 2, verts = []; let v = null, el = null, nParam = 0;
            for (const [c, val] of g) {
              const f = parseFloat(val) || 0;
              if (c === 10) { v = { x: f, y: 0, mx: 1, my: 0, els: [] }; verts.push(v); el = null; }
              else if (!v) continue;
              else if (c === 20) v.y = f;
              else if (c === 12) v.mx = f; else if (c === 22) v.my = f;
              else if (c === 74) { el = { d: null }; v.els.push(el); nParam = f; }
              else if (c === 41 && el && nParam > 0) { if (el.d == null) el.d = f; nParam--; }
            }
            const nEl = Math.max(0, ...verts.map(x => x.els.length));
            const ptOf = (vt, j) => { const d = vt.els[j] && vt.els[j].d != null ? vt.els[j].d : 0; return [vt.x + vt.mx * d, vt.y + vt.my * d]; };
            for (let j = 0; j < nEl; j++) for (let k = 0; k < (closed ? verts.length : verts.length - 1); k++) { const a = ptOf(verts[k], j), b2 = ptOf(verts[(k + 1) % verts.length], j); if (Math.hypot(b2[0] - a[0], b2[1] - a[1]) > 1e-9) line(a[0], a[1], b2[0], b2[1], 'MLINE'); }
            break;
          }
          case 'TEXT': case 'ATTDEF': case 'ATTRIB': {
            const hj = gn(r, 72, 0), vj = gn(r, 73, 0);
            const useAlt = hj !== 0 || vj !== 0;
            putText(gs(r, 1, ''), useAlt ? gn(r, 11, gn(r, 10, 0)) : gn(r, 10, 0), useAlt ? gn(r, 21, gn(r, 20, 0)) : gn(r, 20, 0),
              gn(r, 40, 2.5), gn(r, 50, 0), TX_ALIGN[hj] || 'l', TX_VALIGN[vj] || 'base', gs(r, 7, ''), gn(r, 41, 0) || 0);
            break;
          }
          case 'MTEXT': {
            const [al, va] = MT_ALIGN[gn(r, 71, 1)] || ['l', 't'];
            const rawTxt = gcat(r, 3) + gs(r, 1, '');   // 長字串先用一堆 code 3 分段，最後才是 code 1
            const raw = mtextPlain(unesc(rawTxt));   // 先還原 \U+XXXX／\M+1XXXX，再拿格式碼（否則反斜線會先被吃掉）
            const x = gn(r, 10, 0), y = gn(r, 20, 0), h = gn(r, 40, 2.5);
            let rot = gn(r, 50, 0);
            if (gv(r, 11) !== undefined) rot = Math.atan2(gn(r, 21, 0), gn(r, 11, 1)) * 180 / Math.PI;
            const lines = raw.split('\n').filter(s => s !== '');
            if (/\\[fF]@/.test(rawTxt)) { putVertical(lines, x, y, h, rot, gs(r, 7, '')); break; }
            const step = h * 1.6;
            const top = va === 't' ? 0 : va === 'mid' ? (lines.length - 1) * step / 2 : (lines.length - 1) * step;
            const refW = gn(r, 41, 0);
            lines.forEach((s, k) => putText(s, x, y + top - k * step, h, rot, al, va === 'mid' && lines.length > 1 ? 'mid' : va, gs(r, 7, ''), 0, refW));
            break;
          }
          case 'INSERT': {
            const nm = gs(r, 2, ''), blk = blocks[nm];
            if (!blk) { if (nm) addWarn('找不到圖塊「' + nm + '」，已略過'); break; }
            const sx = gn(r, 41, 1) || 1, sy = gn(r, 42, 1) || 1, rot = gn(r, 50, 0);
            const x = gn(r, 10, 0), y = gn(r, 20, 0);
            const cols = Math.max(1, gn(r, 70, 1) || 1), rows = Math.max(1, gn(r, 71, 1) || 1), dx = gn(r, 44, 0), dy = gn(r, 45, 0);
            const cr = Math.cos(rot * Math.PI / 180), sr = Math.sin(rot * Math.PI / 180);
            for (let ci = 0; ci < cols; ci++) for (let ri = 0; ri < rows; ri++) {
              const ox = ci * dx, oy = ri * dy;   // 陣列位移在圖塊自己的旋轉座標系裡（不受比例影響）
              insert(nm, blk, x + ox * cr - oy * sr, y + ox * sr + oy * cr, sx, sy, rot);
            }
            break;
          }
          case 'DIMENSION': {   // 標註的幾何存在匿名圖塊（*D…）裡，位置已是絕對座標
            const nm = gs(r, 2, ''), blk = blocks[nm];
            if (blk) walk(blk.recs, T, depth + 1);
            break;
          }
          case 'VERTEX': case 'SEQEND': case 'VIEWPORT': case 'ENDBLK': case 'BLOCK': case 'POINT': break;
          default: if (r.t) skipped[r.t] = (skipped[r.t] || 0) + 1;
        }
      }
    }
    walk(recsOf(sec.ENTITIES), { sx: 1, sy: 1, rot: 0, c: 1, s: 0, tx: 0, ty: 0 }, 0);

    const skippedList = Object.entries(skipped).map(([t, n]) => `${t} ×${n}`);
    if (skippedList.length) warn.push('略過不支援的圖元：' + skippedList.join('、'));
    const base = { ents, texts, layers: tbl.layers, styles: tbl.styles, warnings: warn, header, encoding, binary, counts, skipped };
    if (!isFinite(bb.x0)) {
      let err;
      if (paperOnly && !Object.keys(counts).length) err = '模型空間裡沒有圖形，圖形都在配置（圖紙空間）裡。請在 CAD 切到「模型」頁籤確認平面圖在模型空間，或把圖複製到模型空間後再另存 DXF。';
      else if (skippedList.length) err = '這個 DXF 裡的圖元都是目前不支援的類型（' + skippedList.join('、') + '）。請在 CAD 用 EXPLODE 把它們分解成線條、圓弧或多段線後再另存 DXF。';
      else err = '這個 DXF 裡沒有讀到任何線條、圓弧或多段線。請確認圖面在「模型空間」裡，而不是只有配置（圖紙空間）。';
      return Object.assign(base, { error: err, bbox: null });
    }
    // 單位：$INSUNITS 有就用；沒有（R12／$INSUNITS=0）就依圖幅推測並提醒
    let unit = header.units, unitGuessed = false;
    if (!UNIT[unit]) {
      const ext = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0);
      unit = ext < 150 ? 6 : ext < 3000 ? 5 : 4; unitGuessed = true;
      warn.push(`找不到單位設定（$INSUNITS），已依圖幅大小假設為 ${UNIT_NAME[unit]}；若不對請在右側「單位」改選，或用「點選線段輸入長度」定比例`);
    } else if (!UNIT_NAME[unit]) warn.push(`圖檔單位代號 ${unit} 不常見，已直接換算`);
    return Object.assign(base, {
      bbox: bb, w: +(bb.x1 - bb.x0).toFixed(2), h: +(bb.y1 - bb.y0).toFixed(2),
      unit, unitGuessed, area: null, rects: [], areaNamed: false
    });
  };

  /* ---------- 幾何：由線段找封閉面 ---------- */
  const key = (x, y) => Math.round(x / Q) + ',' + Math.round(y / Q);
  const qz = v => Math.round(v / Q) * Q;
  function segIntersect(a, b) {   // 兩線段內部交點（含 T 接），回傳 [t, u] 參數或 null
    const [x1, y1, x2, y2] = a, [x3, y3, x4, y4] = b;
    const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
    const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
    const e = 1e-6;
    if (t < -e || t > 1 + e || u < -e || u > 1 + e) return null;
    return [Math.max(0, Math.min(1, t)), Math.max(0, Math.min(1, u))];
  }
  // segs: [[x1,y1,x2,y2],…]（mm）→ 面清單 [{pts:[[x,y]…], area, per}]
  X.faces = function (segs, opt = {}) {
    const maxN = opt.maxSegs || 6000;
    let S = segs.filter(s => Math.hypot(s[2] - s[0], s[3] - s[1]) >= Q);
    if (S.length > maxN) S = S.sort((a, b) => Math.hypot(b[2] - b[0], b[3] - b[1]) - Math.hypot(a[2] - a[0], a[3] - a[1])).slice(0, maxN);   // 太多線時保留最長的
    // 1. 線段在交點／T 接處切開（含端點落在他線上）
    const cuts = S.map(() => [0, 1]);
    // 格網（400 mm）：只比對共用格子的線段；每對只在其外框交集的左下格處理一次
    const CS = 400, grid = new Map(), BB = S.map(s => [Math.min(s[0], s[2]) - Q, Math.max(s[0], s[2]) + Q, Math.min(s[1], s[3]) - Q, Math.max(s[1], s[3]) + Q]);
    const ck = (x, y) => x + ',' + y;
    BB.forEach((b, i) => { for (let gx = Math.floor(b[0] / CS); gx <= Math.floor(b[1] / CS); gx++) for (let gy = Math.floor(b[2] / CS); gy <= Math.floor(b[3] / CS); gy++) { const k = ck(gx, gy); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i); } });
    for (const [k, arr] of grid) {
      const [gx, gy] = k.split(',').map(Number);
      for (let u = 0; u < arr.length; u++) for (let w = u + 1; w < arr.length; w++) {
        const i = arr[u], j = arr[w], bi = BB[i], bj = BB[j];
        const x0 = Math.max(bi[0], bj[0]), y0 = Math.max(bi[2], bj[2]);
        if (x0 > Math.min(bi[1], bj[1]) || y0 > Math.min(bi[3], bj[3])) continue;
        if (Math.floor(x0 / CS) !== gx || Math.floor(y0 / CS) !== gy) continue;
        const r = segIntersect(S[i], S[j]); if (!r) continue;
        cuts[i].push(r[0]); cuts[j].push(r[1]);
      }
    }
    const E = [];
    S.forEach((s, i) => {
      const ts = [...new Set(cuts[i].map(t => +t.toFixed(6)))].sort((a, b) => a - b);
      for (let k = 0; k + 1 < ts.length; k++) {
        const a = [s[0] + (s[2] - s[0]) * ts[k], s[1] + (s[3] - s[1]) * ts[k]], b = [s[0] + (s[2] - s[0]) * ts[k + 1], s[1] + (s[3] - s[1]) * ts[k + 1]];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= Q) E.push([qz(a[0]), qz(a[1]), qz(b[0]), qz(b[1])]);
      }
    });
    // 2. 建圖（端點吸附到 Q mm 格）
    const nodes = new Map(), adj = new Map();
    const nid = (x, y) => { const k = key(x, y); if (!nodes.has(k)) { nodes.set(k, [x, y]); adj.set(k, new Set()); } return k; };
    E.forEach(([x1, y1, x2, y2]) => { const a = nid(x1, y1), b = nid(x2, y2); if (a === b) return; adj.get(a).add(b); adj.get(b).add(a); });
    // 3. 每個節點的鄰居依方位角排序
    const ang = new Map();
    for (const [k, set] of adj) {
      const p = nodes.get(k);
      const arr = [...set].map(n => { const q = nodes.get(n); return { n, a: Math.atan2(q[1] - p[1], q[0] - p[0]) }; }).sort((u, v) => u.a - v.a);
      ang.set(k, arr);
    }
    // 4. 走訪所有面：進入 v 後，取「反向邊」在 v 的鄰居環中的下一個（順時針方向）
    const used = new Set(), faces = [];
    for (const [u, set] of adj) for (const v0 of set) {
      if (used.has(u + '>' + v0)) continue;
      const poly = []; let a = u, b = v0, guard = 0;
      while (guard++ < 5000) {
        used.add(a + '>' + b); poly.push(nodes.get(a));
        const ring = ang.get(b); const i = ring.findIndex(r => r.n === a);
        const nx = ring[(i - 1 + ring.length) % ring.length].n;
        a = b; b = nx;
        if (a === u && b === v0) break;
      }
      if (poly.length < 3) continue;
      let area = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
      area /= 2;
      let per = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; per += Math.hypot(q[0] - p[0], q[1] - p[1]); }
      faces.push({ pts: poly, area, per });
    }
    return faces;
  };
  // 去掉共線中間點
  function simplify(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[(i - 1 + pts.length) % pts.length], c = pts[i], n = pts[(i + 1) % pts.length];
      const cr = (c[0] - p[0]) * (n[1] - c[1]) - (c[1] - p[1]) * (n[0] - c[0]);
      const l1 = Math.hypot(c[0] - p[0], c[1] - p[1]), l2 = Math.hypot(n[0] - c[0], n[1] - c[1]);
      if (Math.abs(cr) / Math.max(1, l1 * l2) > 0.02) out.push(c);
    }
    return out.length >= 3 ? out : pts;
  }
  // 候選房間：內部面（正負面積依走訪規則，內面與外面符號相反：取數量多的那個符號；只有一個面時取絕對值）
  X.candidates = function (faces) {
    const big = faces.filter(f => Math.abs(f.area) >= 1e6 && Math.abs(f.area) <= 2e9);
    const pos = big.filter(f => f.area > 0).length, neg = big.length - pos;
    let inner = pos >= neg ? big.filter(f => f.area > 0) : big.filter(f => f.area < 0);
    // 單一元件：內面與外面各一；面積相同時無法用符號分 → 兩個都留，由厚薄與排序決定
    if (!inner.length) inner = big;
    const out = inner.map(f => ({ pts: simplify(f.pts), area: Math.abs(f.area), per: f.per, thin: Math.abs(f.area) / (f.per * f.per) }))
      .filter(f => f.thin > 0.015 && f.pts.length >= 3 && f.pts.length <= 60);
    out.sort((a, b) => b.area - a.area);
    // 外框面（包含其他所有面）通常是最大的那個：若它完整包住第二大的面且面積差 < 40%，視為雙線牆外緣，排到後面
    if (out.length >= 2 && contains(out[0].pts, out[1].pts) && out[1].area > out[0].area * 0.6) out.push(out.shift());
    return out.filter(f => f.area <= 400e6).slice(0, 30);
  };
  function pip(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function contains(outer, inner) { return inner.every(p => pip(p[0], p[1], outer)); }
  X.pip = pip;
  // 估牆厚：每道邊往外找平行線（距離 50～400）
  X.thickness = function (poly, segs) {
    const ds = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy); if (L < 300) continue;
      const nx = dy / L, ny = -dx / L, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      const outward = pip(mx + nx * 5, my + ny * 5, poly) ? -1 : 1;
      let best = null;
      segs.forEach(s => {
        const ex = s[2] - s[0], ey = s[3] - s[1], l2 = Math.hypot(ex, ey); if (l2 < 100) return;
        if (Math.abs(ex * dx + ey * dy) / (l2 * L) < 0.999) return;   // 不平行
        const d = ((s[0] - mx) * nx + (s[1] - my) * ny) * outward;
        if (d < 50 || d > 400) return;
        // 投影要有重疊
        const t1 = ((s[0] - p[0]) * dx + (s[1] - p[1]) * dy) / (L * L), t2 = ((s[2] - p[0]) * dx + (s[3] - p[1]) * dy) / (L * L);
        if (Math.max(t1, t2) < 0.2 || Math.min(t1, t2) > 0.8) return;
        if (best == null || d < best) best = d;
      });
      if (best != null) ds.push(best);
    }
    if (!ds.length) return null;
    ds.sort((a, b) => a - b); const t = Math.round(ds[Math.floor(ds.length / 2)] / 5) * 5;
    return t >= 60 && t <= 260 ? t : null;   // 超出常見牆厚（陽台／結構柱誤判）就不採用
  };



  /* 牆線在門窗處是斷開的（內外線各有缺口），房間因此和室外連通而找不到封閉面。
     先把同一直線上、相距 450～4500 mm 且中間沒有其他牆線的兩段牆線用虛擬線段接起來，並記住這些「橋」= 開口 */
  X.bridge = function (segs) {
    const out = segs.map(s => s.slice()), bridges = [];
    const info = segs.map(s => { const L = Math.hypot(s[2] - s[0], s[3] - s[1]) || 1; let d = [(s[2] - s[0]) / L, (s[3] - s[1]) / L]; if (d[0] < 0 || (d[0] === 0 && d[1] < 0)) d = [-d[0], -d[1]]; const ang = Math.atan2(d[1], d[0]) * 180 / Math.PI; const off = s[0] * -d[1] + s[1] * d[0]; return { L, d, ang, off }; });
    // 分桶：方向 0.5°、直線位置 3 mm；只在同一直線（含相鄰桶）內找缺口
    const BO = 3, buckets = new Map();
    const bk = (a, o) => Math.round(a * 2) + ':' + o;
    info.forEach((f, i) => { if (f.L < 60) return; const k = bk(f.ang, Math.round(f.off / BO)); let a = buckets.get(k); if (!a) buckets.set(k, a = []); a.push(i); });
    const near = (f, span) => { const res = []; const ob = Math.round(f.off / BO); for (let da = -1; da <= 1; da++) for (let dob = -span; dob <= span; dob++) { const a = buckets.get(bk(f.ang + da * 0.5, ob + dob)); if (a) res.push(...a); } return res; };
    const seen = new Set();
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], { L, d } = info[i]; if (L < 60) continue;
      const proj = (x, y) => ({ t: (x - s[0]) * d[0] + (y - s[1]) * d[1], n: Math.abs((x - s[0]) * d[1] - (y - s[1]) * d[0]) });
      const cand = near(info[i], 1), blockers = near(info[i], 10);
      for (const j of cand) {
        if (i === j || Math.abs(d[0] * info[j].d[0] + d[1] * info[j].d[1]) < 0.9995) continue;
        const t = segs[j], p1 = proj(t[0], t[1]), p2 = proj(t[2], t[3]);
        if (p1.n > 3 || p2.n > 3) continue;
        const a = Math.min(p1.t, p2.t), b = Math.max(p1.t, p2.t);
        let g0, g1;   // 缺口區間（沿 s 的參數）
        if (b < 0) { g0 = b; g1 = 0; } else if (a > L) { g0 = L; g1 = a; } else continue;
        const gap = g1 - g0;
        if (gap < 450 || gap > 4500) continue;
        // 缺口中間不能有其他牆線（貼近同一直線）
        let blocked = false;
        for (const m of blockers) {
          if (m === i || m === j) continue;
          const u = segs[m], q1 = proj(u[0], u[1]), q2 = proj(u[2], u[3]);
          if (q1.n > 30 && q2.n > 30) continue;
          const lo = Math.min(q1.t, q2.t), hi = Math.max(q1.t, q2.t);
          if (hi > g0 + 20 && lo < g1 - 20) { blocked = true; break; }
        }
        if (blocked) continue;
        const k = [i, j].sort((x, y) => x - y).join('-') + ':' + Math.round(g0);
        if (seen.has(k)) continue; seen.add(k);
        const A = [s[0] + d[0] * g0, s[1] + d[1] * g0], B = [s[0] + d[0] * g1, s[1] + d[1] * g1];
        out.push([A[0], A[1], B[0], B[1]]); bridges.push({ a: A, b: B, w: gap });
      }
    }
    return { segs: out, bridges };
  };

  /* ---------- 門窗辨識 ----------
     1. 房間面在開口處會沿門邊線凹進牆厚（缺口）：找「轉出 t、沿牆 w、轉回 t」的四段，拉直並記成開口
     2. 門：附近有半徑≈開口寬的門弧線；窗：窗圖層線條橫過開口；否則寬 ≥1300 視為窗、其餘為門
     3. 沒有缺口但窗圖層線條貼在牆線上：合併成區間當作窗 */
  X.openings = function (poly, thick, ents, k, layers, bridges, wallSegs) {
    const T = Math.max(60, thick || 120);
    let pts = poly.map(p => p.slice()), opens = [];   // opens: {i:牆序, off, w, type}
    const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dir = (a, b) => { const l = len(a, b) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
    // 1. 缺口拉直
    for (let guard = 0; guard < 200; guard++) {
      const n = pts.length; let found = false;
      for (let i = 0; i < n && n >= 6; i++) {
        const P = j => pts[(i + j) % n];
        const d0 = dir(P(0), P(1)), d1 = dir(P(1), P(2)), d2 = dir(P(2), P(3)), d3 = dir(P(3), P(4));
        const t1 = len(P(1), P(2)), w = len(P(2), P(3)), t2 = len(P(3), P(4));
        if (Math.abs(dot(d0, d1)) > 0.08 || Math.abs(dot(d2, d1)) > 0.08 || Math.abs(dot(d3, d2)) > 0.08) continue;
        if (dot(d0, d2) < 0.99 || dot(d1, d3) > -0.99) continue;
        if (t1 < 40 || t1 > T * 1.6 + 40 || Math.abs(t1 - t2) > Math.max(30, t1 * 0.35) || w < 450 || w > 4500) continue;
        // 缺口要在房間外側：凹口中點往回（朝房間）少許應在多邊形內
        const mx = (P(2)[0] + P(3)[0]) / 2 - d1[0] * (t1 + 5), my = (P(2)[1] + P(3)[1]) / 2 - d1[1] * (t1 + 5);
        if (!pip(mx, my, pts)) continue;
        const off = len(P(0), P(1));
        opens.push({ a: P(0).slice(), b: P(4).slice(), off, w, t: t1, c: [(P(2)[0] + P(3)[0]) / 2, (P(2)[1] + P(3)[1]) / 2], d: d0 });
        // 刪掉 P(1)、P(2)、P(3)（保留 P(0)、P(4)，之後共線點再合併）
        const del = [(i + 1) % n, (i + 2) % n, (i + 3) % n].sort((x, y) => y - x);
        del.forEach(j => pts.splice(j, 1));
        found = true; break;
      }
      if (!found) break;
    }
    pts = simplify(pts);
    // 把開口對應到拉直後的牆（開口中心投影到最近的牆邊）
    const out = [];
    const assign = (c, w, type, extra) => {
      let best = null;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length], L = len(p, q), d = dir(p, q);
        const t = dot([c[0] - p[0], c[1] - p[1]], d);
        if (t < -50 || t > L + 50) continue;
        const dist = Math.abs((c[0] - p[0]) * d[1] - (c[1] - p[1]) * d[0]);
        if (dist <= T * 1.2 + 30 && (!best || dist < best.dist)) best = { i, dist, off: t - w / 2, L };
      }
      if (!best) return;
      if (out.some(o => o.i === best.i && Math.abs(o.off - best.off) < Math.max(o.w, w) * 0.6)) return;   // 已有重疊開口
      out.push(Object.assign({ i: best.i, off: Math.round(best.off), w: Math.round(w), type }, extra));
    };
    const arcs = ents.filter(e => e.k === 'A').map(e => ({ c: [e.c[0] * k, e.c[1] * k], r: e.r * k, ang: e.ang != null ? e.ang : ((e.a2 - e.a1) % 360 + 360) % 360 })).filter(a => a.ang >= 25 && a.ang <= 120 && a.r >= 500 && a.r <= 1300);
    const winLines = ents.filter(e => e.k === 'L' && /win|glaz|窗/i.test(e.l)).map(e => [e.p[0] * k, e.p[1] * k, e.p[2] * k, e.p[3] * k]);
    const crossesWin = o => winLines.some(s => Math.hypot(s[0] - o.c[0], s[1] - o.c[1]) < o.w || Math.hypot(s[2] - o.c[0], s[3] - o.c[1]) < o.w);
    (bridges || []).forEach(b => {
      const c = [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2], L = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) || 1;
      // 橋要落在房間輪廓的邊上（內線）才算這個房間的開口
      const onEdge = pts.some((p, i) => { const q = pts[(i + 1) % pts.length], d = dir(p, q); const n = Math.abs((c[0] - p[0]) * d[1] - (c[1] - p[1]) * d[0]); const t = dot([c[0] - p[0], c[1] - p[1]], d); return n < 5 && t > -5 && t < len(p, q) + 5; });
      if (onEdge) opens.push({ off: 0, w: b.w, t: T, c, d: [(b.b[0] - b.a[0]) / L, (b.b[1] - b.a[1]) / L], src: 'bridge' });
    });
    opens.forEach(o => {
      const isDoor = arcs.some(a => a.r > o.w * 0.75 && a.r < o.w * 1.3 && Math.min(Math.hypot(a.c[0] - (o.c[0] - o.d[0] * o.w / 2), a.c[1] - (o.c[1] - o.d[1] * o.w / 2)), Math.hypot(a.c[0] - (o.c[0] + o.d[0] * o.w / 2), a.c[1] - (o.c[1] + o.d[1] * o.w / 2))) < 200);
      const type = isDoor ? 'door' : crossesWin(o) ? 'window' : (o.w >= 1300 ? 'window' : 'door');
      assign(o.c, o.w, type, { src: o.src || 'gap' });
    });
    // 2b. 牆線覆蓋缺口：沿每道牆邊，把牆圖層的平行線投影上去，沒被覆蓋的區段（450～4500）就是門窗開口
    //     （房間輪廓若來自天花板線／地坪線等細線矩形，牆本身的缺口仍可由此找到）
    if (wallSegs && wallSegs.length) {
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length], L = len(p, q), d = dir(p, q);
        if (L < 600) continue;
        const iv = [];
        wallSegs.forEach(s => {
          const ex = s[2] - s[0], ey = s[3] - s[1], l2 = Math.hypot(ex, ey); if (l2 < 30) return;
          if (Math.abs((ex * d[0] + ey * d[1]) / l2) < 0.98) return;
          const n1 = Math.abs((s[0] - p[0]) * d[1] - (s[1] - p[1]) * d[0]), n2 = Math.abs((s[2] - p[0]) * d[1] - (s[3] - p[1]) * d[0]);
          if (n1 > T + 40 || n2 > T + 40) return;
          const t1 = dot([s[0] - p[0], s[1] - p[1]], d), t2 = dot([s[2] - p[0], s[3] - p[1]], d);
          const a = Math.max(0, Math.min(t1, t2)), b = Math.min(L, Math.max(t1, t2));
          if (b > a) iv.push([a, b]);
        });
        if (!iv.length) continue;
        iv.sort((u, v) => u[0] - v[0]);
        const merged = [];
        iv.forEach(x => { const m = merged[merged.length - 1]; if (m && x[0] <= m[1] + 15) m[1] = Math.max(m[1], x[1]); else merged.push(x.slice()); });
        const total = merged.reduce((s2, m) => s2 + (m[1] - m[0]), 0);
        if (total < L * 0.3) continue;   // 這道邊幾乎沒有牆線貼著（可能不是牆），略過
        for (let g = 0; g + 1 < merged.length; g++) {
          const a = merged[g][1], b = merged[g + 1][0], w = b - a;
          if (w < 450 || w > 4500) continue;
          const c = [p[0] + d[0] * (a + b) / 2, p[1] + d[1] * (a + b) / 2];
          const ends = [[p[0] + d[0] * a, p[1] + d[1] * a], [p[0] + d[0] * b, p[1] + d[1] * b]];
          const isDoor = arcs.some(ar => ar.r > w * 0.6 && ar.r < w * 1.3 && ends.some(e => Math.hypot(ar.c[0] - e[0], ar.c[1] - e[1]) < 250));
          const o = { off: 0, w, t: T, c, d, src: 'cover' };
          const type = isDoor ? 'door' : crossesWin(o) ? 'window' : (w >= 1300 ? 'window' : 'door');
          assign(c, w, type, { src: 'cover' });
        }
      }
    }
    // 2c. 門弧符號：鉸鏈（圓心）貼在牆邊、半徑＝門扇寬；牆線沒斷開的畫法也能找到門
    arcs.forEach(ar => {
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length], L = len(p, q), d = dir(p, q);
        const n = Math.abs((ar.c[0] - p[0]) * d[1] - (ar.c[1] - p[1]) * d[0]), tc = dot([ar.c[0] - p[0], ar.c[1] - p[1]], d);
        if (n > T + 60 || tc < -50 || tc > L + 50) continue;
        // 弧的哪一端貼在牆線上 → 門扇關閉方向
        const e = ents.find(x => x.k === 'A' && Math.abs(x.c[0] * k - ar.c[0]) < 1 && Math.abs(x.c[1] * k - ar.c[1]) < 1);
        let sgn = 0;
        if (e) {
          const ends = [e.a1, e.a2].map(a => [ar.c[0] + ar.r * Math.cos(a * Math.PI / 180), ar.c[1] + ar.r * Math.sin(a * Math.PI / 180)]);
          const best = ends.map(pt => ({ n: Math.abs((pt[0] - p[0]) * d[1] - (pt[1] - p[1]) * d[0]), t: dot([pt[0] - p[0], pt[1] - p[1]], d) })).sort((u, v) => u.n - v.n)[0];
          if (best && best.n < 200) sgn = Math.sign(best.t - tc);
        }
        if (!sgn) sgn = tc < L / 2 ? 1 : -1;
        const w = Math.min(ar.r + 40, 1300), c = [p[0] + d[0] * (tc + sgn * w / 2), p[1] + d[1] * (tc + sgn * w / 2)];
        assign(c, w, 'door', { src: 'arc' });
        break;
      }
    });
    // 2d. 窗符號：牆帶內兩條（以上）平行於牆、長度相近且重疊的短線（450～4000），且附近沒有門弧
    {
      const dark = ents.filter(e => e.k === 'L' && !/8d728d|fe0100/.test(e.l)).map(e => [e.p[0] * k, e.p[1] * k, e.p[2] * k, e.p[3] * k]);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length], L = len(p, q), d = dir(p, q);
        const cand = [];
        dark.forEach(s => {
          const ex = s[2] - s[0], ey = s[3] - s[1], l2 = Math.hypot(ex, ey); if (l2 < 450 || l2 > 4000 || l2 > L - 100) return;
          if (Math.abs((ex * d[0] + ey * d[1]) / l2) < 0.995) return;
          const n1 = (s[0] - p[0]) * d[1] - (s[1] - p[1]) * d[0], n2 = (s[2] - p[0]) * d[1] - (s[3] - p[1]) * d[0];
          if (Math.abs(n1 - n2) > 5 || Math.abs(n1) > T + 150 || Math.abs(n1) < 15) return;
          const t1 = dot([s[0] - p[0], s[1] - p[1]], d), t2 = dot([s[2] - p[0], s[3] - p[1]], d), a = Math.min(t1, t2), b = Math.max(t1, t2);
          if (a < -50 || b > L + 50) return;
          cand.push({ n: n1, a, b });
        });
        cand.sort((u, v) => u.a - v.a);
        const used = new Set();
        cand.forEach((c1, ci) => {
          if (used.has(ci)) return;
          const grp = cand.filter((c2, cj) => cj !== ci && !used.has(cj) && Math.abs(c2.n - c1.n) >= 8 && Math.abs(c2.n - c1.n) <= 120 && Math.min(c1.b, c2.b) - Math.max(c1.a, c2.a) > 0.8 * Math.min(c1.b - c1.a, c2.b - c2.a));
          if (!grp.length) return;
          used.add(ci); grp.forEach(c2 => used.add(cand.indexOf(c2)));
          const a = Math.min(c1.a, ...grp.map(g => g.a)), b = Math.max(c1.b, ...grp.map(g => g.b)), w = b - a;
          const c = [p[0] + d[0] * (a + b) / 2, p[1] + d[1] * (a + b) / 2];
          if (out.some(o => o.type === 'door' && o.i === i && Math.abs(o.off + o.w / 2 - (a + b) / 2) < w)) return;
          assign(c, w, 'window', { src: 'sym' });
        });
      }
    }
    // 3. 窗圖層線條貼在牆線上（無缺口）
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], L = len(p, q), d = dir(p, q);
      const iv = [];
      winLines.forEach(s => {
        const e1 = [s[0] - p[0], s[1] - p[1]], e2 = [s[2] - p[0], s[3] - p[1]];
        const n1 = Math.abs(e1[0] * d[1] - e1[1] * d[0]), n2 = Math.abs(e2[0] * d[1] - e2[1] * d[0]);
        if (n1 > T + 20 || n2 > T + 20) return;
        const t1 = dot(e1, d), t2 = dot(e2, d);
        const a = Math.max(0, Math.min(t1, t2)), b = Math.min(L, Math.max(t1, t2));
        if (b - a >= 300) iv.push([a, b]);
      });
      iv.sort((u, v) => u[0] - v[0]);
      const merged = [];
      iv.forEach(x => { const m = merged[merged.length - 1]; if (m && x[0] <= m[1] + 50) m[1] = Math.max(m[1], x[1]); else merged.push(x.slice()); });
      merged.forEach(([a, b]) => { if (b - a >= 300 && b - a <= 4500) assign([p[0] + d[0] * (a + b) / 2, p[1] + d[1] * (a + b) / 2], b - a, 'window', { src: 'layer' }); });
    }
    return { pts, openings: out };
  };

  /* ---------- 主流程 ---------- */
  X.open = async function (file) {
    App.busy(true, '解析 DXF…');
    let fr;
    try { fr = X.parse(new Uint8Array(await file.arrayBuffer())); }
    catch (e) { App.busy(false); App.toast('讀取失敗：' + (e.message || e)); return; }
    App.busy(false);
    if (!fr || fr.error) { await UI().alert('無法讀取 DXF', (fr && fr.error) || '這個 DXF 沒有可用圖形'); return; }
    await X.openFrame(fr, file.name, { mode: 'dxf', unit: fr.unit });
  };

  // PDF 向量平面圖：fr.ents 為紙面 mm；比例分母 S 由牆厚（平行雙線間距）推測
  const SCALES = [20, 25, 30, 40, 50, 60, 75, 80, 100, 120, 125, 150, 200, 250, 300, 400, 500];
  X.guessScale = function (segs, arcs) {
    const PREF = [100, 50, 200, 30, 25, 20, 40, 60, 150, 75, 80, 120, 125, 250, 300, 400, 500];
    // 1. 門窗開口：同一直線上兩段牆線的間隙（紙面 2～40 mm）做直方圖
    const G = segs.map(s => { const L = Math.hypot(s[2] - s[0], s[3] - s[1]) || 1; return { s, L, d: [(s[2] - s[0]) / L, (s[3] - s[1]) / L] }; }).filter(o => o.L >= 3).sort((a, b) => b.L - a.L).slice(0, 4000);
    const gh = {};
    for (let i = 0; i < G.length; i++) {
      const { s, L, d } = G[i];
      for (let j = 0; j < G.length; j++) {
        if (i === j || Math.abs(d[0] * G[j].d[0] + d[1] * G[j].d[1]) < 0.9995) continue;
        const t = G[j].s, n1 = Math.abs((t[0] - s[0]) * d[1] - (t[1] - s[1]) * d[0]), n2 = Math.abs((t[2] - s[0]) * d[1] - (t[3] - s[1]) * d[0]);
        if (n1 > 0.05 || n2 > 0.05) continue;
        const t1 = (t[0] - s[0]) * d[0] + (t[1] - s[1]) * d[1], t2 = (t[2] - s[0]) * d[0] + (t[3] - s[1]) * d[1], a = Math.min(t1, t2), b = Math.max(t1, t2);
        let gap; if (b < 0) gap = -b; else if (a > L) gap = a - L; else continue;
        if (gap < 2 || gap > 40) continue;
        const key = (Math.round(gap * 2) / 2).toFixed(1); gh[key] = (gh[key] || 0) + 1;
      }
    }
    const gaps = Object.entries(gh).map(([k, n]) => ({ g: +k, n: n / 2 })).filter(o => o.n >= 3);   // 每對算了兩次
    const door = (arcs || []).filter(a => a.ang >= 70 && a.ang <= 110 && a.r >= 2 && a.r <= 40);
    // 2. 評分：各比例下，開口寬落在門（600～1000）得 2 分、窗／大開口（1000～2500）得 1 分；門弧半徑（門扇寬）落在 600～950 得 2 分
    if (gaps.length || door.length >= 3) {
      let best = null;
      PREF.forEach(S => {
        let sc = 0;
        gaps.forEach(o => { const w = o.g * S; if (w >= 600 && w <= 1000) sc += 2 * o.n; else if (w > 1000 && w <= 2500) sc += o.n; });
        door.forEach(a => { const w = a.r * S; if (w >= 600 && w <= 950) sc += 2; });
        if (!best || sc > best.sc) best = { S, sc };
      });
      if (best && best.sc > 0) return best.S;
    }
    // 3. 牆厚：平行雙線間距的眾數
    const L = segs.map(s => ({ s, l: Math.hypot(s[2] - s[0], s[3] - s[1]) })).filter(o => o.l > 4).sort((a, b) => b.l - a.l).slice(0, 1500);
    const hist = {};
    for (let i = 0; i < L.length; i++) {
      const a = L[i].s, la = L[i].l, dx = (a[2] - a[0]) / la, dy = (a[3] - a[1]) / la;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j].s, lb = L[j].l, ex = (b[2] - b[0]) / lb, ey = (b[3] - b[1]) / lb;
        if (Math.abs(dx * ex + dy * ey) < 0.999) continue;
        const d = Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx);
        if (d < 0.4 || d > 8) continue;
        const t1 = (b[0] - a[0]) * dx + (b[1] - a[1]) * dy, t2 = (b[2] - a[0]) * dx + (b[3] - a[1]) * dy;
        if (Math.max(t1, t2) < 0 || Math.min(t1, t2) > la) continue;
        const key = (Math.round(d * 10) / 10).toFixed(1); hist[key] = (hist[key] || 0) + Math.min(la, lb);
      }
    }
    const tb = Object.entries(hist).sort((a, b) => b[1] - a[1])[0];
    if (!tb) return 100;
    const tp = +tb[0], err = S => Math.max(0, 100 - tp * S, tp * S - 220);
    const ok = PREF.filter(S => err(S) === 0);
    return ok.length ? ok[0] : PREF.reduce((p, c) => err(c) < err(p) ? c : p, 100);
  };

  X.openFrame = async function (fr, name, opt) {
    const st = X._st = { fr, mode: opt.mode || 'dxf', unit: opt.unit || 4, scaleDen: opt.scaleDen || 100, image: opt.image || null, renderImage: opt.renderImage || null, paperW: opt.paperW, paperH: opt.paperH, layers: {}, cands: [], pick: 0, faces: null, warn: fr.warnings || [] };
    const counts = {};
    fr.ents.forEach(e => { counts[e.l] = (counts[e.l] || 0) + 1; });
    const layerNames = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    // 預設勾選：名稱像牆的圖層；都沒有就全部勾
    const wallLike = layerNames.filter(l => /wall|牆|墻|A-WALL|WALL/i.test(l));
    if (st.mode === 'pdf') {   // PDF 假圖層＝線寬：預設只勾粗線（牆），細線多為門窗、標註
      const lum = l => { const m = l.match(/色 ([0-9a-f]{6})/); return m ? parseInt(m[1].slice(0, 2), 16) + parseInt(m[1].slice(2, 4), 16) + parseInt(m[1].slice(4, 6), 16) : 0; };
      layerNames.forEach(l => { st.layers[l] = lum(l) < 200; });
      if (!layerNames.some(l => st.layers[l])) layerNames.forEach(l => { st.layers[l] = true; });
    } else
    layerNames.forEach(l => { st.layers[l] = wallLike.length ? wallLike.includes(l) : !/text|dim|標|文字|hatch|furn|家具|door|window|門|窗|軸|axis|grid|title|frame|圖框/i.test(l); });
    await X.dialog(st, counts, layerNames, name);
  };

  const kOf = st => st.mode === 'pdf' ? st.scaleDen : (st.customK || UNIT[st.unit] || 1);
  function segsOf(st) {
    const k = kOf(st);
    return st.fr.ents.filter(e => e.k === 'L' && st.layers[e.l]).map(e => [e.p[0] * k, e.p[1] * k, e.p[2] * k, e.p[3] * k]);
  }
  function compute(st) {
    const raw = segsOf(st), br = X.bridge(raw);
    st.segs = raw; st.bridges = br.bridges;
    st.faces = X.faces(br.segs);
    st.cands = X.candidates(st.faces);
    st.pick = 0;
    return st.cands;
  }

  X.dialog = async function (st, counts, layerNames, fname) {
    const k0 = () => kOf(st);
    const isPdf = st.mode === 'pdf';
    const body = `<div class="dxfin">
      <div class="dxfin-left">
        <div class="dxfin-tools">
          <button type="button" class="btn small" id="dxfTrace">${UI().icon('line')}圈選空間</button>
          <button type="button" class="btn small" id="dxfTraceUndo" disabled>退一點</button>
          <button type="button" class="btn small" id="dxfTraceCancel" disabled>取消圈選</button>
          <span class="dxfin-sep"></span>
          <button type="button" class="btn small" id="dxfZoomIn" title="放大（滾輪）">＋</button>
          <button type="button" class="btn small" id="dxfZoomOut" title="縮小（滾輪）">－</button>
          <button type="button" class="btn small" id="dxfZoomFit" title="全圖">全圖</button>
          <span class="muted" style="font-size:11.5px;margin-left:auto">滾輪縮放 · 拖曳平移 · 圈選時點各轉角，點回起點或快按兩下封閉</span>
        </div>
        <canvas id="dxfCv" width="860" height="600"></canvas>
        <div class="dxfin-stat muted" id="dxfStat"></div></div>
      <div class="dxfin-right">
        <div class="kv"><label>${isPdf ? '圖面比例' : '單位'}</label>${isPdf ? `<div class="inline">1 :&nbsp;<input name="unit" type="number" value="${st.scaleDen}" min="0.01" max="5000" step="any" style="width:80px"><span class="unit">（自動推測，可改）</span></div>` : `<select name="unit" data-k="unit">${[[4, 'mm（公釐）'], [5, 'cm（公分）'], [6, 'm（公尺）'], [1, 'inch（英吋）'], [2, 'ft（英呎）']].map(([v, n]) => `<option value="${v}"${v === st.unit ? ' selected' : ''}>${n}</option>`).join('')}</select>`}
        <label></label><div class="inline"><button type="button" class="btn small" id="dxfPick">${UI().icon('tape')}點選線段輸入長度定比例</button></div>
        <div id="dxfPickRow" class="inline" style="grid-column:1/-1;display:none;gap:6px;align-items:center"><span id="dxfPickInfo" class="muted" style="font-size:12px"></span><input id="dxfPickLen" type="number" step="1" min="10" style="width:90px" placeholder="實際 mm"><span class="unit">mm</span><button type="button" class="btn small primary" id="dxfPickApply">套用</button></div>
        <label>圖幅</label><span id="dxfSize"></span>
        <label>牆厚</label><div class="inline"><input name="t" type="number" value="120" step="5" min="50" max="400"><span class="unit">mm</span></div>
        <label>牆高</label><div class="inline"><input name="h" type="number" value="${App.state.room ? App.state.room.height : 2800}" step="10" min="1800" max="6000"><span class="unit">mm</span></div>
        <label>門窗</label><label class="inline" style="gap:6px"><input type="checkbox" name="op" checked> 自動帶入 <span id="dxfOp" class="muted"></span></label></div>
        <div class="sec-title" style="margin-top:8px">圖層 <small>勾選含牆線的圖層</small></div>
        ${st.warn.length ? `<div class="dxfin-warn muted" style="font-size:11.5px;margin:6px 0 0;padding:6px 8px;border:1px solid #e3c984;border-radius:6px;background:#fff8e5">${st.warn.map(w => '⚠ ' + UI().esc(w)).join('<br>')}</div>` : ''}
        <div class="dxfin-layers">${layerNames.map(l => `<label><input type="checkbox" data-layer="${UI().esc(l)}"${st.layers[l] ? ' checked' : ''}> ${UI().esc(l)} <span class="muted">${counts[l]}</span></label>`).join('')}</div>
        <p class="muted" style="font-size:11.5px;margin:8px 0 0">自動找到的封閉區域會以淡色標出，點選即成為「空間」（藍色）。自動找不到或不準時按「圈選空間」自己沿牆內緣點轉角（會吸附線段端點與直角），門口直接跨過去即可，門窗會再依符號辨識帶入。</p>
      </div></div>`;
    const res = await UI().modal({
      title: (isPdf ? '匯入 PDF 平面圖：' : '匯入 DXF：') + fname, body, wide: true, cls: 'dxfin-modal',
      buttons: [{ label: '取消', value: null }, { label: '轉成底圖描圖', value: 'underlay' }, { label: '建立空間', primary: true, value: 'room' }],
      validate: () => { const el = document.activeElement; if (el && el.id === 'dxfPickLen') { el.dispatchEvent(new Event('apply')); return ' '; } if (st.trace) { finishTrace(); return ' '; } return null; },
      onOpen: back => {
        const cv = back.querySelector('#dxfCv'), ctx = cv.getContext('2d');
        const stat = back.querySelector('#dxfStat'), size = back.querySelector('#dxfSize'), opEl = back.querySelector('#dxfOp');
        const $b = id => back.querySelector('#' + id);
        const wallSegsOf = () => {
          const k = k0(), names = Object.keys(st.layers).filter(l => st.layers[l]);
          let wall;
          if (isPdf) { const lw = l => +((l.match(/線寬 ([\d.]+)/) || [])[1] || 0), mx = Math.max(...names.map(lw), 0); wall = names.filter(l => lw(l) >= mx * 0.5); }
          else { wall = names.filter(l => /wall|牆|墻/i.test(l)); if (!wall.length) wall = names; }
          return st.fr.ents.filter(e => e.k === 'L' && wall.includes(e.l)).map(e => [e.p[0] * k, e.p[1] * k, e.p[2] * k, e.p[3] * k]);
        };
        const detect = () => { const c = st.cands[st.pick]; if (!c) { st.det = null; opEl.textContent = ''; return; } st.det = X.openings(c.pts, +back.querySelector('[name=t]').value || 120, st.fr.ents, k0(), st.layers, st.bridges, wallSegsOf()); const nd = st.det.openings.filter(o => o.type === 'door').length, nw = st.det.openings.length - nd; opEl.textContent = `偵測到 門 ${nd}、窗 ${nw}`; };

        /* ---- 視圖：縮放／平移 ---- */
        const W = cv.width, H = cv.height;
        const vw = { zoom: 1, panX: 0, panY: 0 };
        let fit = null;   // { sc0, ox0, oy0 }
        const calcFit = () => { const k = k0(), bb = st.fr.bbox, w = (bb.x1 - bb.x0) * k || 1, h = (bb.y1 - bb.y0) * k || 1; const sc0 = Math.min((W - 20) / w, (H - 20) / h); fit = { sc0, ox0: (W - w * sc0) / 2 - bb.x0 * k * sc0, oy0: H - (H - h * sc0) / 2 + bb.y0 * k * sc0, w, h }; };
        const tx = x => (x * fit.sc0 + fit.ox0 - W / 2) * vw.zoom + W / 2 + vw.panX;
        const ty = y => (fit.oy0 - y * fit.sc0 - H / 2) * vw.zoom + H / 2 + vw.panY;
        const inv = (px, py) => [((px - W / 2 - vw.panX) / vw.zoom + W / 2 - fit.ox0) / fit.sc0, (fit.oy0 - ((py - H / 2 - vw.panY) / vw.zoom + H / 2)) / fit.sc0];
        const scale = () => fit.sc0 * vw.zoom;   // 畫布 px / mm
        st._tx = tx; st._ty = ty; st._vw = vw;
        const cvPos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
        const zoomAt = (px, py, f) => { const z = Math.max(0.5, Math.min(40, vw.zoom * f)); f = z / vw.zoom; vw.panX = px - W / 2 - (px - W / 2 - vw.panX) * f; vw.panY = py - H / 2 - (py - H / 2 - vw.panY) * f; vw.zoom = z; draw(); };

        /* ---- 圈選 ---- */
        let hover = null;   // 吸附後的游標點 { p:[x,y], snap }
        const snapPoint = (wx, wy) => {
          const k = k0(), tolPx = 9 / scale(), tr = st.trace;
          let best = null;
          // 1. 端點
          // 端點：距離除以線段長度加權（牆線長，優先吸附牆角而不是家具小線）
          st.fr.ents.forEach(e => {
            if (e.k !== 'L' || !st.layers[e.l]) return;
            const Ls = Math.hypot(e.p[2] - e.p[0], e.p[3] - e.p[1]) * k, wgt = 1 + Math.min(Ls, 3000) / 1500;
            [[e.p[0] * k, e.p[1] * k], [e.p[2] * k, e.p[3] * k]].forEach(pt => { const d = Math.hypot(pt[0] - wx, pt[1] - wy); if (d < tolPx && (!best || d / wgt < best.s)) best = { p: pt, d, s: d / wgt, snap: '端點' }; });
          });
          if (best) return best;
          // 2. 線上（垂足）
          const tol2 = 8 / scale();
          st.fr.ents.forEach(e => {
            if (e.k !== 'L' || !st.layers[e.l]) return;
            const ax = e.p[0] * k, ay = e.p[1] * k, bx = e.p[2] * k, by = e.p[3] * k, L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
            const t = Math.max(0, Math.min(1, ((wx - ax) * (bx - ax) + (wy - ay) * (by - ay)) / L2));
            const fx = ax + (bx - ax) * t, fy = ay + (by - ay) * t, d = Math.hypot(wx - fx, wy - fy);
            if (d < tol2 && (!best || d < best.d)) best = { p: [fx, fy], d, snap: '線上' };
          });
          if (best) {
            // 線上點再與上一點對齊直角
            if (tr && tr.pts.length) { const lp = tr.pts[tr.pts.length - 1]; if (Math.abs(best.p[0] - lp[0]) < tol2 * 2) best.p[0] = lp[0]; else if (Math.abs(best.p[1] - lp[1]) < tol2 * 2) best.p[1] = lp[1]; }
            return best;
          }
          // 3. 與上一點直角對齊
          if (tr && tr.pts.length) { const lp = tr.pts[tr.pts.length - 1]; const tol3 = 10 / scale(); if (Math.abs(wx - lp[0]) < tol3) return { p: [lp[0], wy], snap: '直角' }; if (Math.abs(wy - lp[1]) < tol3) return { p: [wx, lp[1]], snap: '直角' }; }
          return { p: [wx, wy], snap: '' };
        };
        const setTraceUI = () => { $b('dxfTrace').classList.toggle('primary', !!st.trace); $b('dxfTraceUndo').disabled = !st.trace || !st.trace.pts.length; $b('dxfTraceCancel').disabled = !st.trace; cv.style.cursor = st.trace || st.pickMode ? 'crosshair' : 'grab'; };
        const startTrace = () => { st.trace = { pts: [] }; st.pickMode = false; $b('dxfPick').classList.remove('primary'); setTraceUI(); App.toast('沿牆內緣依序點各轉角；點回起點或快按兩下封閉，Backspace 退一點'); draw(); };
        const cancelTrace = () => { st.trace = null; hover = null; setTraceUI(); draw(); };
        const finishTrace = () => {
          const tr = st.trace; if (!tr) return;
          let pts = tr.pts.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 20);
          if (pts.length >= 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 20) pts.pop();
          if (pts.length < 3) { App.toast('至少要 3 個點'); return; }
          pts = simplify(pts);
          let area = 0, per = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; per += Math.hypot(q[0] - p[0], q[1] - p[1]); }
          area = Math.abs(area / 2);
          if (area < 5e5) { App.toast('圈選範圍太小'); return; }
          const k = k0();
          st.manual = { raw: pts.map(p => [p[0] / k, p[1] / k]) };   // 以原始單位保存，改比例時可重算
          st.trace = null; hover = null; setTraceUI();
          st.cands = st.cands.filter(c => !c.manual);
          st.cands.unshift({ pts, area, per, thin: area / (per * per), manual: true }); st.pick = 0;
          const t = X.thickness(pts, st.segs); if (t) back.querySelector('[name=t]').value = t;
          detect(); draw();
          App.toast(`已圈選：${pts.length} 面牆、${(area / 1e6).toFixed(2)} m²`);
        };
        const restoreManual = () => { if (!st.manual) return; const k = k0(); const pts = st.manual.raw.map(p => [p[0] * k, p[1] * k]); let area = 0, per = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; per += Math.hypot(q[0] - p[0], q[1] - p[1]); } area = Math.abs(area / 2); st.cands.unshift({ pts, area, per, thin: area / (per * per), manual: true }); st.pick = 0; };

        /* ---- 繪製 ---- */
        const draw = () => {
          if (!fit) calcFit();
          const k = k0(), sc = scale();
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
          ctx.lineWidth = 1;
          const vis = e => true;
          st.fr.ents.forEach(e => {
            const on = st.layers[e.l];
            ctx.strokeStyle = on ? '#333' : '#d5d0c8';
            if (e.k === 'L') { ctx.beginPath(); ctx.moveTo(tx(e.p[0] * k), ty(e.p[1] * k)); ctx.lineTo(tx(e.p[2] * k), ty(e.p[3] * k)); ctx.stroke(); }
            else if (e.k === 'C') { ctx.beginPath(); ctx.arc(tx(e.c[0] * k), ty(e.c[1] * k), e.r * k * sc, 0, Math.PI * 2); ctx.stroke(); }
            else if (e.k === 'A') { ctx.beginPath(); ctx.arc(tx(e.c[0] * k), ty(e.c[1] * k), e.r * k * sc, -e.a2 * Math.PI / 180, -e.a1 * Math.PI / 180); ctx.stroke(); }
          });
          st.cands.forEach((c, i) => {
            ctx.beginPath(); c.pts.forEach((p, j) => j ? ctx.lineTo(tx(p[0]), ty(p[1])) : ctx.moveTo(tx(p[0]), ty(p[1]))); ctx.closePath();
            ctx.fillStyle = i === st.pick ? 'rgba(31,95,214,0.28)' : 'rgba(155,125,71,0.10)'; ctx.fill();
            ctx.strokeStyle = i === st.pick ? '#1f5fd6' : '#9b7d47'; ctx.lineWidth = i === st.pick ? 2 : 1; ctx.stroke(); ctx.lineWidth = 1;
          });
          if (st.det) st.det.openings.forEach(o => {
            const p = st.det.pts[o.i], q = st.det.pts[(o.i + 1) % st.det.pts.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, d = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
            ctx.strokeStyle = o.type === 'door' ? '#d9480f' : '#1f9e89'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(tx(p[0] + d[0] * o.off), ty(p[1] + d[1] * o.off)); ctx.lineTo(tx(p[0] + d[0] * (o.off + o.w)), ty(p[1] + d[1] * (o.off + o.w))); ctx.stroke(); ctx.lineWidth = 1;
          });
          if (st.pickSeg) { const s = st.pickSeg; ctx.strokeStyle = '#e8710a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(tx(s[0] * k), ty(s[1] * k)); ctx.lineTo(tx(s[2] * k), ty(s[3] * k)); ctx.stroke(); ctx.lineWidth = 1; }
          // 圈選中的折線與游標
          if (st.trace) {
            const pts = st.trace.pts;
            ctx.strokeStyle = '#1f5fd6'; ctx.lineWidth = 2; ctx.beginPath();
            pts.forEach((p, j) => j ? ctx.lineTo(tx(p[0]), ty(p[1])) : ctx.moveTo(tx(p[0]), ty(p[1])));
            if (hover && pts.length) ctx.lineTo(tx(hover.p[0]), ty(hover.p[1]));
            ctx.stroke(); ctx.lineWidth = 1;
            pts.forEach((p, j) => { ctx.fillStyle = j === 0 ? '#1e9e2f' : '#1f5fd6'; ctx.beginPath(); ctx.arc(tx(p[0]), ty(p[1]), j === 0 ? 6 : 4, 0, Math.PI * 2); ctx.fill(); });
            if (hover) {
              ctx.strokeStyle = hover.snap === '端點' ? '#1e9e2f' : hover.snap === '線上' ? '#e8710a' : '#1f5fd6'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.arc(tx(hover.p[0]), ty(hover.p[1]), 7, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
              if (pts.length) { const lp = pts[pts.length - 1], len = Math.round(Math.hypot(hover.p[0] - lp[0], hover.p[1] - lp[1])); ctx.fillStyle = '#1f5fd6'; ctx.font = '12px sans-serif'; ctx.fillText(`${len} mm${hover.snap ? '　' + hover.snap : ''}`, tx(hover.p[0]) + 10, ty(hover.p[1]) - 8); }
            }
          }
          size.textContent = `${(fit.w / 1000).toFixed(2)} × ${(fit.h / 1000).toFixed(2)} m`;
          const c = st.cands[st.pick];
          stat.textContent = st.trace ? `圈選中：已點 ${st.trace.pts.length} 點` : st.cands.length ? `${c.manual ? '自行圈選' : '找到 ' + st.cands.length + ' 個封閉區域；目前選擇'}：${c.pts.length} 面牆、${(c.area / 1e6).toFixed(2)} m²（約 ${(c.area / 1e6 * 0.3025).toFixed(1)} 坪）` : '勾選的圖層找不到封閉區域：按「圈選空間」自己沿牆點轉角，或改用「轉成底圖描圖」';
        };
        const recompute = () => { fit = null; compute(st); restoreManual(); const c = st.cands[st.pick]; if (c) { const t = X.thickness(c.pts, st.segs); if (t) back.querySelector('[name=t]').value = t; } detect(); draw(); };

        /* ---- 事件 ---- */
        back.querySelector('[name=t]').addEventListener('change', () => { detect(); draw(); });
        back.querySelector('[name=unit]').addEventListener('change', e => { if (isPdf) st.scaleDen = Math.max(0.01, +e.target.value || 100); else if (e.target.value === 'custom') { /* 保留自訂倍率 */ } else { st.customK = null; st.unit = +e.target.value; } recompute(); });
        back.querySelectorAll('[data-layer]').forEach(cb => cb.addEventListener('change', () => { st.layers[cb.dataset.layer] = cb.checked; recompute(); }));
        $b('dxfZoomIn').addEventListener('click', () => zoomAt(W / 2, H / 2, 1.5));
        $b('dxfZoomOut').addEventListener('click', () => zoomAt(W / 2, H / 2, 1 / 1.5));
        $b('dxfZoomFit').addEventListener('click', () => { vw.zoom = 1; vw.panX = vw.panY = 0; draw(); });
        cv.addEventListener('wheel', e => { e.preventDefault(); const [px, py] = cvPos(e); zoomAt(px, py, e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
        let drag = null;
        cv.addEventListener('pointerdown', e => { if (e.button !== 0) return; const [px, py] = cvPos(e); drag = { px, py, panX: vw.panX, panY: vw.panY, moved: false }; try { cv.setPointerCapture(e.pointerId); } catch (x) { } });
        cv.addEventListener('pointermove', e => {
          const [px, py] = cvPos(e);
          if (drag) {
            if (!drag.moved && Math.hypot(px - drag.px, py - drag.py) > 4) drag.moved = true;
            if (drag.moved) { vw.panX = drag.panX + (px - drag.px); vw.panY = drag.panY + (py - drag.py); draw(); return; }
          }
          if (st.trace) { const [wx, wy] = inv(px, py); hover = snapPoint(wx, wy); draw(); }
        });
        cv.addEventListener('pointerup', e => {
          if (!drag) return; const moved = drag.moved; drag = null;
          if (moved) return;
          const [px, py] = cvPos(e), [wx, wy] = inv(px, py);
          if (st.trace) {   // 圈選：加點；點回起點即封閉
            const sp = snapPoint(wx, wy), pts = st.trace.pts;
            if (pts.length >= 3 && Math.hypot(tx(pts[0][0]) - px, ty(pts[0][1]) - py) < 10) { finishTrace(); return; }
            pts.push(sp.p); setTraceUI(); draw(); return;
          }
          if (st.pickMode) {   // 找最近的線段（原始單位；畫布上 10px 內）
            const k = k0(); let best = null;
            st.fr.ents.forEach(e2 => {
              if (e2.k !== 'L') return;
              const ax = e2.p[0] * k, ay = e2.p[1] * k, bx = e2.p[2] * k, by = e2.p[3] * k, L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
              const t = Math.max(0, Math.min(1, ((wx - ax) * (bx - ax) + (wy - ay) * (by - ay)) / L2));
              const d = Math.hypot(wx - (ax + (bx - ax) * t), wy - (ay + (by - ay) * t)) * scale();
              if (d < 10 && (!best || d < best.d)) best = { d, e: e2 };
            });
            if (!best) { App.toast('請點在線段上'); return; }
            st.pickSeg = best.e.p;
            const len = Math.hypot(best.e.p[2] - best.e.p[0], best.e.p[3] - best.e.p[1]);
            $b('dxfPickRow').style.display = 'flex';
            $b('dxfPickInfo').textContent = `已選線段（目前比例 ${Math.round(len * k0())} mm）實際長度：`;
            const inp = $b('dxfPickLen'); inp.value = Math.round(len * k0()); inp.focus(); inp.select();
            draw(); return;
          }
          const hits = st.cands.map((c, i) => ({ i, c })).filter(o => pip(wx, wy, o.c.pts)).sort((a, b) => a.c.area - b.c.area);
          if (hits.length) { st.pick = hits[0].i; const t = X.thickness(st.cands[st.pick].pts, st.segs); if (t) back.querySelector('[name=t]').value = t; detect(); draw(); }
        });
        cv.addEventListener('dblclick', e => { if (st.trace) finishTrace(); });
        cv.addEventListener('pointerleave', () => { if (st.trace) { hover = null; draw(); } });
        $b('dxfTrace').addEventListener('click', () => { if (st.trace) finishTrace(); else startTrace(); });
        $b('dxfTraceUndo').addEventListener('click', () => { if (st.trace) { st.trace.pts.pop(); setTraceUI(); draw(); } });
        $b('dxfTraceCancel').addEventListener('click', cancelTrace);
        const keyH = e => { if (!back.isConnected) { document.removeEventListener('keydown', keyH, true); return; } if (st.trace && e.key === 'Backspace' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); e.stopPropagation(); st.trace.pts.pop(); setTraceUI(); draw(); } };
        document.addEventListener('keydown', keyH, true);
        const pickBtn = $b('dxfPick');
        pickBtn.addEventListener('click', () => { if (st.trace) cancelTrace(); st.pickMode = !st.pickMode; pickBtn.classList.toggle('primary', st.pickMode); setTraceUI(); App.toast(st.pickMode ? '在預覽中點一條已知長度的線段（例如一道牆）' : '已取消選線'); });
        const applyPick = () => {
          const real = +$b('dxfPickLen').value; if (!(real > 0) || !st.pickSeg) return;
          const raw = Math.hypot(st.pickSeg[2] - st.pickSeg[0], st.pickSeg[3] - st.pickSeg[1]); if (!(raw > 0)) return;
          const kNew = real / raw;
          if (isPdf) { st.scaleDen = Math.round(kNew * 100) / 100; back.querySelector('[name=unit]').value = st.scaleDen; }
          else { st.customK = kNew; const sel = back.querySelector('[name=unit]'); if (![...sel.options].some(o => o.value === 'custom')) sel.add(new Option('自訂（依線段）', 'custom')); sel.value = 'custom'; }
          st.pickMode = false; pickBtn.classList.remove('primary'); setTraceUI();
          $b('dxfPickRow').style.display = 'none'; st.pickSeg = null;
          recompute(); App.toast('比例已依線段設定');
        };
        $b('dxfPickApply').addEventListener('click', applyPick);
        $b('dxfPickLen').addEventListener('apply', applyPick);
        st.finishTrace = finishTrace;
        setTraceUI();
        recompute();
      }
    });
    if (!res) return;
    const k = k0(), bb = st.fr.bbox;
    const cx = (bb.x0 + bb.x1) / 2 * k, cy = (bb.y0 + bb.y1) / 2 * k;   // 圖中心移到原點；CAD y 向上 → 3D z 向下
    const toApp = ([x, y]) => [Math.round(x - cx), Math.round(cy - y)];
    if (res.button === 'room') {
      const c = st.cands[st.pick];
      if (!c) { App.toast('沒有可用的封閉區域，請改用「轉成底圖描圖」'); return; }
      const h = Math.max(1800, Math.min(6000, +res.data.h || 2800)), t = Math.max(50, Math.min(400, +res.data.t || 120));
      const useOp = res.data.op && st.det && st.det.openings.length;
      const pts = useOp ? st.det.pts : c.pts;
      const room = M().createRoom(pts.map(toApp), h, t);
      let nd = 0, nw = 0;
      if (useOp) st.det.openings.forEach(o => {
        const p = pts[o.i], q = pts[(o.i + 1) % pts.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const op = o.type === 'door' ? { id: M().uid('o'), type: 'door', width: o.w, height: Math.min(2100, h - 100), sill: 0 } : { id: M().uid('o'), type: 'window', width: o.w, height: 1200, sill: 900 };
        op.width = Math.max(300, Math.min(op.width, Math.round(L - 20)));
        op.offset = Math.max(10, Math.min(o.off, Math.round(L - op.width - 10)));
        room.walls[o.i].openings.push(op);
        if (op.type === 'door') nd++; else nw++;
      });
      App.setRoom(room);
      App.toast(`已由${isPdf ? ' PDF ' : ' DXF '}建立空間：${pts.length} 面牆、${(c.area / 1e6).toFixed(2)} m²${useOp ? `，門 ${nd}、窗 ${nw}` : ''}`);
      return;
    }
    // PDF：底圖直接用頁面影像（比例 = 紙面 mm × 比例分母）；影像延後到此時才渲染
    const vecOf = (toPx) => { const out = []; st.fr.ents.forEach(e => { if (e.k !== 'L' || !st.layers[e.l]) return; const a = toPx(e.p[0], e.p[1]), b = toPx(e.p[2], e.p[3]); if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) return; out.push([+a[0].toFixed(1), +a[1].toFixed(1), +b[0].toFixed(1), +b[1].toFixed(1)]); }); return out.slice(0, 25000); };
    if (!st.image && st.renderImage) {
      App.busy(true, '渲染 PDF 頁面…');
      try { const im = await st.renderImage(); st.image = Object.assign({ paperW: st.paperW, paperH: st.paperH }, im); } catch (e) { App.toast('頁面影像渲染失敗（' + (e.message || e) + '），改以線條繪製底圖'); st.image = null; }
      App.busy(false);
    }
    if (st.image) {
      const im = st.image, mmPerPx = im.paperW / im.w * k, pxPerMm = im.w / im.paperW;
      const vec = vecOf((x, y) => [(x - im.paperW / 2) * pxPerMm, (im.paperH / 2 - y) * pxPerMm]);
      App.mutate('匯入 PDF 底圖', s => { s.underlay = { src: im.src, w: im.w, h: im.h, scale: mmPerPx, x: Math.round((im.paperW / 2 - cx / k) * k), z: Math.round((cy / k - im.paperH / 2) * k), rot: 0, opacity: 0.75, visible: true, name: fname, vec }; }, 'underlay');
      V().setView('top');
      App.toast('PDF 已轉成底圖（比例 1:' + k + '），按 L 沿牆線描出空間；比例不對可在底圖區重新量測');
      return;
    }
    // 轉成底圖：把勾選圖層的圖線畫成影像，比例已知
    const w = (bb.x1 - bb.x0) * k, h = (bb.y1 - bb.y0) * k;
    const MAX = 2200, sc = Math.min(MAX / w, MAX / h);
    const cv = document.createElement('canvas'); cv.width = Math.max(2, Math.round(w * sc)); cv.height = Math.max(2, Math.round(h * sc));
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = '#222'; ctx.lineWidth = Math.max(1, 1.2 * sc * 10);
    const tx = x => (x * k - bb.x0 * k) * sc, ty = y => cv.height - (y * k - bb.y0 * k) * sc;
    st.fr.ents.forEach(e => {
      if (!st.layers[e.l]) return;
      if (e.k === 'L') { ctx.beginPath(); ctx.moveTo(tx(e.p[0]), ty(e.p[1])); ctx.lineTo(tx(e.p[2]), ty(e.p[3])); ctx.stroke(); }
      else if (e.k === 'C') { ctx.beginPath(); ctx.arc(tx(e.c[0]), ty(e.c[1]), e.r * k * sc, 0, Math.PI * 2); ctx.stroke(); }
      else if (e.k === 'A') { ctx.beginPath(); ctx.arc(tx(e.c[0]), ty(e.c[1]), e.r * k * sc, -e.a2 * Math.PI / 180, -e.a1 * Math.PI / 180); ctx.stroke(); }
    });
    const src = cv.toDataURL('image/jpeg', 0.85);
    const vec = vecOf((x, y) => [tx(x) - cv.width / 2, ty(y) - cv.height / 2]);
    App.mutate('匯入 DXF 底圖', s => { s.underlay = { src, w: cv.width, h: cv.height, scale: 1 / sc, x: 0, z: 0, rot: 0, opacity: 0.8, visible: true, name: fname, vec }; }, 'underlay');
    V().setView('top');
    App.toast('DXF 已轉成底圖（比例正確），按 L 沿牆線描出空間');
  };

  window.DxfIn = X;
})();
