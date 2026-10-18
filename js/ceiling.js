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
    access: { name: '檢修孔 45×45', group: 'hvac', unit: '處', price: 600 },
    smoke: { name: '偵煙探測器', group: 'elec', unit: '個', price: 1200 },
    sprinkler: { name: '灑水頭（移位）', group: 'elec', unit: '個', price: 1500 },
    cam: { name: '監視攝影機', group: 'elec', unit: '支', price: 2500 },
    spk: { name: '吸頂喇叭', group: 'elec', unit: '個', price: 1800 },
    exhaust: { name: '排風扇', group: 'elec', unit: '台', price: 2800 },
    heater: { name: '浴室暖風乾燥機（出線）', group: 'elec', unit: '處', price: 2500 },
    emerg: { name: '緊急照明燈', group: 'elec', unit: '盞', price: 1500 }
  };
  C.LINES = {
    alu: { name: '鋁槽燈', group: 'light', unit: '尺', price: 680 },
    track: { name: '軌道燈軌道', group: 'light', unit: '尺', price: 250 },
    supply: { name: '線型出風口', group: 'hvac', unit: '支', price: 1800 },
    ret: { name: '回風口', group: 'hvac', unit: '支', price: 1500 }
  };
  // 插座／開關（牆面）：room.outlets[{id, type, wall, offset, h}]
  C.OUTLETS = {
    socket: { name: '一般插座 110V', h: 300, price: 1200 },
    socket220: { name: '220V 插座', h: 300, price: 2200 },
    usb: { name: 'USB 插座', h: 900, price: 1500 },
    tv: { name: '電視出線', h: 450, price: 1200 },
    net: { name: '網路（C）', h: 300, price: 1500 },
    sw: { name: '開關（S）', h: 1200, price: 800 },
    floor: { name: '地板插座', h: 0, price: 2500 },
    waterproof: { name: '防水插座（附蓋）', h: 1200, price: 1500, grp: '插座' },
    dedicated: { name: '專用迴路插座', h: 300, price: 2500, grp: '插座' },
    sw2: { name: '雙切開關', h: 1200, price: 1000, grp: '開關' },
    sw3: { name: '三切開關', h: 1200, price: 1200, grp: '開關' },
    sw3way: { name: '三路開關（兩處控制）', h: 1200, price: 1500, grp: '開關' },
    dimmer: { name: '調光開關', h: 1200, price: 1800, grp: '開關' },
    tel: { name: '電話出線', h: 300, price: 1200, grp: '弱電' },
    speaker: { name: '音響喇叭出線', h: 2400, price: 1200, grp: '弱電' },
    intercom: { name: '對講機', h: 1450, price: 3500, grp: '弱電', size: [140, 220] },
    doorbell: { name: '門鈴按鈕', h: 1450, price: 800, grp: '弱電', size: [70, 110] },
    curtain: { name: '電動窗簾電源', h: 2600, price: 1200, grp: '弱電' },
    panel: { name: '電箱（配電盤）', h: 1800, price: 8000, grp: '電箱', size: [400, 600], depth: 110 },
    weakbox: { name: '弱電箱（網路／電視集中）', h: 1800, price: 3500, grp: '電箱', size: [300, 400], depth: 100 }
  };
  // 插座選單分組
  C.OUTLET_GROUPS = [['插座', ['socket', 'socket220', 'usb', 'dedicated', 'waterproof', 'floor']], ['開關', ['sw', 'sw2', 'sw3', 'sw3way', 'dimmer']], ['弱電', ['tv', 'net', 'tel', 'speaker', 'intercom', 'doorbell', 'curtain']], ['電箱', ['panel', 'weakbox']]];
  // 冷氣：room.acs[{id, name, kw, ix, iz, irot, ox, oz, oy, orot, via:[[x,z]]}]
  C.AC_KW = [2.2, 2.8, 3.6, 4.1, 5.0, 5.6, 6.3, 7.1, 8.0, 9.0, 10.0, 12.5, 14.0];
  C.acSpec = function (kw) {   // 常見 R32 分離式估計，實際以原廠安裝手冊為準
    if (kw <= 2.8) return { liq: '1/4"', gas: '3/8"', wire: '2.0mm²', brk: '15A', v: '220V' };
    if (kw <= 5.0) return { liq: '1/4"', gas: '1/2"', wire: '2.0mm²', brk: '20A', v: '220V' };
    if (kw <= 7.1) return { liq: '3/8"', gas: '5/8"', wire: '3.5mm²', brk: '30A', v: '220V' };
    return { liq: '3/8"', gas: '3/4"', wire: '5.5mm²', brk: '40A', v: '220V／三相' };
  };
  C.suggestKw = function (pts) { const ping = Math.abs(M().polyArea(pts)) / 3305785, need = ping * 0.6; return C.AC_KW.find(k => k >= need) || 14.0; };   // 約每坪 0.6kW（≈500 kcal/h）
  C.pipeH = (room, ac) => ac.ph || (C.ensure(room).h + 150);   // 冷媒管高度（預設天花上方 15cm）
  C.acRoute = ac => [[ac.ix, ac.iz], ...(ac.via || []), [ac.ox, ac.oz]];
  C.acLength = function (room, ac) {   // 冷媒管長：天花內水平 + 室外端垂直
    const r = C.acRoute(ac); let L = 0; for (let i = 1; i < r.length; i++) L += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
    const run = C.pipeH(room, ac); return L + Math.abs(run - ((ac.oy || 0) + 450)) + Math.abs(run - (C.ensure(room).h + 140));
  };
  C.MOLDINGS = [['none', '無線板'], ['flat', '平線板 50'], ['cove', '弧形線板 60'], ['crown', '歐式線板 80']];
  C.ensure = function (room) {
    if (!room.ceiling) room.ceiling = { on: true, h: Math.max(2200, room.height - 200), color: '#f4f3ef', paint: null, molding: 'none', zones: [], strips: [], fixtures: [] };
    const c = room.ceiling; c.zones = c.zones || []; c.strips = c.strips || []; c.fixtures = c.fixtures || [];
    room.outlets = room.outlets || []; room.acs = room.acs || []; room.circuits = room.circuits || [];
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
      } else if (C.FIX[T] && C.FIX[T].group === 'elec') {
        const wht = sMat('frame'), dk = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.4 });
        if (T === 'exhaust' || T === 'heater') { const s2 = T === 'heater' ? 300 : 250; addBox(g, s2, 12, s2, f.x, y - 6, f.z, wht, true); for (let i = -2; i <= 2; i++) addBox(g, s2 - 50, 3, 10, f.x, y - 13, f.z + i * (s2 / 6), dk, false); }
        else if (T === 'cam') { const b = new THREE.Mesh(new THREE.SphereGeometry(55, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), dk); b.rotation.x = Math.PI; b.position.set(f.x, y, f.z); g.add(b); const r2 = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 10, 20), wht); r2.position.set(f.x, y - 5, f.z); g.add(r2); }
        else if (T === 'emerg') addBox(g, 300, 50, 80, f.x, y - 25, f.z, wht, true);
        else { const r = T === 'spk' ? 90 : T === 'sprinkler' ? 30 : 55; const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, T === 'smoke' ? 40 : 10, 20), wht); m.position.set(f.x, y - (T === 'smoke' ? 20 : 5), f.z); g.add(m); if (T === 'sprinkler') { const d = new THREE.Mesh(new THREE.CylinderGeometry(12, 6, 40, 10), sMat('aluChampagne')); d.position.set(f.x, y - 25, f.z); g.add(d); } }
      } else if (T === 'ac') {   // 室內機藏在天花內，只在天花下畫出檢修口輪廓
        const a = addBox(g, 1000, 6, 600, f.x, y - 3, f.z, paintMat, true); a.rotation.y = (f.rot || 0) * Math.PI / 180;
      }
    });
    lights.slice(0, 24).forEach(([x, y, z, col, I]) => { const pl = new THREE.PointLight(col, I, 0, 2); pl.position.set(x, y, z); g.add(pl); });
    return g;
  };

  /* ---------- 3D：插座、冷氣系統 ---------- */
  C.buildMEP = function (room, THREE, helpers) {
    const g = new THREE.Group(); const { sMat, addBox } = helpers; C.ensure(room);
    const plate = new THREE.MeshStandardMaterial({ color: 0xf6f6f4, roughness: 0.5 }), dark = new THREE.MeshStandardMaterial({ color: 0x333333 });
    room.outlets.forEach(o => {
      const p = C.outletPos(room, o); if (!p) return;
      if (o.type === 'floor') { const m = addBox(g, 120, 6, 120, p.x, 3, p.z, sMat('frameSilver'), false); return; }
      const d0 = C.OUTLETS[o.type] || {}, sz = d0.size || [86, 86], dp = d0.depth || 8;
      const grp = new THREE.Group(); grp.position.set(p.x + p.nx * (dp / 2), o.h, p.z + p.nz * (dp / 2)); grp.rotation.y = p.rot;
      addBox(grp, sz[0], sz[1], dp, 0, 0, 0, o.type === 'panel' ? new THREE.MeshStandardMaterial({ color: 0xd8d8d4, roughness: 0.6 }) : plate, true);
      if (o.type === 'panel' || o.type === 'weakbox') { addBox(grp, 30, 8, 6, sz[0] / 2 - 40, 0, dp / 2 + 3, dark, false); g.add(grp); return; }
      if (o.type === 'intercom') { addBox(grp, 100, 70, 4, 0, 50, 6, new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.2 }), false); [-25, 0, 25].forEach(dx => addBox(grp, 16, 16, 4, dx, -60, 6, dark, false)); g.add(grp); return; }
      if (o.type === 'doorbell') { const c = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 6, 16), dark); c.rotation.x = Math.PI / 2; c.position.set(0, -15, 6); grp.add(c); g.add(grp); return; }
      if (/^(sw|sw2|sw3|sw3way|dimmer)$/.test(o.type)) { const n = { sw2: 2, sw3: 3 }[o.type] || 1; for (let i = 0; i < n; i++) addBox(grp, 60 / n - 4, 60, 4, -30 + (60 / n) * (i + 0.5), 0, 6, plate, true); if (o.type === 'dimmer') { const kb = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 10, 16), dark); kb.rotation.x = Math.PI / 2; kb.position.z = 8; grp.add(kb); } g.add(grp); return; }
      if (o.type === 'sw') addBox(grp, 40, 60, 4, 0, 0, 6, plate, true);
      else if (o.type === 'waterproof') addBox(grp, 80, 80, 14, 0, 0, 10, new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.3, transparent: true, opacity: 0.7 }), false);
      else if (o.type === 'tv' || o.type === 'net') { const c = new THREE.Mesh(new THREE.CircleGeometry(9, 12), dark); c.position.z = 4.5; grp.add(c); }
      else [-14, 14].forEach(dx => { const c = addBox(grp, 4, 12, 2, dx, 0, 4.5, dark, false); });
      g.add(grp);
    });
    const C0 = C.ensure(room);
    const ins = new THREE.MeshStandardMaterial({ color: 0xe9e9e6, roughness: 0.9 }), drainM = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.6 });
    const tube = (a, b, r, mat) => { const v = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = v.length(); if (L < 5) return; const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 10), mat); m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); m.castShadow = true; g.add(m); };
    room.acs.forEach(ac => {
      // 室內機（天花內）＋天花下檢修／回風框
      const ib = addBox(g, 1000, 250, 600, ac.ix, C0.h + 140, ac.iz, sMat('frame'), true); ib.rotation.y = (ac.irot || 0) * Math.PI / 180;
      const fr = addBox(g, 1040, 6, 640, ac.ix, C0.h - 3, ac.iz, sMat('frameSilver'), false); fr.rotation.y = ib.rotation.y;
      // 室外機
      const oy = ac.oy || 0, og = new THREE.Group(); og.position.set(ac.ox, oy, ac.oz); og.rotation.y = (ac.orot || 0) * Math.PI / 180;
      addBox(og, 800, 600, 300, 0, 300, 0, plate, true);
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(220, 220, 6, 28), dark); fan.rotation.x = Math.PI / 2; fan.position.set(-90, 300, 152); og.add(fan);
      if (oy > 0) addBox(og, 860, 30, 360, 0, -15, 0, sMat('frameBlack'), false);   // 壁掛架
      g.add(og);
      // 冷媒管（保溫）＋排水管：天花內沿路徑，室外端垂直到室外機
      const r = C.acRoute(ac), run = C.pipeH(room, ac);
      for (let i = 1; i < r.length; i++) { tube([r[i - 1][0], run, r[i - 1][1]], [r[i][0], run, r[i][1]], 32, ins); tube([r[i - 1][0], run - 60, r[i - 1][1]], [r[i][0], run - 60, r[i][1]], 14, drainM); }
      tube([ac.ox, run, ac.oz], [ac.ox, oy + 450, ac.oz], 32, ins);
      tube([ac.ix, C0.h + 140, ac.iz], [ac.ix, run, ac.iz], 32, ins);
    });
    return g;
  };

  /* ---------- 拖曳掣點（編輯模式）：回傳 [{key, x, y, z, color, small, apply(room,x,z,st), remove(room)}] ---------- */
  C.grips = function (room, opts = {}) {
    if (opts.ckt) {   // 迴路指派模式：只列可通電設備，顏色＝所屬迴路
      return C.cktItems(room).map(it => { const ck = C.cktOf(room, it.obj.ckt); const y = /^ol:/.test(it.key) ? (it.obj.h || 10) : /^ac:/.test(it.key) ? C.ensure(room).h : /^zv:/.test(it.key) ? it.obj.h : C.heightAt(room, it.x, it.z);
        const x = /^ol:/.test(it.key) ? it.x - (it.x - (C.outletPos(room, it.obj) || { x: it.x }).x) * 0.83 : it.x, z = /^ol:/.test(it.key) ? it.z - (it.z - (C.outletPos(room, it.obj) || { z: it.z }).z) * 0.83 : it.z;
        return { key: it.key, x, y, z, color: ck ? ck.color : '#9e9e9e', label: it.label + (ck ? '（' + ck.code + '）' : '（未指派）'), apply: () => {}, remove: () => {} }; });
    }
    const c = C.ensure(room), out = [], H = c.h;
    c.fixtures.forEach(f => out.push({ key: 'fx:' + f.id, x: f.x, y: C.heightAt(room, f.x, f.z), z: f.z, color: '#ff8f00', label: (C.FIX[f.type] || {}).name,
      apply: (rm, x, z) => { const o = rm.ceiling.fixtures.find(q => q.id === f.id); if (o) { o.x = x; o.z = z; } }, remove: rm => { rm.ceiling.fixtures = rm.ceiling.fixtures.filter(q => q.id !== f.id); } }));
    c.zones.forEach(zn => {
      if (!zn.pts) return;
      const n = zn.pts.length, y = zn.kind === 'box' ? H : zn.h;
      zn.pts.forEach((p, i) => {
        out.push({ key: `zv:${zn.id}:${i}`, x: p[0], y, z: p[1], color: '#2e9e4f', label: C.KINDS[zn.kind] + ' 頂點',
          apply: (rm, x, z) => { const o = rm.ceiling.zones.find(q => q.id === zn.id); if (o) o.pts[i] = [x, z]; },
          remove: rm => { const o = rm.ceiling.zones.find(q => q.id === zn.id); if (!o) return; if (o.pts.length > 3) o.pts.splice(i, 1); else rm.ceiling.zones = rm.ceiling.zones.filter(q => q.id !== zn.id); } });
        const q = zn.pts[(i + 1) % n];
        out.push({ key: `zm:${zn.id}:${i}`, x: (p[0] + q[0]) / 2, y, z: (p[1] + q[1]) / 2, color: '#9ad3a8', small: true, label: '拖曳新增頂點',
          apply: (rm, x, z, st) => { const o = rm.ceiling.zones.find(q2 => q2.id === zn.id); if (!o) return; if (!st.ins) { o.pts.splice(i + 1, 0, [x, z]); st.ins = true; } else o.pts[i + 1] = [x, z]; },
          remove: rm => { rm.ceiling.zones = rm.ceiling.zones.filter(q2 => q2.id !== zn.id); } });
      });
    });
    c.strips.forEach(st => ['1', '2'].forEach(e => out.push({ key: `st:${st.id}:${e}`, x: st['x' + e], y: C.heightAt(room, (st.x1 + st.x2) / 2, (st.z1 + st.z2) / 2), z: st['z' + e], color: '#1e88e5', label: (C.LINES[st.kind || 'alu'] || {}).name + ' 端點',
      apply: (rm, x, z) => { const o = rm.ceiling.strips.find(q => q.id === st.id); if (o) { o['x' + e] = x; o['z' + e] = z; } }, remove: rm => { rm.ceiling.strips = rm.ceiling.strips.filter(q => q.id !== st.id); } })));
    room.acs.forEach(ac => {
      const y = C.pipeH(room, ac), rm0 = rm => rm.acs.find(q => q.id === ac.id);
      out.push({ key: `ac:${ac.id}:in`, x: ac.ix, y: H, z: ac.iz, color: '#d0342c', label: (ac.name || '冷氣') + ' 室內機', apply: (rm, x, z) => { const o = rm0(rm); if (o) { o.ix = x; o.iz = z; } }, remove: rm => { rm.acs = rm.acs.filter(q => q.id !== ac.id); } });
      out.push({ key: `ac:${ac.id}:out`, x: ac.ox, y: (ac.oy || 0) + 600, z: ac.oz, color: '#d0342c', label: (ac.name || '冷氣') + ' 室外機', apply: (rm, x, z) => { const o = rm0(rm); if (o) { o.ox = x; o.oz = z; } }, remove: rm => { rm.acs = rm.acs.filter(q => q.id !== ac.id); } });
      (ac.via || []).forEach((p, i) => out.push({ key: `ac:${ac.id}:v${i}`, x: p[0], y, z: p[1], color: '#8d5a2b', label: '冷媒管轉折點', apply: (rm, x, z) => { const o = rm0(rm); if (o) o.via[i] = [x, z]; }, remove: rm => { const o = rm0(rm); if (o) o.via.splice(i, 1); } }));
      const r = C.acRoute(ac);
      for (let i = 1; i < r.length; i++) out.push({ key: `ac:${ac.id}:m${i}`, x: (r[i - 1][0] + r[i][0]) / 2, y, z: (r[i - 1][1] + r[i][1]) / 2, color: '#d7b48f', small: true, label: '拖曳新增管線轉折',
        apply: (rm, x, z, st) => { const o = rm0(rm); if (!o) return; o.via = o.via || []; if (!st.ins) { o.via.splice(i - 1, 0, [x, z]); st.ins = true; } else o.via[i - 1] = [x, z]; }, remove: () => {} });
    });
    room.outlets.forEach(ol => { const p = C.outletPos(room, ol); if (!p) return; out.push({ key: 'ol:' + ol.id, x: p.x + p.nx * 30, y: ol.type === 'floor' ? 10 : ol.h, z: p.z + p.nz * 30, color: '#c2185b', label: (C.OUTLETS[ol.type] || {}).name,
      apply: (rm, x, z) => { const o = rm.outlets.find(q => q.id === ol.id); if (!o) return; if (o.type === 'floor') { o.x = x; o.z = z; return; } const nw = C.nearestWall(rm, x, z); if (nw) { o.wall = nw.wall; o.offset = nw.offset; } }, remove: rm => { rm.outlets = rm.outlets.filter(q => q.id !== ol.id); } }); });
    return out;
  };
  C.addAC = function (room, a, b, kw, name, oy) { C.ensure(room); const ac = { id: uid('ac'), name: name || '冷氣', kw: kw || 3.6, ix: Math.round(a[0]), iz: Math.round(a[1]), irot: 0, ox: Math.round(b[0]), oz: Math.round(b[1]), oy: oy || 0, orot: 0, via: [[Math.round(b[0]), Math.round(a[1])]] }; room.acs.push(ac); return ac; };
  C.addOutlet = function (room, type, x, z, h) { C.ensure(room); const d = C.OUTLETS[type]; if (type === 'floor') { const o = { id: uid('ol'), type, x: Math.round(x), z: Math.round(z), h: 0 }; room.outlets.push(o); return o; } const nw = C.nearestWall(room, x, z); if (!nw) return null; const o = { id: uid('ol'), type, wall: nw.wall, offset: nw.offset, h: h != null ? h : d.h }; room.outlets.push(o); return o; };

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
  C.outletPos = function (room, o) {
    if (o.type === 'floor' && o.x != null) return { x: o.x, z: o.z, nx: 0, nz: 0, rot: 0 };
    if (o.wall == null || !room.walls[o.wall]) return null;
    const wi = M().wallInfo(room, o.wall);
    return { x: wi.p[0] + wi.dir[0] * o.offset, z: wi.p[1] + wi.dir[1] * o.offset, nx: wi.nIn[0], nz: wi.nIn[1], rot: Math.atan2(wi.nIn[0], wi.nIn[1]) };
  };
  // 依平面點找最近的牆，回傳 { wall, offset, dist }
  C.nearestWall = function (room, x, z) {
    let best = null;
    room.points.forEach((_, i) => { const wi = M().wallInfo(room, i); let t = (x - wi.p[0]) * wi.dir[0] + (z - wi.p[1]) * wi.dir[1]; t = Math.max(60, Math.min(wi.len - 60, t)); const px = wi.p[0] + wi.dir[0] * t, pz = wi.p[1] + wi.dir[1] * t, d = Math.hypot(x - px, z - pz); if (!best || d < best.dist) best = { wall: i, offset: Math.round(t / 10) * 10, dist: d }; });
    return best;
  };
  function osym(pg, type, x, y, sc = 1) {
    const g = pg.g, k = pg.k, col = '#d0342c';
    const circ = (r, fill) => { g.beginPath(); g.arc(x * k, y * k, r * k, 0, Math.PI * 2); g.fillStyle = fill || '#fff'; g.fill(); g.strokeStyle = col; g.lineWidth = 0.25 * k; g.stroke(); };
    if (type === 'socket' || type === 'socket220' || type === 'usb') { circ(1.4 * sc); pg.line(x - 0.45 * sc, y - 0.8 * sc, x - 0.45 * sc, y + 0.8 * sc, 0.25, col); pg.line(x + 0.45 * sc, y - 0.8 * sc, x + 0.45 * sc, y + 0.8 * sc, 0.25, col); if (type !== 'socket') pg.text(x, y - 2 * sc, type === 'usb' ? 'USB' : '220', { size: 3.6 * sc, color: col, align: 'center' }); }
    else if (type === 'tv' || type === 'net') { pg.rect(x - 1.6 * sc, y - 1.1 * sc, 3.2 * sc, 2.2 * sc, { w: 0.25, color: col, fill: '#fff' }); pg.text(x, y + 0.15 * sc, type === 'tv' ? 'TV' : 'C', { size: 4 * sc, color: col, align: 'center', base: 'middle' }); }
    else if (type === 'sw') { circ(1.4 * sc); pg.text(x, y + 0.15 * sc, 'S', { size: 4.6 * sc, color: col, align: 'center', base: 'middle' }); }
    else if (/^(sw2|sw3|sw3way|dimmer|doorbell)$/.test(type)) { circ(1.4 * sc); pg.text(x, y + 0.15 * sc, { sw2: 'S2', sw3: 'S3', sw3way: 'S₃', dimmer: 'D', doorbell: 'B' }[type], { size: 3.8 * sc, color: col, align: 'center', base: 'middle' }); }
    else if (type === 'waterproof' || type === 'dedicated') { circ(1.4 * sc); pg.line(x - 0.45 * sc, y - 0.8 * sc, x - 0.45 * sc, y + 0.8 * sc, 0.25, col); pg.line(x + 0.45 * sc, y - 0.8 * sc, x + 0.45 * sc, y + 0.8 * sc, 0.25, col); pg.text(x, y - 2 * sc, type === 'waterproof' ? 'WP' : '專', { size: 3.6 * sc, color: col, align: 'center' }); }
    else if (/^(tel|speaker|intercom|curtain)$/.test(type)) { pg.rect(x - 1.8 * sc, y - 1.1 * sc, 3.6 * sc, 2.2 * sc, { w: 0.25, color: '#6a1b9a', fill: '#fff' }); pg.text(x, y + 0.15 * sc, { tel: 'T', speaker: 'SP', intercom: 'IC', curtain: 'M' }[type], { size: 3.6 * sc, color: '#6a1b9a', align: 'center', base: 'middle' }); }
    else if (type === 'panel' || type === 'weakbox') { pg.rect(x - 2.6 * sc, y - 1.3 * sc, 5.2 * sc, 2.6 * sc, { w: 0.35, color: '#1f2328', fill: type === 'panel' ? '#3d4550' : '#e3d9ef' }); pg.text(x, y + 0.15 * sc, type === 'panel' ? '電箱' : '弱電', { size: 3.4 * sc, color: type === 'panel' ? '#fff' : '#6a1b9a', align: 'center', base: 'middle' }); }
    else if (type === 'floor') { circ(1.6 * sc, '#fde8e6'); pg.line(x - 1.1 * sc, y, x + 1.1 * sc, y, 0.25, col); pg.line(x, y - 1.1 * sc, x, y + 1.1 * sc, 0.25, col); }
  }
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
    else if (C.FIX[type] && C.FIX[type].group === 'elec') {
      const pc = '#6a1b9a', lab = { smoke: 'SD', sprinkler: '', cam: 'CAM', spk: 'SP', exhaust: 'EF', heater: 'H', emerg: 'EL' }[type];
      if (type === 'exhaust' || type === 'heater' || type === 'emerg') { pg.rect(x - 1.8 * sc, y - 1.4 * sc, 3.6 * sc, 2.8 * sc, { w: 0.25, color: pc, fill: '#fff' }); pg.text(x, y + 0.15 * sc, lab, { size: 3.4 * sc, color: pc, align: 'center', base: 'middle' }); }
      else if (type === 'sprinkler') { g.beginPath(); g.arc(x * k, y * k, 0.9 * sc * k, 0, Math.PI * 2); g.fillStyle = '#d0342c'; g.fill(); L(x - 1.5 * sc, y, x + 1.5 * sc, y, 0.2, '#d0342c'); L(x, y - 1.5 * sc, x, y + 1.5 * sc, 0.2, '#d0342c'); }
      else { circ(1.6 * sc, '#fff', pc); pg.text(x, y + 0.15 * sc, lab, { size: (lab.length > 2 ? 2.8 : 3.4) * sc, color: pc, align: 'center', base: 'middle' }); }
    }
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
    if (layer === 'power') {   // 插座配置圖
      C.ensure(room).fixtures.forEach(f => { if (C.FIX[f.type] && C.FIX[f.type].group === 'elec') { const q = P(f.x, f.z); sym(pg, f.type, q[0], q[1]); } });
      (room.outlets || []).forEach(o => { const p = C.outletPos(room, o); if (!p) return; const q = P(p.x + p.nx * 180, p.z + p.nz * 180); osym(pg, o.type, q[0], q[1]); pg.text(q[0] + 2.4, q[1] + 3.2, o.type === 'floor' ? '地插' : 'H=' + Math.round(o.h / 10), { size: 4.8, color: '#d0342c' }); });
      return;
    }
    if (layer === 'hvac') (room.acs || []).forEach(ac => {
      const r = C.acRoute(ac).map(p => P(p[0], p[1]));
      for (let i = 1; i < r.length; i++) pg.line(r[i - 1][0], r[i - 1][1], r[i][0], r[i][1], 0.55, '#1f5fd6', [2.2, 0.6, 0.5, 0.6]);
      const si = P(ac.ix, ac.iz); sym(pg, 'ac', si[0], si[1], 1.1);
      const so = P(ac.ox, ac.oz); pg.rect(so[0] - 4, so[1] - 2.5, 8, 5, { w: 0.35, color: '#1f5fd6', fill: '#eef4fd' }); pg.text(so[0], so[1] + 0.2, '室外機', { size: 4.6, color: '#1f5fd6', align: 'center', base: 'middle' });
      const sp = C.acSpec(ac.kw || 3.6), L = C.acLength(room, ac), mid = r[Math.floor(r.length / 2)], mid0 = r[Math.floor(r.length / 2) - 1] || r[0];
      const tx = (mid[0] + mid0[0]) / 2, ty = (mid[1] + mid0[1]) / 2;
      pg.rect(tx - 1, ty - 7.2, 46, 6.4, { fill: '#ffffff', stroke: false });
      pg.text(tx, ty - 4.4, `${ac.name || '冷氣'} ${ac.kw}kW　冷媒管 ${sp.liq}+${sp.gas}　L≈${(L / CHI).toFixed(1)}尺`, { size: 4.6, color: '#1f5fd6' });
      pg.text(tx, ty - 1.6, `電源 ${sp.v} ${sp.wire}　無熔絲 ${sp.brk}`, { size: 4.6, color: '#1f5fd6' });
    });
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
    if (group === 'power') { Object.entries(C.OUTLETS).forEach(([t, d]) => { const n = room.outlets.filter(o => o.type === t).length; if (n) out.push({ t, name: d.name, qty: n, unit: '處', kind: 'outlet' }); }); Object.entries(C.FIX).forEach(([t, d]) => { if (d.group !== 'elec') return; const n = c.fixtures.filter(f => f.type === t).length; if (n) out.push({ t, name: d.name, qty: n, unit: d.unit, kind: 'fix' }); }); return out; }
    if (group === 'hvac' && room.acs.length) { out.unshift({ t: 'acpipe', name: '冷媒管（含保溫、排水）', qty: +(room.acs.reduce((s2, a) => s2 + C.acLength(room, a), 0) / CHI).toFixed(1), unit: '尺', kind: 'acpipe' }); out.unshift({ t: 'acsys', name: '分離式冷氣（室內＋室外機）', qty: room.acs.length, unit: '組', kind: 'acsys' }); }
    if (group === 'light') { const cove = c.zones.filter(z => z.cove).reduce((s2, z) => s2 + perim(z.pts), 0); if (cove) out.unshift({ t: 'cove', name: '天花板 T5／LED 燈條（間接光）', qty: +(cove / CHI).toFixed(1), unit: '尺', kind: 'cove' }); }
    return out;
  };
  C.drawLegend = function (pg, room, x, y, layer = 'ceiling') {
    const c = C.ensure(room), g = pg.g, k = pg.k, hs = C.heightList(room);
    if (layer === 'lights' || layer === 'hvac' || layer === 'power') {
      const grp = { lights: 'light', hvac: 'hvac', power: 'power' }[layer];
      pg.rect(x - 2, y - 4, 52, 13 + C.counts(room, grp).length * 6, { fill: '#ffffff', stroke: false });
      pg.text(x, y, { lights: '天花板燈具與迴路圖例', hvac: '空調配置圖例', power: '插座配置圖例' }[layer], { size: 7.5, bold: true }); y += 3;
      pg.text(x, y + 3.5, '圖例', { size: 6, color: '#69727d' }); pg.text(x + 14, y + 3.5, '描述', { size: 6, color: '#69727d' }); pg.text(x + 44, y + 3.5, '數量', { size: 6, color: '#69727d', align: 'right' }); y += 5;
      C.counts(room, grp).forEach(r => {
        const cy = y + 2.6;
        if (r.kind === 'fix') sym(pg, r.t, x + 5, cy, 0.9);
        else if (r.kind === 'outlet') osym(pg, r.t, x + 5, cy, 0.9);
        else if (r.kind === 'acsys') { pg.rect(x + 1.5, cy - 1.6, 7, 3.2, { w: 0.3, color: '#1f5fd6', fill: '#eef4fd' }); }
        else if (r.kind === 'acpipe') pg.line(x + 1, cy, x + 9, cy, 0.55, '#1f5fd6', [2.2, 0.6, 0.5, 0.6]);
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
  C.UNITS = { CEIL: ['平釘天花', 3800, '坪'], CEILZONE: ['造型降板／高低差', 4800, '坪'], BEAM: ['包樑', 450, '尺'], CBOX: ['窗簾盒', 350, '尺'], COVE: ['間接光燈槽（木作）', 450, '尺'], LEDSTRIP: ['LED 燈條（含驅動）', 260, '尺'], MOLD: ['線板', 130, '尺'], ALUCH: ['鋁槽燈（含 LED）', 680, '尺'], CKT: ['新增迴路', 3500, '迴'] };
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
    if ((room.circuits || []).length) add('新增迴路（無熔絲＋配線）', room.circuits.length, u('CKT'), '迴', `${room.circuits.length} 迴`);
    ['light', 'hvac', 'power'].forEach(grp => C.counts(room, grp).forEach(r => {
      if (r.t === 'cove' || r.t === 'alu' || r.t === 'acsys') return;
      const key = 'CF_' + r.t, def = r.t === 'spot' ? 900 : r.t === 'acpipe' ? 350 : (C.FIX[r.t] || C.LINES[r.t] || C.OUTLETS[r.t] || {}).price || 0, up = parts[key] != null ? +parts[key] : def;
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
  /* ================= 迴路 ================= */
  // room.circuits[{id, code, name, type:L|C|E|A, v, brk, wire, color}]；設備以 .ckt 指向迴路 id
  C.CKT_TYPES = { L: { name: '照明', v: 110, brk: '15A', wire: '1.6mm' }, C: { name: '插座', v: 110, brk: '20A', wire: '2.0mm' }, E: { name: '專用迴路', v: 220, brk: '20A', wire: '3.5mm²' }, A: { name: '冷氣', v: 220, brk: '20A', wire: '3.5mm²' } };
  C.CKT_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00897b', '#f4511e', '#3949ab', '#c0ca33', '#6d4c41', '#d81b60', '#00acc1', '#7cb342', '#5e35b1', '#fdd835', '#546e7a'];
  const NOPOWER = new Set(['tv', 'net', 'tel', 'speaker', 'weakbox', 'panel', 'sw', 'sw2', 'sw3', 'sw3way', 'dimmer']);
  // 可指派迴路的設備：{ key(對應掣點), obj, x, z, layer, label }
  C.cktItems = function (room) {
    const c = C.ensure(room); room.circuits = room.circuits || []; const out = [];
    c.fixtures.forEach(f => { const d = C.FIX[f.type]; if (!d || f.type === 'sprinkler' || f.type === 'drain' || f.type === 'access' || f.type === 'ac' || f.type === 'smoke') return; out.push({ key: 'fx:' + f.id, obj: f, x: f.x, z: f.z, layer: d.group === 'light' ? 'lights' : d.group === 'elec' ? 'power' : 'hvac', label: d.name }); });
    c.strips.forEach(st => { const kd = st.kind || 'alu'; if (kd !== 'alu' && kd !== 'track') return; out.push({ key: 'st:' + st.id, obj: st, x: (st.x1 + st.x2) / 2, z: (st.z1 + st.z2) / 2, layer: 'lights', label: C.LINES[kd].name }); });
    c.zones.forEach(z => { if (!z.cove || !z.pts) return; out.push({ key: 'zv:' + z.id, obj: z, x: z.pts[0][0], z: z.pts[0][1], layer: 'lights', label: '間接光燈槽' }); });
    room.outlets.forEach(o => { if (NOPOWER.has(o.type)) return; const p = C.outletPos(room, o); if (!p) return; out.push({ key: 'ol:' + o.id, obj: o, x: p.x + p.nx * 180, z: p.z + p.nz * 180, layer: 'power', label: C.OUTLETS[o.type].name }); });
    room.acs.forEach(ac => out.push({ key: 'ac:' + ac.id, obj: ac, x: ac.ix, z: ac.iz, layer: 'hvac', label: (ac.name || '冷氣') + ' 室內機' }));
    return out;
  };
  // 掣點 key（fx:id / st:id:1 / zv:zid:0 / ol:id / ac:id:in）→ 設備
  C.cktItemByKey = function (room, key) { const p = key.split(':'), k2 = p[0] + ':' + p[1]; return C.cktItems(room).find(it => it.key === k2); };
  C.cktOf = (room, id) => (room.circuits || []).find(q => q.id === id);
  C.addCircuit = function (room, type) {
    room.circuits = room.circuits || []; const T = C.CKT_TYPES[type] || C.CKT_TYPES.C;
    const n = room.circuits.filter(q => q.type === type).length + 1;
    const used = new Set(room.circuits.map(q => q.color)), color = C.CKT_COLORS.find(cl => !used.has(cl)) || C.CKT_COLORS[room.circuits.length % C.CKT_COLORS.length];
    const ck = { id: uid('ck'), code: type + n, name: T.name + n, type, v: T.v, brk: T.brk, wire: T.wire, color }; room.circuits.push(ck); return ck;
  };
  C.removeCircuit = function (room, id) { room.circuits = (room.circuits || []).filter(q => q.id !== id); C.cktItems(room).forEach(it => { if (it.obj.ckt === id) delete it.obj.ckt; }); };
  // 自動分迴路：照明約 10 個一迴、插座依牆每 6 個一迴、220V／專用／暖風機各自一迴、冷氣依能力各一迴
  C.autoCircuits = function (room) {
    room.circuits = []; const items = C.cktItems(room); items.forEach(it => { delete it.obj.ckt; });
    const chunk = (list, size, type) => { for (let i = 0; i < list.length; i += size) { const ck = C.addCircuit(room, type); list.slice(i, i + size).forEach(it => { it.obj.ckt = ck.id; }); } };
    const sortXZ = l => l.sort((a, b) => Math.round(a.z / 1500) - Math.round(b.z / 1500) || a.x - b.x);
    const lights = sortXZ(items.filter(it => it.layer === 'lights' || (it.layer === 'power' && /^fx:/.test(it.key) && /^(exhaust|emerg)$/.test(it.obj.type))));
    // 同一個降板區的燈盡量同一迴
    const zones = C.ensure(room).zones.filter(z => z.pts && z.pts.length >= 3 && z.kind !== 'box');
    const zoneOf = it => { const i = zones.findIndex(z => M().pointInPoly(it.x, it.z, z.pts)); return i; };
    const byZone = new Map(); lights.forEach(it => { const k2 = zoneOf(it); if (!byZone.has(k2)) byZone.set(k2, []); byZone.get(k2).push(it); });
    byZone.forEach(l => chunk(l, 10, 'L'));
    const ded = items.filter(it => /^ol:/.test(it.key) && /^(socket220|dedicated)$/.test(it.obj.type) || (/^fx:/.test(it.key) && it.obj.type === 'heater'));
    ded.forEach(it => { const ck = C.addCircuit(room, 'E'); if (it.obj.type === 'dedicated') { ck.v = 110; ck.brk = '20A'; ck.wire = '2.0mm'; } it.obj.ckt = ck.id; ck.name = it.label; });
    const outs = items.filter(it => /^ol:/.test(it.key) && !it.obj.ckt);
    const byWall = new Map(); outs.forEach(it => { const k2 = it.obj.wall != null ? it.obj.wall : 'f'; if (!byWall.has(k2)) byWall.set(k2, []); byWall.get(k2).push(it); });
    const outsSorted = [].concat(...[...byWall.values()].map(l => l.sort((a, b) => (a.obj.offset || 0) - (b.obj.offset || 0))));
    chunk(outsSorted, 6, 'C');
    const misc = items.filter(it => it.layer === 'power' && /^fx:/.test(it.key) && !it.obj.ckt); if (misc.length) chunk(misc, 10, 'C');
    items.filter(it => /^ac:/.test(it.key)).forEach(it => { const ck = C.addCircuit(room, 'A'), sp = C.acSpec(it.obj.kw || 3.6); ck.brk = sp.brk; ck.wire = sp.wire; ck.name = (it.obj.name || '冷氣') + ' ' + it.obj.kw + 'kW'; it.obj.ckt = ck.id; });
    return room.circuits.length;
  };
  // 配線順序：最近鄰（從最靠近電箱的設備開始）
  function cktOrder(room, list) {
    if (list.length < 2) return list.slice();
    const pnl = room.outlets.find(o => o.type === 'panel'), pp = pnl && C.outletPos(room, pnl);
    const start = pp ? [pp.x, pp.z] : [list[0].x, list[0].z];
    const rest = list.slice(), out = [];
    let cur = start;
    while (rest.length) { let bi = 0, bd = Infinity; rest.forEach((it, i) => { const d = Math.hypot(it.x - cur[0], it.z - cur[1]); if (d < bd) { bd = d; bi = i; } }); const it = rest.splice(bi, 1)[0]; out.push(it); cur = [it.x, it.z]; }
    return out;
  }
  C.drawCircuits = function (pg, room, P, layer, phase) {
    const cs = room.circuits || []; if (!cs.length) return;
    const items = C.cktItems(room).filter(it => it.layer === layer && it.obj.ckt);
    const g = pg.g, k = pg.k;
    cs.forEach(ck => {
      const l = cktOrder(room, items.filter(it => it.obj.ckt === ck.id)); if (!l.length) return;
      if (phase === 'lines') {
        g.save(); g.strokeStyle = ck.color; g.globalAlpha = 0.85; g.lineWidth = 0.45 * k; g.setLineDash([1.6 * k, 0.8 * k]);
        g.beginPath(); l.forEach((it, i) => { const q = P(it.x, it.z); if (i) { const pq = P(l[i - 1].x, l[i - 1].z), mx = (pq[0] + q[0]) / 2, my = (pq[1] + q[1]) / 2, ox = -(q[1] - pq[1]) * 0.12, oy = (q[0] - pq[0]) * 0.12; g.quadraticCurveTo((mx + ox) * k, (my + oy) * k, q[0] * k, q[1] * k); } else g.moveTo(q[0] * k, q[1] * k); });
        g.stroke(); g.restore();
      } else {
        l.forEach((it, i) => { const q = P(it.x, it.z); g.save(); g.strokeStyle = ck.color; g.lineWidth = 0.5 * k; g.beginPath(); g.arc(q[0] * k, q[1] * k, 2.4 * k, 0, Math.PI * 2); g.stroke(); g.restore(); });
        const f = P(l[0].x, l[0].z);
        g.save(); g.fillStyle = ck.color; g.fillRect((f[0] + 2.2) * k, (f[1] - 5.6) * k, (ck.code.length * 1.9 + 1.6) * k, 3.2 * k); g.restore();
        pg.text(f[0] + 3, f[1] - 3.2, ck.code, { size: 5.2, bold: true, color: '#ffffff' });
      }
    });
  };
  C.circuitLoads = function (room, ck) { return C.cktItems(room).filter(it => it.obj.ckt === ck.id); };
  C.drawCircuitLegend = function (pg, room, x, y, layer) {
    const cs = (room.circuits || []).filter(ck => C.cktItems(room).some(it => it.layer === layer && it.obj.ckt === ck.id)); if (!cs.length) return y;
    y += 3; pg.rect(x - 2, y - 4, 52, 8 + cs.length * 5, { fill: '#ffffff', stroke: false });
    pg.text(x, y, '迴路', { size: 7, bold: true }); y += 2.5;
    cs.forEach(ck => { const n = C.cktItems(room).filter(it => it.layer === layer && it.obj.ckt === ck.id).length; pg.line(x + 1, y + 2, x + 9, y + 2, 0.6, ck.color, [1.6, 0.8]); pg.text(x + 11, y + 3, `${ck.code} ${ck.name}`, { size: 5.8, maxW: 26, color: ck.color, bold: true }); pg.text(x + 44, y + 3, `${n} 個`, { size: 5.8, align: 'right' }); y += 5; });
    return y;
  };
  // 配電盤迴路表
  C.drawCircuitTable = function (pg, room, x, y, w) {
    const cs = room.circuits || []; const cols = [['迴路', 16], ['名稱', 44], ['電壓', 16], ['無熔絲', 18], ['線徑', 20], ['負載', 0]];
    const fixed = cols.reduce((s2, c2) => s2 + c2[1], 0); cols[cols.length - 1][1] = w - fixed;
    const row = (vals, opt = {}) => { let cx = x; if (opt.fill) pg.rect(x, y, w, 7, { fill: opt.fill, stroke: false }); vals.forEach((v, i) => { pg.text(cx + 1.5, y + 4.8, String(v), { size: opt.size || 7, bold: !!opt.bold, color: opt.colors ? opt.colors[i] : '#1f2328', maxW: cols[i][1] - 2 }); cx += cols[i][1]; }); pg.line(x, y + 7, x + w, y + 7, 0.1, '#c9ced4'); y += 7; };
    row(cols.map(c2 => c2[0]), { bold: true, fill: '#eef0f3' });
    cs.forEach(ck => { const loads = C.circuitLoads(room, ck); const sum = {}; loads.forEach(it => { sum[it.label] = (sum[it.label] || 0) + 1; }); const txt = Object.entries(sum).map(([n2, q]) => `${n2}×${q}`).join('、') || '—';
      pg.rect(x + 0.8, y + 1.5, 3, 4, { fill: ck.color, stroke: false }); row([`   ${ck.code}`, ck.name, ck.v + 'V', ck.brk, ck.wire, txt], { colors: [ck.color, '#1f2328', '#1f2328', '#1f2328', '#1f2328', '#475467'] }); });
    pg.text(x, y + 6, `共 ${cs.length} 迴路　顏色＝各配置圖的迴路標示；線徑、無熔絲為一般住宅常用規格估計，實際依電機技師設計為準`, { size: 6, color: '#69727d' });
    return y;
  };
  // 包裝平面與圖例：加上迴路配線與標示
  const _drawPlan = C.drawPlan, _drawLegend = C.drawLegend;
  C.drawPlan = function (pg, room, P, poly, s, layer = 'ceiling') {
    const hasC = (room.circuits || []).length && (layer === 'lights' || layer === 'power' || layer === 'hvac');
    if (hasC) C.drawCircuits(pg, room, P, layer, 'lines');
    _drawPlan(pg, room, P, poly, s, layer);
    if (hasC) C.drawCircuits(pg, room, P, layer, 'marks');
  };
  C.drawLegend = function (pg, room, x, y, layer = 'ceiling') {
    let y2 = _drawLegend(pg, room, x, y, layer);
    if ((layer === 'lights' || layer === 'power' || layer === 'hvac') && (room.circuits || []).length) y2 = C.drawCircuitLegend(pg, room, x, y2, layer);
    return y2;
  };
  window.Ceiling = C;
})();
