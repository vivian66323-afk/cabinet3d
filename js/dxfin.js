/* DXF 匯入：讀 CAD 平面圖（DXF ASCII），由牆線自動找出封閉空間建立房間；或把圖線轉成已知比例的底圖描圖
   使用 dxf.js 的 DXFOut.parseFrame() 解析圖元（LINE／LWPOLYLINE／ARC／CIRCLE／INSERT 圖塊展開） */
(function () {
  const X = {};
  const UI = () => window.UI, M = () => window.Model, V = () => window.Viewer;
  const UNIT = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };   // $INSUNITS → mm
  const Q = 2;   // 端點吸附格（mm）

  /* ---------- 讀檔 ---------- */
  async function readText(file) {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    let s = new TextDecoder('utf-8', { fatal: false }).decode(u8);
    // 非 UTF-8（AutoCAD 舊版 Big5／ANSI）：有大量替換字元就改用 big5
    if ((s.match(/�/g) || []).length > 20) { try { s = new TextDecoder('big5').decode(u8); } catch (e) { } }
    return s;
  }
  function headerUnits(text) {
    const m = text.match(/\$INSUNITS\s*\r?\n\s*70\s*\r?\n\s*(\d+)/);
    return m ? +m[1] : 0;
  }
  function guessUnit(bbox, ins) {
    if (UNIT[ins]) return ins;
    const ext = Math.max(bbox.x1 - bbox.x0, bbox.y1 - bbox.y0);
    return ext < 150 ? 6 : ext < 3000 ? 5 : 4;
  }

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
    for (let i = 0; i < S.length; i++) {
      const bi = [Math.min(S[i][0], S[i][2]) - Q, Math.max(S[i][0], S[i][2]) + Q, Math.min(S[i][1], S[i][3]) - Q, Math.max(S[i][1], S[i][3]) + Q];
      for (let j = i + 1; j < S.length; j++) {
        const s = S[j];
        if (Math.max(s[0], s[2]) < bi[0] || Math.min(s[0], s[2]) > bi[1] || Math.max(s[1], s[3]) < bi[2] || Math.min(s[1], s[3]) > bi[3]) continue;
        const r = segIntersect(S[i], s); if (!r) continue;
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
    return out.slice(0, 12);
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
    ds.sort((a, b) => a - b); return Math.round(ds[Math.floor(ds.length / 2)] / 5) * 5;
  };



  /* 牆線在門窗處是斷開的（內外線各有缺口），房間因此和室外連通而找不到封閉面。
     先把同一直線上、相距 450～4500 mm 且中間沒有其他牆線的兩段牆線用虛擬線段接起來，並記住這些「橋」= 開口 */
  X.bridge = function (segs) {
    const out = segs.map(s => s.slice()), bridges = [];
    const info = segs.map(s => { const L = Math.hypot(s[2] - s[0], s[3] - s[1]) || 1; return { L, d: [(s[2] - s[0]) / L, (s[3] - s[1]) / L] }; });
    const seen = new Set();
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], { L, d } = info[i];
      const proj = (x, y) => ({ t: (x - s[0]) * d[0] + (y - s[1]) * d[1], n: Math.abs((x - s[0]) * d[1] - (y - s[1]) * d[0]) });
      for (let j = 0; j < segs.length; j++) {
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
        for (let m = 0; m < segs.length && !blocked; m++) {
          if (m === i || m === j) continue;
          const u = segs[m], q1 = proj(u[0], u[1]), q2 = proj(u[2], u[3]);
          if (q1.n > 30 && q2.n > 30) continue;
          const lo = Math.min(q1.t, q2.t), hi = Math.max(q1.t, q2.t);
          if (hi > g0 + 20 && lo < g1 - 20) blocked = true;
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
  X.openings = function (poly, thick, ents, k, layers, bridges) {
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
    const arcs = ents.filter(e => e.k === 'A').map(e => ({ c: [e.c[0] * k, e.c[1] * k], r: e.r * k }));
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
    if (!window.DXFOut || !window.DXFOut.parseFrame) { App.toast('DXF 模組未載入'); return; }
    App.busy(true, '解析 DXF…');
    let text, fr;
    try { text = await readText(file); fr = window.DXFOut.parseFrame(text); } catch (e) { App.busy(false); App.toast('讀取失敗：' + (e.message || e)); return; }
    App.busy(false);
    if (!fr || fr.error) { await UI().alert('無法讀取', (fr && fr.error) || '這個 DXF 沒有可用圖形'); return; }
    const ins = headerUnits(text);
    await X.openFrame(fr, file.name, { mode: 'dxf', unit: guessUnit(fr.bbox, ins) });
  };

  // PDF 向量平面圖：fr.ents 為紙面 mm；比例分母 S 由牆厚（平行雙線間距）推測
  const SCALES = [20, 25, 30, 40, 50, 60, 75, 80, 100, 120, 125, 150, 200, 250, 300, 400, 500];
  X.guessScale = function (segs) {
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
    const best = Object.entries(hist).sort((a, b) => b[1] - a[1])[0];
    if (!best) return 100;
    const tp = +best[0];
    // 牆厚落在 100～220 mm 都合理；多個比例都合理時優先常用比例
    const PREF = [100, 50, 200, 30, 25, 20, 40, 60, 150, 75, 80, 120, 125, 250, 300, 400, 500];
    const err = S => Math.max(0, 100 - tp * S, tp * S - 220);
    const ok = PREF.filter(S => err(S) === 0);
    return ok.length ? ok[0] : PREF.reduce((p, c) => err(c) < err(p) ? c : p, 100);
  };

  X.openFrame = async function (fr, name, opt) {
    const st = { fr, mode: opt.mode || 'dxf', unit: opt.unit || 4, scaleDen: opt.scaleDen || 100, image: opt.image || null, layers: {}, cands: [], pick: 0, faces: null, warn: fr.warnings || [] };
    const counts = {};
    fr.ents.forEach(e => { counts[e.l] = (counts[e.l] || 0) + 1; });
    const layerNames = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    // 預設勾選：名稱像牆的圖層；都沒有就全部勾
    const wallLike = layerNames.filter(l => /wall|牆|墻|A-WALL|WALL/i.test(l));
    if (st.mode === 'pdf') {   // PDF 假圖層＝線寬：預設只勾粗線（牆），細線多為門窗、標註
      const lw = l => +((l.match(/線寬 ([\d.]+)/) || [])[1] || 0), mx = Math.max(...layerNames.map(lw));
      layerNames.forEach(l => { st.layers[l] = lw(l) >= mx * 0.5; });
    } else
    layerNames.forEach(l => { st.layers[l] = wallLike.length ? wallLike.includes(l) : !/text|dim|標|文字|hatch|furn|家具|door|window|門|窗|軸|axis|grid|title|frame|圖框/i.test(l); });
    await X.dialog(st, counts, layerNames, name);
  };

  const kOf = st => st.mode === 'pdf' ? st.scaleDen : (UNIT[st.unit] || 1);
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
      <div class="dxfin-left"><canvas id="dxfCv" width="560" height="400"></canvas>
        <div class="dxfin-stat muted" id="dxfStat"></div></div>
      <div class="dxfin-right">
        <div class="kv"><label>${isPdf ? '圖面比例' : '單位'}</label>${isPdf ? `<div class="inline">1 :&nbsp;<input name="unit" type="number" value="${st.scaleDen}" min="1" max="2000" step="1" style="width:80px"><span class="unit">（自動推測，可改）</span></div>` : `<select name="unit" data-k="unit">${[[4, 'mm（公釐）'], [5, 'cm（公分）'], [6, 'm（公尺）'], [1, 'inch（英吋）']].map(([v, n]) => `<option value="${v}"${v === st.unit ? ' selected' : ''}>${n}</option>`).join('')}</select>`}
        <label>圖幅</label><span id="dxfSize"></span>
        <label>牆厚</label><div class="inline"><input name="t" type="number" value="120" step="5" min="50" max="400"><span class="unit">mm</span></div>
        <label>牆高</label><div class="inline"><input name="h" type="number" value="${App.state.room ? App.state.room.height : 2600}" step="10" min="1800" max="6000"><span class="unit">mm</span></div>
        <label>門窗</label><label class="inline" style="gap:6px"><input type="checkbox" name="op" checked> 自動帶入 <span id="dxfOp" class="muted"></span></label></div>
        <div class="sec-title" style="margin-top:8px">圖層 <small>勾選含牆線的圖層</small></div>
        <div class="dxfin-layers">${layerNames.map(l => `<label><input type="checkbox" data-layer="${UI().esc(l)}"${st.layers[l] ? ' checked' : ''}> ${UI().esc(l)} <span class="muted">${counts[l]}</span></label>`).join('')}</div>
        <p class="muted" style="font-size:11.5px;margin:8px 0 0">預覽中點選要當作「空間」的封閉區域（藍色＝目前選擇）。找不到時可改「轉成底圖描圖」，圖線會以正確比例放到地面，再用 L 描牆。</p>
      </div></div>`;
    const res = await UI().modal({
      title: (isPdf ? '匯入 PDF 平面圖：' : '匯入 DXF：') + fname, body, wide: true, cls: 'dxfin-modal',
      buttons: [{ label: '取消', value: null }, { label: '轉成底圖描圖', value: 'underlay' }, { label: '建立空間', primary: true, value: 'room' }],
      onOpen: back => {
        const cv = back.querySelector('#dxfCv'), ctx = cv.getContext('2d');
        const stat = back.querySelector('#dxfStat'), size = back.querySelector('#dxfSize'), opEl = back.querySelector('#dxfOp');
        const detect = () => { const c = st.cands[st.pick]; if (!c) { st.det = null; opEl.textContent = ''; return; } st.det = X.openings(c.pts, +back.querySelector('[name=t]').value || 120, st.fr.ents, k0(), st.layers, st.bridges); const nd = st.det.openings.filter(o => o.type === 'door').length, nw = st.det.openings.length - nd; opEl.textContent = `偵測到 門 ${nd}、窗 ${nw}`; };
        let view = null;
        const draw = () => {
          const k = k0(), bb = st.fr.bbox;
          const W = cv.width, H = cv.height, w = (bb.x1 - bb.x0) * k || 1, h = (bb.y1 - bb.y0) * k || 1;
          const sc = Math.min((W - 20) / w, (H - 20) / h);
          const ox = (W - w * sc) / 2 - bb.x0 * k * sc, oy = H - (H - h * sc) / 2 + bb.y0 * k * sc;
          view = { sc, ox, oy, k };
          const tx = x => ox + x * sc, ty = y => oy - y * sc;
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
          ctx.lineWidth = 1;
          st.fr.ents.forEach(e => {
            const on = st.layers[e.l];
            ctx.strokeStyle = on ? '#333' : '#d5d0c8';
            if (e.k === 'L') { ctx.beginPath(); ctx.moveTo(tx(e.p[0] * k), ty(e.p[1] * k)); ctx.lineTo(tx(e.p[2] * k), ty(e.p[3] * k)); ctx.stroke(); }
            else if (e.k === 'C') { ctx.beginPath(); ctx.arc(tx(e.c[0] * k), ty(e.c[1] * k), e.r * k * sc, 0, Math.PI * 2); ctx.stroke(); }
            else if (e.k === 'A') { ctx.beginPath(); ctx.arc(tx(e.c[0] * k), ty(e.c[1] * k), e.r * k * sc, -e.a2 * Math.PI / 180, -e.a1 * Math.PI / 180); ctx.stroke(); }
          });
          if (st.det) st.det.openings.forEach(o => {
            const p = st.det.pts[o.i], q = st.det.pts[(o.i + 1) % st.det.pts.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, d = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
            ctx.strokeStyle = o.type === 'door' ? '#d9480f' : '#1f9e89'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(tx(p[0] + d[0] * o.off), ty(p[1] + d[1] * o.off)); ctx.lineTo(tx(p[0] + d[0] * (o.off + o.w)), ty(p[1] + d[1] * (o.off + o.w))); ctx.stroke(); ctx.lineWidth = 1;
          });
          st.cands.forEach((c, i) => {
            ctx.beginPath(); c.pts.forEach((p, j) => j ? ctx.lineTo(tx(p[0]), ty(p[1])) : ctx.moveTo(tx(p[0]), ty(p[1]))); ctx.closePath();
            ctx.fillStyle = i === st.pick ? 'rgba(31,95,214,0.28)' : 'rgba(155,125,71,0.12)'; ctx.fill();
            ctx.strokeStyle = i === st.pick ? '#1f5fd6' : '#9b7d47'; ctx.lineWidth = i === st.pick ? 2 : 1; ctx.stroke(); ctx.lineWidth = 1;
          });
          size.textContent = `${(w / 1000).toFixed(2)} × ${(h / 1000).toFixed(2)} m`;
          const c = st.cands[st.pick];
          stat.textContent = st.cands.length ? `找到 ${st.cands.length} 個封閉區域；目前選擇：${c.pts.length} 面牆、${(c.area / 1e6).toFixed(2)} m²（約 ${(c.area / 1e6 * 0.3025).toFixed(1)} 坪）` : '勾選的圖層找不到封閉區域：請勾選牆線所在圖層、確認單位，或改用「轉成底圖描圖」';
        };
        const recompute = () => { compute(st); const c = st.cands[st.pick]; if (c) { const t = X.thickness(c.pts, st.segs); if (t) back.querySelector('[name=t]').value = t; } detect(); draw(); };
        back.querySelector('[name=t]').addEventListener('change', () => { detect(); draw(); });
        back.querySelector('[name=unit]').addEventListener('change', e => { if (isPdf) st.scaleDen = Math.max(1, +e.target.value || 100); else st.unit = +e.target.value; recompute(); });
        back.querySelectorAll('[data-layer]').forEach(cb => cb.addEventListener('change', () => { st.layers[cb.dataset.layer] = cb.checked; recompute(); }));
        cv.addEventListener('click', e => {
          if (!view) return;
          const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * cv.width / r.width, y = (e.clientY - r.top) * cv.height / r.height;
          const wx = (x - view.ox) / view.sc, wy = (view.oy - y) / view.sc;
          const hits = st.cands.map((c, i) => ({ i, c })).filter(o => pip(wx, wy, o.c.pts)).sort((a, b) => a.c.area - b.c.area);
          if (hits.length) { st.pick = hits[0].i; const t = X.thickness(st.cands[st.pick].pts, st.segs); if (t) back.querySelector('[name=t]').value = t; detect(); draw(); }
        });
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
      const h = Math.max(1800, Math.min(6000, +res.data.h || 2600)), t = Math.max(50, Math.min(400, +res.data.t || 120));
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
    // PDF：底圖直接用頁面影像（比例 = 紙面 mm × 比例分母）
    if (st.image) {
      const im = st.image, mmPerPx = im.paperW / im.w * k;
      App.mutate('匯入 PDF 底圖', s => { s.underlay = { src: im.src, w: im.w, h: im.h, scale: mmPerPx, x: Math.round((im.paperW / 2 - cx / k) * k), z: Math.round((cy / k - im.paperH / 2) * k), rot: 0, opacity: 0.75, visible: true, name: fname }; }, 'underlay');
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
    App.mutate('匯入 DXF 底圖', s => { s.underlay = { src, w: cv.width, h: cv.height, scale: 1 / sc, x: 0, z: 0, rot: 0, opacity: 0.8, visible: true, name: fname }; }, 'underlay');
    V().setView('top');
    App.toast('DXF 已轉成底圖（比例正確），按 L 沿牆線描出空間');
  };

  window.DxfIn = X;
})();
