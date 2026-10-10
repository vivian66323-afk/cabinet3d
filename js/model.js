/* 櫃體 / 空間資料模型與 3D 建構 */
(function () {
  const D = window.DATA;
  const B = D.BOARD;
  let THREE;
  const uid = (p = 'c') => p + Math.random().toString(36).slice(2, 9);

  /* ================= 資料 ================= */
  function rowsWithFiller(cab) {
    const sum = cab.fronts.reduce((s, r) => s + r.h, 0);
    const rows = cab.fronts.map(r => ({ ...r }));
    const rest = Math.round(cab.h / 10 - sum);
    if (rest > 0) rows.unshift({ t: 'O', h: rest, filler: true });
    return rows;
  }

  // 依門片配置產生預設層板（shelf.y = 層板底面距櫃體底部 mm）
  function genShelves(cab) {
    const shelves = [];
    if (cab.kind === 'desk' || cab.kind === 'appl' || cab.kind === 'filler') return shelves;
    if (cab.kind === 'tri') {
      if (cab.triType === '00') return shelves;
      const n = Math.max(0, Math.round((cab.h - 2 * B) / 320) - 1);
      for (let i = 1; i <= n; i++) shelves.push({ y: Math.round(B + (cab.h - 2 * B) * i / (n + 1) - B / 2), fixed: false });
      return shelves;
    }
    const rows = rowsWithFiller(cab).reverse(); // 由下往上
    let acc = 0;
    const segs = [];
    rows.forEach((r, i) => {
      const lo = acc, hi = acc + r.h * 10;
      segs.push({ lo, hi, t: r.t });
      acc = hi;
      if (i < rows.length - 1) {
        const nx = rows[i + 1];
        if (!(r.t === 'D' && nx.t === 'D') && nx.t !== 'E') shelves.push({ y: hi - B / 2, fixed: true });   // 電器抽底部是拉出托盤，下方不另加隔板
      }
    });
    segs.forEach(sg => {
      if (sg.t === 'D' || sg.t === 'E' || cab.sinkBase || cab.hoodHang) return;   // 水槽櫃：預設不放活動層板（留管線空間），使用者可自行加
      const lo = sg.lo === 0 ? B : sg.lo + B / 2;
      const hi = sg.hi >= cab.h ? cab.h - B : sg.hi - B / 2;
      const usable = hi - lo;
      if (cab.dc === 'A' && usable >= 1200 && sg.t !== 'O') {
        shelves.push({ y: Math.round(hi - 350), fixed: false });
        return;
      }
      const n = Math.max(0, Math.round(usable / 340) - 1);
      for (let i = 1; i <= n; i++) shelves.push({ y: Math.round(lo + usable * i / (n + 1) - B / 2), fixed: false });
    });
    // 高櫃 4H(含) 以上須加一片固隔
    if (cab.h >= 1280 && !shelves.some(s => s.fixed) && shelves.length) {
      let best = shelves[0];
      shelves.forEach(s => { if (Math.abs(s.y - cab.h / 2) < Math.abs(best.y - cab.h / 2)) best = s; });
      best.fixed = true;
    }
    return shelves.sort((a, b) => a.y - b.y);
  }

  function createCabinet(code, defaults = {}) {
    const it = D.byCode[code];
    if (!it) return null;
    const hanging = it.hanging;
    const cab = {
      id: uid(), code, kind: it.kind === 'hangcorner' ? 'corner' : it.kind, dc: it.dc, hc: it.hc,
      w: it.w, d: it.d, h: it.h, hanging, noBack: !!it.noBack, ...(it.sink ? { sinkBase: true } : {}), ...(it.hood ? { hoodHang: true } : {}), ...(it.applCab ? { applCab: true } : {}), ...(it.doorLip ? { doorLip: it.doorLip } : {}),
      triType: it.triType || null, mirror: false,
      x: 0, z: 0, rot: 0,
      y: hanging ? Math.max(1200, 2340 - it.h) : it.kind === 'filler' ? 0 : D.KICK,
      kick: !hanging && it.kind !== 'tri' && it.kind !== 'filler',
      bodyColor: defaults.bodyColor || '110',
      doorColor: defaults.doorColor || '110',
      topColor: defaults.topColor || '407',
      kickColor: defaults.kickColor || '110',
      doorStyle: defaults.doorStyle || 'STD',
      handle: defaults.handle || '',
      fronts: it.fronts.map(r => ({ ...r })),
      top: 'none', rod: false, note: ''
    };
    if (defaults.grain && Object.keys(defaults.grain).length) cab.grain = { ...defaults.grain };
    if (it.kind === 'appl') {
      Object.assign(cab, { at: it.at, mount: it.mount, y: it.y != null ? it.y : 850 - it.h, kick: false, bodyColor: '', doorColor: defaults.doorColor || '110', kickColor: '', topColor: '' });
    }
    if (it.kind === 'desk') {
      Object.assign(cab, { shape: it.shape, l2: it.l2, thick: 18, h: 18, deskMat: 'SYS', edge: 'none', y: 750 - 18, kick: false, topColor: defaults.topColor || '407' });
    }
    cab.shelves = genShelves(cab);
    cab.base = { S: cab.shelves.filter(s => !s.fixed).length, F: cab.shelves.filter(s => s.fixed).length, fronts: cab.fronts.map(r => ({ ...r })) };
    return cab;
  }

  // 改變櫃高時，門片/抽屜列依比例調整（單位 cm），並重排層板
  function resizeCabinet(cab, w, h, d) {
    const oldH = cab.h;
    cab.w = w;
    if (d != null && d > 0) cab.d = d;
    if (h !== oldH) {
      const k = h / oldH;
      cab.fronts = cab.fronts.map(r => ({ ...r, h: Math.max(10, Math.round(r.h * k)) }));
      let over = cab.fronts.reduce((a, r) => a + r.h, 0) - Math.floor(h / 10);
      for (let i = cab.fronts.length - 1; over > 0 && i >= 0; i--) { const cut = Math.min(over, cab.fronts[i].h - 10); cab.fronts[i].h -= cut; over -= cut; }
      cab.h = h;
    }
    cab.shelves = genShelves(cab);
  }

  /* 這個櫃體有沒有被改過（寬／深／高／層板數／抽屜數任一項和型錄不同）。
     不看 cab.base —— 舊專案檔的 base 是事後補的、數字不可靠；
     改拿型錄原款現場重算一次來比，比較保險。結果依型號快取。 */
  const pristineCache = new Map();
  function pristineOf(code) {
    if (pristineCache.has(code)) return pristineCache.get(code);
    const it = D.byCode[code];
    let out = null;
    if (it && it.kind !== 'desk' && it.kind !== 'appl') {
      const c = createCabinet(code);
      if (c) out = { w: it.w, d: it.d, h: it.h, shelves: c.shelves.length, drawers: (c.fronts || []).filter(r => r.t === 'D').length };
    }
    pristineCache.set(code, out);
    return out;
  }
  function isModified(cab) {
    if (!cab || cab.kind === 'desk' || cab.kind === 'appl') return false;
    const p = pristineOf(cab.code);
    if (!p) return false;
    if (cab.w !== p.w || cab.d !== p.d || cab.h !== p.h) return true;
    if ((cab.shelves || []).length !== p.shelves) return true;
    if ((cab.fronts || []).filter(r => r.t === 'D').length !== p.drawers) return true;
    return false;
  }
  /* 櫃體命名：W寬D深H高-櫃型門片-S/M
     門片：連續同型合併，高度全同用 ×N、不同用 / 串接
       D24,D24,D24        → 抽屜24×3
       L128,D16,D16,D32   → 左開128＋抽屜16/16/32
     櫃型：吊／雙開／轉角／吊轉角／電視／水槽櫃／吊櫃-抽油煙機（一般櫃省略）；三角邊櫃用形狀名
     加上深度、櫃型與門片之後，614 款型錄櫃體各自有不重複的名稱 */
  const FRONT_SHORT = { O: '開放', L: '左開', R: '右開', P: '對開', G: '玻璃', GP: '玻璃對開', D: '抽屜', F: '折疊', E: '電器抽' };
  const OPEN_ROW = t => t === 'O' || t === 'E';
  const E_FRONT = 50;   // 電器抽抽頭高（mm）   // 沒有門片的列（開放、電器抽）
  const DOOR_ROW = t => ['L', 'R', 'P', 'G', 'GP', 'F'].includes(t);
  // 門片下凸（取手縫）：門片列下方是開放／電器抽時，門片往下延伸 cab.doorLip mm
  function rowLip(cab, rows, i) { return cab.doorLip && DOOR_ROW(rows[i].t) && rows[i + 1] && OPEN_ROW(rows[i + 1].t) ? cab.doorLip : 0; }
  function frontSpec(cab) {
    if (cab.kind === 'tri') return D.TRI_TYPE_NAME[cab.triType] || '';
    const fronts = cab.fronts || [];
    if (!fronts.length) return '開放';
    const g = [];
    fronts.forEach(r => {
      // 抽油煙機吊櫃的單門不分左右，統稱「單開」（可按「⇄ 換邊」）
      const n = (cab.hoodHang || cab.hood) && (r.t === 'L' || r.t === 'R') ? '單開' : FRONT_SHORT[r.t] || r.t;
      const last = g[g.length - 1];
      if (last && last.n === n) last.h.push(r.h); else g.push({ n, h: [r.h] });
    });
    return g.map(p => {
      const same = p.h.every(x => x === p.h[0]);
      return p.n + (same ? p.h[0] + (p.h.length > 1 ? '×' + p.h.length : '') : p.h.join('/'));
    }).join('＋');
  }
  function kindTag(cab) {
    if (cab.hoodHang || cab.hood) return '吊櫃-抽油煙機';   // 型錄項目用 hood／sink，櫃體用 hoodHang／sinkBase
    return (cab.hanging ? '吊' : '')
      + (cab.kind === 'corner' || cab.kind === 'hangcorner' ? '轉角' : cab.kind === 'double' ? '雙開' : cab.kind === 'tv' ? '電視' : cab.sinkBase || cab.sink ? '水槽櫃' : cab.applCab ? '電器櫃' : '');
  }
  // std=true 時固定標 -S（型錄項目沒有 shelves，不能拿去跑 isModified）
  function cabName(cab, std) {
    if (!cab) return '';
    if (cab.kind === 'desk') return `${D.DESK_SHAPES[cab.shape] || ''}桌面`;
    if (cab.kind === 'appl') return cab.code;
    if (cab.kind === 'filler') return `W${cab.w}D${cab.d}H${cab.h}-補板`;
    return `W${cab.w}D${cab.d}H${cab.h}-${kindTag(cab)}${frontSpec(cab)}-${std === true || !isModified(cab) ? 'S' : 'M'}`;
  }

  function footprint(cab) {
    // 回傳局部座標 [minx,maxx,minz,maxz]
    if (cab.kind === 'corner') return [-cab.w / 2, cab.w / 2, -cab.w / 2, cab.w / 2];
    return [-cab.w / 2, cab.w / 2, -cab.d / 2, cab.d / 2];
  }
  function footDepth(cab) { return cab.kind === 'corner' ? cab.w : cab.kind === 'desk' && cab.shape !== 'R' ? cab.l2 : cab.d; }

  /* ---------- 桌面幾何 ---------- */
  // 局部座標外框：寬 w（x）、深 footDepth（z），背面在 -z；L 形靠左、ㄇ形兩側
  function deskGeom(cab) {
    const W = cab.w, Dz = footDepth(cab), d = cab.d, L = -W / 2, T = -Dz / 2;
    let pts, rects, wallSide;
    if (cab.shape === 'L') {
      pts = [[L, T], [L + W, T], [L + W, T + d], [L + d, T + d], [L + d, T + Dz], [L, T + Dz]];
      rects = [[L, L + W, T, T + d], [L, L + d, T + d, T + Dz]];
      wallSide = W + Dz;
    } else if (cab.shape === 'U') {
      pts = [[L, T], [L + W, T], [L + W, T + Dz], [L + W - d, T + Dz], [L + W - d, T + d], [L + d, T + d], [L + d, T + Dz], [L, T + Dz]];
      rects = [[L, L + W, T, T + d], [L, L + d, T + d, T + Dz], [L + W - d, L + W, T + d, T + Dz]];
      wallSide = W + 2 * Dz;
    } else {
      pts = [[L, T], [L + W, T], [L + W, T + d], [L, T + d]];
      rects = [[L, L + W, T, T + d]];
      wallSide = W;
    }
    let per = 0;
    const edges = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length]; const len = Math.hypot(q[0] - p[0], q[1] - p[1]); per += len;
      // 靠牆邊：背面(z=T)、L/ㄇ 左外側(x=L)、ㄇ 右外側(x=L+W)
      const wall = (p[1] === T && q[1] === T) || (cab.shape !== 'R' && p[0] === L && q[0] === L) || (cab.shape === 'U' && p[0] === L + W && q[0] === L + W);
      return { p, q, len, wall };
    });
    return { pts, rects, edges, area: Math.abs(polyArea(pts)), perimeter: per, exposed: per - wallSide };
  }

  /* ---------- 空間 ---------- */
  function polyArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return a / 2;
  }
  function pointInPoly(x, z, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
      if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
    }
    return inside;
  }
  function createRoom(points, height, thickness) {
    return {
      points: points.map(p => [Math.round(p[0]), Math.round(p[1])]),
      height: height || 2600, thickness: thickness || 120,
      walls: points.map(() => ({ id: uid('w'), locked: false, openings: [] }))
    };
  }
  function rectRoom(W, Dp, H, T) {
    return createRoom([[-W / 2, -Dp / 2], [W / 2, -Dp / 2], [W / 2, Dp / 2], [-W / 2, Dp / 2]], H, T);
  }
  function wallInfo(room, i) {
    const pts = room.points, p = pts[i], q = pts[(i + 1) % pts.length];
    const dx = q[0] - p[0], dz = q[1] - p[1];
    const len = Math.hypot(dx, dz) || 1;
    const dir = [dx / len, dz / len];
    let n = [dir[1], -dir[0]];
    const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
    if (pointInPoly(mx + n[0] * 5, mz + n[1] * 5, pts)) n = [-n[0], -n[1]];
    return { p, q, dir, len, nOut: n, nIn: [-n[0], -n[1]], mid: [mx, mz] };
  }
  function wallName(i) { return '牆面 ' + (i + 1); }

  /* ================= 3D ================= */
  const matCache = new Map();
  let grainTex = null;
  function getGrain() {
    if (grainTex) return grainTex;
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * 256, a = 0.03 + Math.random() * 0.07;
      g.strokeStyle = `rgba(80,50,20,${a})`; g.lineWidth = 0.5 + Math.random() * 2.2;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= 256; y += 16) g.lineTo(x + Math.sin(y / 40 + i) * 3, y);
      g.stroke();
    }
    grainTex = new THREE.CanvasTexture(c);
    grainTex.colorSpace = THREE.SRGBColorSpace;
    grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
    return grainTex;
  }
  const texCache = new Map();
  const texWaiters = new Map();
  function getSwatchTex(code, onReady) {
    const sw = D.SWATCH_BY_CODE[code];
    if (!sw) return null;
    if (texCache.has(code)) { const t = texCache.get(code); if (t.userData.ready) onReady(t); else texWaiters.get(code).push(onReady); return t; }
    const t = new THREE.Texture();
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    texCache.set(code, t); texWaiters.set(code, [onReady]);
    const img = new Image();
    img.onload = () => {
      t.image = img;
      if (imgGrainOf(code, img) === 'v') { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; t.repeat.set(1, 0.390625); }   // 0.39＝旋轉後維持像素比例（640×400 圖 vs 1200×750mm 磚）
      t.needsUpdate = true; t.userData.ready = true; texWaiters.get(code).forEach(f => f(t)); texWaiters.set(code, []);
    };
    img.src = sw.img;
    return t;
  }
  /* 色板圖片本身的紋路方向：'h'＝紋路沿圖片寬度（橫向）、'v'＝沿圖片高度（直向）
     色板可指定 sw.imgGrain；未指定時依圖片偵測：紋路方向上的明暗變化小（梯度小） */
  const imgGrainCache = new Map();
  function imgGrainOf(code, img) {
    const sw = D.SWATCH_BY_CODE[code];
    if (sw && (sw.imgGrain === 'h' || sw.imgGrain === 'v')) return sw.imgGrain;
    if (imgGrainCache.has(code)) return imgGrainCache.get(code);
    if (!img) return 'h';
    let g = 'h';
    try {
      const W = 96, H = 60, c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H);
      const p = x.getImageData(0, 0, W, H).data, L = i => p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
      let dx = 0, dy = 0;
      for (let yy = 1; yy < H; yy++) for (let xx = 1; xx < W; xx++) { const i = (yy * W + xx) * 4; dx += Math.abs(L(i) - L(i - 4)); dy += Math.abs(L(i) - L(i - W * 4)); }
      if (dx > dy * 1.25) g = 'v';   // 左右變化大＝直紋
    } catch (e) { /* 跨網域圖片無法分析：當作橫向 */ }
    imgGrainCache.set(code, g);
    return g;
  }
  // 櫃體某部位的紋路設定：'auto'（沿板材長邊）／'v' 直紋／'h' 橫紋
  const grainOf = (cab, key) => (cab && cab.grain && cab.grain[key]) || 'auto';
  const gOpt = (cab, key) => { const g = grainOf(cab, key); return g === 'auto' ? {} : { grain: g }; };
  function matInfo(code) {
    const list = (window.App && App.state && App.state.pricing.materials) || D.MATERIALS;
    return list.find(m => m.code === code) || D.MATERIALS[0];
  }
  function getMat(code, opts = {}) {
    const key = code + JSON.stringify(opts) + (window.App && App.renderMode || '');
    if (matCache.has(key)) return matCache.get(key);
    const mi = matInfo(code);
    const mode = window.App && App.renderMode;
    let m;
    if (mode === 'white') m = new THREE.MeshStandardMaterial({ color: 0xf7f7f5, roughness: 0.9 });
    else if (opts.gloss) m = new THREE.MeshPhysicalMaterial({ color: mi.hex, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
    else m = new THREE.MeshStandardMaterial({ color: mi.hex, roughness: 0.72, map: mi.grain ? getGrain() : null });
    if (mode !== 'white' && D.SWATCH_BY_CODE[code]) {
      const metal = /^BR/.test(code);
      if (metal) { m.metalness = 0.55; m.roughness = 0.35; }
      getSwatchTex(code, t => { m.map = t; m.color.set(0xffffff); m.needsUpdate = true; });
    }
    if (mode === 'xray') { m.transparent = true; m.opacity = 0.35; m.depthWrite = false; }
    m.userData.matCode = code;
    if (opts.grain) m.userData.grain = opts.grain;
    matCache.set(key, m);
    return m;
  }
  const special = {};
  function sMat(name) {
    if (special[name]) return special[name];
    const P = {
      glass: () => new THREE.MeshPhysicalMaterial({ color: 0xcfe6ec, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.28, depthWrite: false }),
      alu: () => new THREE.MeshStandardMaterial({ color: 0xbfc3c7, metalness: 0.75, roughness: 0.32 }),
      dark: () => new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.6 }),
      handle: () => new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.85, roughness: 0.25 }),
      back: () => new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.9 }),
      wall: () => new THREE.MeshStandardMaterial({ color: 0xf2f0eb, roughness: 0.95 }),
      doorLeaf: () => new THREE.MeshStandardMaterial({ color: 0xb58d62, roughness: 0.6, map: getGrain() }),
      frame: () => new THREE.MeshStandardMaterial({ color: 0xe8e6e1, roughness: 0.7 }),
      floor: () => new THREE.MeshStandardMaterial({ color: 0xd9c7a8, roughness: 0.85 }),
      rod: () => new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.9, roughness: 0.2 })
    };
    special[name] = P[name]();
    return special[name];
  }
  const edgeMat = () => special.edge || (special.edge = new THREE.LineBasicMaterial({ color: 0x1e1e1e, transparent: true, opacity: 0.38 }));

  // 依實際尺寸設定 UV（貼圖 1200x750mm）；紋路（貼圖寬度方向）：
  //   auto＝沿板材長邊、v＝直紋（立面沿高度）、h＝橫紋（立面沿水平）；水平面（頂底板、層板）一律沿該面長邊
  function boxUV(geo, w, h, d, mode) {
    const uv = geo.attributes.uv, dims = { x: w, y: h, z: d };
    const L = w >= h && w >= d ? 'x' : h >= d ? 'y' : 'z';
    const faces = [['z', 'y'], ['z', 'y'], ['x', 'z'], ['x', 'z'], ['x', 'y'], ['x', 'y']];
    const TU = D.TEX_TILE.u, TV = D.TEX_TILE.v;
    faces.forEach(([ua, va], f) => {
      let G = L;
      if (mode === 'v' || mode === 'h') {
        if (va === 'y') G = mode === 'v' ? 'y' : ua;
        else G = dims[ua] >= dims[va] ? ua : va;
      }
      const swap = va === G;
      const du = dims[ua], dv = dims[va];
      for (let j = 0; j < 4; j++) {
        const i = f * 4 + j, a = uv.getX(i), b = uv.getY(i);
        if (swap) uv.setXY(i, b * dv / TU, a * du / TV); else uv.setXY(i, a * du / TU, b * dv / TV);
      }
    });
    uv.needsUpdate = true;
  }
  function addBox(parent, w, h, d, x, y, z, mat, edges = true) {
    const geo = new THREE.BoxGeometry(Math.max(w, 0.5), Math.max(h, 0.5), Math.max(d, 0.5));
    boxUV(geo, Math.max(w, 0.5), Math.max(h, 0.5), Math.max(d, 0.5), mat && mat.userData && mat.userData.grain);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (edges && !(window.App && App.renderMode === 'xray' && false)) {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat());
      e.userData.isEdge = true;
      mesh.add(e);
    }
    parent.add(mesh);
    return mesh;
  }
  function scaleUV(geo, swap) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const a = uv.getX(i), b = uv.getY(i); if (swap) uv.setXY(i, b / D.TEX_TILE.u, a / D.TEX_TILE.v); else uv.setXY(i, a / D.TEX_TILE.u, b / D.TEX_TILE.v); }
    uv.needsUpdate = true;
  }
  function addExtrude(parent, shapePts, depth, mat, y) {
    // shapePts: [[x,z]...] 局部平面；沿 y 擠出
    const s = new THREE.Shape();
    shapePts.forEach((p, i) => i ? s.lineTo(p[0], -p[1]) : s.moveTo(p[0], -p[1]));
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 16 });
    scaleUV(geo);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = y;
    mesh.castShadow = true; mesh.receiveShadow = true;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat()); e.userData.isEdge = true;
    mesh.add(e);
    parent.add(mesh);
    return mesh;
  }

  /* ---------- 門片 ---------- */
  function styleOf(cab) { return D.DOOR_STYLES.find(s => s.id === cab.doorStyle) || D.DOOR_STYLES[0]; }

  // 建立單片門（局部：寬 w 高 h，門片中心於原點，正面朝 +z）；hinge: 'L'|'R'|null(抽屜)
  // 把手：cab.handle 為空時沿用門板款式預設（一字 / 鈕扣 / 款式一體把手）
  function handleOf(cab) {
    if (cab.handle && D.HANDLE_BY_ID[cab.handle]) return D.HANDLE_BY_ID[cab.handle];
    const v = (styleOf(cab).visual || {}).handle || 'bar';
    return D.HANDLE_BY_ID[v] || { id: 'style:' + v, type: 'style', style: v };
  }
  // 解析把手所在邊：mid＝對開門的中縫側（單門為開啟側、抽屜為上緣）
  function handleEdge(pos, hinge) {
    if (pos !== 'mid') return pos;
    return !hinge ? 'top' : hinge === 'L' ? 'right' : 'left';
  }
  function insetPos(pos, hinge, w, h) {
    const mx = !hinge ? 0 : hinge === 'L' ? w / 2 - 70 : -w / 2 + 70;
    const x = pos[1] === 'R' ? w / 2 - 70 : pos[1] === 'L' ? -w / 2 + 70 : mx;
    const y = pos[0] === 'T' ? h / 2 - 40 : -h / 2 + 40;
    return [x, y];
  }
  function addHandle(g, cab, w, h, t, hinge, handleY) {
    const hd = handleOf(cab), drawer = !hinge;
    if (hd.type === 'j' || hd.type === 'bev') {
      const e = handleEdge(hd.pos, hinge), horiz = e === 'top' || e === 'bottom';
      const len = horiz ? w : h, sgn = e === 'top' || e === 'right' ? 1 : -1;
      if (hd.type === 'j') {
        // J型鋁擠：沿邊外凸的鋁條＋內側勾槽
        const m1 = addBox(g, horiz ? len : 22, horiz ? 22 : len, 14, 0, 0, t / 2 + 7, sMat('alu'), false);
        const m2 = addBox(g, horiz ? len : 6, horiz ? 6 : len, 10, 0, 0, t / 2 + 3, sMat('dark'), false);
        if (horiz) { m1.position.y = sgn * (h / 2 - 11); m2.position.y = sgn * (h / 2 - 25); }
        else { m1.position.x = sgn * (w / 2 - 11); m2.position.x = sgn * (w / 2 - 25); }
      } else {
        // 斜邊：門片邊緣 45° 斜切（以深色斜面表示）
        const m = addBox(g, horiz ? len : 14, horiz ? 14 : len, 6, 0, 0, t / 2 - 2, sMat('dark'), false);
        if (horiz) { m.position.y = sgn * (h / 2 - 7); m.rotation.x = sgn * Math.PI / 4; }
        else { m.position.x = sgn * (w / 2 - 7); m.rotation.y = -sgn * Math.PI / 4; }
      }
      return;
    }
    if (hd.type === 'inset') {
      const [x, y] = insetPos(hd.pos, hinge, w, h);
      addBox(g, 110, 36, 3, x, y, t / 2 + 0.5, sMat('dark'), false);
      addBox(g, 110, 6, 8, x, y + (hd.pos[0] === 'T' ? 15 : -15), t / 2 + 2, sMat('alu'), false);
      return;
    }
    const hx = drawer ? 0 : (hinge === 'L' ? w / 2 - 40 : -w / 2 + 40);
    const hy = drawer ? h / 2 - Math.min(50, h / 3) : (handleY != null ? handleY : 0);
    const style = hd.type === 'style' ? hd.style : hd.type;
    if (style === 'bar') {
      if (drawer) addBox(g, Math.min(160, w * 0.5), 12, 14, hx, hy, t / 2 + 14, sMat('handle'), false);
      else addBox(g, 12, Math.min(160, h * 0.5), 14, hx, hy, t / 2 + 14, sMat('handle'), false);
    } else if (style === 'knob') {
      const k = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), sMat('handle'));
      k.position.set(hx, hy, t / 2 + 14); g.add(k);
    } else if (style === 'slot') {
      if (drawer) addBox(g, 120, 16, 3, 0, h / 2 - 22, t / 2, sMat('dark'), false);
      else addBox(g, 16, 120, 3, hx + (hinge === 'L' ? 10 : -10), hy, t / 2, sMat('dark'), false);
    } else if (style === 'channel') {
      addBox(g, w - 4, 14, 3, 0, h / 2 - 9, t / 2, sMat('alu'), false);
    } else if (style === 'alu') {
      if (drawer) addBox(g, w, 20, 22, 0, h / 2 - 10, 2, sMat('alu'), false);
      else addBox(g, 20, h, 22, hinge === 'L' ? w / 2 - 10 : -w / 2 + 10, 0, 2, sMat('alu'), false);
    } else if (style === 'bevel') {
      addBox(g, w, 10, 4, 0, h / 2 - 5, t / 2 + 1, sMat('dark'), false);
    }
  }
  function buildLeaf(cab, w, h, opts) {
    const g = new THREE.Group();
    const st = styleOf(cab);
    const v = st.visual || {};
    const t = 18;
    const dm = getMat(cab.doorColor, { gloss: !!v.gloss, ...gOpt(cab, 'doorColor') });
    const glass = opts.glass;
    if (glass) {
      const fw = 32;
      addBox(g, w, fw, t, 0, h / 2 - fw / 2, 0, sMat('alu'));
      addBox(g, w, fw, t, 0, -h / 2 + fw / 2, 0, sMat('alu'));
      addBox(g, fw, h - 2 * fw, t, -w / 2 + fw / 2, 0, 0, sMat('alu'));
      addBox(g, fw, h - 2 * fw, t, w / 2 - fw / 2, 0, 0, sMat('alu'));
      const gl = addBox(g, w - 2 * fw, h - 2 * fw, 5, 0, 0, 0, sMat('glass'), false);
      gl.castShadow = false;
    } else if (v.frame) {
      const f = Math.min(v.frame, w / 4, h / 4);
      const fm = v.alu ? sMat('alu') : dm;
      addBox(g, w, f, t, 0, h / 2 - f / 2, 0, fm);
      addBox(g, w, f, t, 0, -h / 2 + f / 2, 0, fm);
      addBox(g, f, h - 2 * f, t, -w / 2 + f / 2, 0, 0, fm);
      addBox(g, f, h - 2 * f, t, w / 2 - f / 2, 0, 0, fm);
      const pz = v.raised ? 2 : -4;
      addBox(g, w - 2 * f, h - 2 * f, t - 8, 0, 0, pz, dm);
      if (v.raised && w - 2 * f > 80 && h - 2 * f > 80) addBox(g, w - 2 * f - 50, h - 2 * f - 50, 4, 0, 0, t / 2 + 1, dm);
    } else {
      addBox(g, w, h, t, 0, 0, 0, dm);
    }
    if (v.louver && !glass) {
      const n = Math.max(3, Math.floor((h - 120) / 40));
      for (let i = 0; i < n; i++) addBox(g, w - 90, 8, 4, 0, -h / 2 + 60 + (h - 120) * (i + 0.5) / n, t / 2 + 2, sMat('alu'), false);
    }
    if (v.trim && !glass) addBox(g, w - 40, 10, 3, 0, h / 2 - 50, t / 2 + 1.5, sMat('alu'), false);
    // 把手（玻璃門固定為一字型）
    if (glass) addHandle(g, { ...cab, handle: 'bar' }, w, h, t, opts.hinge, opts.handleY);
    else addHandle(g, cab, w, h, t, opts.hinge, opts.handleY);
    return g;
  }

  /* ---------- 櫃體 ---------- */
  // 補板：前方一片補板（前緣對齊門片面）＋後方一支 50mm 固定條；補滿櫃體與牆之間的空隙
  function buildFiller(g, cab, y0) {
    const { w, d, h } = cab;
    const bm = getMat(cab.bodyColor, gOpt(cab, 'bodyColor'));
    addBox(g, w, h, B, 0, y0 + h / 2, d / 2 - B / 2, bm);
    const sw = Math.min(50, w);
    addBox(g, sw, h, Math.max(10, d - B), 0, y0 + h / 2, -B / 2, bm);
  }
  const SINK_RAIL = 80;   // 水槽櫃檔板高
  function buildStdBody(g, cab, y0, open) {
    const { w, d, h } = cab;
    const bm = getMat(cab.bodyColor, gOpt(cab, 'bodyColor'));
    const zb = -d / 2;
    addBox(g, B, h, d, -w / 2 + B / 2, y0 + h / 2, 0, bm);
    addBox(g, B, h, d, w / 2 - B / 2, y0 + h / 2, 0, bm);
    if (cab.hoodHang) {
      // 抽油煙機吊櫃：無頂板、無底板、無背板；前緣上下各一支、後緣上方一支 80mm 檔板（夾在左右側板中間）
      const R = SINK_RAIL;
      addBox(g, w - 2 * B, R, B, 0, y0 + h - R / 2, d / 2 - B / 2, bm);
      addBox(g, w - 2 * B, R, B, 0, y0 + R / 2, d / 2 - B / 2, bm);
      addBox(g, w - 2 * B, R, B, 0, y0 + h - R / 2, zb + B / 2, bm);
    } else addBox(g, w - 2 * B, B, d, 0, y0 + B / 2, 0, bm);
    if (cab.hoodHang) { /* 上方已處理 */ }
    else if (cab.sinkBase) {
      // 水槽櫃：無頂板；前緣上方、後緣上下各一支 80mm 檔板（夾在左右側板中間），後檔板內側一片 8mm 背板
      const R = SINK_RAIL;
      addBox(g, w - 2 * B, R, B, 0, y0 + h - R / 2, d / 2 - B / 2, bm);
      addBox(g, w - 2 * B, R, B, 0, y0 + h - R / 2, zb + B / 2, bm);
      addBox(g, w - 2 * B, R, B, 0, y0 + B + R / 2, zb + B / 2, bm);
      addBox(g, w - 2 * B, h - B, D.BACK, 0, y0 + B + (h - B) / 2, zb + B + D.BACK / 2, bm);
    } else if (!cab.hanging && counterOver(cab).length) {
      // 水槽 / 爐具下方：頂板改為前後橫料
      addBox(g, w - 2 * B, B, 90, 0, y0 + h - B / 2, d / 2 - 45, bm);
      addBox(g, w - 2 * B, B, 90, 0, y0 + h - B / 2, -d / 2 + 45, bm);
    } else addBox(g, w - 2 * B, B, d, 0, y0 + h - B / 2, 0, bm);
    if (!cab.noBack && !cab.sinkBase) addBox(g, w - 2 * B + 10, h - 2 * B + 10, D.BACK, 0, y0 + h / 2, zb + 14, getMat(cab.bodyColor, gOpt(cab, 'bodyColor')));
    const backFace = cab.sinkBase ? zb + B + D.BACK : cab.noBack ? zb : zb + 18;
    cab.shelves.forEach(s => {
      const inset = s.fixed ? 0 : 20;
      const sd = d - (backFace - zb) - inset - 2;
      addBox(g, w - 2 * B - (s.fixed ? 0 : 4), B, sd, 0, y0 + s.y + B / 2, backFace + sd / 2, bm).userData.shelf = true;
    });
    if (cab.rod) {
      const top = cab.shelves.filter(s => s.y < h - 200).reduce((m, s) => Math.max(m, s.y), 0);
      const ry = y0 + (top ? top - 60 : h - B - 60);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, w - 2 * B, 16), sMat('rod'));
      r.rotation.z = Math.PI / 2; r.position.set(0, ry, 0); g.add(r);
    }
    buildFronts(g, cab, y0, w, d / 2, 0, open);
  }

  function buildFronts(g, cab, y0, w, zFront, xCenter, open) {
    const rows = rowsWithFiller(cab);
    let yTop = y0 + cab.h;
    const gap = 2, t = 18;
    const zf = zFront + t / 2 + 1;
    rows.forEach((r, ri) => {
      const rh = r.h * 10;
      const yc = yTop - rh / 2;
      const hh = rh - 2 * gap;
      const lip = rowLip(cab, rows, ri);
      if (r.t === 'E') {
        // 電器抽：開放格，底部一片可拉出的托盤（櫃身色）＋前方 H50 抽頭（門片色）
        const tg = new THREE.Group(), tw = w - 2 * B - 26, td = cab.d - 60, fh = E_FRONT;
        addBox(tg, w - 2 * gap, fh - 2 * gap, t, 0, fh / 2, 0, getMat(cab.doorColor, gOpt(cab, 'doorColor')));
        addBox(tg, tw, B, td, 0, fh - B / 2 - 4, -t / 2 - td / 2, getMat(cab.bodyColor, gOpt(cab, 'bodyColor')));
        tg.position.set(xCenter, yTop - rh, zf + (open ? td * 0.6 : 0));
        tg.userData.front = 'tray';
        g.add(tg);
      } else if (r.t === 'D') {
        const dg = new THREE.Group();
        const leaf = buildLeaf(cab, w - 2 * gap, hh, { hinge: null });
        dg.add(leaf);
        // 屜身
        const bd = Math.min(cab.d - 80, 520), bh = Math.max(60, rh - 70);
        const box = new THREE.Group();
        const bm = sMat('back');
        addBox(box, w - 2 * B - 30, bh, 12, 0, 0, -bd, bm);
        addBox(box, 12, bh, bd, -(w - 2 * B - 30) / 2 + 6, 0, -bd / 2, bm);
        addBox(box, 12, bh, bd, (w - 2 * B - 30) / 2 - 6, 0, -bd / 2, bm);
        addBox(box, w - 2 * B - 30, 8, bd, 0, -bh / 2, -bd / 2, bm);
        box.position.set(0, -(rh - bh) / 2 + 20, -t / 2);
        dg.add(box);
        dg.position.set(xCenter, yc, zf + (open ? bd * 0.65 : 0));
        dg.userData.front = 'drawer';
        g.add(dg);
      } else if (!OPEN_ROW(r.t)) {
        const glass = r.t === 'G' || r.t === 'GP';
        const leaves = [];
        if (r.t === 'P' || r.t === 'GP') leaves.push(['L', -w / 4, w / 2], ['R', w / 4, w / 2]);
        else if (r.t === 'F') [-3, -1, 1, 3].forEach((k, i) => leaves.push([i % 2 ? 'R' : 'L', k * w / 8, w / 4]));
        else leaves.push([r.t === 'R' ? 'R' : 'L', 0, w]);
        leaves.forEach(([hinge, cx, lw]) => {
          const leaf = buildLeaf(cab, lw - 2 * gap, hh + lip, { hinge, glass, handleY: rh > 900 ? -hh / 2 + Math.min(1000, hh * 0.45) : 0 });
          const pivot = new THREE.Group();
          const px = hinge === 'L' ? cx - lw / 2 + gap : cx + lw / 2 - gap;
          pivot.position.set(xCenter + px, yc - lip / 2, zFront + 1);
          leaf.position.set(hinge === 'L' ? (lw - 2 * gap) / 2 : -(lw - 2 * gap) / 2, 0, t / 2);
          pivot.add(leaf);
          if (open) pivot.rotation.y = (hinge === 'L' ? -1 : 1) * (95 * Math.PI / 180);
          pivot.userData.front = 'door';
          g.add(pivot);
        });
      }
      yTop -= rh;
    });
  }

  function buildCorner(g, cab, y0, open) {
    const { w, d, h } = cab;
    const bm = getMat(cab.bodyColor, gOpt(cab, 'bodyColor'));
    const L = -w / 2;
    // 背側 (沿 -z)
    addBox(g, w, h, B, 0, y0 + h / 2, L + B / 2, bm);
    // 左側 (沿 -x)
    addBox(g, B, h, w - B, L + B / 2, y0 + h / 2, B / 2, bm);
    // 右端側板、前端側板
    addBox(g, B, h, d - B, w / 2 - B / 2, y0 + h / 2, L + B + (d - B) / 2, bm);
    addBox(g, d - B, h, B, L + B + (d - B) / 2, y0 + h / 2, w / 2 - B / 2, bm);
    const lshape = [[L + B, L + B], [w / 2 - B, L + B], [w / 2 - B, L + d], [L + d, L + d], [L + d, w / 2 - B], [L + B, w / 2 - B]];
    addExtrude(g, lshape, B, bm, y0);
    addExtrude(g, lshape, B, bm, y0 + h - B);
    cab.shelves.forEach(s => addExtrude(g, lshape, B, bm, y0 + s.y));
    // 內角面：面 A（朝 +z，x 從 L+d 到 w/2）放門；面 B（朝 +x）封板或開放
    const faceW = w / 2 - (L + d);
    const hasDoor = cab.fronts.some(r => !OPEN_ROW(r.t));
    if (hasDoor) {
      buildFronts(g, { ...cab, w: faceW }, y0, faceW, L + d, (L + d + w / 2) / 2, open);
      addBox(g, B, h, faceW, L + d + B / 2 + 1, y0 + h / 2, (L + d + w / 2) / 2, bm);
    }
  }

  function triShape(cab) {
    const { w, d } = cab;
    const s = cab.triSize;
    const L = -w / 2, T0 = -d / 2;
    const P = (x, z) => [L + x, T0 + z];
    if (cab.triType === '02') {
      let cx, cz, r;
      if (s === '5535') { cx = 121; cz = 341; r = 220; } else { cx = 0; cz = 0; r = w; }
      const pts = [P(0, 0), P(w, 0)];
      if (cz > 0) pts.push(P(w, cz));
      for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI / 2; pts.push(P(cx + r * Math.cos(a), cz + r * Math.sin(a))); }
      pts.push(P(0, d));
      return pts;
    }
    if (s === '5535') return [P(0, 0), P(w, 0), P(w, 341), P(121, d), P(0, d)];
    return [P(0, 0), P(w, 0), P(w, 94), P(94, d), P(0, d)];
  }
  function buildTri(g, cab, y0) {
    const { w, d, h } = cab;
    const bm = getMat(cab.bodyColor, gOpt(cab, 'bodyColor'));
    if (cab.triType === '00') {
      addBox(g, w, h, B, 0, y0 + h / 2, -d / 2 + B / 2, bm);
      addBox(g, B, h, d - B, w / 2 - B / 2, y0 + h / 2, B / 2, bm);
      return;
    }
    const sh = triShape(cab);
    addBox(g, w, h, B, 0, y0 + h / 2, -d / 2 + B / 2, bm);
    addBox(g, B, h, d - B, -w / 2 + B / 2, y0 + h / 2, B / 2, bm);
    addExtrude(g, sh, B, bm, y0);
    addExtrude(g, sh, B, bm, y0 + h - B);
    cab.shelves.forEach(s => addExtrude(g, sh, B, bm, y0 + s.y));
    // 腳
    [[-w / 2 + 40, -d / 2 + 40], [w / 2 - 50, -d / 2 + 40], [-w / 2 + 40, d / 2 - 50]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, y0, 10), sMat('dark'));
      leg.position.set(x, y0 / 2, z); g.add(leg);
    });
  }

  function buildDesk(g, cab) {
    const geo0 = deskGeom(cab), t = cab.thick;
    const s = new THREE.Shape();
    geo0.pts.forEach((p, i) => i ? s.lineTo(p[0], -p[1]) : s.moveTo(p[0], -p[1]));
    deskHoles(cab).forEach(hp => { const hl = new THREE.Path(); hp.forEach((p, i) => i ? hl.lineTo(p[0], -p[1]) : hl.moveTo(p[0], -p[1])); hl.closePath(); s.holes.push(hl); });
    let b = 0, seg = 1;
    if (cab.edge === 'q') { b = Math.min(6, t / 3); seg = 4; }
    else if (cab.edge === 'h') { b = t / 2 - 0.5; seg = 6; }
    else if (cab.edge === 'c') { b = Math.min(5, t / 2 - 1); seg = 1; }
    const geo = new THREE.ExtrudeGeometry(s, b ? { depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: seg, curveSegments: 8 } : { depth: t, bevelEnabled: false });
    if (b) geo.translate(0, 0, b);
    scaleUV(geo, grainOf(cab, 'topColor') === 'v');
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, getMat(cab.topColor || '407'));
    mesh.position.y = cab.y; mesh.castShadow = mesh.receiveShadow = true;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat()); e.userData.isEdge = true; mesh.add(e);
    g.add(mesh);
    // 止水溝槽：外露邊下方 12mm 處
    if (cab.edge === 'drip') {
      geo0.edges.filter(ed => !ed.wall).forEach(ed => {
        const mx = (ed.p[0] + ed.q[0]) / 2, mz = (ed.p[1] + ed.q[1]) / 2, ang = Math.atan2(ed.q[1] - ed.p[1], ed.q[0] - ed.p[0]);
        const nx = -(ed.q[1] - ed.p[1]) / ed.len, nz = (ed.q[0] - ed.p[0]) / ed.len;
        // 內側方向（朝多邊形內）
        const inside = pointInPoly(mx + nx * 20, mz + nz * 20, geo0.pts) ? 1 : -1;
        const gm = addBox(g, Math.max(10, ed.len - 30), 3, 6, mx + nx * 12 * inside, cab.y - 1, mz + nz * 12 * inside, sMat('dark'), false);
        gm.rotation.y = -ang;
      });
    }
  }


  /* ---------- 廚房設備 ---------- */
  const stateCabs = () => (window.App && App.state && App.state.cabinets) || [];
  // 世界座標 ↔ 物件局部座標
  function toLocal(o, wx, wz) {
    const r = o.rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), dx = wx - o.x, dz = wz - o.z;
    return [c * dx - s * dz, s * dx + c * dz];
  }
  function toWorld(o, lx, lz) {
    const r = o.rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
  }
  const isCounterAppl = c => !!c && c.kind === 'appl' && c.mount === 'counter';
  // 位於此落地櫃上方的水槽 / 爐具
  function counterOver(cab) {
    const top = cab.y + cab.h;
    return stateCabs().filter(a => isCounterAppl(a) && a.id !== cab.id).filter(a => {
      const [lx, lz] = toLocal(cab, a.x, a.z), at = a.y + a.h;
      return Math.abs(lx) < cab.w / 2 - 20 && Math.abs(lz) < cab.d / 2 + 60 && at > top - 5 && at < top + 80;
    });
  }
  // 桌面開孔（桌面局部座標多邊形）
  function deskHoles(desk) {
    const g = deskGeom(desk), top = desk.y + desk.thick;
    return stateCabs().filter(isCounterAppl).filter(a => {
      const at = a.y + a.h, [lx, lz] = toLocal(desk, a.x, a.z);
      return at > top - 12 && at < top + 30 && pointInPoly(lx, lz, g.pts);
    }).map(a => {
      const it = D.byCode[a.code] || a, cut = it.cut || [a.w - 40, a.d - 40], cw = cut[0] / 2, cd = cut[1] / 2;
      // 開孔限制在桌面外框內（留 5mm），避免超出外框造成無法開孔
      const xs = g.pts.map(p => p[0]), zs = g.pts.map(p => p[1]);
      const cx = v => Math.max(Math.min(...xs) + 5, Math.min(Math.max(...xs) - 5, v)), cz = v => Math.max(Math.min(...zs) + 5, Math.min(Math.max(...zs) - 5, v));
      return [[-cw, -cd], [cw, -cd], [cw, cd], [-cw, cd]].map(([x, z]) => { const w = toWorld(a, x, z), l = toLocal(desk, w[0], w[1]); return [cx(l[0]), cz(l[1])]; });
    });
  }
  function applMat(name) {
    const P = {
      steel: () => new THREE.MeshStandardMaterial({ color: 0xc9cdd1, metalness: 0.65, roughness: 0.32 }),
      glassBlack: () => new THREE.MeshStandardMaterial({ color: 0x18191b, metalness: 0.25, roughness: 0.12 }),
      white: () => new THREE.MeshStandardMaterial({ color: 0xf3f3f1, roughness: 0.45 }),
      burner: () => new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.4, roughness: 0.5 }),
      window: () => new THREE.MeshStandardMaterial({ color: 0x3b4148, metalness: 0.3, roughness: 0.1, transparent: true, opacity: 0.85 }),
      led: () => new THREE.MeshBasicMaterial({ color: 0x7fd13b }),
      gold: () => new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.8, roughness: 0.3 }),
      gray: () => new THREE.MeshStandardMaterial({ color: 0x6e7074, metalness: 0.6, roughness: 0.45 }),
      black: () => new THREE.MeshStandardMaterial({ color: 0x2b2b2d, metalness: 0.5, roughness: 0.55 }),
      mirror: () => new THREE.MeshStandardMaterial({ color: 0xcfd8e0, metalness: 0.95, roughness: 0.05 }),
      fabric: () => new THREE.MeshStandardMaterial({ color: 0xb3a596, roughness: 0.95 }),   // 沙發布面（暖灰）
      mattress: () => new THREE.MeshStandardMaterial({ color: 0xf5f1ea, roughness: 0.9 })
    };
    const k = 'appl_' + name;
    if (!special[k]) special[k] = P[name]();
    return special[k];
  }
  function cyl(g, r, h, x, y, z, mat, seg = 24) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
    m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  }
  function buildAppl(g, cab) {
    const it = D.byCode[cab.code] || cab, { w, d, h } = cab, y0 = cab.y;
    const steel = applMat('steel'), black = applMat('glassBlack');
    const face = it.finish === 'glass' ? black : it.finish === 'white' ? applMat('white') : steel;
    if (cab.at === 'sink') {
      const cut = it.cut || [w - 30, d - 30], t = 3, bw = cut[0] - 30, bd = cut[1] - 30;
      // 上緣框（含槽口）
      const rim = new THREE.Shape([[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]].map(p => new THREE.Vector2(p[0], p[1])));
      // 槽數：bowls 為各槽寬度比例，槽間留 40mm 隔板
      const ratios = it.bowls || [1], gapB = 40, avail = bw - gapB * (ratios.length - 1);
      let bx0 = -bw / 2;
      const bowls = ratios.map(r => { const ww = avail * r, b = { x: bx0 + ww / 2, w: ww }; bx0 += ww + gapB; return b; });
      bowls.forEach(b => rim.holes.push(new THREE.Path([[b.x - b.w / 2, bd / 2], [b.x - b.w / 2, -bd / 2], [b.x + b.w / 2, -bd / 2], [b.x + b.w / 2, bd / 2]].map(p => new THREE.Vector2(p[0], p[1])))));
      const rg = new THREE.ExtrudeGeometry(rim, { depth: 2, bevelEnabled: false }); rg.rotateX(-Math.PI / 2);
      const rm = new THREE.Mesh(rg, steel); rm.position.y = y0 + h - 2; g.add(rm);
      const re = new THREE.LineSegments(new THREE.EdgesGeometry(rg), edgeMat()); re.userData.isEdge = true; rm.add(re);
      // 槽身
      const bh = h - 2;
      bowls.forEach((b, i) => {
        const hh = i ? bh * 0.8 : bh, yb = y0 + bh - hh;
        addBox(g, b.w, t, bd, b.x, yb + t / 2, 0, steel);
        addBox(g, t, hh, bd, b.x - b.w / 2, yb + hh / 2, 0, steel); addBox(g, t, hh, bd, b.x + b.w / 2, yb + hh / 2, 0, steel);
        addBox(g, b.w, hh, t, b.x, yb + hh / 2, -bd / 2, steel); addBox(g, b.w, hh, t, b.x, yb + hh / 2, bd / 2, steel);
        cyl(g, Math.min(45, b.w / 5), 2, b.x + b.w * 0.25, yb + t + 1, 0, applMat('burner'));
      });
      // 龍頭
      const fz = -d / 2 + 30, top = y0 + h;
      cyl(g, 22, 30, 0, top + 15, fz, steel);
      cyl(g, 13, 300, 0, top + 150, fz, steel);
      cyl(g, 11, 200, 0, top + 300, fz + 90, steel).rotation.x = Math.PI / 2;
      cyl(g, 8, 60, 0, top + 270, fz + 190, steel);
      return;
    }
    if (cab.at === 'hob') {
      const cut = it.cut || [w - 60, d - 60], pt = 8, top = y0 + h;
      addBox(g, cut[0] - 10, h - pt, cut[1] - 10, 0, y0 + (h - pt) / 2, 0, applMat('burner'));
      addBox(g, w, pt, d, 0, top - pt / 2, 0, face);
      const n = it.burners || 2;
      for (let i = 0; i < n; i++) {
        const bx = (i - (n - 1) / 2) * w / n, bz = -d * 0.06;
        cyl(g, 68, 6, bx, top + 3, bz, applMat('burner'), 32);
        cyl(g, 42, 16, bx, top + 8, bz, applMat('burner'), 32);
        cyl(g, 24, 20, bx, top + 10, bz, steel, 24);
        [0, 1].forEach(k => { const b = addBox(g, 200, 10, 10, bx, top + 18, bz, applMat('burner'), false); b.rotation.y = k * Math.PI / 2 + Math.PI / 4; });
        cyl(g, 20, 22, bx * 0.55, top + 11, d / 2 - 45, it.finish === 'glass' ? steel : applMat('burner'));
      }
      return;
    }
    if (cab.at === 'dw' || (cab.at === 'dryer' && cab.mount === 'floor')) {
      addBox(g, w - 4, h, d - 20, 0, y0 + h / 2, -10, steel);
      if (it.finish === 'panel') {
        addBox(g, w, h - 10, 18, 0, y0 + (h - 10) / 2 + 10, d / 2 - 9, getMat(cab.doorColor || '1143'));
        addBox(g, 160, 12, 22, 0, y0 + h - 70, d / 2 + 11, sMat('handle'));
      } else {
        addBox(g, w, h, 16, 0, y0 + h / 2, d / 2 - 8, face);
        if (cab.at === 'dw') {
          addBox(g, w, 90, 17, 0, y0 + h - 45, d / 2 - 8, black);
          addBox(g, 60, 8, 2, w / 2 - 70, y0 + h - 45, d / 2 + 1, applMat('led'));
          addBox(g, 300, 14, 24, 0, y0 + h - 130, d / 2 + 10, sMat('handle'));
        } else {
          addBox(g, w - 20, 3, 2, 0, y0 + h * 0.52, d / 2 + 1, steel);
          [0.8, 0.3].forEach(k => addBox(g, 160, 10, 16, 0, y0 + h * k, d / 2 + 8, sMat('handle')));
          addBox(g, 40, 6, 2, w / 2 - 50, y0 + h - 40, d / 2 + 1, applMat('led'));
        }
      }
      return;
    }
    if (cab.at === 'dryer') { // 懸掛式
      addBox(g, w, h - 70, d, 0, y0 + 70 + (h - 70) / 2, 0, applMat('white'));
      addBox(g, w - 10, 70, d - 10, 0, y0 + 35, 0, steel);
      addBox(g, w - 60, 4, 2, 0, y0 + h * 0.6, d / 2 + 1, steel);
      addBox(g, 30, 6, 2, w / 2 - 40, y0 + h - 40, d / 2 + 1, applMat('led'));
      return;
    }
    if (cab.at === 'oven') {
      addBox(g, w - 36, h - 10, d - 20, 0, y0 + (h - 10) / 2, -10, applMat('burner'));
      addBox(g, w, h, 20, 0, y0 + h / 2, d / 2 - 10, black);
      addBox(g, w, 90, 21, 0, y0 + h - 45, d / 2 - 10, steel);
      addBox(g, w - 120, h - 200, 2, 0, y0 + (h - 110) / 2, d / 2 + 1, applMat('window'));
      addBox(g, w - 140, 16, 26, 0, y0 + h - 120, d / 2 + 13, sMat('handle'));
      [-1, 1].forEach(k => { cyl(g, 18, 20, k * (w / 2 - 70), y0 + h - 45, d / 2 + 10, sMat('handle')).rotation.x = Math.PI / 2; });
      return;
    }
    if (cab.at === 'hood') {
      if (it.style === 'deep') {
        // 斜背深罩式：後段箱體＋前傾集煙罩
        addBox(g, w, h, d * 0.45, 0, y0 + h / 2, -d / 2 + d * 0.225, steel);
        const L = Math.hypot(d * 0.55, h * 0.55), pn = addBox(g, w, 10, L, 0, y0 + h * 0.72, -d / 2 + d * 0.45 + d * 0.275, steel);
        pn.rotation.x = Math.atan2(h * 0.55, d * 0.55);
        addBox(g, w, h * 0.45, 12, 0, y0 + h * 0.225, d / 2 - 6, steel);
        addBox(g, w - 20, 4, d - 20, 0, y0 + 2, 0, applMat('burner'));
        cyl(g, 90, 300, 0, y0 + h + 150, -d / 2 + 110, steel);
      } else if (it.style === 'std') {
        // 單層標準型
        addBox(g, w, h - 30, d, 0, y0 + 30 + (h - 30) / 2, 0, steel);
        addBox(g, w - 20, 30, d - 20, 0, y0 + 15, 0, applMat('burner'));
        addBox(g, 160, 30, 40, 0, y0 - 10, d / 2 - 40, applMat('white'));
        cyl(g, 75, 300, 0, y0 + h + 150, -d / 2 + 110, steel);
      } else if (it.style === 'near') {
        addBox(g, w, 120, d - 60, 0, y0 + h - 60, -30, black);
        const pn = addBox(g, w, Math.hypot(h - 120, 200), 12, 0, y0 + (h - 120) / 2, d / 2 - 110, black);
        pn.rotation.x = -Math.atan2(200, h - 120);
        addBox(g, w - 40, h - 130, d - 260, 0, y0 + (h - 130) / 2 + 10, -d / 2 + (d - 260) / 2, applMat('burner'));
        addBox(g, 300, 480, 260, 0, y0 + h + 240, -d / 2 + 130, steel);
      } else {
        addBox(g, w, h - 40, d, 0, y0 + 40 + (h - 40) / 2, 0, steel);
        addBox(g, w, 40, d, 0, y0 + 20, 0, applMat('burner'));
        addBox(g, w - 40, 3, 60, 0, y0 + 1, d / 2 - 50, black);
        [-1, 1].forEach(k => addBox(g, 80, 2, 30, k * w * 0.3, y0 - 1, 0, applMat('white')));
        cyl(g, 90, 200, 0, y0 + h + 100, -d / 2 + 110, steel);
      }
      return;
    }
    const wire = ['gold', 'gray', 'black'].includes(it.finish) ? applMat(it.finish) : steel;
    if (cab.at === 'rod' || cab.at === 'towel' || cab.at === 'grab') {
      // 掛桿／毛巾桿／扶手：圓管＋兩端固定座（貼牆，牆在 -z 側）
      const rr = cab.at === 'grab' ? 16 : cab.at === 'towel' ? 9 : 8, zr = -d / 2 + Math.min(d, 62) / 2;
      cyl(g, rr, w, 0, y0 + h / 2, -d / 2 + d - rr, wire, 16).rotation.z = Math.PI / 2;
      [-1, 1].forEach(k => { cyl(g, rr + 4, d, k * (w / 2 - rr - 12), y0 + h / 2, 0, wire, 16).rotation.x = Math.PI / 2; });
      return;
    }
    const white = applMat('white');
    if (cab.at === 'bed') {
      // 床組：床架（門板色）＋床墊（白）＋床頭片＋枕頭
      const wood = getMat(cab.doorColor || '110'), mat = applMat('mattress'), bedH = Math.min(500, h * 0.55);
      addBox(g, w, bedH * 0.5, d - 60, 0, y0 + bedH * 0.25, 30, wood);
      addBox(g, w - 40, bedH * 0.45, d - 120, 0, y0 + bedH * 0.5 + bedH * 0.225, 30, mat);
      addBox(g, w, h - bedH, 60, 0, y0 + bedH + (h - bedH) / 2, -d / 2 + 30, wood);
      const pw = Math.min(600, (w - 120) / 2);
      [-1, 1].forEach(k => { if (w > 1200 || k < 0) addBox(g, pw, 100, 400, k * (w > 1200 ? pw / 2 + 20 : 0), y0 + bedH + 50, -d / 2 + 60 + 260, mat); });
      return;
    }
    if (cab.at === 'sofa' || cab.at === 'armchair') {
      // 沙發：座墊、靠背、扶手；L 型在右側加貴妃椅（可旋轉 180° 改左）
      const fab = applMat('fabric'), base = applMat('burner'), armW = Math.min(180, w * 0.1), seatH = Math.min(430, h * 0.5), backD = Math.min(250, d * 0.28), seatD = Math.min(950, d);
      const isL = /L 型|L型/.test(cab.name || (D.byCode[cab.code] || {}).name || '');
      const mainD = isL ? seatD : d;
      addBox(g, w, seatH - 80, mainD - 20, 0, y0 + 80 + (seatH - 80) / 2, (d - mainD) / 2 + 10, fab);
      addBox(g, w - 2 * armW, 120, mainD - backD - 40, 0, y0 + seatH + 40, (d - mainD) / 2 + backD / 2 + 10, fab);
      addBox(g, w - 2 * armW, h - seatH, backD, 0, y0 + seatH + (h - seatH) / 2, (d - mainD) / 2 - mainD / 2 + backD / 2 + 10, fab);
      [-1, 1].forEach(k => addBox(g, armW, h - seatH - 150, mainD - 20, k * (w / 2 - armW / 2), y0 + seatH + (h - seatH - 150) / 2, (d - mainD) / 2 + 10, fab));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([kx, kz]) => cyl(g, 25, 80, kx * (w / 2 - 60), y0 + 40, (d - mainD) / 2 + 10 + kz * (mainD / 2 - 80), base, 12));
      if (isL) { const cw = Math.min(900, w * 0.35); addBox(g, cw, seatH + 40, d - mainD + 40, w / 2 - cw / 2, y0 + 80 + (seatH - 40) / 2, -d / 2 + (d - mainD + 40) / 2 + 0, fab); }
      return;
    }
    if (['coffeetable', 'sidetable', 'diningtable', 'studydesk'].includes(cab.at)) {
      // 桌几：桌面（門板色）＋四腳；圓形者用圓柱桌面
      const wood = getMat(cab.doorColor || '110'), tt = cab.at === 'diningtable' ? 40 : 30, round = /圓/.test((D.byCode[cab.code] || {}).name || '');
      if (round) cyl(g, Math.min(w, d) / 2, tt, 0, y0 + h - tt / 2, 0, wood, 40);
      else addBox(g, w, tt, d, 0, y0 + h - tt / 2, 0, wood);
      const lw = cab.at === 'sidetable' ? 30 : 50, leg = applMat('burner');
      if (round) cyl(g, Math.min(w, d) * 0.08 + 20, h - tt, 0, y0 + (h - tt) / 2, 0, leg, 16);
      else [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([kx, kz]) => addBox(g, lw, h - tt, lw, kx * (w / 2 - lw / 2 - 20), y0 + (h - tt) / 2, kz * (d / 2 - lw / 2 - 20), leg, false));
      if (cab.at === 'studydesk') addBox(g, Math.min(420, w * 0.35), h - tt - 60, d - 60, w / 2 - Math.min(420, w * 0.35) / 2 - 20, y0 + 60 + (h - tt - 60) / 2, 0, wood);
      return;
    }
    if (cab.at === 'chair' || cab.at === 'barstool') {
      const wood = getMat(cab.doorColor || '110'), leg = applMat('burner'), seatH = cab.at === 'barstool' ? Math.min(700, h * 0.7) : Math.min(450, h * 0.55);
      if (cab.at === 'barstool') { cyl(g, Math.min(w, d) / 2, 40, 0, y0 + seatH - 20, 0, wood, 24); cyl(g, 22, seatH - 40, 0, y0 + (seatH - 40) / 2, 0, leg, 12); cyl(g, Math.min(w, d) / 2 - 20, 12, 0, y0 + 6, 0, leg, 24); }
      else {
        addBox(g, w, 40, d, 0, y0 + seatH - 20, 0, wood);
        addBox(g, w, h - seatH, 30, 0, y0 + seatH + (h - seatH) / 2, -d / 2 + 15, wood);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([kx, kz]) => addBox(g, 30, seatH - 40, 30, kx * (w / 2 - 25), y0 + (seatH - 40) / 2, kz * (d / 2 - 25), leg, false));
      }
      return;
    }
    if (cab.at === 'nightstand' || cab.at === 'tvstand' || cab.at === 'wardrobe') {
      // 箱型家具：櫃體用櫃身色、門片／抽屜面用門板色
      const body = getMat(cab.bodyColor || cab.doorColor || '110'), door = getMat(cab.doorColor || '110');
      addBox(g, w, h, d, 0, y0 + h / 2, 0, body);
      const n = cab.at === 'wardrobe' ? Math.max(2, Math.round(w / 600)) : cab.at === 'tvstand' ? Math.max(2, Math.round(w / 600)) : 1;
      const fw = (w - 8) / n;
      for (let i = 0; i < n; i++) { addBox(g, fw - 6, h - 8, 18, -w / 2 + 4 + fw * i + fw / 2, y0 + h / 2, d / 2 - 9 + 2, door); addBox(g, 120, 10, 20, -w / 2 + 4 + fw * i + fw / 2, y0 + (cab.at === 'wardrobe' ? h * 0.5 : h - 40), d / 2 + 10, sMat('handle')); }
      return;
    }
    if (cab.at === 'vanity') {
      // 浴櫃：櫃體（用門板色）＋ 上方檯面臉盆
      addBox(g, w, h - 180, d, 0, y0 + (h - 180) / 2, 0, getMat(cab.doorColor || '110'));
      addBox(g, w, 20, d, 0, y0 + h - 170, 0, white);
      cyl(g, Math.min(w, d) * 0.4, 150, 0, y0 + h - 85, 0, white, 28).scale.z = Math.min(1, (d - 40) / (Math.min(w, d) * 0.8));
      return;
    }
    if (cab.at === 'mirrorcab') {
      addBox(g, w, h, d - 4, 0, y0 + h / 2, -2, applMat('white'));
      addBox(g, w - 8, h - 8, 2, 0, y0 + h / 2, d / 2 - 1, applMat('mirror'), false);
      return;
    }
    if (cab.at === 'showerdoor') {
      // 淋浴拉門：鋁框＋玻璃
      addBox(g, w, h, 20, 0, y0 + h / 2, 0, applMat('window'), false);
      [-1, 1].forEach(k => addBox(g, 30, h, 30, k * (w / 2 - 15), y0 + h / 2, 0, steel));
      addBox(g, w, 30, 30, 0, y0 + h - 15, 0, steel);
      return;
    }
    if (cab.at === 'toilet') {
      // 馬桶：水箱＋座體＋便座蓋（壁掛式無水箱底座）
      const tankD = Math.min(200, d * 0.28), tankH = Math.min(380, h * 0.48), seatH = Math.max(380, h - tankH);
      addBox(g, w * 0.92, tankH, tankD, 0, y0 + h - tankH / 2, -d / 2 + tankD / 2, white);
      addBox(g, w * 0.8, seatH * 0.85, d - tankD - 10, 0, y0 + seatH * 0.85 / 2, (tankD) / 2 + 5, white);
      cyl(g, w * 0.46, seatH * 0.15, 0, y0 + seatH * 0.925, d / 2 - w * 0.46 - 20, white, 24).scale.z = (d - tankD - 40) / (w * 0.92);
      addBox(g, w * 0.86, 20, 24, 0, y0 + seatH + 10, -d / 2 + tankD + 12, white);
      return;
    }
    if (cab.at === 'seat') { cyl(g, w / 2, h, 0, y0 + h / 2, 0, white, 24).scale.z = d / w; return; }
    if (cab.at === 'washbasin') {
      // 臉盆：外殼＋內凹（用深色薄盤表示）
      const wall = cab.mount === 'wall';
      cyl(g, w / 2, h, 0, y0 + h / 2, 0, white, 28).scale.z = d / w;
      cyl(g, w / 2 - 25, 2, 0, y0 + h - 1, 0, applMat('window'), 28).scale.z = (d - 50) / (w - 50);
      if (wall) addBox(g, w * 0.5, 60, d * 0.5, 0, y0 + h + 30, -d / 2 + d * 0.25, white);
      return;
    }
    if (cab.at === 'urinal') {
      addBox(g, w, h * 0.35, d * 0.7, 0, y0 + h - h * 0.175, -d / 2 + d * 0.35, white);
      cyl(g, w / 2, h * 0.65, 0, y0 + h * 0.325, -d / 2 + d / 2, white, 24).scale.z = d / w;
      return;
    }
    if (cab.at === 'bathtub') {
      addBox(g, w, h, d, 0, y0 + h / 2, 0, white);
      addBox(g, w - 120, 2, d - 120, 0, y0 + h - 1, 0, applMat('window'));
      return;
    }
    if (cab.at === 'flushvalve') {
      addBox(g, w, h * 0.5, d, 0, y0 + h * 0.75, 0, wire);
      cyl(g, 16, h * 0.5, 0, y0 + h * 0.25, -d / 2 + 16, wire, 12);
      return;
    }
    if (cab.at === 'dryerfan' || cab.at === 'handdryer') { addBox(g, w, h, d, 0, y0 + h / 2, 0, cab.at === 'handdryer' ? applMat('white') : white); if (cab.at === 'dryerfan') addBox(g, w - 40, 2, d - 40, 0, y0 - 1, 0, applMat('burner')); return; }
    if (cab.at === 'faucet' || cab.at === 'basin' || cab.at === 'wallfaucet') {
      // 龍頭：底座＋立管＋彎出水嘴（壁式：由牆面水平伸出）
      const r = cab.at === 'basin' ? 14 : 18, top = y0 + h;
      if (cab.at === 'wallfaucet') {
        cyl(g, r + 6, 12, 0, y0 + h / 2, -d / 2 + 6, wire, 20).rotation.x = Math.PI / 2;
        cyl(g, r - 4, d - 40, 0, y0 + h / 2, -d / 2 + (d - 40) / 2 + 6, wire, 16).rotation.x = Math.PI / 2;
        cyl(g, r - 6, 40, 0, y0 + h / 2 - 20, d / 2 - 20, wire, 16);
        cyl(g, 6, 50, 0, y0 + h / 2 + 10, -d / 2 + 30, wire, 12).rotation.z = Math.PI / 2;
        return;
      }
      const zb = -d / 2 + r + 10;
      cyl(g, r + 6, 24, 0, y0 + 12, zb, wire, 20);
      cyl(g, r - 4, h - 60, 0, y0 + (h - 60) / 2 + 24, zb, wire, 16);
      cyl(g, r - 6, d - r - 30, 0, top - 30, zb + (d - r - 30) / 2, wire, 16).rotation.x = Math.PI / 2;
      cyl(g, r - 6, 50, 0, top - 55, d / 2 - 20, wire, 16);
      cyl(g, 6, 70, 35, y0 + h * 0.45, zb, wire, 12).rotation.z = Math.PI / 2;
      return;
    }
    if (cab.at === 'shower') {
      // 沐浴龍頭組：壁掛混合閥本體＋把手＋蓮蓬頭
      cyl(g, 30, w - 60, 0, y0 + h - 40, -d / 2 + 45, wire, 20).rotation.z = Math.PI / 2;
      [-1, 1].forEach(k => { cyl(g, 24, 50, k * (w / 2 - 30), y0 + h - 40, -d / 2 + 25, wire, 20).rotation.x = Math.PI / 2; });
      cyl(g, 7, 60, 0, y0 + h - 40, -d / 2 + 75, wire, 12).rotation.x = Math.PI / 2;
      cyl(g, 10, 40, w / 2 - 40, y0 + h - 70, -d / 2 + 60, wire, 12);
      cyl(g, 30, 10, w / 2 - 40, y0 + 5, -d / 2 + 60, wire, 20);
      return;
    }
    if (cab.at === 'showercol' || cab.at === 'slidebar') {
      // 淋浴柱／滑桿：直桿＋固定座（淋浴柱加頂部花灑）
      const r = cab.at === 'slidebar' ? 11 : 14;
      cyl(g, r, h - 20, 0, y0 + h / 2, -d / 2 + 40, wire, 16);
      [60, h - 60].forEach(yy => { cyl(g, r + 4, 40, 0, y0 + yy, -d / 2 + 20, wire, 16).rotation.x = Math.PI / 2; });
      if (cab.at === 'showercol') {
        cyl(g, 10, d - 60, 0, y0 + h - 10, 0, wire, 12).rotation.x = Math.PI / 2;
        cyl(g, Math.min(110, w / 2), 10, 0, y0 + h - 10, d / 2 - 110, wire, 32);
        addBox(g, 160, 40, 70, 0, y0 + h * 0.55, -d / 2 + 60, wire, false);
      }
      cyl(g, 18, 90, 0, y0 + h * 0.6, -d / 2 + 60, wire, 12);
      return;
    }
    if (cab.at === 'bidet') {
      cyl(g, 14, 30, 0, y0 + h - 15, -d / 2 + 20, wire, 12).rotation.x = Math.PI / 2;
      cyl(g, 12, h - 40, 0, y0 + (h - 40) / 2, -d / 2 + 40, wire, 12);
      cyl(g, 20, 30, 0, y0 + h - 20, -d / 2 + 40, wire, 16);
      return;
    }
    if (cab.at === 'mirror') {
      // 鏡子：鏡面＋細邊框，貼牆
      addBox(g, w, h, d - 4, 0, y0 + h / 2, -2, wire, false);
      addBox(g, w - 16, h - 16, 2, 0, y0 + h / 2, d / 2 - 1, applMat('mirror'), false);
      return;
    }
    if (cab.at === 'hook') {
      // 掛勾：底座＋彎勾
      addBox(g, w, Math.min(h, 40), 6, 0, y0 + h - Math.min(h, 40) / 2, -d / 2 + 3, wire, false);
      cyl(g, 5, d - 6, 0, y0 + h - 12, 0, wire, 12).rotation.x = Math.PI / 2;
      cyl(g, 5, Math.max(10, h - 20), 0, y0 + (h - 20) / 2 + 4, d / 2 - 5, wire, 12);
      return;
    }
    if (['rack', 'spice', 'knife', 'cup', 'util', 'basket', 'bath', 'paper', 'mshelf', 'toothcup', 'soap', 'brush', 'hairdryer', 'bathacc'].includes(cab.at)) {
      // DAY&DAY 線架：每層＝底部直條＋四邊圍欄；多層加四角立柱；掛式在背面加掛勾
      const tiers = it.tiers || 1, r = 3;
      const lip = tiers > 1 ? Math.min(90, h / tiers * 0.45) : h;
      const bar = (bw, bh, bd, x, y, z) => addBox(g, bw, bh, bd, x, y, z, wire, false);
      for (let t = 0; t < tiers; t++) {
        const yb = y0 + (tiers > 1 ? (h - lip) * t / (tiers - 1) : 0);
        [yb + r / 2, yb + lip - r / 2].forEach(y => {
          bar(w, r, r, 0, y, -d / 2 + r / 2); bar(w, r, r, 0, y, d / 2 - r / 2);
          bar(r, r, d, -w / 2 + r / 2, y, 0); bar(r, r, d, w / 2 - r / 2, y, 0);
        });
        const n = Math.max(2, Math.round(w / 35));
        for (let i = 1; i < n; i++) bar(1.5, 1.5, d - r * 2, -w / 2 + w * i / n, yb + r / 2, 0);
        const m = Math.max(2, Math.round(w / 60));
        for (let i = 0; i <= m; i++) { const x = -w / 2 + r / 2 + (w - r) * i / m; bar(r, lip, r, x, yb + lip / 2, -d / 2 + r / 2); bar(r, lip, r, x, yb + lip / 2, d / 2 - r / 2); }
        const md = Math.max(1, Math.round(d / 60));
        for (let i = 1; i < md; i++) { const z = -d / 2 + d * i / md; bar(r, lip, r, -w / 2 + r / 2, yb + lip / 2, z); bar(r, lip, r, w / 2 - r / 2, yb + lip / 2, z); }
      }
      if (tiers > 1) [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([kx, kz]) => bar(r * 2, h, r * 2, kx * (w / 2 - r), y0 + h / 2, kz * (d / 2 - r)));
      if (cab.mount === 'wall') [-1, 1].forEach(k => bar(r * 2, 40, 14, k * (w / 2 - 20), y0 + h - 20, -d / 2 - 6));
      return;
    }
    addBox(g, w, h, d, 0, y0 + h / 2, 0, face);
  }

  function buildCabinet(cab, opts = {}) {
    const g = new THREE.Group();
    const y0 = cab.y;
    const open = !!opts.open;
    if (cab.kind === 'appl') buildAppl(g, cab);
    else if (cab.kind === 'desk') buildDesk(g, cab);
    else if (cab.kind === 'corner') buildCorner(g, cab, y0, open);
    else if (cab.kind === 'tri') buildTri(g, cab, y0);
    else if (cab.kind === 'filler') buildFiller(g, cab, y0);
    else buildStdBody(g, cab, y0, open);
    // 踢腳
    if (cab.kick && !cab.hanging && cab.kind !== 'tri' && y0 >= 60) {
      const km = getMat(cab.kickColor || cab.bodyColor, gOpt(cab, 'kickColor'));
      const kh = Math.min(D.KICK, y0) - 4;
      if (cab.kind === 'corner') {
        addBox(g, cab.w - cab.d, kh, B, cab.d / 2, y0 - kh / 2 - 2, -cab.w / 2 + cab.d - 40, km);
        addBox(g, B, kh, cab.w - cab.d, -cab.w / 2 + cab.d - 40, y0 - kh / 2 - 2, cab.d / 2, km);
      } else addBox(g, cab.w, kh, B, 0, y0 - kh / 2 - 2, cab.d / 2 - 40, km);
    }
    // 檯面
    if (cab.top && cab.top !== 'none') {
      const tp = D.PARTS.TOP[cab.top];
      const tm = getMat(cab.topColor || cab.doorColor, gOpt(cab, 'topColor'));
      if (cab.kind === 'corner') {
        const L = -cab.w / 2, dd = cab.d + 30;
        addExtrude(g, [[L, L], [cab.w / 2, L], [cab.w / 2, L + dd], [L + dd, L + dd], [L + dd, cab.w / 2], [L, cab.w / 2]], tp.thick, tm, y0 + cab.h);
      } else addBox(g, cab.w, tp.thick, cab.d + 30, 0, y0 + cab.h + tp.thick / 2, 15, tm);
    }
    g.position.set(cab.x, 0, cab.z);
    g.rotation.y = cab.rot * Math.PI / 180;
    if (cab.mirror) g.scale.x = -1;
    g.userData.cabId = cab.id;
    g.traverse(o => { o.userData.cabId = cab.id; });
    return g;
  }

  /* ---------- 空間 3D ---------- */
  function buildRoom(room, opts = {}) {
    const g = new THREE.Group();
    const pts = room.points;
    // 地板
    const fs = new THREE.Shape();
    pts.forEach((p, i) => i ? fs.lineTo(p[0], -p[1]) : fs.moveTo(p[0], -p[1]));
    const fg = new THREE.ShapeGeometry(fs);
    fg.rotateX(-Math.PI / 2);
    const floorMat = floorMaterial(room);
    const floor = new THREE.Mesh(fg, floorMat);
    floor.receiveShadow = true;
    floor.position.y = 0.5;
    floor.userData.isFloor = true;
    g.add(floor);
    const H = room.height, Tk = room.thickness;
    pts.forEach((_, i) => {
      const wi = wallInfo(room, i);
      const wall = room.walls[i];
      const L = wi.len;
      // 外框 + 門洞缺口
      const doors = wall.openings.filter(o => o.sill <= 1).sort((a, b) => a.offset - b.offset);
      const wins = wall.openings.filter(o => o.sill > 1);
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      doors.forEach(o => {
        const a = Math.max(1, o.offset), b = Math.min(L - 1, o.offset + o.width), hh = Math.min(o.height, H - 1);
        s.lineTo(a, 0); s.lineTo(a, hh); s.lineTo(b, hh); s.lineTo(b, 0);
      });
      s.lineTo(L, 0); s.lineTo(L, H); s.lineTo(0, H); s.lineTo(0, 0);
      wins.forEach(o => {
        const a = Math.max(1, o.offset), b = Math.min(L - 1, o.offset + o.width);
        const y1 = Math.max(1, o.sill), y2 = Math.min(H - 1, o.sill + o.height);
        const hole = new THREE.Path();
        hole.moveTo(a, y1); hole.lineTo(b, y1); hole.lineTo(b, y2); hole.lineTo(a, y2); hole.lineTo(a, y1);
        s.holes.push(hole);
      });
      const geo = new THREE.ExtrudeGeometry(s, { depth: Tk, bevelEnabled: false });
      const X = new THREE.Vector3(wi.dir[0], 0, wi.dir[1]);
      const Y = new THREE.Vector3(0, 1, 0);
      const Z = new THREE.Vector3().crossVectors(X, Y);
      const nOut = new THREE.Vector3(wi.nOut[0], 0, wi.nOut[1]);
      if (Z.dot(nOut) < 0) geo.translate(0, 0, -Tk);
      const m = new THREE.Matrix4().makeBasis(X, Y, Z);
      m.setPosition(wi.p[0], 0, wi.p[1]);
      geo.applyMatrix4(m);
      const color = wall.locked ? 0x9c9c9c : (opts.selectedWall === i ? 0xbcd6f7 : 0xf1efea);
      const wm = new THREE.MeshStandardMaterial({ color, roughness: 0.95, transparent: true, opacity: 1, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, wm);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.wallIndex = i;
      mesh.userData.nOut = wi.nOut; mesh.userData.mid = wi.mid;
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.45 }));
      e.userData.isEdge = true; e.userData.wallEdge = true;
      mesh.add(e);
      g.add(mesh);
      // 轉角補塊
      const prev = wallInfo(room, (i - 1 + pts.length) % pts.length);
      const p = wi.p;
      const quad = [[p[0], p[1]], [p[0] + prev.nOut[0] * Tk, p[1] + prev.nOut[1] * Tk],
        [p[0] + prev.nOut[0] * Tk + wi.nOut[0] * Tk, p[1] + prev.nOut[1] * Tk + wi.nOut[1] * Tk], [p[0] + wi.nOut[0] * Tk, p[1] + wi.nOut[1] * Tk]];
      if (polyArea(quad) < 0) quad.reverse();
      const cs = new THREE.Shape(); quad.forEach((q, k) => k ? cs.lineTo(q[0], -q[1]) : cs.moveTo(q[0], -q[1]));
      const cg = new THREE.ExtrudeGeometry(cs, { depth: H, bevelEnabled: false }); cg.rotateX(-Math.PI / 2);
      const cm = new THREE.Mesh(cg, wm);
      cm.userData.wallIndex = i; cm.userData.cornerOf = i;
      cm.userData.nOut = wi.nOut; cm.userData.mid = wi.mid;
      g.add(cm);
      // 門窗配件
      wall.openings.forEach(o => buildOpening(g, wi, o, Tk, H, i));
    });
    return g;
  }

  function buildOpening(g, wi, o, Tk, H, wallIndex) {
    const og = new THREE.Group();
    const fm = sMat('frame');
    const w = o.width, h = Math.min(o.height, H - o.sill);
    const fd = Tk + 20, fw = 45;
    // 局部：x 沿牆、y 上、z 朝外
    if (o.type === 'door') {
      addBox(og, fw, h, fd, fw / 2, h / 2, Tk / 2, fm);
      addBox(og, fw, h, fd, w - fw / 2, h / 2, Tk / 2, fm);
      addBox(og, w, fw, fd, w / 2, h - fw / 2, Tk / 2, fm);
      const leaf = addBox(og, w - 2 * fw - 6, h - fw - 10, 40, w / 2, (h - fw) / 2, Tk / 2, sMat('doorLeaf'));
      leaf.userData.doorLeaf = true;
      const k = new THREE.Mesh(new THREE.SphereGeometry(22, 16, 12), sMat('handle'));
      k.position.set(w - fw - 90, 1000, -12); og.add(k);
      const k2 = k.clone(); k2.position.z = Tk + 12; og.add(k2);
    } else {
      addBox(og, fw, h, fd, fw / 2, o.sill + h / 2, Tk / 2, fm);
      addBox(og, fw, h, fd, w - fw / 2, o.sill + h / 2, Tk / 2, fm);
      addBox(og, w, fw, fd, w / 2, o.sill + h - fw / 2, Tk / 2, fm);
      addBox(og, w + 80, 25, fd + 40, w / 2, o.sill - 12, Tk / 2 - 20, fm);
      if (w > 900) addBox(og, 40, h - 2 * fw, 60, w / 2, o.sill + h / 2, Tk / 2, fm);
      const gl = addBox(og, w - 2 * fw, h - 2 * fw, 6, w / 2, o.sill + h / 2, Tk / 2, sMat('glass'), false);
      gl.castShadow = false;
    }
    const X = new THREE.Vector3(wi.dir[0], 0, wi.dir[1]);
    const Z = new THREE.Vector3(wi.nOut[0], 0, wi.nOut[1]);
    const m = new THREE.Matrix4().makeBasis(X, new THREE.Vector3(0, 1, 0), Z);
    // (沿牆, 上, 朝外) 若為左手座標，改用反向 z 並鏡射子物件深度位置
    if (m.determinant() < 0) {
      og.children.forEach(c => { c.position.z = Tk - c.position.z; });
      m.makeBasis(X, new THREE.Vector3(0, 1, 0), Z.clone().negate());
      m.setPosition(wi.p[0] + wi.dir[0] * o.offset + wi.nOut[0] * Tk, 0, wi.p[1] + wi.dir[1] * o.offset + wi.nOut[1] * Tk);
    } else {
      m.setPosition(wi.p[0] + wi.dir[0] * o.offset, 0, wi.p[1] + wi.dir[1] * o.offset);
    }
    og.applyMatrix4(m);
    og.userData.opening = o.id;
    og.userData.ofWall = wallIndex;
    g.add(og);
  }

  /* ---------- 地板貼圖（程序產生） ---------- */
  const floorTex = new Map();
  function floorDef(room) { return D.FLOORS.find(f => f.id === (room.floor || 'wood-light')) || D.FLOORS[0]; }
  function makeFloorTexture(f) {
    if (floorTex.has(f.id)) return floorTex.get(f.id);
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    let tile = 1200; // 貼圖代表的實際尺寸 mm
    const rnd = (a, b) => a + Math.random() * (b - a);
    if (f.type === 'wood') {
      // 1200×1200mm：8 條 150mm 寬木條，每條一個錯縫接頭
      c.width = c.height = 1024;
      const base = new THREE.Color(f.color);
      const rows = 8, rh = 1024 / rows;
      for (let r = 0; r < rows; r++) {
        const joint = rnd(0.1, 0.9) * 1024;
        [[0, joint], [joint, 1024]].forEach(([x0, x1]) => {
          const tone = base.clone().offsetHSL(rnd(-0.01, 0.01), rnd(-0.05, 0.05), rnd(-0.06, 0.06));
          g.fillStyle = '#' + tone.getHexString(); g.fillRect(x0, r * rh, x1 - x0, rh);
          for (let k = 0; k < 14; k++) {
            g.strokeStyle = `rgba(${f.id === 'wood-dark' ? '20,10,5' : '90,60,30'},${rnd(0.04, 0.12)})`; g.lineWidth = rnd(0.6, 2.2);
            const y = r * rh + rnd(4, rh - 4);
            g.beginPath(); g.moveTo(x0, y);
            for (let x = x0; x <= x1; x += 32) g.lineTo(x, y + Math.sin(x / rnd(60, 140) + k) * rnd(0.5, 2.5));
            g.stroke();
          }
          g.fillStyle = 'rgba(40,25,15,0.55)'; g.fillRect(x0, r * rh, 2, rh);
        });
        g.fillStyle = 'rgba(40,25,15,0.5)'; g.fillRect(0, r * rh, 1024, 2);
      }
    } else {
      // 一片磁磚＝一張貼圖，四邊為填縫
      tile = f.size;
      c.width = c.height = 512;
      g.fillStyle = f.color; g.fillRect(0, 0, 512, 512);
      for (let k = 0; k < 2500; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '120,110,100'},${rnd(0.02, 0.07)})`; g.fillRect(rnd(0, 512), rnd(0, 512), rnd(1, 4), rnd(1, 4)); }
      const gw = Math.max(6, Math.round(512 * 5 / f.size)); // 填縫約 5mm（視覺上略加粗）
      g.fillStyle = f.grout;
      g.fillRect(0, 0, 512, gw / 2); g.fillRect(0, 512 - gw / 2, 512, gw / 2);
      g.fillRect(0, 0, gw / 2, 512); g.fillRect(512 - gw / 2, 0, gw / 2, 512);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.userData.tile = tile;
    floorTex.set(f.id, t);
    return t;
  }
  function floorMaterial(room) {
    const f = floorDef(room);
    if (window.App && App.renderMode === 'white') return new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.95 });
    if (f.type === 'plain') return new THREE.MeshStandardMaterial({ color: f.color, roughness: f.id === 'plain-grey' ? 0.8 : 0.9 });
    const t = makeFloorTexture(f).clone();
    t.needsUpdate = true;
    t.repeat.set(1 / t.userData.tile, 1 / t.userData.tile);
    return new THREE.MeshStandardMaterial({ map: t, roughness: f.type === 'tile' ? 0.45 : 0.8 });
  }

  function clearMatCache() { matCache.clear(); }
  // 色板變更：清除貼圖快取（codes 未指定＝全部）
  function clearSwatchTex(codes) {
    if (!codes) { texCache.clear(); texWaiters.clear(); }
    else codes.forEach(c => { texCache.delete(c); texWaiters.delete(c); });
    matCache.clear();
  }

  window.Model = {
    init(T) { THREE = T; },
    uid, rowsWithFiller, genShelves, createCabinet, footprint, footDepth,
    createRoom, rectRoom, wallInfo, wallName, polyArea, pointInPoly, isModified, cabName,
    rowLip, OPEN_ROW, E_FRONT, buildCabinet, buildRoom, triShape, getMat, clearMatCache, clearSwatchTex, grainOf, imgGrainOf, floorDef, deskGeom, resizeCabinet, handleOf, handleEdge, insetPos, counterOver, deskHoles, isCounterAppl, toLocal, toWorld
  };
})();
