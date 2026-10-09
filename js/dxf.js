/* ============================================================================
   立面／平面施工圖 DXF 匯出
   - 輸出 AutoCAD R12（AC1009）ASCII DXF，模型空間 1:1、單位 mm
   - 幾何邏輯對應 drawings.js 的 cabFront / elevation / plan，但畫的是真向量圖元
   - 圖層／線型／字型名稱一律 ASCII；中文內容以 \U+XXXX 轉義，
     整個檔案是純 7-bit ASCII，不受 $DWGCODEPAGE 影響（AutoCAD 會還原成中文）
   - 尺寸標註是「打散的線＋文字」（放在 A-DIM 圖層），不是 DIMENSION 實體：
     換取在所有 CAD／看圖軟體都畫得出來；要關聯式標註請整層刪掉重標
   ========================================================================== */
(function () {
  const M = () => window.Model;
  const D = window.DATA;
  const Dx = {};
  Dx.VERSION = '1.0.0';

  /* ---------- 圖層表：[名稱, AutoCAD 色號, 線型] ---------- */
  const LAYERS = [
    ['0', 7, 'CONTINUOUS'],
    ['A-WALL', 8, 'CONTINUOUS'],        // 牆體輪廓
    ['A-WALL-HATCH', 9, 'CONTINUOUS'],  // 牆體剖面填充線
    ['A-FLOOR', 7, 'CONTINUOUS'],       // 地坪線／天花線
    ['A-OPEN', 4, 'CONTINUOUS'],        // 門窗
    ['A-OPEN-SYM', 9, 'DASHED'],        // 門開啟方向
    ['F-CAB', 7, 'CONTINUOUS'],         // 櫃體外輪廓
    ['F-CAB-BODY', 8, 'CONTINUOUS'],    // 櫃身板件（側板／頂底板）
    ['F-CAB-SHELF', 2, 'CONTINUOUS'],   // 層板
    ['F-CAB-HIDE', 9, 'HIDDEN'],        // 隱藏線（門片後方的層板）
    ['F-CAB-DOOR', 3, 'CONTINUOUS'],    // 門片／抽屜面板
    ['F-CAB-SWING', 9, 'DASHED'],       // 門開啟方向
    ['F-CAB-HDL', 1, 'CONTINUOUS'],     // 把手
    ['F-CAB-TOP', 6, 'CONTINUOUS'],     // 檯面
    ['F-CAB-KICK', 8, 'CONTINUOUS'],    // 踢腳板
    ['F-CAB-HANG', 5, 'DASHED'],        // 吊櫃（平面圖以虛線表示）
    ['F-APPL', 5, 'CONTINUOUS'],        // 廚房設備
    ['F-DESK', 6, 'CONTINUOUS'],        // 桌板
    ['A-DIM', 1, 'CONTINUOUS'],         // 尺寸標註
    ['A-TEXT', 7, 'CONTINUOUS'],        // 文字與型號標籤
    ['A-SYMB', 1, 'CONTINUOUS'],        // 立面索引符號
    ['A-TITLE', 7, 'CONTINUOUS'],       // 圖框與標題欄
    ['DEFPOINTS', 7, 'CONTINUOUS']      // 不列印輔助線
  ];
  // 線型：虛線長度以「紙面 mm」定義，再用 $LTSCALE = 出圖比例分母放大
  const LTYPES = [
    ['CONTINUOUS', 'Solid line', []],
    ['DASHED', 'Dashed __ __ __ __ __', [4, -2]],
    ['HIDDEN', 'Hidden _ _ _ _ _ _', [2, -1.2]],
    ['CENTER', 'Center ____ _ ____ _ __', [10, -2, 2, -2]]
  ];

  /* ---------- 紙張（mm，橫式） ---------- */
  const PAPER = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] };

  const num = v => { const r = Math.round(v * 1e4) / 1e4; return r === 0 ? 0 : r; };
  const r1 = v => Math.round(v);

  /* ======================================================================
     DXF 寫出器
     ====================================================================== */
  function Doc(opt) {
    const o = Object.assign({ scale: 30, font: 'kaiu.ttf', bigfont: '', wf: 0.85, ascii: true }, opt || {});
    const out = [];
    const ext = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    // 公司圖框帶進來的圖層／線型／字型（名稱和內建的撞名時以內建的為準）
    const own = { lay: new Set(LAYERS.map(l => l[0])), lt: new Set(LTYPES.map(l => l[0])), st: new Set(['STANDARD', 'ARIES']) };
    const extra = { lay: new Map(), lt: new Map(), st: new Map() };
    const g = (code, val) => { out.push(String(code), String(val)); };
    const grow = (x, y) => {
      if (x < ext.x0) ext.x0 = x; if (y < ext.y0) ext.y0 = y;
      if (x > ext.x1) ext.x1 = x; if (y > ext.y1) ext.y1 = y;
    };
    // 非 ASCII → \U+XXXX（AutoCAD 的 Unicode 轉義），並清掉會弄壞 DXF 的控制字元
    const esc = s => {
      let t = String(s == null ? '' : s).replace(/[\r\n\t]/g, ' ');
      if (o.ascii) t = t.replace(/[^\x20-\x7E]/g, ch => '\\U+' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
      return t;
    };

    const doc = {
      o,
      p: v => v * o.scale,           // 紙面 mm → 模型 mm
      ext,
      count: 0
    };

    doc.line = function (x1, y1, x2, y2, layer, lt) {
      if (Math.abs(x1 - x2) < 1e-7 && Math.abs(y1 - y2) < 1e-7) return;
      g(0, 'LINE'); g(8, layer || '0'); if (lt) g(6, lt);
      g(10, num(x1)); g(20, num(y1)); g(30, 0);
      g(11, num(x2)); g(21, num(y2)); g(31, 0);
      grow(x1, y1); grow(x2, y2); doc.count++;
    };
    doc.pline = function (pts, layer, closed, lt) {
      if (!pts || pts.length < 2) return;
      g(0, 'POLYLINE'); g(8, layer || '0'); if (lt) g(6, lt);
      g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, closed ? 1 : 0);
      pts.forEach(([x, y]) => {
        g(0, 'VERTEX'); g(8, layer || '0');
        g(10, num(x)); g(20, num(y)); g(30, 0); g(70, 0);
        grow(x, y);
      });
      g(0, 'SEQEND'); g(8, layer || '0'); doc.count++;
    };
    doc.rect = function (x, y, w, h, layer, lt) {
      doc.pline([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], layer, true, lt);
    };
    doc.circle = function (x, y, r, layer, lt) {
      if (r <= 0) return;
      g(0, 'CIRCLE'); g(8, layer || '0'); if (lt) g(6, lt);
      g(10, num(x)); g(20, num(y)); g(30, 0); g(40, num(r));
      grow(x - r, y - r); grow(x + r, y + r); doc.count++;
    };
    // a1/a2 = 起訖角度（度，逆時針）
    doc.arc = function (x, y, r, a1, a2, layer, lt) {
      if (r <= 0) return;
      g(0, 'ARC'); g(8, layer || '0'); if (lt) g(6, lt);
      g(10, num(x)); g(20, num(y)); g(30, 0); g(40, num(r));
      g(50, num(a1)); g(51, num(a2));
      grow(x - r, y - r); grow(x + r, y + r); doc.count++;
    };
    // 塗實（3 或 4 點；4 點依 p1,p2,p3,p4 的環繞順序傳入即可）
    doc.solid = function (pts, layer) {
      const q = pts.length === 3 ? [pts[0], pts[1], pts[2], pts[2]] : [pts[0], pts[1], pts[3], pts[2]];
      g(0, 'SOLID'); g(8, layer || '0');
      q.forEach((pt, i) => { g(10 + i, num(pt[0])); g(20 + i, num(pt[1])); g(30 + i, 0); grow(pt[0], pt[1]); });
      doc.count++;
    };
    /* 登記外來（公司圖框）的圖層／線型／字型；和內建的撞名時以內建的為準。
       表格裡的「名稱」不能用 \U+ 轉義（AutoCAD 不會還原），所以含非 ASCII 的
       名稱一律改成 FRAME-n / FSTYLE-n，並記錄下來讓介面可以告知使用者。 */
    const renamed = [];
    const asciiName = (name, prefix, seq) =>
      /^[\x20-\x7E]+$/.test(name) ? name : (() => {
        const safe = prefix + '-' + seq;
        renamed.push({ from: name, to: safe });
        return safe;
      })();
    doc.useLayer = function (name, color, lt) {
      if (!name) return '0';
      if (own.lay.has(name)) return name;
      if (extra.lay.has(name)) return extra.lay.get(name)[0];
      const safe = asciiName(name, 'FRAME', extra.lay.size + 1);
      extra.lay.set(name, [safe, Math.abs(color) || 7, own.lt.has(lt) || extra.lt.has(lt) ? lt : 'CONTINUOUS']);
      return safe;
    };
    doc.useStyle = function (name, font, big, wf) {
      if (!name) return 'ARIES';
      if (own.st.has(name)) return name;
      if (extra.st.has(name)) return extra.st.get(name)[0];
      const safe = asciiName(name, 'FSTYLE', extra.st.size + 1);
      extra.st.set(name, [safe, font || 'txt', big || '', wf || 1]);
      return safe;
    };
    doc.hasLtype = n => own.lt.has(n) || extra.lt.has(n);
    doc.renamed = renamed;

    /* 文字：h = 字高（模型 mm）
       op = { layer, align:'l|c|r', valign:'base|b|mid|t', rot, wf, style } */
    doc.text = function (x, y, h, str, op) {
      const s = String(str == null ? '' : str);
      if (!s) return;
      op = op || {};
      const hj = { l: 0, c: 1, r: 2 }[op.align || 'l'];
      const vj = { base: 0, b: 1, mid: 2, t: 3 }[op.valign || 'base'];
      g(0, 'TEXT'); g(8, op.layer || 'A-TEXT');
      g(10, num(x)); g(20, num(y)); g(30, 0);
      g(40, num(h)); g(1, esc(s));
      g(50, num(op.rot || 0));
      g(41, op.wf || o.wf);
      g(7, op.style || 'ARIES');
      g(72, hj); g(73, vj);
      g(11, num(x)); g(21, num(y)); g(31, 0);
      // 粗估文字佔位，讓圖面範圍不會切掉字
      const wEst = s.length * h * (op.wf || o.wf);
      grow(x - wEst, y - h); grow(x + wEst, y + h);
      doc.count++;
    };

    /* 45° 剖面填充線（R12 沒有 HATCH，手工畫線並裁在多邊形內）
       poly = [[x,y],…]（閉合，可凹）；spacing 為模型 mm */
    doc.hatch45 = function (poly, spacing, layer) {
      if (!poly || poly.length < 3 || spacing <= 0) return;
      const k = Math.SQRT1_2;
      const rot = ([x, y]) => [(x + y) * k, (y - x) * k];     // 轉 -45°
      const inv = ([u, v]) => [(u - v) * k, (u + v) * k];
      const P = poly.map(rot);
      let v0 = Infinity, v1 = -Infinity;
      P.forEach(([, v]) => { if (v < v0) v0 = v; if (v > v1) v1 = v; });
      const start = Math.ceil(v0 / spacing) * spacing;
      for (let v = start; v < v1; v += spacing) {
        const hits = [];
        for (let i = 0; i < P.length; i++) {
          const a = P[i], b = P[(i + 1) % P.length];
          if ((a[1] - v) * (b[1] - v) >= 0) continue;          // 不跨越此掃描線
          hits.push(a[0] + (b[0] - a[0]) * (v - a[1]) / (b[1] - a[1]));
        }
        hits.sort((m, n2) => m - n2);
        for (let i = 0; i + 1 < hits.length; i += 2) {
          if (hits[i + 1] - hits[i] < 1) continue;
          const A = inv([hits[i], v]), B = inv([hits[i + 1], v]);
          doc.line(A[0], A[1], B[0], B[1], layer || 'A-WALL-HATCH');
        }
      }
    };

    /* ---------- 組檔 ---------- */
    doc.toString = function () {
      const h = [];
      const hv = (name, pairs) => { h.push('9', name); pairs.forEach(([c, v]) => h.push(String(c), String(v))); };
      const e = isFinite(ext.x0) ? ext : { x0: 0, y0: 0, x1: 100, y1: 100 };
      const pad = o.scale * 10;
      h.push('0', 'SECTION', '2', 'HEADER');
      hv('$ACADVER', [[1, 'AC1009']]);
      hv('$INSBASE', [[10, 0], [20, 0], [30, 0]]);
      hv('$EXTMIN', [[10, num(e.x0)], [20, num(e.y0)], [30, 0]]);
      hv('$EXTMAX', [[10, num(e.x1)], [20, num(e.y1)], [30, 0]]);
      hv('$LIMMIN', [[10, num(e.x0 - pad)], [20, num(e.y0 - pad)]]);
      hv('$LIMMAX', [[10, num(e.x1 + pad)], [20, num(e.y1 + pad)]]);
      hv('$MEASUREMENT', [[70, 1]]);                 // 公制
      hv('$INSUNITS', [[70, 4]]);                    // 公釐
      hv('$LTSCALE', [[40, num(o.scale)]]);
      hv('$CELTSCALE', [[40, 1]]);
      hv('$DIMSCALE', [[40, num(o.scale)]]);
      hv('$TEXTSTYLE', [[7, 'ARIES']]);
      hv('$TEXTSIZE', [[40, num(o.scale * 2.5)]]);
      hv('$CLAYER', [[8, '0']]);
      hv('$PDMODE', [[70, 0]]);
      hv('$PDSIZE', [[40, 0]]);
      h.push('0', 'ENDSEC');

      // ---- TABLES
      h.push('0', 'SECTION', '2', 'TABLES');
      h.push('0', 'TABLE', '2', 'LTYPE', '70', String(LTYPES.length));
      LTYPES.forEach(([nm, desc, dash]) => {
        h.push('0', 'LTYPE', '2', nm, '70', '0', '3', desc, '72', '65', '73', String(dash.length));
        h.push('40', String(num(dash.reduce((a, b) => a + Math.abs(b), 0))));
        dash.forEach(v => h.push('49', String(num(v))));
      });
      h.push('0', 'ENDTAB');
      const allLay = LAYERS.concat([...extra.lay.values()]);
      h.push('0', 'TABLE', '2', 'LAYER', '70', String(allLay.length));
      allLay.forEach(([nm, col, lt]) => {
        h.push('0', 'LAYER', '2', nm, '70', '0', '62', String(col), '6', lt);
      });
      h.push('0', 'ENDTAB');
      const allSt = [['STANDARD', 'txt', '', o.wf], ['ARIES', o.font, o.bigfont, o.wf]]
        .concat([...extra.st.values()]);
      h.push('0', 'TABLE', '2', 'STYLE', '70', String(allSt.length));
      allSt.forEach(([nm, font, big, wf]) => {
        h.push('0', 'STYLE', '2', nm, '70', '0', '40', '0', '41', String(num(wf || o.wf)),
          '50', '0', '71', '0', '42', String(num(o.scale * 2.5)), '3', font, '4', big);
      });
      h.push('0', 'ENDTAB');
      h.push('0', 'ENDSEC');

      // ---- ENTITIES
      h.push('0', 'SECTION', '2', 'ENTITIES');
      return h.concat(out, ['0', 'ENDSEC', '0', 'EOF']).join('\r\n') + '\r\n';
    };
    return doc;
  }
  Dx.Doc = Doc;

  /* ======================================================================
     尺寸標註（打散的圖元）
     x1,y1→x2,y2 必須是水平或垂直；off = 標註線偏移量（紙面 mm，帶正負號）
     ====================================================================== */
  function dim(doc, x1, y1, x2, y2, off, text, op) {
    op = op || {};
    const p = doc.p, L = 'A-DIM';
    const th = p(op.h || 2.5), tk = p(2.2), gp = p(1.2), ex = p(2.0), td = p(1.0);
    const vert = Math.abs(x2 - x1) < Math.abs(y2 - y1);
    const O = p(off), sgn = O >= 0 ? 1 : -1;
    const txt = text == null ? '' : String(text);
    const need = txt.length * th * doc.o.wf * 1.15;         // 文字大約要多寬
    if (!vert) {
      if (x2 < x1) { const t = x1; x1 = x2; x2 = t; }
      const dy = y1 + O;
      doc.line(x1, y1 + sgn * gp, x1, dy + sgn * ex, L);
      doc.line(x2, y1 + sgn * gp, x2, dy + sgn * ex, L);
      doc.line(x1, dy, x2, dy, L);
      [x1, x2].forEach(x => doc.line(x - tk / 2, dy - tk / 2, x + tk / 2, dy + tk / 2, L));
      if (x2 - x1 >= need) {
        doc.text((x1 + x2) / 2, dy + td, th, txt, { layer: L, align: 'c', valign: 'b' });
      } else {                                              // 空間不夠 → 文字拉到外側
        doc.line(x2, dy, x2 + p(3), dy, L);
        doc.text(x2 + p(3.6), dy + td, th, txt, { layer: L, align: 'l', valign: 'b' });
      }
    } else {
      if (y2 < y1) { const t = y1; y1 = y2; y2 = t; }
      const dx = x1 + O;
      doc.line(x1 + sgn * gp, y1, dx + sgn * ex, y1, L);
      doc.line(x1 + sgn * gp, y2, dx + sgn * ex, y2, L);
      doc.line(dx, y1, dx, y2, L);
      [y1, y2].forEach(y => doc.line(dx - tk / 2, y - tk / 2, dx + tk / 2, y + tk / 2, L));
      if (y2 - y1 >= need) {
        doc.text(dx - td, (y1 + y2) / 2, th, txt, { layer: L, align: 'c', valign: 'b', rot: 90 });
      } else {
        doc.line(dx, y2, dx, y2 + p(3), L);
        doc.text(dx - td, y2 + p(3.6), th, txt, { layer: L, align: 'l', valign: 'b', rot: 90 });
      }
    }
  }
  Dx.dim = dim;

  // 由「起點 + 各段長度」畫一整列連續標註
  function dimChain(doc, segs, base, fixed, off, horiz, h) {
    segs.forEach(([a, b, t]) => {
      if (b - a < 1) return;
      if (horiz) dim(doc, base + a, fixed, base + b, fixed, off, t == null ? r1(b - a) : t, { h });
      else dim(doc, fixed, base + a, fixed, base + b, off, t == null ? r1(b - a) : t, { h });
    });
  }

  /* ======================================================================
     把手正視符號（對應 Drawings.handleMark）
     x,y = 門片左下角；w,h = 門片寬高（模型 mm）；hinge = 'L'|'R'|null(抽屜)
     ====================================================================== */
  function handleMark(doc, cab, x, y, w, h, hinge) {
    const L = 'F-CAB-HDL';
    const hd = M().handleOf(cab);
    if (hd.type === 'j' || hd.type === 'bev') {
      const e = M().handleEdge(hd.pos, hinge), th = hd.type === 'j' ? 22 : 14;
      if (e === 'top') doc.rect(x, y + h - th, w, th, L);
      else if (e === 'bottom') doc.rect(x, y, w, th, L);
      else if (e === 'left') doc.rect(x, y, th, h, L);
      else doc.rect(x + w - th, y, th, h, L);
      return;
    }
    if (hd.type === 'inset') {
      const [lx, ly] = M().insetPos(hd.pos, hinge, w, h);
      doc.rect(x + w / 2 + lx - 55, y + h / 2 + ly - 18, 110, 36, L);
      return;
    }
    const style = hd.type === 'style' ? hd.style : hd.type;
    if (!hinge) {                                            // 抽屜：橫把手
      const yy = y + h - Math.min(h / 2, 50);
      if (style === 'knob') doc.circle(x + w / 2, yy, 14, L);
      else if (style === 'bar' || style === 'slot') doc.line(x + w / 2 - 80, yy, x + w / 2 + 80, yy, L);
      else doc.line(x, y + h - 8, x + w, y + h - 8, L);
      return;
    }
    const hx = hinge === 'L' ? x + w - 40 : x + 40;           // 把手在非鉸鏈側
    const cy = y + h / 2;
    if (style === 'knob') doc.circle(hx, cy, 14, L);
    else if (style === 'bar' || style === 'slot') doc.line(hx, cy - 80, hx, cy + 80, L);
    else if (style === 'alu') doc.rect(hinge === 'L' ? x + w - 20 : x, y, 20, h, L);
    else doc.line(x, y + h - 8, x + w, y + h - 8, L);
  }

  /* ======================================================================
     廚房設備正視
     ====================================================================== */
  function applFront(doc, cab, X, Y) {
    const L = 'F-APPL', it = D.byCode[cab.code] || {};
    const W = cab.w, yb = Y + cab.y, yt = yb + cab.h;
    if (cab.at === 'sink') {                                 // 水槽：檯面下的槽體 + 龍頭
      doc.rect(X + 25, yb, W - 50, cab.h, L, 'DASHED');
      doc.rect(X, yt - 2, W, 4, L);
      doc.line(X + W / 2, yt, X + W / 2, yt + 300, L);
      doc.line(X + W / 2, yt + 300, X + W / 2 + 40, yt + 300, L);
      return;
    }
    if (cab.at === 'hob') {                                  // 爐具：開孔 + 爐頭
      const cut = it.cut || [cab.w - 60];
      doc.rect(X + (W - cut[0]) / 2, yb, cut[0], cab.h - 8, L, 'DASHED');
      doc.rect(X, yt - 8, W, 8, L);
      [0.25, 0.75].forEach(k => doc.rect(X + W * k - 70, yt, 140, 20, L));
      return;
    }
    doc.rect(X, yb, W, cab.h, L);
    if (cab.at === 'dw') { doc.rect(X, yt - 90, W, 90, L); doc.line(X + W / 2 - 150, yt - 130, X + W / 2 + 150, yt - 130, L); }
    else if (cab.at === 'oven') {
      doc.rect(X, yt - 90, W, 90, L);
      doc.rect(X + 60, yb + 40, W - 120, cab.h - 200, L);
      doc.line(X + 70, yt - 120, X + W - 70, yt - 120, L);
    } else if (cab.at === 'dryer') doc.line(X + 10, yb + cab.h * 0.48, X + W - 10, yb + cab.h * 0.48, L);
    else if (cab.at === 'hood') {
      doc.rect(X, yb, W, 40, L);
      if (it.style !== 'near') doc.rect(X + W / 2 - 90, yt, 180, 200, L);
    }
    doc.text(X + W / 2, yb + cab.h / 2, doc.p(2.2), cab.code, { align: 'c', valign: 'mid' });
  }

  /* ======================================================================
     單一櫃體正視（X = 左緣，Y = 地坪高度 0 基準）
     ====================================================================== */
  function cabFront(doc, cab, X, Y, opt) {
    opt = opt || {};
    const b = D.BOARD;
    const W = cab.w, yb = Y + cab.y, H = cab.h, yt = yb + H;

    if (cab.kind === 'desk') { doc.rect(X, yb, W, cab.thick, 'F-DESK'); return; }
    if (cab.kind === 'appl') { applFront(doc, cab, X, Y); return; }
    if (cab.kind === 'filler') { doc.rect(X, yb, W, H, 'F-CAB'); return; }   // 補板

    if (cab.kind === 'tri') {                                // 轉角封板：只畫輪廓與層板
      doc.rect(X, yb, W, H, 'F-CAB');
      doc.line(X, yb + b, X + W, yb + b, 'F-CAB-BODY');
      doc.line(X, yt - b, X + W, yt - b, 'F-CAB-BODY');
      (cab.shelves || []).forEach(sh => doc.line(X, yb + sh.y + 9, X + W, yb + sh.y + 9, 'F-CAB-SHELF'));
      return;
    }

    // 踢腳板
    if (cab.kick && !cab.hanging && cab.y > 50) {
      doc.rect(X + 2, Y, W - 4, Math.min(cab.y, D.KICK), 'F-CAB-KICK');
    }
    // 檯面
    if (cab.top && cab.top !== 'none') {
      const th = D.PARTS.TOP[cab.top].thick;
      doc.rect(X, yt, W, th, 'F-CAB-TOP');
    }
    // 櫃身外框
    doc.rect(X, yb, W, H, 'F-CAB');

    let fx = X, fw = W;
    if (cab.kind === 'corner') {                             // 轉角櫃：左側為側板外露面
      doc.rect(X, yb, cab.d, H, 'F-CAB-BODY');
      fx = X + cab.d; fw = W - cab.d;
    } else {
      doc.line(X + b, yb, X + b, yt, 'F-CAB-BODY');          // 左側板
      doc.line(X + W - b, yb, X + W - b, yt, 'F-CAB-BODY');  // 右側板
    }
    doc.line(X, yb + b, X + W, yb + b, 'F-CAB-BODY');        // 底板
    doc.line(X, yt - b, X + W, yt - b, 'F-CAB-BODY');        // 頂板

    const rows = M().rowsWithFiller(cab);
    // 該高度是否被門片遮住
    const covered = yy => {
      let top = cab.h;
      for (const r of rows) { const lo = top - r.h * 10; if (yy >= lo && yy <= top) return !window.Model.OPEN_ROW(r.t); top = lo; }
      return false;
    };
    // 層板
    (cab.shelves || []).forEach(sh => {
      const yy = sh.y + b / 2;
      const hid = opt.hidden !== false && covered(yy);
      doc.line(fx + b, yb + yy, fx + fw - b, yb + yy, hid ? 'F-CAB-HIDE' : 'F-CAB-SHELF', hid ? 'HIDDEN' : null);
    });

    // 門片／抽屜（由上往下依 rows 排）
    let top = yt;
    const gap = 2;
    const leaf = (lx, lw, ly, lh, hinge, glass) => {
      const x0 = lx + gap, y0 = ly + gap, w0 = lw - 2 * gap, h0 = lh - 2 * gap;
      doc.rect(x0, y0, w0, h0, 'F-CAB-DOOR');
      if (glass) {                                           // 玻璃斜線
        doc.line(x0 + w0 * 0.18, y0 + h0 * 0.62, x0 + w0 * 0.44, y0 + h0 * 0.86, 'F-CAB-DOOR');
        doc.line(x0 + w0 * 0.30, y0 + h0 * 0.38, x0 + w0 * 0.62, y0 + h0 * 0.68, 'F-CAB-DOOR');
      }
      if (opt.swing !== false) {                             // 開啟方向：V 形，尖端在鉸鏈側
        const hx = hinge === 'L' ? x0 : x0 + w0, fe = hinge === 'L' ? x0 + w0 : x0;
        doc.line(fe, y0, hx, y0 + h0 / 2, 'F-CAB-SWING');
        doc.line(fe, y0 + h0, hx, y0 + h0 / 2, 'F-CAB-SWING');
      }
      if (opt.handles !== false) handleMark(doc, glass ? Object.assign({}, cab, { handle: 'bar' }) : cab, x0, y0, w0, h0, hinge);
    };
    rows.forEach(r => {
      const rh = r.h * 10, ly = top - rh;
      if (r.t === 'D') {                                     // 抽屜
        doc.rect(fx + gap, ly + gap, fw - 2 * gap, rh - 2 * gap, 'F-CAB-DOOR');
        if (opt.handles !== false) handleMark(doc, cab, fx + gap, ly + gap, fw - 2 * gap, rh - 2 * gap, null);
      } else if (r.t === 'L' || r.t === 'R') leaf(fx, fw, ly, rh, r.t);
      else if (r.t === 'G') leaf(fx, fw, ly, rh, 'L', true);
      else if (r.t === 'P') { leaf(fx, fw / 2, ly, rh, 'L'); leaf(fx + fw / 2, fw / 2, ly, rh, 'R'); }
      else if (r.t === 'GP') { leaf(fx, fw / 2, ly, rh, 'L', true); leaf(fx + fw / 2, fw / 2, ly, rh, 'R', true); }
      else if (r.t === 'F') [0, 1, 2, 3].forEach(i => leaf(fx + i * fw / 4, fw / 4, ly, rh, i % 2 ? 'R' : 'L'));
      top = ly;
    });
    if (cab.rod) doc.line(fx + 20, yt - 80, fx + fw - 20, yt - 80, 'F-CAB-BODY');   // 吊衣桿
  }
  Dx.cabFront = cabFront;

  /* ======================================================================
     立面圖：X0,Y0 = 牆左下角（地坪）
     ====================================================================== */
  function elevation(doc, st, i, X0, Y0, opt) {
    opt = opt || {};
    const p = doc.p, room = st.room;
    const { wi, list } = window.Drawings.wallCabinets(st, i);
    const L = wi.len, H = room.height;

    // 牆面範圍 + 向兩側延伸的地坪線
    doc.rect(X0, Y0, L, H, 'A-WALL');
    doc.line(X0 - p(6), Y0, X0 + L + p(6), Y0, 'A-FLOOR');

    // 門窗
    (room.walls[i].openings || []).forEach(op => {
      const fwd = (wi.dir[0] * -wi.nOut[1] + wi.dir[1] * wi.nOut[0]) > 0;
      const sA = fwd ? op.offset : L - op.offset - op.width;
      const ox = X0 + sA, oy = Y0 + op.sill, ow = op.width, oh = op.height;
      doc.rect(ox, oy, ow, oh, 'A-OPEN');
      if (op.type === 'window') {
        doc.line(ox + ow / 2, oy, ox + ow / 2, oy + oh, 'A-OPEN');
        doc.line(ox, oy + oh / 2, ox + ow, oy + oh / 2, 'A-OPEN');
      } else {
        doc.line(ox, oy + oh, ox + ow, oy + oh / 2, 'A-OPEN-SYM', 'DASHED');
        doc.line(ox, oy, ox + ow, oy + oh / 2, 'A-OPEN-SYM', 'DASHED');
      }
      if (opt.labels !== false) {
        doc.text(ox + ow / 2, oy + oh + p(1.2), p(2.2),
          `${op.type === 'door' ? '門' : '窗'} ${op.width}x${op.height}${op.sill ? ' 窗台' + op.sill : ''}`,
          { align: 'c', valign: 'b' });
      }
      if (opt.dims !== false) {
        dim(doc, ox, oy + oh, ox + ow, oy + oh, 4, op.width, { h: 2.2 });
        dim(doc, ox + ow, oy, ox + ow, oy + oh, 4, op.height, { h: 2.2 });
        if (op.sill) dim(doc, ox + ow, Y0, ox + ow, oy, 4, op.sill, { h: 2.2 });
      }
    });

    // 櫃體：落地 → 桌板 → 設備 → 吊櫃（與 Drawings.elevation 相同的疊放順序）
    const lay = c => c.hanging ? 3 : c.kind === 'appl' ? 2 : c.kind === 'desk' ? 1 : 0;
    const sorted = list.slice().sort((a, b) => lay(a.cab) - lay(b.cab));
    sorted.forEach(({ cab, left }) => cabFront(doc, cab, X0 + left, Y0, opt));

    // 型號標籤
    if (opt.labels !== false) {
      sorted.forEach(({ cab, left }) => {
        const cx = X0 + left + cab.w / 2;
        let ty, va;
        if (cab.hanging) { ty = Y0 + cab.y + cab.h + p(1.4); va = 'b'; }
        else if (cab.kind === 'desk') { ty = Y0 + cab.y + cab.thick + p(1.4); va = 'b'; }
        else { ty = Y0 - p(2.4); va = 't'; }
        const label = cab.kind === 'appl'
          ? `${cab.code} ${D.APPL_TYPES[cab.at] || ''}`
          : cab.kind === 'desk'
            ? `${window.Pricing.describe(cab).split('　')[0]} ${cab.topColor || ''}`
            : `${window.Model.cabName(cab)} ${cab.bodyColor}${cab.fronts.some(r => !window.Model.OPEN_ROW(r.t)) ? '/' + cab.doorColor : ''}`;
        doc.text(cx, ty, p(2.4), label.trim(), { align: 'c', valign: va });
      });
    }

    if (opt.dims === false) return { len: L, height: H, cabs: sorted.map(s => s.cab) };

    /* ---- 下方：落地櫃寬度鏈 + 牆淨長 ----
       桌板（檯面）會橫跨下方好幾個櫃體，放進寬度鏈會和櫃寬互相重疊，所以排除 */
    const floor = sorted.filter(l => !l.cab.hanging && l.cab.kind !== 'desk'
      && (l.cab.kind !== 'appl' || l.cab.mount === 'floor')).sort((a, b) => a.left - b.left);
    if (floor.length) {
      const segs = [];
      let cur = 0;
      floor.forEach(({ cab, left }) => {
        const end = left + cab.w;
        if (end <= cur + 1) return;                      // 完全被前一個櫃體涵蓋
        if (left - cur > 5) segs.push([cur, left]);      // 空檔
        const a = Math.max(left, cur);
        segs.push([a, end, a === left ? cab.w : null]);  // 部分重疊時改標實際淨距
        cur = end;
      });
      if (L - cur > 5) segs.push([cur, L]);
      dimChain(doc, segs, X0, Y0, -10, true, 2.5);
    }
    dim(doc, X0, Y0, X0 + L, Y0, floor.length ? -20 : -10, r1(L), { h: 3.0 });

    /* ---- 上方：吊櫃寬度鏈 ---- */
    const hang = sorted.filter(l => l.cab.hanging).sort((a, b) => a.left - b.left);
    if (hang.length) {
      const segs = [];
      hang.forEach(({ cab, left }) => segs.push([left, left + cab.w, cab.w]));
      dimChain(doc, segs, X0, Y0 + H, 10, true, 2.5);
    }

    /* ---- 左側：高度鏈（踢腳／櫃高／檯面厚／桌板厚／到天花） ---- */
    const tall = floor.map(l => l.cab).sort((a, b) => (b.y + b.h + topTh(b)) - (a.y + a.h + topTh(a)))[0];
    const desk = sorted.filter(l => l.cab.kind === 'desk').map(l => l.cab)
      .sort((a, b) => (b.y + b.thick) - (a.y + a.thick))[0];
    const segs = [];
    let cz = 0;
    if (tall) {
      if (tall.y > 5) segs.push([0, tall.y, tall.y]);               // 踢腳／離地
      segs.push([tall.y, tall.y + tall.h, tall.h]);                 // 櫃體高
      cz = tall.y + tall.h;
      const th = topTh(tall);
      if (th) { segs.push([cz, cz + th, th]); cz += th; }           // 檯面厚
    }
    if (desk && desk.y + desk.thick > cz + 1) {                     // 桌板（檯面）
      if (desk.y > cz + 1) segs.push([cz, desk.y]);
      segs.push([desk.y, desk.y + desk.thick, desk.thick]);
      cz = desk.y + desk.thick;
    }
    if (segs.length && H - cz > 5) segs.push([cz, H]);
    if (segs.length) dimChain(doc, segs, Y0, X0, -10, false, 2.5);
    dim(doc, X0, Y0, X0, Y0 + H, segs.length ? -20 : -10, H, { h: 3.0 });

    /* ---- 右側：吊櫃高度（下緣離地／櫃高） ---- */
    const hc = hang.map(l => l.cab).sort((a, b) => b.h - a.h)[0];
    if (hc) {
      dimChain(doc, [[0, hc.y, hc.y], [hc.y, hc.y + hc.h, hc.h]], Y0, X0 + L, 10, false, 2.5);
    }
    return { len: L, height: H, cabs: sorted.map(s => s.cab) };
  }
  Dx.elevation = elevation;
  const topTh = c => (c.top && c.top !== 'none' && D.PARTS.TOP[c.top] ? D.PARTS.TOP[c.top].thick : 0);

  /* ======================================================================
     平面圖：X0,Y0 = 平移量（世界座標 → 圖面座標，世界 z 軸朝下，需翻轉）
     ====================================================================== */
  function plan(doc, st, X0, Y0, opt) {
    opt = opt || {};
    const p = doc.p, room = st.room;
    // 世界 (x,z) → 圖面 (x,y)：z 往下，所以 y = -z
    const T = ([x, z]) => [X0 + x, Y0 - z];

    if (room) {
      const n = room.points.length, t = room.thickness;
      const inner = room.points.map(q => q);
      const outer = room.points.map((q, i) => {
        // 以相鄰兩牆外法線的交會點取外輪廓（直角空間下等同平移牆厚）
        const a = M().wallInfo(room, (i - 1 + n) % n), b = M().wallInfo(room, i);
        const na = a.nOut, nb = b.nOut;
        const det = na[0] * nb[1] - na[1] * nb[0];
        if (Math.abs(det) < 1e-6) return [q[0] + nb[0] * t, q[1] + nb[1] * t];
        const c1 = na[0] * q[0] + na[1] * q[1] + t, c2 = nb[0] * q[0] + nb[1] * q[1] + t;
        return [(c1 * nb[1] - c2 * na[1]) / det, (c2 * na[0] - c1 * nb[0]) / det];
      });
      // 牆剖面填充（內外輪廓之間）
      if (opt.hatch) {
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          doc.hatch45([T(inner[i]), T(inner[j]), T(outer[j]), T(outer[i])], p(2.5), 'A-WALL-HATCH');
        }
      }
      // 牆線（在門窗開口處斷開）
      for (let i = 0; i < n; i++) {
        const wi = M().wallInfo(room, i), j = (i + 1) % n;
        const ops = (room.walls[i].openings || []).slice().sort((a, b) => a.offset - b.offset);
        const spans = [];
        let cur = 0;
        ops.forEach(o => {
          const a = Math.max(0, o.offset), b = Math.min(wi.len, o.offset + o.width);
          if (b > a) { if (a - cur > 1) spans.push([cur, a]); cur = Math.max(cur, b); }
        });
        if (wi.len - cur > 1) spans.push([cur, wi.len]);
        const at = (base, s) => [base[0] + wi.dir[0] * s, base[1] + wi.dir[1] * s];
        // 內牆線沿 inner[i]→inner[j]，外牆線沿 outer[i]→outer[j]
        const oLen = Math.hypot(outer[j][0] - outer[i][0], outer[j][1] - outer[i][1]);
        const oDir = oLen > 1e-6 ? [(outer[j][0] - outer[i][0]) / oLen, (outer[j][1] - outer[i][1]) / oLen] : wi.dir;
        spans.forEach(([a, b]) => {
          const A = T(at(inner[i], a)), B = T(at(inner[i], b));
          doc.line(A[0], A[1], B[0], B[1], 'A-WALL');
          const ra = oLen / (wi.len || 1);
          const C = T([outer[i][0] + oDir[0] * a * ra, outer[i][1] + oDir[1] * a * ra]);
          const E = T([outer[i][0] + oDir[0] * b * ra, outer[i][1] + oDir[1] * b * ra]);
          doc.line(C[0], C[1], E[0], E[1], 'A-WALL');
        });
        // 轉角接合線
        const Ai = T(inner[i]), Ao = T(outer[i]);
        doc.line(Ai[0], Ai[1], Ao[0], Ao[1], 'A-WALL');
        // 門窗：門框線 + 門扇／窗線
        ops.forEach(o => {
          const i0 = at(inner[i], o.offset), i1 = at(inner[i], o.offset + o.width);
          const o0 = [i0[0] + wi.nOut[0] * t, i0[1] + wi.nOut[1] * t];
          const o1 = [i1[0] + wi.nOut[0] * t, i1[1] + wi.nOut[1] * t];
          [[i0, o0], [i1, o1]].forEach(([a, b]) => { const A = T(a), B = T(b); doc.line(A[0], A[1], B[0], B[1], 'A-OPEN'); });
          if (o.type === 'window') {
            [0.25, 0.5, 0.75].forEach(k => {
              const a = [i0[0] + wi.nOut[0] * t * k, i0[1] + wi.nOut[1] * t * k];
              const b = [i1[0] + wi.nOut[0] * t * k, i1[1] + wi.nOut[1] * t * k];
              const A = T(a), B = T(b); doc.line(A[0], A[1], B[0], B[1], 'A-OPEN');
            });
          } else {
            // 門扇（開向室內）+ 開啟弧
            const hinge = i0, swing = [hinge[0] + wi.nIn[0] * o.width, hinge[1] + wi.nIn[1] * o.width];
            const Hp = T(hinge), Sp = T(swing);
            doc.line(Hp[0], Hp[1], Sp[0], Sp[1], 'A-OPEN');
            const a0 = Math.atan2(Sp[1] - Hp[1], Sp[0] - Hp[0]) * 180 / Math.PI;
            const Ip = T(i1);
            const a1 = Math.atan2(Ip[1] - Hp[1], Ip[0] - Hp[0]) * 180 / Math.PI;
            doc.arc(Hp[0], Hp[1], o.width, a0, a1, 'A-OPEN-SYM', 'DASHED');
          }
          if (opt.labels !== false) {
            const m = at(inner[i], o.offset + o.width / 2);
            const Mp = T([m[0] + wi.nOut[0] * t * 0.5, m[1] + wi.nOut[1] * t * 0.5]);
            doc.text(Mp[0], Mp[1], p(2.0), `${o.type === 'door' ? '門' : '窗'}${o.width}`, { align: 'c', valign: 'mid' });
          }
        });
        // 牆長標註（畫在室外側）
        if (opt.dims !== false) {
          const A = T(at(inner[i], 0)), B = T(at(inner[i], wi.len));
          const horiz = Math.abs(A[1] - B[1]) < 1;
          const vertl = Math.abs(A[0] - B[0]) < 1;
          if (horiz || vertl) {
            // nOut 在圖面上的方向（y 已翻轉）
            const no = [wi.nOut[0], -wi.nOut[1]];
            const off = (horiz ? Math.sign(no[1]) : Math.sign(no[0])) * (t / doc.o.scale + 8);
            dim(doc, A[0], A[1], B[0], B[1], off || 8, r1(wi.len), { h: 2.5 });
          }
        }
        // 立面索引符號
        if (opt.index !== false) {
          const m = T(at(inner[i], wi.len / 2));
          const ip = [wi.nIn[0], -wi.nIn[1]];
          const r = p(3.2), cx = m[0] + ip[0] * p(7), cy = m[1] + ip[1] * p(7);
          doc.circle(cx, cy, r, 'A-SYMB');
          doc.line(cx - ip[0] * r, cy - ip[1] * r, m[0], m[1], 'A-SYMB');
          doc.text(cx, cy, p(2.6), 'W' + (i + 1), { layer: 'A-SYMB', align: 'c', valign: 'mid' });
        }
      }
    }

    // 櫃體：先落地後吊櫃
    const cabs = (st.cabinets || []).slice().sort((a, b) => (a.hanging ? 1 : 0) - (b.hanging ? 1 : 0));
    cabs.forEach(c => {
      const layer = c.hanging ? 'F-CAB-HANG' : c.kind === 'appl' ? 'F-APPL' : c.kind === 'desk' ? 'F-DESK' : 'F-CAB';
      const lt = c.hanging ? 'DASHED' : null;
      doc.pline(window.Drawings.cabWorldPoly(c).map(T), layer, true, lt);
      // 門面方向：前緣加一條門片厚度線
      if (c.kind !== 'desk' && (c.fronts || []).some(r => !window.Model.OPEN_ROW(r.t))) {
        const fe = window.Drawings.cabFrontEdge(c);
        const pts = fe.map(([x, z]) => M().toWorld(c, x, z));
        const A = T(pts[0]), B = T(pts[1]);
        doc.line(A[0], A[1], B[0], B[1], 'F-CAB-DOOR');
      }
      if (c.kind === 'appl' && c.at === 'hob') {
        const it = D.byCode[c.code] || {};
        const nb = it.burners || 2;
        for (let i = 0; i < nb; i++) {
          const q = T(M().toWorld(c, (-(nb - 1) / 2 + i) * c.w / nb, -c.d * 0.06));
          doc.circle(q[0], q[1], 68, 'F-APPL');
        }
      }
      if (opt.labels !== false) {
        const q = T([c.x, c.z]);
        doc.text(q[0], q[1], p(2.2), window.Model.cabName(c), { align: 'c', valign: 'mid' });
      }
    });
    return cabs.length;
  }
  Dx.plan = plan;

  /* ======================================================================
     圖框 + 標題欄（X,Y = 圖框左下角；pw/ph = 紙張 mm）
     ====================================================================== */
  function frame(doc, X, Y, pw, ph, title, meta) {
    const p = doc.p, L = 'A-TITLE';
    doc.rect(X, Y, p(pw), p(ph), L);                                   // 裁切線
    doc.rect(X + p(18), Y + p(7), p(pw - 25), p(ph - 14), L);          // 圖框（左側留裝訂邊）
    const bw = 165, bh = 36, bx = X + p(pw - 7 - bw), by = Y + p(7);
    doc.rect(bx, by, p(bw), p(bh), L);
    for (let i = 1; i < 3; i++) doc.line(bx, by + p(bh * i / 3), bx + p(bw), by + p(bh * i / 3), L);
    doc.line(bx + p(82), by, bx + p(82), by + p(bh), L);
    const rows = [
      [['案名', meta.name], ['圖名', title]],
      [['客戶', meta.client || '—'], ['比例', meta.scale + '　單位 mm']],
      [['日期', meta.date], ['圖號', meta.sheet]]
    ];
    rows.forEach((cols, ri) => {
      const cy = by + p(bh * (2.5 - ri) / 3);
      cols.forEach(([k, v], ci) => {
        const cx = bx + p(ci ? 85 : 3);
        doc.text(cx, cy, p(2.4), k, { layer: L, align: 'l', valign: 'mid' });
        doc.text(cx + p(12), cy, p(2.8), String(v == null ? '' : v), { layer: L, align: 'l', valign: 'mid' });
      });
    });
    doc.text(bx + p(3), by + p(bh + 2.5), p(2.6), '系統櫃 3D 設計平台', { layer: L, align: 'l', valign: 'b' });
  }
  Dx.frame = frame;

  /* ======================================================================
     組一整份 DXF
     project = { name, client, floors: [{ name, room, cabinets }] }
     ====================================================================== */
  const STD_SCALES = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 500];

  Dx.build = function (project, opt) {
    const o = Object.assign({
      scale: 'auto', paper: 'A3', frame: true, plan: true, walls: 'with-cab',
      dims: true, labels: true, swing: true, handles: true, hidden: true,
      hatch: true, index: true, font: 'kaiu.ttf', ascii: true
    }, opt || {});
    // 有公司圖框時，紙張大小與繪圖區都以圖框實際畫的為準，忽略「圖紙」下拉
    const fr = o.companyFrame && o.companyFrame.ents ? o.companyFrame : null;
    const [pw, ph] = fr ? [fr.w, fr.h] : (PAPER[o.paper] || PAPER.A3);
    // 繪圖區（紙面 mm，相對於紙張左下角）
    const AREA = fr && fr.area
      ? { x0: fr.area.x0 - fr.bbox.x0, y0: fr.area.y0 - fr.bbox.y0, x1: fr.area.x1 - fr.bbox.x0, y1: fr.area.y1 - fr.bbox.y0 }
      : fr
        ? { x0: 5, y0: 5, x1: pw - 5, y1: ph - 5 }
        : { x0: 26, y0: 52, x1: pw - 14, y1: ph - 16 };
    const date = (() => { const d = new Date(); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; })();

    // ---- 先列出所有要畫的視圖，順便記下各自的實際內容尺寸（模型 mm）
    const views = [];
    (project.floors || []).forEach(fl => {
      const st = { room: fl.room, cabinets: fl.cabinets || [] };
      const pre = (project.floors.length > 1 ? fl.name + ' ' : '');
      if (!st.room && !st.cabinets.length) return;
      if (o.plan) {
        const bb = planBounds(st);
        views.push({ type: 'plan', st, bb, cw: bb.x1 - bb.x0, ch: bb.z1 - bb.z0, title: pre + '平面配置圖', code: 'P' });
      }
      if (!st.room) return;
      st.room.points.forEach((_, i) => {
        const wc = window.Drawings.wallCabinets(st, i);
        if (o.walls === 'with-cab' && !wc.list.length) return;
        views.push({
          type: 'elev', st, wall: i, cw: wc.wi.len, ch: st.room.height,
          title: `${pre}立面圖　${M().wallName(i)}（W${i + 1}）`, code: 'E'
        });
      });
    });
    if (!views.length) return null;

    /* ---- 出圖比例：'auto' = 讓最大的一張剛好塞進圖框（含標註留白），再進位到標準比例
       同一個 DXF 只能有一個 $LTSCALE，所以全部視圖共用一個比例 ---- */
    let scale = o.scale;
    if (scale === 'auto' || !(scale > 0)) {
      // 可用範圍 = 繪圖區再扣掉標註鏈佔的留白
      const availW = Math.max(20, (AREA.x1 - AREA.x0) - 30), availH = Math.max(20, (AREA.y1 - AREA.y0) - 30);
      let need = 1;
      views.forEach(v => { need = Math.max(need, v.cw / availW, v.ch / availH); });
      scale = STD_SCALES.find(s => s >= need) || Math.ceil(need / 100) * 100;
    }
    const doc = Doc({ scale, font: o.font, ascii: o.ascii });
    const p = doc.p;

    const no = { P: 0, E: 0 };
    const sheets = [];
    const cols = Math.max(1, Math.ceil(Math.sqrt(views.length)));
    views.forEach((v, idx) => {
      const gx = (idx % cols) * p(pw + 20), gy = -Math.floor(idx / cols) * p(ph + 20);
      const sheet = v.code + '-' + String(++no[v.code]).padStart(2, '0');
      const ax0 = gx + p(AREA.x0), ay0 = gy + p(AREA.y0), ax1 = gx + p(AREA.x1), ay1 = gy + p(AREA.y1);
      if (v.type === 'plan') {
        const bb = v.bb;
        const cx = (ax0 + ax1) / 2, cy = (ay0 + ay1) / 2;
        plan(doc, v.st, cx - (bb.x0 + bb.x1) / 2, cy + (bb.z0 + bb.z1) / 2, o);
      } else {
        const wc = window.Drawings.wallCabinets(v.st, v.wall);
        // 標註鏈在下方與左側，所以把圖形往右上推一點，整體看起來才置中
        const X0 = (ax0 + ax1) / 2 - wc.wi.len / 2 + p(6);
        const Y0 = (ay0 + ay1) / 2 - v.st.room.height / 2 + p(8);
        const res = elevation(doc, v.st, v.wall, X0, Y0, o);
        doc.text(ax0 + p(3), ay0 + p(3), p(2.4),
          `從室內面向 W${v.wall + 1} 觀看　牆淨長 ${r1(res.len)}　樓高 ${res.height}　${res.cabs.length ? res.cabs.length + ' 件櫃體' : '此牆面無靠牆櫃體'}`,
          { align: 'l', valign: 'b' });
      }
      if (fr) {
        Dx.drawFrame(doc, fr, gx, gy, scale, {
          name: project.name || '專案', client: project.client || '', title: v.title,
          scale: '1:' + scale, date, sheet, of: `${idx + 1} of ${views.length}`,
          by: project.by || ''
        }, o.frameMap || {});
      } else if (o.frame) {
        frame(doc, gx, gy, pw, ph, v.title, {
          name: project.name || '專案', client: project.client, date,
          scale: '1:' + scale, sheet: sheet + ' / 共 ' + views.length + ' 張'
        });
      } else {
        /* 不畫內建圖框：改在 DEFPOINTS（AutoCAD 不列印此圖層）留下紙張範圍與插入基準點，
           公司圖框只要 INSERT 到基準點、比例給 1:<scale> 的倒數對應值就能對齊 */
        doc.rect(gx, gy, p(pw), p(ph), 'DEFPOINTS');
        doc.line(gx - p(5), gy, gx + p(5), gy, 'DEFPOINTS');
        doc.line(gx, gy - p(5), gx, gy + p(5), 'DEFPOINTS');
        doc.text(gx + p(2), gy + p(2), p(2.5), `${sheet}　${v.title}　1:${scale}`,
          { layer: 'DEFPOINTS', align: 'l', valign: 'b' });
      }
      sheets.push({ sheet, title: v.title, x: r1(gx), y: r1(gy) });
    });
    return {
      text: doc.toString(), views: views.length, entities: doc.count,
      scale, paper: fr ? `公司圖框 ${pw}×${ph}` : o.paper,
      frame: !!(fr || o.frame), frameKind: fr ? 'company' : o.frame ? 'builtin' : 'none',
      renamed: doc.renamed, sheets,
      pitch: { x: r1(p(pw + 20)), y: r1(p(ph + 20)), w: r1(p(pw)), h: r1(p(ph)) }
    };
  };

  function planBounds(st) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const put = ([x, z]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; };
    if (st.room) st.room.points.forEach((q, i) => {
      put(q);
      const wi = M().wallInfo(st.room, i);
      put([q[0] + wi.nOut[0] * st.room.thickness, q[1] + wi.nOut[1] * st.room.thickness]);
    });
    (st.cabinets || []).forEach(c => window.Drawings.cabWorldPoly(c).forEach(put));
    if (!isFinite(x0)) { x0 = z0 = 0; x1 = z1 = 1000; }
    return { x0, x1, z0, z1 };
  }

  /* ==========================================================================
     讀取公司提供的圖框 .dxf
     解析時就把 INSERT、圖塊、bulge 圓弧全部展開成基本圖元（圖框本身的紙面 mm
     座標），之後 drawFrame 只要平移縮放重畫一次即可，也能直接 JSON 存進瀏覽器。
     ========================================================================== */

  // DXF 是「代碼一行、值一行」；遇到對不齊時只前進一行自動重新同步
  function gpairs(text) {
    const L = String(text).split(/\r\n|\r|\n/), P = [];
    for (let i = 0; i + 1 < L.length; i++) {
      const t = L[i].trim();
      if (!/^-?\d+$/.test(t)) continue;
      P.push([parseInt(t, 10), L[i + 1]]);
      i++;
    }
    return P;
  }
  function sectionsOf(P) {
    const sec = {};
    for (let i = 0; i < P.length; i++) {
      if (P[i][0] !== 0 || P[i][1].trim() !== 'SECTION' || !P[i + 1] || P[i + 1][0] !== 2) continue;
      const name = P[i + 1][1].trim();
      let j = i + 2;
      while (j < P.length && !(P[j][0] === 0 && P[j][1].trim() === 'ENDSEC')) j++;
      sec[name] = P.slice(i + 2, j);
      i = j;
    }
    return sec;
  }
  function recsOf(body) {
    const out = []; let cur = null, skip = false;
    for (const [c, v] of body || []) {
      if (c === 0) { cur = { t: String(v).trim(), g: [] }; out.push(cur); skip = false; }
      // 內嵌物件（MTEXT 分欄資料）、應用程式群組與 XDATA 會重複用到 10/11/40/50…
      // 這些群組碼，不排除掉就會把本體的插入點、字高、角度讀成別的值
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
  // AutoCAD 的 \U+XXXX 轉義還原成實際字元
  const unesc = s => String(s).replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

  // 圓弧：由 bulge（= tan(夾角/4)）求出圓心、半徑與起訖角
  function bulgeArc(x1, y1, x2, y2, b) {
    const dx = x2 - x1, dy = y2 - y1, c = Math.hypot(dx, dy);
    if (!c || !b) return null;
    const th = 4 * Math.atan(b);
    const R = c / (2 * Math.sin(th / 2));
    const hh = R * Math.cos(th / 2);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const cx = mx - hh * dy / c, cy = my + hh * dx / c;
    let a1 = Math.atan2(y1 - cy, x1 - cx), a2 = Math.atan2(y2 - cy, x2 - cx);
    if (b < 0) { const t = a1; a1 = a2; a2 = t; }          // DXF 的 ARC 一律逆時針
    return { cx, cy, r: Math.abs(R), a1: a1 * 180 / Math.PI, a2: a2 * 180 / Math.PI };
  }

  const MT_ALIGN = { 1: ['l', 't'], 2: ['c', 't'], 3: ['r', 't'], 4: ['l', 'mid'], 5: ['c', 'mid'], 6: ['r', 'mid'], 7: ['l', 'b'], 8: ['c', 'b'], 9: ['r', 'b'] };
  const TX_ALIGN = { 0: 'l', 1: 'c', 2: 'r', 3: 'l', 4: 'c', 5: 'l' };
  const TX_VALIGN = { 0: 'base', 1: 'b', 2: 'mid', 3: 't' };

  Dx.parseFrame = function (text) {
    const sec = sectionsOf(gpairs(text));
    const warn = new Set();
    const tbl = { layers: [], styles: [] };
    recsOf(sec.TABLES).forEach(r => {
      if (r.t === 'LAYER' && gs(r, 2)) tbl.layers.push({ name: gs(r, 2), color: Math.abs(gn(r, 62, 7)) || 7, lt: gs(r, 6, 'CONTINUOUS') });
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
    const tp = (T, x, y) => {
      const X = x * T.sx, Y = y * T.sy;
      return [T.tx + X * T.c - Y * T.s, T.ty + X * T.s + Y * T.c];
    };

    function walk(recs, T, depth) {
      if (depth > 6) { warn.add('圖塊巢狀超過 6 層，更深的沒有展開'); return; }
      for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        const lay = gs(r, 8, '0') || '0';
        const lt = gs(r, 6, '');
        const put = e => { ents.push(Object.assign({ l: lay }, lt && lt !== 'BYLAYER' ? { lt } : null, e)); };
        const line = (x1, y1, x2, y2) => { const a = tp(T, x1, y1), b2 = tp(T, x2, y2); grow(a[0], a[1]); grow(b2[0], b2[1]); put({ k: 'L', p: [a[0], a[1], b2[0], b2[1]] }); };
        const arcOf = (cx, cy, rr, a1, a2) => {
          const c0 = tp(T, cx, cy), R = rr * Math.abs(T.sx);
          const d = T.rot * 180 / Math.PI;
          grow(c0[0] - R, c0[1] - R); grow(c0[0] + R, c0[1] + R);
          put({ k: 'A', c: [c0[0], c0[1]], r: R, a1: a1 + d, a2: a2 + d });
        };
        const polyline = (pts, closed) => {
          const n = pts.length;
          for (let k = 0; k < (closed ? n : n - 1); k++) {
            const a = pts[k], b2 = pts[(k + 1) % n];
            if (a.b) { const ar = bulgeArc(a.x, a.y, b2.x, b2.y, a.b); if (ar) { arcOf(ar.cx, ar.cy, ar.r, ar.a1, ar.a2); continue; } }
            line(a.x, a.y, b2.x, b2.y);
          }
        };
        const putText = (raw, x, y, h, rot, align, valign, style, wf, refW) => {
          const s = unesc(raw).replace(/\s+$/, '');
          if (!s) return;
          const q = tp(T, x, y), H = Math.abs(h * T.sy) || 2.5;
          // 只用插入點撐範圍：文字寬度是估的，拿去算紙張大小會把圖框撐大
          grow(q[0], q[1]);
          const ti = texts.length;
          texts.push({ ti, s, x: q[0], y: q[1], h: H });
          put({ k: 'T', ti, x: q[0], y: q[1], h: H, s, rot: (rot || 0) + T.rot * 180 / Math.PI, align, valign, style, wf, w: refW || 0 });
        };
        /* 直書中文：AutoCAD 用 @ 開頭的字型（字身先轉 90°）配上朝下的文字方向。
           我們沒辦法只轉字身，所以拆成一個字一個 TEXT 沿方向排下去，每個字保持正立，
           這才是 AutoCAD 實際顯示的樣子（整段當註記用，不列入標題欄欄位對應）。 */
        const putVertical = (lines, x, y, h, dirDeg, style) => {
          const rad = dirDeg * Math.PI / 180;
          const dir = [Math.cos(rad), Math.sin(rad)];
          const perp = [-dir[1], dir[0]];
          const step = h * 1.6;
          lines.forEach((ln, k) => {
            [...ln].forEach((ch, j) => {
              if (ch === ' ') return;
              const px = x - perp[0] * k * step + dir[0] * (j + 0.5) * h;
              const py = y - perp[1] * k * step + dir[1] * (j + 0.5) * h;
              const q = tp(T, px, py), H = Math.abs(h * T.sy) || 2.5;
              grow(q[0], q[1]);
              put({ k: 'T', x: q[0], y: q[1], h: H, s: ch, rot: T.rot * 180 / Math.PI, align: 'c', valign: 'mid', style });
            });
          });
        };

        switch (r.t) {
          case 'LINE': line(gn(r, 10, 0), gn(r, 20, 0), gn(r, 11, 0), gn(r, 21, 0)); break;
          case 'LWPOLYLINE': {
            const pts = []; let cur = null;
            for (const [c, v] of r.g) {
              if (c === 10) { cur = { x: parseFloat(v) || 0, y: 0, b: 0 }; pts.push(cur); }
              else if (c === 20 && cur) cur.y = parseFloat(v) || 0;
              else if (c === 42 && cur) cur.b = parseFloat(v) || 0;
            }
            polyline(pts, (gn(r, 70, 0) & 1) === 1);
            break;
          }
          case 'POLYLINE': {
            const pts = []; let j = i + 1;
            for (; j < recs.length && recs[j].t === 'VERTEX'; j++) pts.push({ x: gn(recs[j], 10, 0), y: gn(recs[j], 20, 0), b: gn(recs[j], 42, 0) });
            if (recs[j] && recs[j].t === 'SEQEND') j++;
            polyline(pts, (gn(r, 70, 0) & 1) === 1);
            i = j - 1;
            break;
          }
          case 'CIRCLE': {
            const c0 = tp(T, gn(r, 10, 0), gn(r, 20, 0)), R = gn(r, 40, 0) * Math.abs(T.sx);
            grow(c0[0] - R, c0[1] - R); grow(c0[0] + R, c0[1] + R);
            put({ k: 'C', c: [c0[0], c0[1]], r: R });
            break;
          }
          case 'ARC': arcOf(gn(r, 10, 0), gn(r, 20, 0), gn(r, 40, 0), gn(r, 50, 0), gn(r, 51, 0)); break;
          case 'SOLID': case 'TRACE': {
            const q = [[10, 20], [11, 21], [12, 22], [13, 23]].map(([a, b2]) => tp(T, gn(r, a, 0), gn(r, b2, 0)));
            q.forEach(([x, y]) => grow(x, y));
            put({ k: 'S', pts: q });
            break;
          }
          case 'TEXT': case 'ATTDEF': case 'ATTRIB': {
            const hj = gn(r, 72, 0), vj = gn(r, 73, 0);
            const useAlt = hj !== 0 || vj !== 0;
            putText(gs(r, 1, ''), useAlt ? gn(r, 11, gn(r, 10, 0)) : gn(r, 10, 0),
              useAlt ? gn(r, 21, gn(r, 20, 0)) : gn(r, 20, 0),
              gn(r, 40, 2.5), gn(r, 50, 0), TX_ALIGN[hj] || 'l', TX_VALIGN[vj] || 'base',
              gs(r, 7, ''), gn(r, 41, 0) || 0);
            break;
          }
          case 'MTEXT': {
            const [al, va] = MT_ALIGN[gn(r, 71, 1)] || ['l', 't'];
            // 長字串會先用一堆 code 3 分段，最後才是 code 1
            const rawTxt = gcat(r, 3) + gs(r, 1, '');
            const raw = mtextPlain(rawTxt);
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
            if (!blk) { if (nm) warn.add('找不到圖塊 ' + nm + '，已略過'); break; }
            const sx = gn(r, 41, 1) || 1, sy = gn(r, 42, 1) || 1, rot = (gn(r, 50, 0)) * Math.PI / 180;
            if (Math.abs(Math.abs(sx) - Math.abs(sy)) > 1e-6) warn.add('圖塊 ' + nm + ' 的 X/Y 比例不同，圓與圓弧會畫成正圓');
            const q = tp(T, gn(r, 10, 0), gn(r, 20, 0));
            const c = Math.cos(T.rot + rot), s = Math.sin(T.rot + rot);
            const T2 = { sx: T.sx * sx, sy: T.sy * sy, rot: T.rot + rot, c, s, tx: q[0] - (blk.base[0] * T.sx * sx * c - blk.base[1] * T.sy * sy * s), ty: q[1] - (blk.base[0] * T.sx * sx * s + blk.base[1] * T.sy * sy * c) };
            // 圖塊裡的 ATTDEF 只是欄位定義；若這個 INSERT 後面帶了 ATTRIB 實際值就用實際值
            const hasAttrib = recs[i + 1] && recs[i + 1].t === 'ATTRIB';
            walk(blk.recs.filter(x => !(hasAttrib && x.t === 'ATTDEF')), T2, depth + 1);
            break;
          }
          case 'VERTEX': case 'SEQEND': case 'VIEWPORT': case 'ENDBLK': break;
          default: if (r.t && r.t !== 'BLOCK') warn.add('不支援的圖元 ' + r.t + '，已略過');
        }
      }
    }
    walk(recsOf(sec.ENTITIES), { sx: 1, sy: 1, rot: 0, c: 1, s: 0, tx: 0, ty: 0 }, 0);

    if (!isFinite(bb.x0)) return { error: '這個 DXF 裡沒有讀到任何圖形。請確認是「模型空間」裡的圖框，而不是配置（圖紙空間）。' };

    // 找出矩形，推測繪圖區：去掉最外圈那個，剩下面積最大的就是放圖的框
    const rects = [];
    ents.forEach(e => { if (e.k === 'L') return; });
    const segs = ents.filter(e => e.k === 'L');
    rects.push(...findRects(segs));
    const uniq = [];
    rects.forEach(r => { if (!uniq.some(u => Math.abs(u.x0 - r.x0) < 0.6 && Math.abs(u.y0 - r.y0) < 0.6 && Math.abs(u.x1 - r.x1) < 0.6 && Math.abs(u.y1 - r.y1) < 0.6)) uniq.push(r); });
    uniq.sort((a, b2) => (b2.x1 - b2.x0) * (b2.y1 - b2.y0) - (a.x1 - a.x0) * (a.y1 - a.y0));
    // 使用者可以在圖框裡用名為 AW-AREA／繪圖區 的圖層畫一個矩形明確指定
    const named = uniq.find(r => /^(AW-AREA|繪圖區|VIEWPORT)$/i.test(r.layer || ''));
    const area = named || uniq[1] || null;

    return {
      ents, texts, layers: tbl.layers, styles: tbl.styles,
      bbox: bb, w: +(bb.x1 - bb.x0).toFixed(2), h: +(bb.y1 - bb.y0).toFixed(2),
      area, rects: uniq.slice(0, 6), areaNamed: !!named,
      warnings: [...warn]
    };
  };

  // 粗估文字寬度（紙面 mm）：中日韓字是全形，其餘約半形
  function textWidth(s, h, wf) {
    let n = 0;
    for (const ch of String(s)) n += ch.charCodeAt(0) > 0x2E80 ? 1 : 0.55;
    return n * h * (wf || 0.85);
  }

  /* 標題欄可替換的欄位；猜測規則用來預填對應表（使用者可改） */
  Dx.FIELDS = [
    ['', '（不替換）'], ['name', '案名'], ['client', '客戶'], ['title', '圖名'],
    ['scale', '比例'], ['date', '日期'], ['sheet', '圖號'], ['of', '張次'], ['by', '繪製者']
  ];
  Dx.guessMap = function (fr) {
    const m = {};
    (fr.texts || []).forEach(t => {
      const s = t.s.trim();
      if (/^(專案名稱|案名|工程名稱|專案)$/.test(s)) m[t.ti] = 'name';
      else if (/(配置圖|平面圖|立面圖|施工圖)$/.test(s) || /^圖名$/.test(s)) m[t.ti] = 'title';
      else if (/^1\s*[:：]\s*\d/.test(s)) m[t.ti] = 'scale';
      else if (/^\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}$/.test(s)) m[t.ti] = 'date';
      else if (/of\s*\d+/i.test(s) || /^-{2,}/.test(s)) m[t.ti] = 'of';
      else if (/^(設計師|繪圖者|製圖|設計者)$/.test(s)) m[t.ti] = 'by';
      else if (/^(客戶|業主)名稱?$/.test(s)) m[t.ti] = 'client';
    });
    return m;
  };

  // 從線段裡找出軸對齊的矩形（四條邊都在、容差 0.6mm）
  function findRects(segs) {
    const H = [], V = [];
    segs.forEach(e => {
      const [x1, y1, x2, y2] = e.p;
      if (Math.abs(y1 - y2) < 0.4 && Math.abs(x1 - x2) > 1) H.push({ y: (y1 + y2) / 2, a: Math.min(x1, x2), b: Math.max(x1, x2), layer: e.l });
      else if (Math.abs(x1 - x2) < 0.4 && Math.abs(y1 - y2) > 1) V.push({ x: (x1 + x2) / 2, a: Math.min(y1, y2), b: Math.max(y1, y2), layer: e.l });
    });
    const out = [], T = 0.6;
    const spans = (s, lo, hi) => s.a <= lo + T && s.b >= hi - T;
    for (let i = 0; i < H.length; i++) for (let j = i + 1; j < H.length; j++) {
      const lo = Math.min(H[i].y, H[j].y), hi = Math.max(H[i].y, H[j].y);
      if (hi - lo < 1) continue;
      const x0 = Math.max(H[i].a, H[j].a), x1 = Math.min(H[i].b, H[j].b);
      if (x1 - x0 < 1) continue;
      const left = V.find(v => Math.abs(v.x - x0) < T && spans(v, lo, hi));
      const right = V.find(v => Math.abs(v.x - x1) < T && spans(v, lo, hi));
      if (left && right) out.push({ x0, y0: lo, x1, y1: hi, layer: H[i].layer });
    }
    return out;
  }

  /* 把解析好的圖框重畫到 (X,Y)（該張圖的左下角），s = 出圖比例分母
     fields = { name, client, title, scale, date, sheet, by }；map = { 文字序號: 欄位名 } */
  Dx.drawFrame = function (doc, fr, X, Y, s, fields, map) {
    const T = (x, y) => [X + (x - fr.bbox.x0) * s, Y + (y - fr.bbox.y0) * s];
    (fr.layers || []).forEach(l => doc.useLayer(l.name, l.color, l.lt));
    (fr.styles || []).forEach(st => doc.useStyle(st.name, st.font, st.big, st.wf));
    fr.ents.forEach(e => {
      const lay = doc.useLayer(e.l, 7, 'CONTINUOUS') || '0';
      const lt = e.lt && doc.hasLtype(e.lt) ? e.lt : null;
      if (e.k === 'L') { const a = T(e.p[0], e.p[1]), b = T(e.p[2], e.p[3]); doc.line(a[0], a[1], b[0], b[1], lay, lt); }
      else if (e.k === 'A') { const c = T(e.c[0], e.c[1]); doc.arc(c[0], c[1], e.r * s, e.a1, e.a2, lay, lt); }
      else if (e.k === 'C') { const c = T(e.c[0], e.c[1]); doc.circle(c[0], c[1], e.r * s, lay, lt); }
      else if (e.k === 'S') doc.solid(e.pts.map(p => T(p[0], p[1])), lay);
      else if (e.k === 'T') {
        const f = e.ti != null && map ? map[e.ti] : null;
        const str = f && fields[f] != null ? String(fields[f]) : e.s;
        if (!str) return;
        const q = T(e.x, e.y);
        // 代入的內容比原本的欄位寬時自動縮小，才不會寫到標題欄外面去
        let h = e.h;
        if (f && e.w > 0) {
          const need = textWidth(str, e.h, e.wf || doc.o.wf);
          if (need > e.w) h = e.h * (e.w / need);
        }
        doc.text(q[0], q[1], h * s, str, {
          layer: lay, align: e.align || 'l', valign: e.valign || 'base',
          rot: e.rot || 0, style: e.style ? doc.useStyle(e.style) : undefined, wf: e.wf || undefined
        });
      }
    });
  };

  window.DXFOut = Dx;
})();
