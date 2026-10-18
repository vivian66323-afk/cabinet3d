/* 天花板：平釘天花、降板／包樑／窗簾盒／灑水頭下高區、間接光（燈槽）、線板、鋁槽燈
   資料：room.ceiling = { on, h(基本高 mm), color, paint, molding, zones:[{id, kind:'drop'|'beam'|'box'|'raise', pts:[[x,z]], h, cove, kelvin, label}], strips:[{id, x1,z1,x2,z2, w, kelvin}] }
   3D 由 Model.buildRoom 附掛；天花板配置圖由 Drawings.plan({ceiling:true}) 呼叫 drawPlan；報價由 Pricing.quote 呼叫 quoteLines */
(function () {
  const C = {};
  const M = () => window.Model, V = () => window.Viewer;
  const CHI = 303;   // 台尺 mm
  C.KINDS = { drop: '降板', beam: '包樑', box: '窗簾盒', raise: '灑水頭下（最高）' };
  // 天花設備：點狀 fixtures[{id,type,x,z,rot}]、線狀 strips[{kind:'alu'|'track'|'supply'|'return', ...}]
  C.FIX = {
    dl_big: { name: '大崁燈 Ø12', group: 'light', unit: '盞', price: 650 },
    dl_small: { name: '小崁燈 Ø9', group: 'light', unit: '盞', price: 450 },
    ar111: { name: 'AR111 盒燈（雙頭）', group: 'light', unit: '組', price: 2400 },
    pendant: { name: '吊燈出線位', group: 'light', unit: '處', price: 350 },
    wall_lt: { name: '壁燈出線位', group: 'light', unit: '處', price: 350 },
    ac: { name: '吊隱式冷氣（室內機）', group: 'hvac', unit: '台', price: 0 },
    drain: { name: '冷氣排水口', group: 'hvac', unit: '處', price: 0 },
    access: { name: '檢修孔 45×45', group: 'hvac', unit: '處', price: 600 }
  };
  C.LINES = {
    alu: { name: '鋁槽燈', group: 'light', unit: '尺', price: 680 },
    track: { name: '軌道燈軌道', group: 'light', unit: '尺', price: 250 },
    supply: { name: '線型出風口', group: 'hvac', unit: '支', price: 1800 },
    ret: { name: '回風口', group: 'hvac', unit: '支', price: 1500 }
  };
  C.MOLDINGS = [['none', '無線板'], ['flat', '平線板 50'], ['cove', '弧形線板 60'], ['crown', '歐式線板 80']];
  C.ensure = function (room) {
    if (!room.ceiling) room.ceiling = { on: true, h: Math.max(2200, room.height - 200), color: '#f4f3ef', paint: null, molding: 'none', zones: [], strips: [], fixtures: [] };
    const c = room.ceiling; c.zones = c.zones || []; c.strips = c.strips || []; c.fixtures = c.fixtures || [];
    c.strips.forEach(st => { if (!st.kind) st.kind = 'alu'; });
    return c;
  };
  const uid = p => (M() ? M().uid(p) : p + Math.random().toString(36).slice(2, 8));
  const area = pts => Math.abs(M().polyArea(pts));
  const perim = pts => pts.reduce((s, p, i) => s + Math.hypot(pts[(i + 1) % pts.length][0] - p[0], pts[(i + 1) % pts.length][1] - p[1]), 0);
  const centroid = pts => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
  // 多邊形往內偏移 d（各邊沿內法線平移後求相鄰交點）
  function offsetPoly(pts, d) {
    const n = pts.length, sign = M().polyArea(pts) > 0 ? 1 : -1, out = [];
    const lines = pts.map((p, i) => { const q = pts[(i + 1) % n]; const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1; const nx = -dz / L * sign, nz = dx / L * sign; return { p: [p[0] + nx * d, p[1] + nz * d], d: [dx / L, dz / L] }; });
    for (let i = 0; i < n; i++) {
      const a = lines[(i - 1 + n) % n], b = lines[i];
      const det = a.d[0] * b.d[1] - a.d[1] * b.d[0];
      if (Math.abs(det) < 1e-6) { out.push(b.p); continue; }
      const t = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / det;
      out.push([a.p[0] + a.d[0] * t, a.p[1] + a.d[1] * t]);
    }
    return out;
  }
  C.heightAt = function (room, x, z) {
    const c = C.ensure(room); let h = c.h;
    c.zones.forEach(zn => { if (zn.kind !== 'box' && M().pointInPoly(x, z, zn.pts)) h = zn.h; });
    return h;
  };
  C.zoneHeight = zn => zn.h;

  /* ---------- 3D ---------- */
  C.build = function (room, THREE, helpers) {
    const c = C.ensure(room); const g = new THREE.Group(); g.userData.ceilGroup = true; g.userData.h = c.h;
    if (!c.on) return g;
    const { sMat, addBox } = helpers;
    const white = window.App && App.renderMode === 'white';
    const paintMat = new THREE.MeshStandardMaterial({ color: white ? 0xf2f2f0 : (c.color || '#f4f3ef'), roughness: 0.95, side: THREE.DoubleSide });
    const lampsOn = !(V() && V().lampsOn === false);
    const lights = [];
    const KEL = { 2700: 0xffb86c, 3000: 0xffc78f, 4000: 0xffe3c7, 6500: 0xffffff };
    const shape = (pts, holes) => { const sh = new THREE.Shape(); pts.forEach((p, i) => i ? sh.lineTo(p[0], -p[1]) : sh.moveTo(p[0], -p[1])); (holes || []).forEach(hp => { const ph = new THREE.Path(); hp.forEach((p, i) => i ? ph.lineTo(p[0], -p[1]) : ph.moveTo(p[0], -p[1])); sh.holes.push(ph); }); return sh; };
    const slab = (pts, holes, y, th = 12) => { const geo = new THREE.ExtrudeGeometry(shape(pts, holes), { depth: th, bevelEnabled: false }); geo.rotateX(-Math.PI / 2); const m = new THREE.Mesh(geo, paintMat); m.position.y = y; m.receiveShadow = true; m.castShadow = true; g.add(m); return m; };
    // 垂直封板：沿邊 a→b，從 y0 到 y1，厚 10，往 side（內法線）方向半厚
    const fascia = (a, b, y0, y1, mat = paintMat) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1 || Math.abs(y1 - y0) < 1) return; const m = addBox(g, L, Math.abs(y1 - y0), 10, (a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2, mat, false); m.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); };
    const edgeLights = (pts, y, kelvin, inward = 60) => {
      const n = pts.length, sign = M().polyArea(pts) > 0 ? 1 : -1, col = KEL[kelvin] || KEL[2700];
      const em = new THREE.MeshBasicMaterial({ color: col });
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L * sign, nz = dx / L * sign;
        const m = addBox(g, L - 20, 14, 30, (a[0] + b[0]) / 2 + nx * inward, y, (a[1] + b[1]) / 2 + nz * inward, em, false); m.rotation.y = -Math.atan2(dz, dx);
        if (lampsOn) { const cnt = Math.max(1, Math.round(L / 1500)); for (let k = 0; k < cnt; k++) { const t = (k + 0.5) / cnt; lights.push([a[0] + dx * t + nx * 80, y + 60, a[1] + dz * t + nz * 80, col, 350000]); } }
      }
    };
    const holes = c.zones.filter(z => z.pts && z.pts.length >= 3).map(z => z.pts);
    slab(room.points, holes, c.h);
    c.zones.forEach(zn => {
      if (!zn.pts || zn.pts.length < 3) return;
      const n = zn.pts.length;
      if (zn.kind === 'box') {   // 窗簾盒：開口到樓板，內側封板由基本高往上到牆高
        for (let i = 0; i < n; i++) fascia(zn.pts[i], zn.pts[(i + 1) % n], c.h, room.height);
        return;
      }
      const lower = zn.h < c.h;
      if (lower && zn.cove) {
        const inner = offsetPoly(zn.pts, 100);   // 燈槽：封板內縮 100，留出光槽
        slab(inner, null, zn.h);
        for (let i = 0; i < n; i++) fascia(inner[i], inner[(i + 1) % n], zn.h, c.h);
        edgeLights(zn.pts, zn.h + 20, zn.kelvin || 2700, 50);
      } else {
        slab(zn.pts, null, zn.h);
        for (let i = 0; i < n; i++) fascia(zn.pts[i], zn.pts[(i + 1) % n], Math.min(zn.h, c.h), Math.max(zn.h, c.h));
      }
    });
    // 線板（沿牆內面，基本高處）
    if (c.molding && c.molding !== 'none') {
      const size = { flat: 50, cove: 60, crown: 80 }[c.molding] || 50, mMat = new THREE.MeshStandardMaterial({ color: white ? 0xf2f2f0 : 0xf7f6f2, roughness: 0.9 });
      room.points.forEach((_, i) => {
        const wi = M().wallInfo(room, i);
        const m = addBox(g, wi.len, size, size, wi.mid[0] + wi.nIn[0] * size / 2, c.h - size / 2, wi.mid[1] + wi.nIn[1] * size / 2, mMat, true);
        m.rotation.y = -Math.atan2(wi.dir[1], wi.dir[0]);
        if (c.molding === 'cove') { const q = addBox(g, wi.len, size * 0.7, size * 0.7, wi.mid[0] + wi.nIn[0] * size * 0.75, c.h - size * 0.75, wi.mid[1] + wi.nIn[1] * size * 0.75, mMat, false); q.rotation.y = m.rotation.y; q.rotation.x = Math.PI / 4; }
        if (c.molding === 'crown') { const q = addBox(g, wi.len, 20, size + 25, wi.mid[0] + wi.nIn[0] * (size + 25) / 2, c.h - size - 10, wi.mid[1] + wi.nIn[1] * (size + 25) / 2, mMat, false); q.rotation.y = m.rotation.y; }
      });
    }
    // 鋁槽燈
    const alu = sMat('frameSilver');
    const black = sMat('frameBlack'), grille = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.8 });
    c.strips.forEach(st => {
      const L = Math.hypot(st.x2 - st.x1, st.z2 - st.z1); if (L < 50) return;
      const mx = (st.x1 + st.x2) / 2, mz = (st.z1 + st.z2) / 2, y = C.heightAt(room, mx, mz), w = st.w || 30, rot = -Math.atan2(st.z2 - st.z1, st.x2 - st.x1), col = KEL[st.kelvin] || KEL[3000];
      if (st.kind === 'track') {   // 軌道 + 投射燈頭
        const tr = addBox(g, L, 18, 34, mx, y - 9, mz, black, false); tr.rotation.y = rot;
        const n = Math.max(1, st.heads || Math.round(L / 600));
        for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, hx = st.x1 + (st.x2 - st.x1) * t, hz = st.z1 + (st.z2 - st.z1) * t;
          const head = new THREE.Mesh(new THREE.CylinderGeometry(32, 38, 110, 18), black); head.position.set(hx, y - 90, hz); head.rotation.x = 0.35; g.add(head);
          const lens = new THREE.Mesh(new THREE.CircleGeometry(30, 18), new THREE.MeshBasicMaterial({ color: col })); lens.position.set(hx, y - 146, hz + 20); lens.rotation.x = Math.PI / 2 + 0.35; g.add(lens);
          if (lampsOn) lights.push([hx, y - 160, hz, col, 300000]); }
        return;
      }
      if (st.kind === 'supply' || st.kind === 'ret') {   // 線型出風口／回風口：深色百葉
        const bw = st.kind === 'ret' ? 300 : (w || 120);
        const fr = addBox(g, L, 6, bw, mx, y - 3, mz, sMat('frame'), false); fr.rotation.y = rot;
        const gr = addBox(g, L - 30, 4, bw - 30, mx, y - 5, mz, grille, false); gr.rotation.y = rot;
        return;
      }
      const ch = addBox(g, L, 14, w, mx, y + 6, mz, alu, false); ch.rotation.y = rot;
      const em = addBox(g, L - 4, 4, w - 8, mx, y - 2, mz, new THREE.MeshBasicMaterial({ color: col }), false); em.rotation.y = rot;
      if (lampsOn) { const cnt = Math.max(1, Math.round(L / 1000)); for (let k = 0; k < cnt; k++) { const t = (k + 0.5) / cnt; lights.push([st.x1 + (st.x2 - st.x1) * t, y - 30, st.z1 + (st.z2 - st.z1) * t, col, 450000]); } }
    });
    // 點狀設備
    c.fixtures.forEach(f => {
      const y = C.heightAt(room, f.x, f.z), T = f.type;
      if (T === 'dl_big' || T === 'dl_small') {
        const r = T === 'dl_big' ? 60 : 45;
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(r + 12, r + 12, 6, 24), sMat('frame')); rim.position.set(f.x, y - 3, f.z); g.add(rim);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: KEL[f.kelvin] || KEL[3000] })); lens.rotation.x = Math.PI / 2; lens.position.set(f.x, y - 7, f.z); g.add(lens);
        if (lampsOn) lights.push([f.x, y - 120, f.z, KEL[f.kelvin] || KEL[3000], T === 'dl_big' ? 260000 : 180000]);
      } else if (T === 'ar111') {
        const bx = addBox(g, 330, 10, 180, f.x, y - 5, f.z, black, false); bx.rotation.y = (f.rot || 0) * Math.PI / 180;
        [-1, 1].forEach(k => { const lens = new THREE.Mesh(new THREE.CircleGeometry(55, 20), new THREE.MeshBasicMaterial({ color: KEL[3000] })); lens.rotation.x = Math.PI / 2; const a = (f.rot || 0) * Math.PI / 180; lens.position.set(f.x + Math.cos(a) * k * 80, y - 11, f.z - Math.sin(a) * k * 80); g.add(lens); });
        if (lampsOn) lights.push([f.x, y - 150, f.z, KEL[3000], 380000]);
      } else if (T === 'pendant') {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(55, 55, 18, 20), sMat('frame')); base.position.set(f.x, y - 9, f.z); g.add(base);
      } else if (T === 'access') {
        const a = addBox(g, 450, 6, 450, f.x, y - 3, f.z, paintMat, true); a.material = paintMat;
        const e = addBox(g, 470, 4, 470, f.x, y - 1, f.z, sMat('frameSilver'), false); e.scale.set(1, 1, 1);
      } else if (T === 'ac') {   // 室內機藏在天花內，只在天花下畫出檢修口輪廓
        const a = addBox(g, 1000, 6, 600, f.x, y - 3, f.z, paintMat, true); a.rotation.y = (f.rot || 0) * Math.PI / 180;
      }
    });
    lights.slice(0, 24).forEach(([x, y, z, col, I]) => { const pl = new THREE.PointLight(col, I, 0, 2); pl.position.set(x, y, z); g.add(pl); });
    return g;
  };

  /* ---------- 天花板配置圖 ---------- */
  const PALETTE = ['#2d7dd2', '#d2691e', '#8e44ad', '#27ae60', '#c0392b', '#16a085', '#7f8c8d', '#b7950b'];
  function hatch(g, k, color, step = 2.2, angle = 45) {
    const c = document.createElement('canvas'); const sz = Math.max(4, Math.round(step * k)); c.width = c.height = sz; const x = c.getContext('2d');
    x.strokeStyle = color; x.lineWidth = Math.max(1, 0.18 * k); x.beginPath();
    if (angle === 45) { x.moveTo(0, sz); x.lineTo(sz, 0); x.moveTo(-sz / 2, sz / 2); x.lineTo(sz / 2, -sz / 2); x.moveTo(sz / 2, sz * 1.5); x.lineTo(sz * 1.5, sz / 2); }
    else { x.moveTo(0, 0); x.lineTo(sz, sz); x.moveTo(-sz / 2, sz / 2); x.lineTo(sz / 2, sz * 1.5); x.moveTo(sz / 2, -sz / 2); x.lineTo(sz * 1.5, sz / 2); }
    x.stroke(); return g.createPattern(c, 'repeat');
  }
  C.heightList = function (room) {
    const c = C.ensure(room); const hs = new Set([c.h]); c.zones.forEach(z => { if (z.kind !== 'box') hs.add(z.h); });
    return [...hs].sort((a, b) => b - a);
  };
  // 圖例符號（頁面 mm 座標）
  function sym(pg, type, x, y, sc = 1) {
    const g = pg.g, k = pg.k, L = (x1, y1, x2, y2, w = 0.25, col = '#1f2328') => pg.line(x1, y1, x2, y2, w, col);
    const circ = (r, fill, col = '#1f2328', w = 0.25) => { g.beginPath(); g.arc(x * k, y * k, r * k, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } g.strokeStyle = col; g.lineWidth = w * k; g.stroke(); };
    if (type === 'dl_big' || type === 'dl_small') { const r = (type === 'dl_big' ? 1.6 : 1.15) * sc; circ(r, '#fff'); L(x - r * 1.6, y, x + r * 1.6, y); L(x, y - r * 1.6, x, y + r * 1.6); if (type === 'dl_big') circ(r * 0.45, '#1f2328'); }
    else if (type === 'ar111') { [-1.4, 1.4].forEach(dx => { g.beginPath(); g.arc((x + dx * sc) * k, y * k, 1.1 * sc * k, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#1f2328'; g.lineWidth = 0.25 * k; g.stroke(); }); pg.rect(x - 2.8 * sc, y - 1.5 * sc, 5.6 * sc, 3 * sc, { w: 0.25 }); L(x - 2.8 * sc, y, x + 2.8 * sc, y, 0.2); }
    else if (type === 'pendant') { circ(1.7 * sc, '#fff'); circ(0.8 * sc, null); L(x + 0.8 * sc, y - 1.2 * sc, x + 1.9 * sc, y - 2.2 * sc); }
    else if (type === 'wall_lt') { circ(1.1 * sc, '#fff'); L(x, y + 1.1 * sc, x, y + 2.4 * sc); L(x - 1.6 * sc, y + 2.4 * sc, x + 1.6 * sc, y + 2.4 * sc); }
    else if (type === 'ac') { pg.rect(x - 2.6 * sc, y - 2.6 * sc, 5.2 * sc, 5.2 * sc, { w: 0.3, color: '#d0342c' }); L(x - 2.6 * sc, y + 2.6 * sc, x + 2.6 * sc, y - 2.6 * sc, 0.3, '#d0342c'); pg.text(x - 1.6 * sc, y - 0.2 * sc, 'A', { size: 6 * sc, color: '#d0342c', align: 'center', base: 'middle' }); pg.text(x + 1.4 * sc, y + 1.4 * sc, 'C', { size: 6 * sc, color: '#d0342c', align: 'center', base: 'middle' }); }
    else if (type === 'drain') { circ(0.8 * sc, '#fff', '#1f5fd6'); L(x + 0.8 * sc, y, x + 3.2 * sc, y, 0.25, '#1f5fd6'); }
    else if (type === 'access') { pg.rect(x - 1.8 * sc, y - 1.8 * sc, 3.6 * sc, 3.6 * sc, { w: 0.25 }); L(x - 1.8 * sc, y - 1.8 * sc, x + 1.8 * sc, y + 1.8 * sc, 0.2); L(x - 1.8 * sc, y + 1.8 * sc, x + 1.8 * sc, y - 1.8 * sc, 0.2); }
  }
  function lineSym(pg, kind, A, B) {
    if (kind === 'alu') { pg.line(A[0], A[1], B[0], B[1], 1.1, '#1e88e5'); pg.line(A[0], A[1], B[0], B[1], 0.5, '#ffffff'); }
    else if (kind === 'track') { pg.line(A[0], A[1], B[0], B[1], 0.35, '#1f2328', [1.2, 0.6]); }
    else if (kind === 'supply' || kind === 'ret') {
      const col = kind === 'supply' ? '#b02bc4' : '#2e7d32', dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * 0.7, ny = dx / L * 0.7;
      pg.line(A[0] + nx, A[1] + ny, B[0] + nx, B[1] + ny, 0.35, col); pg.line(A[0] - nx, A[1] - ny, B[0] - nx, B[1] - ny, 0.35, col);
      pg.line(A[0] + nx, A[1] + ny, A[0] - nx, A[1] - ny, 0.35, col); pg.line(B[0] + nx, B[1] + ny, B[0] - nx, B[1] - ny, 0.35, col);
    }
  }
  C.drawPlan = function (pg, room, P, poly, s, layer = 'ceiling') {
    const c = C.ensure(room), g = pg.g, k = pg.k;
    if (layer === 'lights' || layer === 'hvac') {   // 燈具／空調配置圖：天花造型只畫淡綠輪廓
      const grp = layer === 'lights' ? 'light' : 'hvac';
      c.zones.forEach(zn => { if (zn.pts && zn.pts.length >= 3) { poly(zn.pts, null, '#2e9e4f', 0.25); if (zn.cove && layer === 'lights') { const inn = offsetPoly(zn.pts, 100); poly(inn, null, '#d0342c', 0.6); } } });
      c.strips.forEach(st => { const kd = st.kind || 'alu'; if (C.LINES[kd].group !== grp) return; const A = P(st.x1, st.z1), B = P(st.x2, st.z2); lineSym(pg, kd, A, B);
        if (kd === 'track') { const n = Math.max(1, st.heads || Math.round(Math.hypot(st.x2 - st.x1, st.z2 - st.z1) / 600)); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; const q = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]; g.beginPath(); g.moveTo(q[0] * k, (q[1] - 1.2) * k); g.lineTo((q[0] + 1) * k, (q[1] + 0.8) * k); g.lineTo((q[0] - 1) * k, (q[1] + 0.8) * k); g.closePath(); g.fillStyle = '#1f2328'; g.fill(); } } });
      c.fixtures.forEach(f => { if (C.FIX[f.type] && C.FIX[f.type].group === grp) { const q = P(f.x, f.z); sym(pg, f.type, q[0], q[1]); } });
      return;
    }
    const hs = C.heightList(room), colorOf = h => PALETTE[hs.indexOf(h) % PALETTE.length];
    const cm = h => 'H=' + Math.round(h / 10);
    // 基本天花（整間）
    poly(room.points, hatch(g, k, colorOf(c.h)), '#1f2328', 0.2);
    c.zones.forEach(zn => {
      if (!zn.pts || zn.pts.length < 3) return;
      if (zn.kind === 'box') { poly(zn.pts, hatch(g, k, '#c2185b', 1.6, 135), '#c2185b', 0.3); const ct = P(...centroid(zn.pts)); pg.text(ct[0], ct[1] + 1, '窗簾盒', { size: 5, color: '#c2185b', align: 'center', base: 'middle' }); return; }
      poly(zn.pts, '#ffffff', null); poly(zn.pts, hatch(g, k, colorOf(zn.h), 2.2, zn.kind === 'beam' ? 135 : 45), zn.kind === 'beam' ? '#8e44ad' : '#1f2328', 0.3);
      if (zn.cove) poly(zn.pts, null, '#e67e22', 0.6, [1.4, 0.8]);
      const ct = P(...centroid(zn.pts));
      pg.text(ct[0], ct[1] + 1, cm(zn.h) + (zn.kind === 'beam' ? '(包樑)' : zn.kind === 'raise' ? '(灑水頭下)' : '') + (zn.cove ? ' 間接光' : ''), { size: 5.5, color: '#c0392b', align: 'center', base: 'middle', bold: true });
    });
    c.strips.forEach(st => { const A = P(st.x1, st.z1), B = P(st.x2, st.z2); pg.line(A[0], A[1], B[0], B[1], 1.1, '#1e88e5'); pg.line(A[0], A[1], B[0], B[1], 0.5, '#ffffff'); const L = Math.hypot(st.x2 - st.x1, st.z2 - st.z1); pg.text((A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - 1.6, `鋁槽燈 ${Math.round(L / 10)}cm`, { size: 4.6, color: '#1e88e5', align: 'center' }); });
    // 基本高標示：放在空間重心（若在某區內則略過）
    const ctr = centroid(room.points);
    if (!c.zones.some(z => z.pts && z.pts.length >= 3 && M().pointInPoly(ctr[0], ctr[1], z.pts))) { const q = P(...ctr); pg.text(q[0], q[1], cm(c.h) + ' 平釘', { size: 6, color: '#c0392b', align: 'center', base: 'middle', bold: true }); }
    if (c.molding && c.molding !== 'none') poly(offsetPoly(room.points, 60), null, '#7f8c8d', 0.25, [0.8, 0.6]);
  };
  C.counts = function (room, group) {
    const c = C.ensure(room), out = [];
    Object.entries(C.FIX).forEach(([t, d]) => { if (d.group !== group) return; const n = c.fixtures.filter(f => f.type === t).length; if (n) out.push({ t, name: d.name, qty: n, unit: d.unit, kind: 'fix' }); });
    Object.entries(C.LINES).forEach(([t, d]) => { if (d.group !== group) return; const l = c.strips.filter(st => (st.kind || 'alu') === t); if (!l.length) return;
      if (d.unit === '尺') out.push({ t, name: d.name, qty: +(l.reduce((s2, st) => s2 + Math.hypot(st.x2 - st.x1, st.z2 - st.z1), 0) / CHI).toFixed(1), unit: '尺', kind: 'line' });
      else out.push({ t, name: d.name, qty: l.length, unit: d.unit, kind: 'line' });
      if (t === 'track') out.push({ t: 'spot', name: '軌道投射燈', qty: l.reduce((s2, st) => s2 + Math.max(1, st.heads || Math.round(Math.hypot(st.x2 - st.x1, st.z2 - st.z1) / 600)), 0), unit: '顆', kind: 'spot' }); });
    if (group === 'light') { const cove = c.zones.filter(z => z.cove).reduce((s2, z) => s2 + perim(z.pts), 0); if (cove) out.unshift({ t: 'cove', name: '天花板 T5／LED 燈條（間接光）', qty: +(cove / CHI).toFixed(1), unit: '尺', kind: 'cove' }); }
    return out;
  };
  C.drawLegend = function (pg, room, x, y, layer = 'ceiling') {
    const c = C.ensure(room), g = pg.g, k = pg.k, hs = C.heightList(room);
    if (layer === 'lights' || layer === 'hvac') {
      pg.rect(x - 2, y - 4, 52, 13 + C.counts(room, layer === 'lights' ? 'light' : 'hvac').length * 6, { fill: '#ffffff', stroke: false });
      pg.text(x, y, layer === 'lights' ? '天花板燈具與迴路圖例' : '空調配置圖例', { size: 7.5, bold: true }); y += 3;
      pg.text(x, y + 3.5, '圖例', { size: 6, color: '#69727d' }); pg.text(x + 14, y + 3.5, '描述', { size: 6, color: '#69727d' }); pg.text(x + 44, y + 3.5, '數量', { size: 6, color: '#69727d', align: 'right' }); y += 5;
      C.counts(room, layer === 'lights' ? 'light' : 'hvac').forEach(r => {
        const cy = y + 2.6;
        if (r.kind === 'fix') sym(pg, r.t, x + 5, cy, 0.9);
        else if (r.kind === 'cove') pg.line(x + 1, cy, x + 9, cy, 0.6, '#d0342c');
        else if (r.kind === 'spot') { g.beginPath(); g.moveTo((x + 5) * k, (cy - 1.2) * k); g.lineTo((x + 6) * k, (cy + 0.8) * k); g.lineTo((x + 4) * k, (cy + 0.8) * k); g.closePath(); g.fillStyle = '#1f2328'; g.fill(); }
        else lineSym(pg, r.t, [x + 1, cy], [x + 9, cy]);
        pg.text(x + 14, cy + 1, r.name, { size: 6.2, maxW: 28 }); pg.text(x + 44, cy + 1, `${r.qty} ${r.unit}`, { size: 6.2, align: 'right' });
        pg.line(x, y + 5.6, x + 46, y + 5.6, 0.1, '#c9ced4'); y += 6;
      });
      return y;
    }
    { const extra = ['beam', 'box'].filter(kk => c.zones.some(z => z.kind === kk)).length + (c.zones.some(z => z.cove) ? 1 : 0) + (c.strips.length ? 1 : 0) + (c.molding && c.molding !== 'none' ? 1 : 0); pg.rect(x - 2, y - 4, 52, 14 + (hs.length + extra) * 6.5, { fill: '#ffffff', stroke: false }); }
    pg.text(x, y, '天花板高層圖例', { size: 7.5, bold: true }); y += 3;
    pg.text(x, y + 3.5, '圖例', { size: 6, color: '#69727d' }); pg.text(x + 16, y + 3.5, '高層（cm）', { size: 6, color: '#69727d' }); y += 5;
    const row = (fill, stroke, label, dash) => { g.save(); g.fillStyle = fill || '#fff'; g.fillRect(x * k, y * k, 12 * k, 5 * k); g.restore(); pg.rect(x, y, 12, 5, { color: stroke || '#1f2328', w: 0.25, dash }); pg.text(x + 16, y + 3.6, label, { size: 6.5 }); y += 6.5; };
    hs.forEach(h => row(hatch(g, k, PALETTE[hs.indexOf(h) % PALETTE.length]), '#1f2328', `${Math.round(h / 10)}${h === c.h ? '（平釘）' : ''}`));
    if (c.zones.some(z => z.kind === 'beam')) row(hatch(g, k, '#8e44ad', 2.2, 135), '#8e44ad', '包樑');
    if (c.zones.some(z => z.kind === 'box')) row(hatch(g, k, '#c2185b', 1.6, 135), '#c2185b', '窗簾盒');
    if (c.zones.some(z => z.cove)) row('#fff', '#e67e22', '間接光燈槽', [1.4, 0.8]);
    if (c.strips.length) { pg.line(x, y + 2.5, x + 12, y + 2.5, 1.1, '#1e88e5'); pg.text(x + 16, y + 3.6, `鋁槽燈 ×${c.strips.length}`, { size: 6.5 }); y += 6.5; }
    if (c.molding && c.molding !== 'none') row('#fff', '#7f8c8d', '線板 ' + C.MOLDINGS.find(m => m[0] === c.molding)[1], [0.8, 0.6]);
    return y;
  };

  /* ---------- 報價 ---------- */
  C.UNITS = { CEIL: ['平釘天花', 3800, '坪'], CEILZONE: ['造型降板／高低差', 4800, '坪'], BEAM: ['包樑', 450, '尺'], CBOX: ['窗簾盒', 350, '尺'], COVE: ['間接光燈槽（木作）', 450, '尺'], LEDSTRIP: ['LED 燈條（含驅動）', 260, '尺'], MOLD: ['線板', 130, '尺'], ALUCH: ['鋁槽燈（含 LED）', 680, '尺'] };
  C.quoteLines = function (room, pricing) {
    if (!room || !room.ceiling || !room.ceiling.on) return [];
    const c = room.ceiling, parts = (pricing && pricing.parts) || {}, u = k => parts[k] != null ? +parts[k] : C.UNITS[k][1];
    const lines = [], add = (name, qty, unit, unitName, qtyTxt) => { if (qty > 0) lines.push({ name: `${name} ${qtyTxt}`, amount: Math.round(qty * unit), qty, unit, unitName }); };
    const ping = mm2 => mm2 / 3305785;
    let zoneArea = 0, beamLen = 0, boxLen = 0, coveLen = 0;
    c.zones.forEach(z => { if (!z.pts || z.pts.length < 3) return; if (z.kind === 'box') { boxLen += perim(z.pts) / 2; return; } if (z.kind === 'beam') { beamLen += Math.max(...[0, 1].map(i => Math.hypot(z.pts[(i + 1) % z.pts.length][0] - z.pts[i][0], z.pts[(i + 1) % z.pts.length][1] - z.pts[i][1]))); } else zoneArea += area(z.pts); if (z.cove) coveLen += perim(z.pts); });
    const total = area(room.points), flat = Math.max(0, total - zoneArea);
    add(C.UNITS.CEIL[0], +ping(flat).toFixed(2), u('CEIL'), '坪', `${ping(flat).toFixed(2)} 坪`);
    add(C.UNITS.CEILZONE[0], +ping(zoneArea).toFixed(2), u('CEILZONE'), '坪', `${ping(zoneArea).toFixed(2)} 坪`);
    add(C.UNITS.BEAM[0], +(beamLen / CHI).toFixed(1), u('BEAM'), '尺', `${(beamLen / CHI).toFixed(1)} 尺`);
    add(C.UNITS.CBOX[0], +(boxLen / CHI).toFixed(1), u('CBOX'), '尺', `${(boxLen / CHI).toFixed(1)} 尺`);
    add(C.UNITS.COVE[0], +(coveLen / CHI).toFixed(1), u('COVE'), '尺', `${(coveLen / CHI).toFixed(1)} 尺`);
    add(C.UNITS.LEDSTRIP[0], +(coveLen / CHI).toFixed(1), u('LEDSTRIP'), '尺', `${(coveLen / CHI).toFixed(1)} 尺`);
    if (c.molding && c.molding !== 'none') add(C.UNITS.MOLD[0], +(perim(room.points) / CHI).toFixed(1), u('MOLD'), '尺', `${(perim(room.points) / CHI).toFixed(1)} 尺`);
    const alu = c.strips.filter(st => (st.kind || 'alu') === 'alu').reduce((s, st) => s + Math.hypot(st.x2 - st.x1, st.z2 - st.z1), 0);
    add(C.UNITS.ALUCH[0], +(alu / CHI).toFixed(1), u('ALUCH'), '尺', `${(alu / CHI).toFixed(1)} 尺`);
    ['light', 'hvac'].forEach(grp => C.counts(room, grp).forEach(r => {
      if (r.t === 'cove' || r.t === 'alu') return;
      const key = 'CF_' + r.t, def = r.t === 'spot' ? 900 : (C.FIX[r.t] || C.LINES[r.t] || {}).price || 0, up = parts[key] != null ? +parts[key] : def;
      if (up > 0) add(r.name, r.qty, up, r.unit, `${r.qty} ${r.unit}`);
    }));
    return lines;
  };

  /* ---------- 編輯：自動窗簾盒、新增區域 ---------- */
  C.addCurtainBoxes = function (room, depth = 180) {
    const c = C.ensure(room); let n = 0;
    room.points.forEach((_, i) => {
      const w = room.walls[i]; if (!w.openings.some(o => o.type === 'window' || /^(balcony3|aluglass|patio2|patio4|bifold)$/.test(o.style || ''))) return;
      const wi = M().wallInfo(room, i);
      const a = wi.p, b = wi.q, ai = [a[0] + wi.nIn[0] * depth, a[1] + wi.nIn[1] * depth], bi = [b[0] + wi.nIn[0] * depth, b[1] + wi.nIn[1] * depth];
      if (c.zones.some(z => z.kind === 'box' && z.wall === i)) return;
      c.zones.push({ id: uid('cz'), kind: 'box', wall: i, pts: [a.slice(), b.slice(), bi, ai], h: c.h, cove: false }); n++;
    });
    return n;
  };
  C.addZone = function (room, kind, pts, h, cove) {
    const c = C.ensure(room); const z = { id: uid('cz'), kind, pts: pts.map(p => [Math.round(p[0]), Math.round(p[1])]), h, cove: !!cove, kelvin: 2700 }; c.zones.push(z); return z;
  };
  C.addBeam = function (room, a, b, w, h) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L * w / 2, nz = dx / L * w / 2;
    return C.addZone(room, 'beam', [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]], h, false);
  };
  C.addStrip = function (room, a, b, w = 30, kelvin = 3000, kind = 'alu') { const c = C.ensure(room); const st = { id: uid('cs'), kind, x1: Math.round(a[0]), z1: Math.round(a[1]), x2: Math.round(b[0]), z2: Math.round(b[1]), w: kind === 'supply' ? 120 : w, kelvin }; c.strips.push(st); return st; };
  C.addFixture = function (room, type, p, extra = {}) { const c = C.ensure(room); const f = { id: uid('cf'), type, x: Math.round(p[0]), z: Math.round(p[1]), kelvin: 3000, ...extra }; c.fixtures.push(f); return f; };
  // 等距排一排：a→b 兩端點之間放 n 顆（含兩端）
  C.addRow = function (room, type, a, b, n) { const out = []; n = Math.max(1, Math.min(60, n | 0)); for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); out.push(C.addFixture(room, type, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])); } return out; };
  // 一個區域內排成矩陣（崁燈常用）：pts 為區域，間距 gap，離邊 margin
  C.addGrid = function (room, type, pts, gap, margin) {
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]), x0 = Math.min(...xs) + margin, x1 = Math.max(...xs) - margin, z0 = Math.min(...zs) + margin, z1 = Math.max(...zs) - margin;
    const nx = Math.max(1, Math.round((x1 - x0) / gap) + 1), nz = Math.max(1, Math.round((z1 - z0) / gap) + 1), out = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const x = nx === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (nx - 1), z = nz === 1 ? (z0 + z1) / 2 : z0 + (z1 - z0) * j / (nz - 1); if (M().pointInPoly(x, z, pts)) out.push(C.addFixture(room, type, [x, z])); }
    return out;
  };
  window.Ceiling = C;
})();
