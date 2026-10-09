/* 3D 視窗：仿 SketchUp 操作（中鍵環轉、Shift+中鍵平移、滾輪縮放、工具列） */
(function () {
  let THREE, OrbitControls;
  const V = {};
  const D = window.DATA;
  const M = () => window.Model;
  const deg = Math.PI / 180;

  let renderer, scene, persp, ortho, camera, controls, container, overlay;
  let roomGroup = null, cabGroup, helperGroup, grid, axes, ghost = null, selBox = null;
  const cabObjs = new Map();
  let raycaster, mouse, groundPlane;
  let hemi, dir, amb;
  let openAll = false;
  const openSet = new Set();

  V.tool = 'select';
  V.wallMode = 'auto';

  V.init = function (el, T, OC) {
    THREE = T; OrbitControls = OC;
    container = el;
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false; // 模型空間不使用太陽陰影
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    overlay = document.createElement('div'); overlay.className = 'vp-overlay'; el.appendChild(overlay);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef1f4);
    persp = new THREE.PerspectiveCamera(40, 1, 10, 400000);
    ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -200000, 400000);
    camera = persp;
    camera.position.set(6500, 5200, 7500);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.zoomSpeed = 1.2;
    controls.maxPolarAngle = Math.PI * 0.499 * 2;
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    controls.target.set(0, 900, 0);
    controls.update();

    hemi = new THREE.HemisphereLight(0xffffff, 0xb9ad9a, 0.9); scene.add(hemi);
    amb = new THREE.AmbientLight(0xffffff, 0.25); scene.add(amb);
    dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(4000, 9000, 6000);
    dir.castShadow = false;
    dir.shadow.mapSize.set(2048, 2048);
    const sc = dir.shadow.camera; sc.left = -9000; sc.right = 9000; sc.top = 9000; sc.bottom = -9000; sc.near = 100; sc.far = 30000;
    dir.shadow.bias = -0.0005;
    scene.add(dir); scene.add(dir.target);

    grid = new THREE.Group();
    const g1 = new THREE.GridHelper(40000, 40, 0xc3c9d0, 0xd6dbe0); g1.material.transparent = true; g1.material.opacity = 0.6;
    grid.add(g1);
    const g2 = new THREE.GridHelper(40000, 400, 0xe3e7eb, 0xe3e7eb); g2.material.transparent = true; g2.material.opacity = 0.35; g2.position.y = -1;
    grid.add(g2);
    scene.add(grid);
    axes = new THREE.Group();
    const axis = (to, color, dashed) => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), to]);
      const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 200, gapSize: 150 }) : new THREE.LineBasicMaterial({ color });
      const l = new THREE.Line(geo, mat); if (dashed) l.computeLineDistances(); axes.add(l);
    };
    axis(new THREE.Vector3(20000, 2, 0), 0xd32f2f); axis(new THREE.Vector3(-20000, 2, 0), 0xd32f2f, true);
    axis(new THREE.Vector3(0, 2, -20000), 0x2e9e44); axis(new THREE.Vector3(0, 2, 20000), 0x2e9e44, true);
    axis(new THREE.Vector3(0, 20000, 0), 0x1f5fd6);
    scene.add(axes);

    cabGroup = new THREE.Group(); scene.add(cabGroup);
    helperGroup = new THREE.Group(); scene.add(helperGroup);

    raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 5 };
    mouse = new THREE.Vector2();
    groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const cvs = renderer.domElement;
    cvs.addEventListener('pointerdown', onDown);
    cvs.addEventListener('pointermove', onMove);
    cvs.addEventListener('pointerup', onUp);
    cvs.addEventListener('dblclick', onDbl);
    cvs.addEventListener('contextmenu', e => e.preventDefault());
    cvs.addEventListener('dragover', e => { e.preventDefault(); if (V.tool === 'place') { setMouse(e); updateGhost(); } });
    cvs.addEventListener('drop', e => { e.preventDefault(); if (V.tool === 'place') { setMouse(e); updateGhost(); commitPlace(); } });
    new ResizeObserver(resize).observe(el);
    window.addEventListener('resize', resize);
    resize();
    animate();
  };

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    persp.aspect = w / h; persp.updateProjectionMatrix();
    updateOrthoFrustum();
  }
  function updateOrthoFrustum() {
    const w = container.clientWidth, h = container.clientHeight;
    const dist = camera === ortho ? V._orthoDist || 8000 : persp.position.distanceTo(controls.target);
    const fh = 2 * dist * Math.tan(persp.fov * deg / 2);
    ortho.left = -fh * w / h / 2; ortho.right = fh * w / h / 2; ortho.top = fh / 2; ortho.bottom = -fh / 2;
    ortho.updateProjectionMatrix();
  }

  function animate() {
    requestAnimationFrame(animate);
    // 容器尺寸改變但未收到 ResizeObserver 通知時（例如分頁在背景載入）自動修正
    const cv = renderer.domElement;
    if (container.clientWidth && container.clientHeight && (Math.abs(cv.clientWidth - container.clientWidth) > 1 || Math.abs(cv.clientHeight - container.clientHeight) > 1)) resize();
    tween();
    updateWalls();
    renderer.render(scene, camera);
    updateLabels();
  }

  /* ---------- 相機 ---------- */
  let tw = null;
  function tween() {
    if (!tw) return;
    const t = Math.min(1, (performance.now() - tw.t0) / tw.dur);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    camera.position.lerpVectors(tw.p0, tw.p1, e);
    controls.target.lerpVectors(tw.c0, tw.c1, e);
    camera.lookAt(controls.target);
    if (t >= 1) { tw = null; controls.update(); }
  }
  V.flyTo = function (pos, target, dur = 550) {
    tw = { t0: performance.now(), dur, p0: camera.position.clone(), p1: new THREE.Vector3(...pos), c0: controls.target.clone(), c1: new THREE.Vector3(...target) };
  };
  V.getCamera = () => ({ pos: camera.position.toArray().map(Math.round), target: controls.target.toArray().map(Math.round), ortho: camera === ortho, zoom: camera.zoom });
  V.setCamera = function (c, animate = true) {
    if (!!c.ortho !== (camera === ortho)) V.setProjection(c.ortho);
    if (camera === ortho && c.zoom) { ortho.zoom = c.zoom; ortho.updateProjectionMatrix(); }
    if (animate) V.flyTo(c.pos, c.target); else { camera.position.set(...c.pos); controls.target.set(...c.target); controls.update(); }
  };
  V.setProjection = function (isOrtho) {
    const pos = camera.position.clone(), tgt = controls.target.clone();
    if (isOrtho && camera !== ortho) {
      V._orthoDist = pos.distanceTo(tgt);
      camera = ortho; ortho.zoom = 1; updateOrthoFrustum();
    } else if (!isOrtho && camera !== persp) {
      camera = persp;
      const dist = (V._orthoDist || 8000) / (ortho.zoom || 1);
      const dirv = pos.clone().sub(tgt).normalize();
      pos.copy(tgt).add(dirv.multiplyScalar(dist));
    }
    camera.position.copy(pos); camera.up.set(0, 1, 0);
    controls.object = camera; controls.target.copy(tgt); controls.update();
    App.ui && App.ui.syncToolbar();
  };
  V.isOrtho = () => camera === ortho;
  // 立即重繪一次（截圖、匯出前使用）
  V.renderNow = function () { resize(); tw = null; controls.update(); updateWalls(); renderer.render(scene, camera); updateLabels(); };
  // 3D 座標 → 畫布內像素座標
  V.toScreen = function (x, y, z) {
    camera.updateMatrixWorld();
    const q = new THREE.Vector3(x, y, z).project(camera), r = renderer.domElement.getBoundingClientRect();
    return [(q.x + 1) / 2 * r.width, (1 - q.y) / 2 * r.height];
  };

  function sceneBox() {
    const box = new THREE.Box3();
    if (roomGroup) box.expandByObject(roomGroup);
    cabGroup.children.forEach(c => box.expandByObject(c));
    if (box.isEmpty()) box.set(new THREE.Vector3(-3000, 0, -3000), new THREE.Vector3(3000, 2400, 3000));
    return box;
  }
  // 計算讓外框剛好填滿畫面的相機距離（margin：四周留白比例）
  function fitDistance(box, d, margin = 1.08) {
    const c = box.getCenter(new THREE.Vector3());
    const f = d.clone().negate();
    const up = Math.abs(f.y) > 0.99 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
    const r = new THREE.Vector3().crossVectors(f, up).normalize(), u = new THREE.Vector3().crossVectors(r, f).normalize();
    const tanV = Math.tan(persp.fov * deg / 2), tanH = tanV * (persp.aspect || 1.6);
    let need = 0, halfW = 0, halfH = 0;
    [box.min.x, box.max.x].forEach(x => [box.min.y, box.max.y].forEach(y => [box.min.z, box.max.z].forEach(z => {
      const rel = new THREE.Vector3(x, y, z).sub(c);
      const px = Math.abs(rel.dot(r)), py = Math.abs(rel.dot(u)), pz = rel.dot(f);
      need = Math.max(need, px / tanH - pz, py / tanV - pz);
      halfW = Math.max(halfW, px); halfH = Math.max(halfH, py);
    })));
    return { c, dist: need * margin, halfW: halfW * margin, halfH: halfH * margin };
  }
  // 實際空間外框：房間牆體（含牆厚）＋ 所有櫃體 / 設備
  function roomBox() {
    const room = App.state.room;
    if (!room) return sceneBox();
    const T = room.thickness || 0, xs = room.points.map(p => p[0]), zs = room.points.map(p => p[1]);
    const box = new THREE.Box3(new THREE.Vector3(Math.min(...xs) - T, 0, Math.min(...zs) - T), new THREE.Vector3(Math.max(...xs) + T, room.height, Math.max(...zs) + T));
    cabGroup.children.forEach(c => box.expandByObject(c));
    return box;
  }
  V.fitRoom = function () {
    let d = camera.position.clone().sub(controls.target).normalize();
    // 視角太低（平視或由下往上）時改用標準等角視角
    if (camera !== ortho && d.y < 0.25) d = new THREE.Vector3(1, 0.8, 1.15).normalize();
    V.zoomExtents(d.toArray(), roomBox());
  };
  V.zoomExtents = function (dirv, boxIn) {
    const box = boxIn || sceneBox();
    const d = dirv ? new THREE.Vector3(...dirv).normalize() : camera.position.clone().sub(controls.target).normalize();
    const fit = fitDistance(box, d);
    if (camera === ortho) {
      // 平行投影：以縮放倍率填滿
      const w = container.clientWidth || 1, h = container.clientHeight || 1;
      V._orthoDist = Math.max(fit.dist, 1000);
      const fh = 2 * V._orthoDist * Math.tan(persp.fov * deg / 2), fw = fh * w / h;
      ortho.zoom = Math.min(fw / (2 * fit.halfW), fh / (2 * fit.halfH));
      updateOrthoFrustum(); ortho.updateProjectionMatrix();
      V.flyTo(fit.c.clone().add(d.clone().multiplyScalar(V._orthoDist)).toArray(), fit.c.toArray());
      return;
    }
    V.flyTo(fit.c.clone().add(d.clone().multiplyScalar(fit.dist)).toArray(), fit.c.toArray());
  };
  V.overviewCam = function () {
    const box = sceneBox();
    const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
    const dist = r / Math.sin(persp.fov * deg / 2) * 0.9;
    const d = new THREE.Vector3(1, 0.8, 1.15).normalize();
    return { pos: c.clone().add(d.multiplyScalar(dist)).toArray().map(Math.round), target: c.toArray().map(Math.round), ortho: false, zoom: 1 };
  };
  V.setView = function (name) {
    const dirs = { iso: [1, 0.8, 1.15], top: [0, 1, 0.0001], front: [0, 0.0001, 1], back: [0, 0.0001, -1], left: [-1, 0.0001, 0], right: [1, 0.0001, 0] };
    V.zoomExtents(dirs[name]);
  };

  /* ---------- 牆面自動透明 ---------- */
  function updateWalls() {
    if (!roomGroup) return;
    const cp = camera.position;
    const topView = camera.position.y - controls.target.y > 0.97 * camera.position.distanceTo(controls.target);
    const hidden = new Set();
    roomGroup.children.forEach(m => {
      if (m.userData.wallIndex == null) return;
      const n = m.userData.nOut, mid = m.userData.mid;
      let hide = false;
      if (V.wallMode === 'hide') hide = true;
      else if (V.wallMode === 'auto' && !topView) {
        const vx = cp.x - mid[0], vz = cp.z - mid[1];
        hide = (vx * n[0] + vz * n[1]) > 0;
        if (camera === ortho) { const dv = camera.getWorldDirection(new THREE.Vector3()); hide = (dv.x * n[0] + dv.z * n[1]) < -0.05; }
      }
      if (hide) hidden.add(m.userData.wallIndex);
      const op = hide ? 0.1 : 1;
      if (m.material.opacity !== op) { m.material.opacity = op; m.material.depthWrite = !hide; m.material.needsUpdate = true; }
      m.children.forEach(c => { if (c.userData.wallEdge) c.visible = !hide; });
    });
    roomGroup.children.forEach(m => { if (m.userData.ofWall != null) m.visible = !hidden.has(m.userData.ofWall); });
  }

  /* ---------- 場景同步 ---------- */
  V.rebuildRoom = function () {
    if (roomGroup) { scene.remove(roomGroup); dispose(roomGroup); roomGroup = null; }
    const st = App.state;
    if (!st.room) return;
    roomGroup = M().buildRoom(st.room, { selectedWall: App.sel && App.sel.type === 'wall' ? App.sel.index : -1 });
    scene.add(roomGroup);
    const box = new THREE.Box3().expandByObject(roomGroup);
    const c = box.getCenter(new THREE.Vector3());
    dir.target.position.copy(c); dir.position.set(c.x + 4000, 9000, c.z + 6000);
  };
  function buildOne(id) {
    const old = cabObjs.get(id);
    const wasCounter = !!(old && old.userData.counter);
    if (old) { cabGroup.remove(old); dispose(old); cabObjs.delete(id); }
    const cab = App.state.cabinets.find(c => c.id === id);
    if (cab) {
      const g = M().buildCabinet(cab, { open: openAll || openSet.has(id) });
      g.userData.counter = M().isCounterAppl(cab);
      cabGroup.add(g); cabObjs.set(id, g);
    }
    return wasCounter || M().isCounterAppl(cab);
  }
  V.rebuildCabinet = function (id) {
    // 水槽 / 爐具變動時，一併重建桌面開孔與下方櫃體頂板
    if (buildOne(id)) App.state.cabinets.forEach(c => { if (c.id !== id && (c.kind === 'desk' || (!c.hanging && c.kind !== 'appl' && c.kind !== 'tri'))) buildOne(c.id); });
    updateSelBox();
  };
  V.rebuildAll = function () {
    [...cabObjs.keys()].forEach(id => { const g = cabObjs.get(id); cabGroup.remove(g); dispose(g); });
    cabObjs.clear();
    App.state.cabinets.forEach(c => V.rebuildCabinet(c.id));
    V.rebuildRoom();
    updateSelBox();
  };
  function dispose(obj) {
    obj.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  V.toggleOpenAll = function () { openAll = !openAll; openSet.clear(); App.state.cabinets.forEach(c => V.rebuildCabinet(c.id)); return openAll; };
  V.isOpenAll = () => openAll;
  V.toggleOpen = function (id) { if (openSet.has(id)) openSet.delete(id); else openSet.add(id); V.rebuildCabinet(id); };

  /* ---------- 桌面寬度掣點 ---------- */
  let gripGroup = null;
  const grip = { active: false };
  function deskGripPos(cab) {
    const xa = xAxisOf(cab.rot), za = zAxisOf(cab.rot);
    const zc = cab.shape === 'R' ? 0 : -M().footDepth(cab) / 2 + cab.d / 2;
    const y = cab.y + cab.thick + 12;
    const list = [-1, 1].map(side => ({ side, p: new THREE.Vector3(cab.x + xa[0] * side * (cab.w / 2 + 25) + za[0] * zc, y, cab.z + xa[1] * side * (cab.w / 2 + 25) + za[1] * zc) }));
    // 深度掣點：桌面前緣（端部）中央
    const zf = -M().footDepth(cab) / 2 + cab.d + 25;
    list.push({ side: 'd', p: new THREE.Vector3(cab.x + za[0] * zf, y, cab.z + za[1] * zf) });
    return list;
  }
  // 桌面深度上下限（L/ㄇ形受側翼限制）
  function deskDepthMax(cab) { return cab.shape === 'U' ? (cab.w - 200) / 2 : cab.shape === 'L' ? Math.min(cab.w, cab.l2) - 200 : 1500; }
  function updateGrips() {
    if (gripGroup) { helperGroup.remove(gripGroup); gripGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); gripGroup = null; }
    const s = App.sel;
    const cab = s && s.type === 'cab' ? App.state.cabinets.find(c => c.id === s.id) : null;
    if (!cab || cab.kind !== 'desk' || move.active) return;
    gripGroup = new THREE.Group();
    deskGripPos(cab).forEach(({ side, p }) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(32, 20, 14), new THREE.MeshBasicMaterial({ color: grip.active && grip.side === side ? 0xff8f00 : side === 'd' ? 0x1e88e5 : 0x5a8f00, depthTest: false }));
      m.position.copy(p); m.renderOrder = 1000; m.userData.grip = side;
      const ring = new THREE.Mesh(new THREE.SphereGeometry(44, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      ring.position.copy(p); ring.renderOrder = 999;
      gripGroup.add(ring, m);
    });
    helperGroup.add(gripGroup);
  }
  function pickGrip() {
    if (!gripGroup) return null;
    { const c = App.selectedCab && App.selectedCab(); if (c && c.locked) return null; }
    gripGroup.updateMatrixWorld();
    raycaster.setFromCamera(mouse, camera);
    const h = raycaster.intersectObjects(gripGroup.children.filter(o => o.userData.grip), false)[0];
    return h ? h.object.userData.grip : null;
  }
  function castWall(ox, oz, dx, dz) {
    const room = App.state.room; if (!room) return Infinity;
    let best = Infinity;
    room.points.forEach((p, i) => {
      const q = room.points[(i + 1) % room.points.length];
      const ex = q[0] - p[0], ez = q[1] - p[1], den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) return;
      const t = ((p[0] - ox) * ez - (p[1] - oz) * ex) / den, u = ((p[0] - ox) * dz - (p[1] - oz) * dx) / den;
      if (t > 1 && u >= -1e-6 && u <= 1 + 1e-6 && t < best) best = t;
    });
    return best;
  }
  function startGrip(side) {
    const cab = App.state.cabinets.find(c => c.id === App.sel.id);
    const xa = xAxisOf(cab.rot);
    if (side === 'd') {
      const za = zAxisOf(cab.rot), hb = M().footDepth(cab) / 2;
      Object.assign(grip, { active: true, side, id: cab.id, start: { d: cab.d, w: cab.w, x: cab.x, z: cab.z }, za, fixed: [cab.x - za[0] * hb, cab.z - za[1] * hb] });
      controls.enabled = false;
      updateGrips();
      return;
    }
    Object.assign(grip, { active: true, side, id: cab.id, start: { w: cab.w, x: cab.x, z: cab.z }, xa,
      fixed: [cab.x - xa[0] * side * cab.w / 2, cab.z - xa[1] * side * cab.w / 2] });
    controls.enabled = false;
    updateGrips();
  }
  function gripUpdate() {
    const cab = App.state.cabinets.find(c => c.id === grip.id); if (!cab) return;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(cab.y + cab.thick));
    raycaster.setFromCamera(mouse, camera);
    const p = new THREE.Vector3(); if (!raycaster.ray.intersectPlane(plane, p)) return;
    if (grip.side === 'd') { depthUpdate(cab, p); return; }
    const dir = [grip.xa[0] * grip.side, grip.xa[1] * grip.side];
    let t = (p.x - grip.fixed[0]) * dir[0] + (p.z - grip.fixed[1]) * dir[1];
    t = Math.round(t / 10) * 10;
    // 吸附：同方向櫃體的側邊、牆面
    const za = zAxisOf(cab.rot), dz = M().footDepth(cab);
    const cands = [];
    App.state.cabinets.forEach(c => {
      if (c.id === cab.id || c.kind === 'desk' || c.hanging) return;
      if (Math.abs((((c.rot - cab.rot) % 360) + 540) % 360 - 180) > 1) return;
      const across = (c.x - cab.x) * za[0] + (c.z - cab.z) * za[1];
      if (Math.abs(across) > (M().footDepth(c) + dz) / 2 - 10) return;
      const along = (c.x - grip.fixed[0]) * dir[0] + (c.z - grip.fixed[1]) * dir[1];
      cands.push([along + c.w / 2, M().cabName(c) + ' 側邊'], [along - c.w / 2, M().cabName(c) + ' 側邊']);
    });
    const wd = castWall(grip.fixed[0] - dir[0] * 2, grip.fixed[1] - dir[1] * 2, dir[0], dir[1]);
    if (isFinite(wd)) cands.push([Math.round(wd - 2), '牆面']);
    let snap = '';
    cands.forEach(([v, name]) => { if (v > 250 && Math.abs(v - t) < 60 && (!snap || Math.abs(v - t) < Math.abs(snap.v - t))) snap = { v, name }; });
    if (snap) t = Math.round(snap.v);
    t = Math.max(300, t);
    cab.w = t;
    cab.x = Math.round(grip.fixed[0] + dir[0] * t / 2); cab.z = Math.round(grip.fixed[1] + dir[1] * t / 2);
    V.rebuildCabinet(cab.id);
    V.checkOverlaps(); V.showGaps(cab);
    App.status(`桌面寬度 ${t} mm　${snap ? '吸附【' + snap.name + '】' : '（10mm 網格）'}　放開完成，Esc 取消`);
  }
  // 拖曳深度掣點：背面固定，前緣可自由拉出（吸附櫃體前緣、櫃體前緣＋20mm、牆面）
  function depthUpdate(cab, p) {
    const za = grip.za;
    let t = Math.round(((p.x - grip.fixed[0]) * za[0] + (p.z - grip.fixed[1]) * za[1]) / 10) * 10;
    const xa = xAxisOf(cab.rot), cands = [];
    App.state.cabinets.forEach(c => {
      if (c.id === cab.id || c.kind === 'desk' || c.kind === 'appl' || c.hanging) return;
      if (Math.abs((((c.rot - cab.rot) % 360) + 540) % 360 - 180) > 1) return;
      const along = (c.x - cab.x) * xa[0] + (c.z - cab.z) * xa[1];
      if (Math.abs(along) > (c.w + cab.w) / 2 - 10) return;
      const front = (c.x - grip.fixed[0]) * za[0] + (c.z - grip.fixed[1]) * za[1] + M().footDepth(c) / 2;
      cands.push([front, M().cabName(c) + ' 前緣'], [front + 20, M().cabName(c) + ' 前緣＋20mm']);
    });
    const wd = castWall(grip.fixed[0] + za[0] * 2, grip.fixed[1] + za[1] * 2, za[0], za[1]);
    if (isFinite(wd)) cands.push([Math.round(wd), '牆面']);
    let snap = '';
    cands.forEach(([v, name]) => { if (v > 150 && Math.abs(v - t) < 30 && (!snap || Math.abs(v - t) < Math.abs(snap.v - t))) snap = { v, name }; });
    if (snap) t = Math.round(snap.v);
    t = Math.max(200, Math.min(deskDepthMax(cab), t));
    cab.d = t;
    if (cab.shape === 'R') { cab.x = Math.round(grip.fixed[0] + za[0] * t / 2); cab.z = Math.round(grip.fixed[1] + za[1] * t / 2); }
    V.rebuildCabinet(cab.id);
    V.checkOverlaps(); V.showGaps(cab);
    App.status(`桌面深度 ${t} mm　${snap ? '吸附【' + snap.name + '】' : '（10mm 網格）'}　放開完成，Esc 取消`);
  }
  function endGrip(commit) {
    if (!grip.active) return;
    const cab = App.state.cabinets.find(c => c.id === grip.id);
    grip.active = false; controls.enabled = true;
    if (!cab) return;
    if (grip.side === 'd') {
      const after = { d: cab.d, x: cab.x, z: cab.z };
      Object.assign(cab, grip.start);
      if (commit && after.d !== grip.start.d) { App.mutate('調整桌面深度', () => Object.assign(cab, after), [cab.id]); App.toast(`桌面深度 ${after.d} mm`); }
      else { V.rebuildCabinet(cab.id); V.checkOverlaps(); }
      App.status('');
      return;
    }
    const after = { w: cab.w, x: cab.x, z: cab.z };
    Object.assign(cab, grip.start);
    if (commit && after.w !== grip.start.w) { App.mutate('調整桌面寬度', () => Object.assign(cab, after), [cab.id]); App.toast(`桌面寬度 ${after.w} mm`); }
    else { V.rebuildCabinet(cab.id); V.checkOverlaps(); }
    App.status('');
  }

  function updateSelBox() {
    if (V.refreshGaps && !move.active) setTimeout(V.refreshGaps, 0);
    setTimeout(updateGrips, 0);
    if (selBox) { helperGroup.remove(selBox); selBox = null; }
    const s = App.sel;
    if (s && s.type === 'cab') {
      const g = cabObjs.get(s.id);
      if (g) { selBox = new THREE.BoxHelper(g, 0x5a8f00); selBox.material.linewidth = 2; helperGroup.add(selBox); }
    }
  }
  V.updateSelection = function () { updateSelBox(); V.refreshGaps(); };

  /* ---------- 標籤 ---------- */
  const labels = [];
  function updateLabels() {
    overlay.innerHTML = '';
    const w = container.clientWidth, h = container.clientHeight;
    const put = (p, text, cls) => {
      const v = p.clone().project(camera);
      if (v.z > 1) return;
      if (cls === 'dim' && occluded(p)) return;
      const el = document.createElement('div');
      el.className = 'vp-label ' + (cls || '');
      el.textContent = text;
      el.style.left = ((v.x + 1) / 2 * w) + 'px'; el.style.top = ((1 - v.y) / 2 * h) + 'px';
      overlay.appendChild(el);
    };
    labels.forEach(l => put(l.p, l.text, l.cls));
    V.gapLabels.forEach(l => put(l.p, l.text, l.cls));
    // 鎖點標記
    if (V.tool === 'tape' || V.tool === 'line') {
      const mark = (p, type, tip) => {
        const v = p.clone().project(camera); if (v.z > 1) return;
        const el = document.createElement('div');
        el.className = 'snap-mark snap-' + ({ '端點': 'end', '中點': 'mid', '邊線上': 'edge', '面上': 'face', '地面': 'ground', '紅軸': 'axis', '綠軸': 'axis', '藍軸': 'axis', '起點': 'start', '對齊': 'axis' }[type] || 'face');
        el.style.left = ((v.x + 1) / 2 * w) + 'px'; el.style.top = ((1 - v.y) / 2 * h) + 'px';
        el.style.setProperty('--c', SNAP_COLOR[type] || (type === '起點' ? '#1e9e2f' : type === '對齊' ? '#e8710a' : '#1f5fd6'));
        if (tip) { const t = document.createElement('span'); t.textContent = typeof tip === 'string' ? tip : type; el.appendChild(t); }
        overlay.appendChild(el);
      };
      if (V.tool === 'tape' && tape.a) mark(tape.a, tape.aType || '端點', false);
      if (V.tool === 'line' && draw.pts.length) mark(new THREE.Vector3(draw.pts[0][0], 0, draw.pts[0][1]), '起點', draw.pts.length > 2 ? '起點' : false);
      if (V.snapMark) mark(V.snapMark.p, V.snapMark.type, V.tool === 'line' ? (V.snapMark.tip || false) : true);
    }
    const s = App.sel;
    const mini = document.getElementById('miniBar');
    if (mini) mini.hidden = true;
    if (s && s.type === 'cab') {
      const cab = App.state.cabinets.find(c => c.id === s.id);
      const g = cabObjs.get(s.id);
      if (cab && g) {
        const b = new THREE.Box3().setFromObject(g);
        if (mini && !move.active && !grip.active && (V.tool === 'select' || V.tool === 'move' || V.tool === 'rotate')) {
          // 放在綠色型號標籤上方，不遮住標籤
          const v = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y + 60, (b.min.z + b.max.z) / 2).project(camera);
          if (v.z < 1) {
            mini.hidden = false;
            const labelTop = (1 - v.y) / 2 * h - 13;
            mini.style.left = ((v.x + 1) / 2 * w) + 'px';
            mini.style.top = Math.max(8, labelTop - 6 - (mini.offsetHeight || 36)) + 'px';
          }
        }
        // 櫃體名稱本身已含 W/D/H，不再重複；桌面與設備的名稱沒有尺寸，才補上
        const nm = M().cabName(cab);
        const lbl = ((cab.kind === 'desk' || cab.kind === 'appl') ? `${nm}  W${cab.w} x D${cab.d} x H${cab.h} mm` : nm) + (cab.locked ? '　🔒 已鎖定' : '');
        put(new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y + 60, (b.min.z + b.max.z) / 2), lbl, 'sel');
      }
    }
    if (s && s.type === 'wall' && App.state.room) {
      const wi = M().wallInfo(App.state.room, s.index);
      put(new THREE.Vector3(wi.mid[0], App.state.room.height + 80, wi.mid[1]), `${M().wallName(s.index)}  ${Math.round(wi.len)} mm`, 'sel');
    }
    if (V.tool === 'line' && draw.pts.length && draw.cursor) {
      const a = draw.pts[draw.pts.length - 1];
      const len = Math.hypot(draw.cursor[0] - a[0], draw.cursor[1] - a[1]);
      put(new THREE.Vector3((a[0] + draw.cursor[0]) / 2, 30, (a[1] + draw.cursor[1]) / 2), Math.round(len) + ' mm', 'draw');
    }
    if (App.state.room && V.showWallDims) {
      App.state.room.points.forEach((_, i) => {
        const wi = M().wallInfo(App.state.room, i);
        put(new THREE.Vector3(wi.mid[0] + wi.nOut[0] * 400, 10, wi.mid[1] + wi.nOut[1] * 400), Math.round(wi.len) + '', 'dim');
      });
    }
  }
  V.showWallDims = true;
  const occRay = { rc: null };
  function occluded(p) {
    if (!occRay.rc) occRay.rc = new THREE.Raycaster();
    const from = camera.position.clone();
    const dirv = p.clone().sub(from); const dist = dirv.length();
    occRay.rc.set(from, dirv.normalize()); occRay.rc.far = dist - 30;
    return occRay.rc.intersectObjects(cabGroup.children, true).some(h => h.object.isMesh);
  }

  /* ---------- 滑鼠 ---------- */
  function setMouse(e) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    camera.updateMatrixWorld();
    V.lastClient = [e.clientX, e.clientY];
  }
  function groundPoint(y = 0) {
    raycaster.setFromCamera(mouse, camera);
    groundPlane.constant = -y;
    const p = new THREE.Vector3();
    return raycaster.ray.intersectPlane(groundPlane, p) ? p : null;
  }
  function pick() {
    raycaster.setFromCamera(mouse, camera);
    const objs = [...cabGroup.children];
    if (roomGroup) objs.push(roomGroup);
    const hits = raycaster.intersectObjects(objs, true).filter(h => h.object.isMesh && h.object.visible && !(h.object.material && h.object.material.opacity < 0.2));
    for (const h of hits) {
      if (h.object.userData.cabId) return { type: 'cab', id: h.object.userData.cabId, point: h.point };
      let o = h.object;
      while (o && o.userData.wallIndex == null && o.parent) o = o.parent;
      if (o && o.userData.wallIndex != null) return { type: 'wall', index: o.userData.wallIndex, point: h.point };
      if (h.object.userData.isFloor) return { type: 'floor', point: h.point };
    }
    return null;
  }
  // 鎖點（仿 SketchUp 推導）：端點 > 中點 > 邊線上 > 面上 > 地面；有起點時再做紅/綠/藍軸推導
  const SNAP_COLOR = { '端點': '#1e9e2f', '中點': '#00a3c4', '邊線上': '#d32f2f', '面上': '#1f5fd6', '地面': '#6b7280', '紅軸': '#d32f2f', '綠軸': '#1e9e2f', '藍軸': '#1f5fd6' };
  let AXES_V = null;
  const AXES = () => AXES_V || (AXES_V = [['紅軸', new THREE.Vector3(1, 0, 0)], ['綠軸', new THREE.Vector3(0, 0, 1)], ['藍軸', new THREE.Vector3(0, 1, 0)]]);
  function pickPoint(from, lockAxis) {
    raycaster.setFromCamera(mouse, camera);
    const objs = [...cabGroup.children]; if (roomGroup) objs.push(roomGroup);
    const hits = raycaster.intersectObjects(objs, true).filter(h => h.object.isMesh && h.object.visible && !(h.object.material && h.object.material.opacity < 0.2));
    const cr = renderer.domElement.getBoundingClientRect();
    const scr = v => { const q = v.clone().project(camera); return [(q.x + 1) / 2 * cr.width, (1 - q.y) / 2 * cr.height]; };
    const ms = [(mouse.x + 1) / 2 * cr.width, (1 - mouse.y) / 2 * cr.height];
    const d2 = a => (a[0] - ms[0]) ** 2 + (a[1] - ms[1]) ** 2;
    let res = null;
    if (hits.length) {
      const h = hits[0];
      // 蒐集命中物件（與同一櫃體/空間）的邊線
      const segs = [];
      const va = new THREE.Vector3(), vb = new THREE.Vector3();
      const collect = mesh => mesh.children.forEach(c => {
        if (!c.userData.isEdge) return;
        const pa = c.geometry.attributes.position;
        for (let i = 0; i + 1 < pa.count; i += 2) segs.push([va.fromBufferAttribute(pa, i).applyMatrix4(c.matrixWorld).clone(), vb.fromBufferAttribute(pa, i + 1).applyMatrix4(c.matrixWorld).clone()]);
      });
      collect(h.object);
      if (h.object.parent) h.object.parent.children.forEach(o => { if (o !== h.object && o.isMesh && o.position.distanceTo(h.object.position) < 1500) collect(o); });
      let best = null;
      const PT = 11 * 11, EDGE = 7 * 7;
      segs.forEach(([a, b]) => {
        [[a, '端點', 0], [b, '端點', 0], [a.clone().add(b).multiplyScalar(0.5), '中點', 1]].forEach(([p, type, pri]) => {
          const dd = d2(scr(p));
          if (dd < PT && (!best || pri < best.pri || (pri === best.pri && dd < best.dd))) best = { p, type, pri, dd };
        });
      });
      if (!best) {
        segs.forEach(([a, b]) => {
          const A = scr(a), Bs = scr(b), vx = Bs[0] - A[0], vy = Bs[1] - A[1], L = vx * vx + vy * vy;
          if (L < 1) return;
          const t = Math.max(0, Math.min(1, ((ms[0] - A[0]) * vx + (ms[1] - A[1]) * vy) / L));
          const dd = (A[0] + vx * t - ms[0]) ** 2 + (A[1] + vy * t - ms[1]) ** 2;
          if (dd < EDGE && (!best || dd < best.dd)) best = { p: a.clone().lerp(b, t), type: '邊線上', dd };
        });
      }
      res = best ? { p: best.p, snap: best.type } : { p: h.point.clone(), snap: '面上' };
    } else {
      const g = groundPoint();
      if (!g) return null;
      res = { p: g, snap: '地面' };
    }
    // 軸向推導：Shift 鎖定或靠近軸線 8px 內
    if (from && (lockAxis || res.snap === '面上' || res.snap === '地面' || res.snap === '邊線上')) {
      const cand = lockAxis ? AXES().filter(x => x[0] === lockAxis) : AXES();
      let bestAx = null;
      cand.forEach(([name, dir]) => {
        // 以滑鼠射線與軸線的最近點作為候選
        const r0 = raycaster.ray.origin, rd = raycaster.ray.direction;
        const w0 = from.clone().sub(r0), b = dir.dot(rd), dd2 = dir.dot(w0), e = rd.dot(w0);
        const den = 1 - b * b; if (Math.abs(den) < 1e-6) return;
        const t = (b * e - dd2) / den;
        const p = from.clone().add(dir.clone().multiplyScalar(t));
        const dist = d2(scr(p));
        if ((lockAxis || dist < 64) && (!bestAx || dist < bestAx.dist)) bestAx = { p, name, dist };
      });
      if (bestAx) res = { p: bestAx.p, snap: bestAx.name, axis: bestAx.name };
    }
    res.p.x = Math.round(res.p.x); res.p.y = Math.round(res.p.y); res.p.z = Math.round(res.p.z);
    return res;
  }

  let down = null;
  function onDown(e) {
    if (e.button !== 0) return;
    setMouse(e);
    down = { x: e.clientX, y: e.clientY, moved: false };
    const t = V.tool;
    if (t === 'place') { updateGhost(); commitPlace(); return; }
    if (t === 'line') { lineClick(); return; }
    if (t === 'tape') { tapeClick(); return; }
    if (t === 'rotate') { const h = pick(); if (h && h.type === 'cab') { App.select({ type: 'cab', id: h.id }); App.rotateSelected(e.shiftKey ? -90 : 90); } return; }
    if (t === 'move') {
      if (move.active) { endMove(true); return; }
      const h = pick();
      if (h && h.type === 'cab') { App.select({ type: 'cab', id: h.id }); startMove(h); }
      return;
    }
    if (t === 'select') {
      const gs = pickGrip();
      if (gs) { startGrip(gs); return; }
      const h = pick();
      if (!h || h.type === 'floor') { App.select(null); return; }
      if (h.type === 'cab') {
        App.select({ type: 'cab', id: h.id });
        down.cand = h;
      } else if (h.type === 'wall') App.select({ type: 'wall', index: h.index });
    }
  }
  function onMove(e) {
    setMouse(e);
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true;
    const t = V.tool;
    if (t === 'place') updateGhost();
    else if (t === 'line') lineMove(e);
    else if (t === 'tape') tapeMove();
    else if (grip.active) { gripUpdate(); return; }
    else if (move.active) moveUpdate();
    else if (t === 'select' && down && down.cand && down.moved && !move.active) startMove(down.cand, true);
    // 游標
    const pg0 = t === 'select' ? pickGrip() : null;
    if (pg0) { renderer.domElement.style.cursor = pg0 === 'd' ? 'ns-resize' : 'ew-resize'; return; }
    if (t === 'select' || t === 'move' || t === 'rotate') {
      const h = pick();
      renderer.domElement.style.cursor = h && h.type === 'cab' ? (t === 'rotate' ? 'alias' : 'move') : (h && h.type === 'wall' ? 'pointer' : 'default');
    }
  }
  function onUp() {
    if (grip.active) { endGrip(true); down = null; return; }
    if (move.active && move.drag) endMove(true);
    down = null;
  }
  function onDbl(e) {
    if (V.tool === 'line') { finishLine(); return; }
    if (V.tool === 'place' || V.tool === 'tape') return;
    // Shift + 快按兩下櫃體：開門預覽
    if (e && e.shiftKey) { const h = pick(); if (h && h.type === 'cab') { V.toggleOpen(h.id); return; } }
    // 快按左鍵兩下（任何位置）：自動縮放到實際空間最適大小
    V.fitRoom();
    App.status('已縮放至空間最適大小（快按左鍵兩下）');
  }

  /* ---------- 吸附 ---------- */
  function rotVec(rotDeg) { const r = rotDeg * deg; return { fx: Math.sin(r), fz: Math.cos(r), rx: Math.cos(r), rz: -Math.sin(r) }; }
  // 自動靠牆設定：吸附距離（櫃背離牆 mm）；Alt 暫時停用
  V.autoWall = localStorage.getItem('cab3d.autowall') !== 'off';
  V.wallSnapDist = 50;   // 櫃背離牆 5cm 內自動靠牆
  V.altDown = false;
  window.addEventListener('keydown', e => { if (e.key === 'Alt') { V.altDown = true; e.preventDefault(); } });
  window.addEventListener('keyup', e => { if (e.key === 'Alt') V.altDown = false; });
  window.addEventListener('blur', () => { V.altDown = false; });
  V.setAutoWall = on => { V.autoWall = on; try { localStorage.setItem('cab3d.autowall', on ? 'on' : 'off'); } catch (e) { /* 忽略 */ } };

  // opts.force：不論距離，貼齊最近的牆；opts.free：不吸附牆面（只吸附網格與鄰櫃）
  V.snap = function (cab, px, pz, excludeId, opts = {}) {
    const st = App.state;
    let x = Math.round(px / 10) * 10, z = Math.round(pz / 10) * 10, rot = cab.rot;
    let info = '';
    const fd = M().footDepth(cab);
    const wallOn = opts.force || (V.autoWall && !opts.free && !V.altDown);
    if (st.room && wallOn) {
      const room = st.room;
      if (cab.kind === 'corner' || (cab.kind === 'desk' && cab.shape === 'L')) {
        const ha = cab.kind === 'desk' ? M().footDepth(cab) / 2 : cab.w / 2, hb = cab.w / 2;
        let best = null;
        room.points.forEach((v, i) => {
          const d0 = Math.hypot(px - v[0], pz - v[1]);
          if (!opts.force && d0 > cab.w * 1.2 + 1500) return;
          const a = M().wallInfo(room, i), b = M().wallInfo(room, (i - 1 + room.points.length) % room.points.length);
          if (Math.abs(a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1]) > 0.1) return;
          [[a, b], [b, a]].forEach(([wa, wb]) => {
            const r = Math.atan2(wa.nIn[0], wa.nIn[1]);
            const xm = [Math.cos(r), -Math.sin(r)];
            if (xm[0] * wb.nIn[0] + xm[1] * wb.nIn[1] > 0.9) {
              const cx = v[0] + wa.nIn[0] * ha + wb.nIn[0] * hb, cz = v[1] + wa.nIn[1] * ha + wb.nIn[1] * hb;
              const ga = (px - v[0]) * wa.nIn[0] + (pz - v[1]) * wa.nIn[1] - ha, gb = (px - v[0]) * wb.nIn[0] + (pz - v[1]) * wb.nIn[1] - hb;
              if (!opts.force && (ga > V.wallSnapDist || gb > V.wallSnapDist)) return;
              if (!best || d0 < best.d) best = { d: d0, x: cx, z: cz, rot: r / deg, i };
            }
          });
        });
        if (best) return { x: Math.round(best.x), z: Math.round(best.z), rot: ((Math.round(best.rot) % 360) + 360) % 360, info: '吸附牆角' };
      }
      let bestW = null;
      room.points.forEach((_, i) => {
        const wi = M().wallInfo(room, i);
        const t = (px - wi.p[0]) * wi.dir[0] + (pz - wi.p[1]) * wi.dir[1];
        const dist = (px - wi.p[0]) * wi.nIn[0] + (pz - wi.p[1]) * wi.nIn[1];
        if (t < -cab.w / 2 || t > wi.len + cab.w / 2) return;
        const off = Math.abs(dist - fd / 2);
        // 櫃背在牆內側 wallSnapDist 以內、或已穿出牆外 → 貼齊此牆
        const gap = dist - fd / 2; // 櫃背與牆面距離（負值＝穿牆）
        const inRange = opts.force || (gap > -1500 && gap <= V.wallSnapDist);
        if (inRange && (!bestW || off < bestW.off)) bestW = { off, wi, t, i };
      });
      if (bestW) {
        const wi = bestW.wi;
        rot = Math.round(Math.atan2(wi.nIn[0], wi.nIn[1]) / deg);
        const half = cab.w / 2;
        let t = Math.max(half, Math.min(wi.len - half, Math.round(bestW.t / 10) * 10));
        // 貼齊牆端
        if (Math.abs(t - half) < 120) t = half;
        if (Math.abs(t - (wi.len - half)) < 120) t = wi.len - half;
        x = wi.p[0] + wi.dir[0] * t + wi.nIn[0] * fd / 2;
        z = wi.p[1] + wi.dir[1] * t + wi.nIn[1] * fd / 2;
        info = '貼齊' + M().wallName(bestW.i);
      }
    }
    // 鄰櫃吸附（同方向）
    const v = rotVec(rot);
    let bestN = null;
    st.cabinets.forEach(o => {
      if (o.id === excludeId || o.id === cab.id) return;
      if (Math.abs(((o.rot - rot) % 360 + 360) % 360) > 1) return;
      const dxw = o.x - x, dzw = o.z - z;
      const along = dxw * v.rx + dzw * v.rz;
      const across = dxw * v.fx + dzw * v.fz;
      const odepth = M().footDepth(o);
      if (Math.abs(across - (odepth - fd) / 2) > Math.max(fd, odepth) * 0.8) return;
      const myL = -cab.w / 2, myR = cab.w / 2, oL = along - o.w / 2, oR = along + o.w / 2;
      [[oR - myL, '靠齊'], [oL - myR, '靠齊'], [oL - myL, '左緣對齊'], [oR - myR, '右緣對齊']].forEach(([delta, name]) => {
        if (Math.abs(delta) < 90 && (!bestN || Math.abs(delta) < Math.abs(bestN.delta))) bestN = { delta, name: name + ' ' + M().cabName(o), across, odepth };
      });
    });
    if (bestN) {
      x += v.rx * bestN.delta; z += v.rz * bestN.delta;
      if (!info) { const shift = bestN.across - (bestN.odepth - fd) / 2; x += v.fx * shift; z += v.fz * shift; }
      info = (info ? info + '、' : '') + bestN.name;
    }
    return { x: Math.round(x), z: Math.round(z), rot: ((rot % 360) + 360) % 360, info };
  };

  /* ---------- 重疊偵測（紅色線框警示） ---------- */
  // 櫃體拆成數個矩形（局部座標 [minx,maxx,minz,maxz]）＋高度範圍
  function cabBoxes(cab) {
    let rects;
    if (cab.kind === 'desk') rects = M().deskGeom(cab).rects;
    else if (cab.kind === 'corner') { const L = -cab.w / 2; rects = [[L, cab.w / 2, L, L + cab.d], [L, L + cab.d, L + cab.d, cab.w / 2]]; }
    else rects = [[-cab.w / 2, cab.w / 2, -cab.d / 2, cab.d / 2]];
    if (cab.mirror) rects = rects.map(([a, b, c, d]) => [-b, -a, c, d]);
    const kick = cab.kick && !cab.hanging && cab.kind !== 'tri' && cab.y >= 60 ? Math.min(D.KICK, cab.y) : 0;
    const top = cab.top && cab.top !== 'none' && D.PARTS.TOP[cab.top] ? D.PARTS.TOP[cab.top].thick : 0;
    const y0 = cab.kind === 'tri' ? 0 : cab.y - kick, y1 = cab.kind === 'desk' ? cab.y + cab.thick : cab.y + cab.h + top;
    const r = cab.rot * deg, c = Math.cos(r), s = Math.sin(r);
    const W = (x, z) => [cab.x + x * c + z * s, cab.z - x * s + z * c];
    return rects.map(([a, b, cc, d]) => ({ rect: [a, b, cc, d], poly: [W(a, cc), W(b, cc), W(b, d), W(a, d)], y0, y1 }));
  }
  function sat(A, B) {
    let min = Infinity;
    for (const P of [A, B]) {
      for (let i = 0; i < P.length; i++) {
        const p = P[i], q = P[(i + 1) % P.length];
        let nx = q[1] - p[1], nz = p[0] - q[0]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        A.forEach(v => { const t = v[0] * nx + v[1] * nz; a0 = Math.min(a0, t); a1 = Math.max(a1, t); });
        B.forEach(v => { const t = v[0] * nx + v[1] * nz; b0 = Math.min(b0, t); b1 = Math.max(b1, t); });
        const o = Math.min(a1, b1) - Math.max(a0, b0);
        if (o <= 0) return 0;
        min = Math.min(min, o);
      }
    }
    return min;
  }
  const TOL = 3; // 容許 3mm 以內的貼合誤差
  function cabsOverlap(a, b) {
    const A = cabBoxes(a), B = cabBoxes(b);
    return A.some(x => B.some(y => Math.min(x.y1, y.y1) - Math.max(x.y0, y.y0) > TOL && sat(x.poly, y.poly) > TOL));
  }
  function outsideRoom(cab) {
    const room = App.state.room; if (!room) return false;
    return cabBoxes(cab).some(b => {
      const cx = b.poly.reduce((s2, p) => s2 + p[0], 0) / 4, cz = b.poly.reduce((s2, p) => s2 + p[1], 0) / 4;
      const inset = b.poly.map(([x, z]) => { const dx = cx - x, dz = cz - z, l = Math.hypot(dx, dz) || 1; return [x + dx / l * 6, z + dz / l * 6]; });
      if (inset.some(([x, z]) => !M().pointInPoly(x, z, room.points))) return true;
      // 凹角：牆角點落在櫃體內
      return room.points.some(([x, z]) => M().pointInPoly(x, z, inset));
    });
  }
  V.findOverlaps = function (extra) {
    const list = App.state.cabinets.slice();
    if (extra && !list.some(c => c.id === extra.id)) list.push(extra);
    const bad = new Map();
    const mark = (c, why) => { if (!bad.has(c.id)) bad.set(c.id, { cab: c, why: new Set() }); bad.get(c.id).why.add(why); };
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (Math.hypot(a.x - b.x, a.z - b.z) > (Math.max(a.w, a.d) + Math.max(b.w, b.d))) continue;
        if (M().isCounterAppl(a) || M().isCounterAppl(b)) continue;
        // DAY&DAY 配件（置物架、掛桿等）放在檯面或牆上，不當作櫃體重疊
        const acc = c => c.kind === 'appl' && /^dayday/.test((D.byCode[c.code] || {}).group || '');
        if (acc(a) || acc(b)) continue;
        const bi = c => c.kind === 'appl' && c.mount === 'builtin';
        if ((bi(a) && b.kind !== 'appl') || (bi(b) && a.kind !== 'appl')) continue;
        if (cabsOverlap(a, b)) { mark(a, M().cabName(b)); mark(b, M().cabName(a)); }
      }
      if (outsideRoom(list[i])) mark(list[i], '牆面');
    }
    return bad;
  };
  let warnGroup = null;
  const warnMat = () => V._warnMat || (V._warnMat = new THREE.LineBasicMaterial({ color: 0xe53935, depthTest: false, transparent: true, opacity: 0.95 }));
  function wireFor(cab) {
    const g = new THREE.Group();
    cabBoxes(cab).forEach(b => {
      const [a, bb, c, d] = b.rect, h = Math.max(1, b.y1 - b.y0);
      const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(bb - a + 16, h + 16, d - c + 16));
      const ls = new THREE.LineSegments(geo, warnMat());
      ls.position.set((a + bb) / 2, b.y0 + h / 2, (c + d) / 2);
      ls.renderOrder = 999;
      g.add(ls);
    });
    g.position.set(cab.x, 0, cab.z); g.rotation.y = cab.rot * deg;
    return g;
  }
  V.checkOverlaps = function (extra) {
    if (warnGroup) { helperGroup.remove(warnGroup); warnGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    warnGroup = new THREE.Group();
    const bad = V.findOverlaps(extra);
    bad.forEach(({ cab }) => warnGroup.add(wireFor(cab)));
    helperGroup.add(warnGroup);
    V.overlaps = bad;
    App.ui && App.ui.showWarn && App.ui.showWarn(bad, extra);
    return bad;
  };

  /* ---------- 自由擺放：顯示離牆 X / Y 軸距離 ---------- */
  // 從櫃體外框（平面）四邊中點沿 ±X、±Z 射向牆面，取每軸最近的一面牆
  V.wallGaps = function (cab) {
    const room = App.state.room;
    if (!room || !cab) return [];
    const pts = cabBoxes(cab).flatMap(b => b.poly);
    const minx = Math.min(...pts.map(p => p[0])), maxx = Math.max(...pts.map(p => p[0]));
    const minz = Math.min(...pts.map(p => p[1])), maxz = Math.max(...pts.map(p => p[1]));
    const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
    const cast = (ox, oz, dx, dz) => {
      let best = Infinity;
      room.points.forEach((p, i) => {
        const q = room.points[(i + 1) % room.points.length];
        const ex = q[0] - p[0], ez = q[1] - p[1];
        const den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) return;
        const t = ((p[0] - ox) * ez - (p[1] - oz) * ex) / den;      // 沿射線距離
        const u = ((p[0] - ox) * dz - (p[1] - oz) * dx) / den;      // 牆段參數
        if (t > -1 && u >= -1e-6 && u <= 1 + 1e-6 && t < best) best = t;
      });
      return best;
    };
    const res = [];
    [['X', [[maxx, cz, 1, 0], [minx, cz, -1, 0]]], ['Y', [[cx, maxz, 0, 1], [cx, minz, 0, -1]]]].forEach(([axis, rays]) => {
      let pick = null;
      rays.forEach(([ox, oz, dx, dz]) => { const d = cast(ox, oz, dx, dz); if (isFinite(d) && (!pick || d < pick.d)) pick = { d, from: [ox, oz], to: [ox + dx * d, oz + dz * d] }; });
      if (pick && pick.d >= 3 && pick.d < 50000) res.push({ axis, d: Math.round(pick.d), from: pick.from, to: pick.to });
    });
    return res;
  };
  let gapGroup = null;
  V.gapLabels = [];
  V.showGaps = function (cab) {
    if (gapGroup) { helperGroup.remove(gapGroup); gapGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); gapGroup = null; }
    V.gapLabels = [];
    if (!cab || !App.state.room) return;
    const gaps = V.wallGaps(cab);
    if (!gaps.length) return;
    gapGroup = new THREE.Group();
    const y = cab.hanging ? cab.y : 15; // 地櫃標註在地面、吊櫃標註在櫃底高度
    gaps.forEach(g => {
      const col = g.axis === 'X' ? 0xd32f2f : 0x1e9e2f;
      const a = new THREE.Vector3(g.from[0], y, g.from[1]), b = new THREE.Vector3(g.to[0], y, g.to[1]);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineDashedMaterial({ color: col, dashSize: 35, gapSize: 20, depthTest: false }));
      line.computeLineDistances(); line.renderOrder = 997;
      gapGroup.add(line);
      // 兩端短垂直標記
      const perp = g.axis === 'X' ? new THREE.Vector3(0, 0, 60) : new THREE.Vector3(60, 0, 0);
      [a, b].forEach(p => {
        const tick = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p.clone().sub(perp), p.clone().add(perp)]), new THREE.LineBasicMaterial({ color: col, depthTest: false }));
        tick.renderOrder = 997; gapGroup.add(tick);
      });
      V.gapLabels.push({ p: a.clone().add(b).multiplyScalar(0.5), text: `${g.axis === 'X' ? 'X' : 'Y'} ${g.d} mm`, cls: 'gap gap-' + g.axis.toLowerCase() });
    });
    helperGroup.add(gapGroup);
  };
  function gapTarget() {
    if (V.tool === 'place' && placeCab && ghost && ghost.visible) return placeCab;
    if (move.active) return App.state.cabinets.find(c => c.id === move.id);
    const s = App.sel;
    return s && s.type === 'cab' ? App.state.cabinets.find(c => c.id === s.id) : null;
  }
  V.refreshGaps = () => V.showGaps(gapTarget());

  /* ---------- 桌面：自動放在櫃體上方 ---------- */
  // 游標下方的落地櫃（不含桌面、吊櫃、轉角櫃）
  function pickCabUnder(excludeId) {
    cabGroup.updateMatrixWorld();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(cabGroup.children, true);
    for (const h of hits) {
      const id = h.object.userData.cabId;
      if (!id || id === excludeId) continue;
      const c = App.state.cabinets.find(x => x.id === id);
      if (c && c.kind !== 'desk' && c.kind !== 'appl' && !c.hanging && c.kind !== 'corner' && c.kind !== 'tri') return c;
    }
    return null;
  }
  V.pickCabUnder = id => pickCabUnder(id);
  const cabTopY = c => c.y + c.h + (c.top && c.top !== 'none' && D.PARTS.TOP[c.top] ? D.PARTS.TOP[c.top].thick : 0);
  const xAxisOf = rotDeg => { const r = rotDeg * deg; return [Math.cos(r), -Math.sin(r)]; };
  const zAxisOf = rotDeg => { const r = rotDeg * deg; return [Math.sin(r), Math.cos(r)]; };
  // keepWidth=true：移動時保留桌面寬度，左緣對齊櫃體左緣
  function deskFit(desk, base, keepWidth) {
    const w = keepWidth ? desk.w : base.w;
    const xa = xAxisOf(base.rot);
    const left = [base.x - xa[0] * base.w / 2, base.z - xa[1] * base.w / 2];
    return { x: Math.round(left[0] + xa[0] * w / 2), z: Math.round(left[1] + xa[1] * w / 2), rot: base.rot, w, d: M().footDepth(base), y: cabTopY(base), base };
  }
  // 水槽 / 爐具：置中於櫃體上方，上緣對齊檯面（有桌面時加桌面厚度）
  function counterTopOf(base) {
    const top = cabTopY(base);
    const desk = App.state.cabinets.find(c => c.kind === 'desk' && Math.abs(c.y - top) < 12 && M().pointInPoly(...M().toLocal(c, base.x, base.z), M().deskGeom(c).pts));
    return desk ? desk.y + desk.thick : top;
  }
  function applFit(a, base) {
    const top = counterTopOf(base);
    const [fx, fz] = M().toWorld(base, 0, 0);
    return { x: Math.round(fx), z: Math.round(fz), rot: base.rot, y: a.at === 'hob' ? top + 8 - a.h : top - a.h, top };
  }
  function applyFit(desk, f) {
    const changed = desk.w !== f.w || desk.d !== f.d || desk.y !== f.y;
    Object.assign(desk, { x: f.x, z: f.z, rot: f.rot, w: f.w, d: f.d, y: f.y });
    return changed;
  }

  /* ---------- 放置 ---------- */
  let placeCab = null;
  V.startPlace = function (code) {
    V.setTool('place');
    placeCab = M().createCabinet(code, App.state.defaults);
    makeGhost(false);
    App.status(`放置 ${code}：移動滑鼠到牆邊自動貼齊，點擊放下。Esc 取消，Q 旋轉`);
  };
  function makeGhost(visible) {
    if (ghost) { helperGroup.remove(ghost); ghost.traverse(o => { if (o.geometry) o.geometry.dispose(); }); ghost = null; }
    ghost = M().buildCabinet({ ...placeCab, x: 0, z: 0, rot: 0 });
    ghost.traverse(o => { if (o.material && !o.userData.isEdge) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.material.depthWrite = false; } });
    ghost.visible = visible;
    helperGroup.add(ghost);
  }
  function updateGhost() {
    if (!placeCab || !ghost) return;
    const p = groundPoint(0);
    if (!p) return;
    let s;
    const base = placeCab.kind === 'desk' && placeCab.shape === 'R' && !V.altDown ? pickCabUnder() : null;
    const cbase = M().isCounterAppl(placeCab) && !V.altDown ? pickCabUnder() : null;
    if (cbase) {
      const f = applFit(placeCab, cbase);
      if (placeCab.y !== f.y) { placeCab.y = f.y; makeGhost(true); }
      s = { x: f.x, z: f.z, rot: f.rot, info: `嵌入 ${M().cabName(cbase)} 上方檯面（檯面高 ${f.top}）` };
    } else if (base) {
      const f = deskFit(placeCab, base, false);
      if (applyFit(placeCab, f)) makeGhost(true);
      s = { x: f.x, z: f.z, rot: f.rot, info: `放在 ${M().cabName(base)} 上方（寬 ${f.w}、深 ${f.d}、高 ${f.y + placeCab.thick}）` };
    } else {
      if (placeCab.kind === 'desk' && placeCab.y !== 750 - placeCab.thick) { placeCab.y = 750 - placeCab.thick; makeGhost(true); }
      if (M().isCounterAppl(placeCab) && placeCab.y !== 850 - placeCab.h) { placeCab.y = 850 - placeCab.h; makeGhost(true); }
      s = V.snap(placeCab, p.x, p.z);
    }
    placeCab.x = s.x; placeCab.z = s.z; placeCab.rot = s.rot;
    ghost.position.set(s.x, 0, s.z); ghost.rotation.y = s.rot * deg;
    ghost.visible = true;
    const bad = V.checkOverlaps(placeCab), me = bad.get(placeCab.id);
    V.showGaps(placeCab);
    App.status(`放置 ${M().cabName(placeCab)}　X ${s.x}　Z ${s.z}　${s.info || '自由放置（網格 10mm）'}${me ? `　⚠ 與 ${[...me.why].join('、')} 重疊` : ''}`);
  }
  function commitPlace() {
    if (!placeCab || !ghost || !ghost.visible) return;
    const cab = placeCab;
    const me = V.findOverlaps(cab).get(cab.id);
    App.addCabinet(cab);
    if (me) App.toast(`⚠ ${M().cabName(cab)} 與 ${[...me.why].join('、')} 重疊，已以紅色線框標示`);
    if (V.keepPlacing) { V.startPlace(cab.code); placeCab.rot = cab.rot; }
    else { V.setTool('select'); App.select({ type: 'cab', id: cab.id }); }
  }
  V.rotatePlace = function (d) { if (placeCab) { placeCab.rot = (placeCab.rot + d + 360) % 360; if (ghost) ghost.rotation.y = placeCab.rot * deg; } };

  /* ---------- 移動 ---------- */
  const move = { active: false };
  function startMove(hit, drag) {
    const cab = App.state.cabinets.find(c => c.id === hit.id);
    if (!cab) return;
    if (cab.locked) { App.status('此物件已鎖定，無法移動（屬性面板可解鎖）'); return; }
    const gp = groundPoint(0) || new THREE.Vector3(cab.x, 0, cab.z);
    Object.assign(move, { active: true, drag: !!drag, id: cab.id, start: { x: cab.x, z: cab.z, rot: cab.rot, y: cab.y, w: cab.w, d: cab.d }, grab: [gp.x - cab.x, gp.z - cab.z], orig: JSON.stringify(cab) });
    controls.enabled = false;
    App.status('移動中：可輸入距離後按 Enter，Esc 取消');
  }
  function moveUpdate() {
    const cab = App.state.cabinets.find(c => c.id === move.id);
    const gp = groundPoint(0);
    if (!cab || !gp) return;
    const base = cab.kind === 'desk' && cab.shape === 'R' && !V.altDown ? pickCabUnder(cab.id) : null;
    const cbase = M().isCounterAppl(cab) && !V.altDown ? pickCabUnder(cab.id) : null;
    let s;
    if (cbase) {
      const f = applFit(cab, cbase);
      if (cab.y !== f.y) { cab.y = f.y; V.rebuildCabinet(cab.id); }
      s = { x: f.x, z: f.z, rot: f.rot, info: `嵌入 ${M().cabName(cbase)} 上方檯面` };
    } else if (base) {
      const f = deskFit(cab, base, true);
      if (applyFit(cab, f)) V.rebuildCabinet(cab.id);
      s = { x: f.x, z: f.z, rot: f.rot, info: `放在 ${M().cabName(base)} 上方` };
    } else s = V.snap(cab, gp.x - move.grab[0], gp.z - move.grab[1], cab.id);
    cab.x = s.x; cab.z = s.z; cab.rot = s.rot;
    const g = cabObjs.get(cab.id);
    g.position.set(cab.x, 0, cab.z); g.rotation.y = cab.rot * deg;
    updateSelBox();
    const dx = cab.x - move.start.x, dz = cab.z - move.start.z;
    move.vec = [dx, dz];
    const me = V.checkOverlaps().get(cab.id);
    V.showGaps(cab);
    App.status(`移動 ${Math.round(Math.hypot(dx, dz))} mm　${s.info || (V.altDown ? '自由移動（Alt）' : '')}${me ? `　⚠ 與 ${[...me.why].join('、')} 重疊` : ''}`);
  }
  function endMove(commit) {
    if (!move.active) return;
    const cab = App.state.cabinets.find(c => c.id === move.id);
    controls.enabled = true;
    move.active = false;
    if (!cab) return;
    const after = { x: cab.x, z: cab.z, rot: cab.rot, y: cab.y, w: cab.w, d: cab.d };
    Object.assign(cab, move.start);
    if (commit && Object.keys(after).some(k => after[k] !== move.start[k])) {
      App.mutate('移動櫃體', () => Object.assign(cab, after), [cab.id]);
    } else { V.rebuildCabinet(cab.id); V.checkOverlaps(); }
    App.status('');
  }
  V.moveBy = function (dist) {
    if (!move.active || !move.vec) return false;
    const len = Math.hypot(...move.vec); if (!len) return false;
    const cab = App.state.cabinets.find(c => c.id === move.id);
    cab.x = Math.round(move.start.x + move.vec[0] / len * dist); cab.z = Math.round(move.start.z + move.vec[1] / len * dist);
    endMove(true); return true;
  };

  /* ---------- 畫線建立空間 ---------- */
  const draw = { pts: [], cursor: null, line: null, guides: null, lock: null, last: null };
  // 鎖點追蹤：起點（封閉）> 端點 > 中點 > 軸向（紅/綠）＋ 與已畫點對齊的追蹤線
  function inferPoint(raw, from) {
    const cr = renderer.domElement.getBoundingClientRect();
    const scr = (x, z) => { const q = new THREE.Vector3(x, 0, z).project(camera); return [(q.x + 1) / 2 * cr.width, (1 - q.y) / 2 * cr.height]; };
    const ms = [(mouse.x + 1) / 2 * cr.width, (1 - mouse.y) / 2 * cr.height];
    const near = (x, z, px) => { const q = scr(x, z); return (q[0] - ms[0]) ** 2 + (q[1] - ms[1]) ** 2 < px * px; };
    const pts = draw.pts;
    const room = App.state.room;
    // 追蹤參考點：已畫的點＋既有空間牆角
    const refs = pts.map((q, i) => ({ q, name: i === 0 ? '起點' : `第 ${i + 1} 點` }));
    if (room) room.points.forEach(q => refs.push({ q, name: '牆角' }));
    // 1. 起點（封閉）
    if (pts.length > 2 && near(pts[0][0], pts[0][1], 14)) return { p: pts[0].slice(), snap: '起點（封閉）', close: true, guides: [] };
    // 2. 端點（已畫的點、牆角）
    for (const r of refs) {
      if (r.q === pts[pts.length - 1]) continue;
      if (near(r.q[0], r.q[1], 11)) return { p: [r.q[0], r.q[1]], snap: '端點（' + r.name + '）', guides: [] };
    }
    // 3. 中點（已畫線段）
    for (let i = 0; i + 1 < pts.length; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
      if (near(mx, mz, 9)) return { p: [Math.round(mx), Math.round(mz)], snap: '中點', guides: [] };
    }
    let x = Math.round(raw.x / 10) * 10, z = Math.round(raw.z / 10) * 10;
    const tags = [];
    let axis = null;
    // 4. 軸向推導（Shift 鎖定）
    if (from) {
      const ang = Math.atan2(z - from[1], x - from[0]) / deg, a = ((ang % 180) + 180) % 180;
      if (draw.lock === 'X' || (!draw.lock && (a < 6 || a > 174))) { z = from[1]; axis = 'X'; tags.push('紅軸'); }
      else if (draw.lock === 'Z' || (!draw.lock && Math.abs(a - 90) < 6)) { x = from[0]; axis = 'Z'; tags.push('綠軸'); }
    }
    // 5. 對齊追蹤：與參考點的 X 或 Z 相同（螢幕 10px 內）
    const pxPerMM = (() => { const a1 = scr(x, z), a2 = scr(x + 1000, z), a3 = scr(x, z + 1000); return Math.max(Math.hypot(a2[0] - a1[0], a2[1] - a1[1]), Math.hypot(a3[0] - a1[0], a3[1] - a1[1])) / 1000; })();
    const tol = 10 / Math.max(pxPerMM, 1e-6);
    const guides = [];
    const pickAlign = coord => {
      let best = null;
      refs.forEach((r, i) => {
        if (from && r.q === from) return;           // 最後一點由軸向推導處理
        const d = Math.abs((coord === 'x' ? x : z) - r.q[coord === 'x' ? 0 : 1]);
        if (d < tol && (!best || d < best.d - 1 || (Math.abs(d - best.d) <= 1 && i === 0))) best = { d, r };
      });
      return best;
    };
    if (axis !== 'Z') { const b = pickAlign('x'); if (b) { x = b.r.q[0]; guides.push({ from: b.r.q, axis: 'Z' }); tags.push('對齊' + b.r.name + '（X）'); } }
    if (axis !== 'X') { const b = pickAlign('z'); if (b) { z = b.r.q[1]; guides.push({ from: b.r.q, axis: 'X' }); tags.push('對齊' + b.r.name + '（Y）'); } }
    // 同時對齊起點 X 與 Y → 即為起點，可封閉
    if (pts.length > 2 && x === pts[0][0] && z === pts[0][1]) return { p: pts[0].slice(), snap: '起點（封閉）', close: true, guides: [] };
    return { p: [x, z], snap: tags.join(' · '), axis, guides };
  }
  function redrawLine() {
    if (draw.line) { helperGroup.remove(draw.line); draw.line = null; }
    if (draw.guides) { helperGroup.remove(draw.guides); draw.guides = null; }
    const pts = draw.pts.map(p => new THREE.Vector3(p[0], 5, p[1]));
    draw.line = new THREE.Group();
    // 已完成的線段：黑色；目前這一段：依軸向上色
    if (pts.length >= 2) {
      const done = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x1a1a1a, depthTest: false }));
      done.renderOrder = 996; draw.line.add(done);
    }
    if (draw.cursor && pts.length) {
      const color = draw.axis === 'X' ? 0xd32f2f : draw.axis === 'Z' ? 0x2e9e44 : 0x1a1a1a;
      const cur = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pts[pts.length - 1], new THREE.Vector3(draw.cursor[0], 5, draw.cursor[1])]), new THREE.LineBasicMaterial({ color, depthTest: false }));
      cur.renderOrder = 996; draw.line.add(cur);
    }
    helperGroup.add(draw.line);
    // 追蹤虛線：由參考點延伸到游標
    if (draw.cursor && draw.cursorGuides && draw.cursorGuides.length) {
      draw.guides = new THREE.Group();
      draw.cursorGuides.forEach(g => {
        const a = new THREE.Vector3(g.from[0], 6, g.from[1]), b = new THREE.Vector3(draw.cursor[0], 6, draw.cursor[1]);
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineDashedMaterial({ color: g.axis === 'X' ? 0xd32f2f : 0x2e9e44, dashSize: 60, gapSize: 45, depthTest: false }));
        l.computeLineDistances(); l.renderOrder = 995;
        draw.guides.add(l);
      });
      helperGroup.add(draw.guides);
    }
    if (App.ui && App.ui.syncLineInput) App.ui.syncLineInput();
  }
  function lineMove() {
    const g = groundPoint(0); if (!g) { V.snapMark = null; return; }
    const r = inferPoint(g, draw.pts[draw.pts.length - 1]);
    draw.cursor = r.p; draw.snap = r.snap; draw.axis = r.axis; draw.cursorGuides = r.guides; draw.last = r;
    redrawLine();
    const type = r.close ? '起點' : r.snap.startsWith('端點') ? '端點' : r.snap === '中點' ? '中點' : r.axis === 'X' ? '紅軸' : r.axis === 'Z' ? '綠軸' : r.guides && r.guides.length ? '對齊' : '地面';
    V.snapMark = { p: new THREE.Vector3(r.p[0], 0, r.p[1]), type, tip: r.snap || '' };
    App.status(`畫線：${draw.pts.length ? '點擊下一點' : '點擊起點'}　${r.snap ? '鎖點【' + r.snap + '】' : ''}${draw.lock ? '（Shift 鎖定）' : ''}　可直接打數字：長度 或 長度,角度 再按 Enter；Backspace 退回上一點；按住 Shift 鎖定軸向；點回起點、雙擊或空白時按 Enter 完成`);
  }
  function lineClick() {
    const g = groundPoint(0); if (!g) return;
    const r = inferPoint(g, draw.pts[draw.pts.length - 1]);
    if (r.close) { finishLine(); return; }
    draw.pts.push(r.p);
    redrawLine();
  }
  V.lineLength = function (len) {
    if (!draw.pts.length || !draw.cursor) return false;
    const a = draw.pts[draw.pts.length - 1];
    const dx = draw.cursor[0] - a[0], dz = draw.cursor[1] - a[1];
    const l = Math.hypot(dx, dz); if (!l) return false;
    draw.pts.push([Math.round(a[0] + dx / l * len), Math.round(a[1] + dz / l * len)]);
    redrawLine();
    return true;
  };
  /* 畫線時輸入數據：
     「3000」      沿滑鼠方向畫 3000 mm
     「3000,90」或「3000<90」  畫 3000 mm、角度 90°（0°＝右，90°＝上，以平面圖逆時針計）
     尚未點起點時輸入，會以滑鼠所在位置（不在地面上則原點）當起點。回傳錯誤訊息或空字串。 */
  V.lineInput = function (raw) {
    const m = String(raw).trim().replace(/，/g, ',').match(/^(-?\d+(?:\.\d+)?)\s*(?:[,<＜\s]\s*(-?\d+(?:\.\d+)?))?$/);
    if (!m) return '請輸入「長度」或「長度,角度」，例如 3000 或 3000,90';
    const len = Number(m[1]), ang = m[2] != null ? Number(m[2]) : null;
    if (!(len > 0)) return '長度必須大於 0';
    if (len > 100000) return `長度 ${len} mm 超過 100 公尺，請確認是否打錯（單位是 mm）`;
    if (!draw.pts.length) {
      if (ang == null && !draw.cursor) return '請先點擊起點，或輸入「長度,角度」';
      draw.pts.push(draw.cursor ? draw.cursor.slice() : [0, 0]);
    }
    const a = draw.pts[draw.pts.length - 1];
    let ux, uz;
    if (ang != null) { const r = ang * Math.PI / 180; ux = Math.cos(r); uz = -Math.sin(r); }
    else {
      if (!draw.cursor) return '請移動滑鼠指定方向，或輸入「長度,角度」';
      const dx = draw.cursor[0] - a[0], dz = draw.cursor[1] - a[1], l = Math.hypot(dx, dz);
      if (l < 1) return '請移動滑鼠指定方向，或輸入「長度,角度」';
      ux = dx / l; uz = dz / l;
    }
    const p = [Math.round(a[0] + ux * len), Math.round(a[1] + uz * len)];
    const s = draw.pts[0];
    // 回到起點（誤差 5 mm 內）就直接完成
    if (draw.pts.length >= 3 && Math.hypot(p[0] - s[0], p[1] - s[1]) <= 5) { finishLine(); return ''; }
    draw.pts.push(p);
    draw.cursor = null; draw.cursorGuides = null;
    redrawLine(); lineMove();
    return '';
  };
  V.lineUndoPoint = function () {
    if (!draw.pts.length) return false;
    draw.pts.pop();
    if (draw.pts.length) { redrawLine(); lineMove(); } else V.cancelLine();
    return true;
  };
  V.lineFinish = () => finishLine();
  V.linePointCount = () => draw.pts.length;
  V.linePoints = () => draw.pts.map(p => p.slice());
  function finishLine() {
    // 雙擊完成時最後一點會被點兩次；去掉重疊的點（含與起點重疊的終點），避免出現 0 長度的牆
    const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1;
    draw.pts = draw.pts.filter((p, i, a) => i === 0 || !near(p, a[i - 1]));
    while (draw.pts.length > 1 && near(draw.pts[draw.pts.length - 1], draw.pts[0])) draw.pts.pop();
    if (draw.pts.length < 3) { App.toast('至少需要 3 個點才能封閉空間'); return; }
    const pts = draw.pts.slice();
    V.cancelLine();
    V.setTool('select');
    App.ui.askHeight(pts);
  }
  V.cancelLine = function () { draw.pts = []; draw.cursor = null; draw.cursorGuides = null; draw.lock = null; V.snapMark = null; redrawLine(); };
  // Shift：鎖定畫線目前的軸向
  window.addEventListener('keydown', e => { if (e.key === 'Shift' && V.tool === 'line' && draw.last && draw.last.axis && !draw.lock) { draw.lock = draw.last.axis; lineMove(); } });
  window.addEventListener('keyup', e => { if (e.key === 'Shift' && draw.lock) { draw.lock = null; if (V.tool === 'line') lineMove(); } });

  /* ---------- 捲尺 ---------- */
  const tape = { a: null, line: null, lock: null, last: null };
  V.snapMark = null;
  function tapeLine(a, b, axis) {
    if (tape.line) helperGroup.remove(tape.line);
    const col = axis ? SNAP_COLOR[axis] : '#e8710a';
    tape.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineDashedMaterial({ color: col, dashSize: 40, gapSize: 25, depthTest: false }));
    tape.line.renderOrder = 998;
    tape.line.computeLineDistances(); helperGroup.add(tape.line);
  }
  const fmtD = (a, b) => {
    const d = Math.round(a.distanceTo(b));
    const dx = Math.round(Math.abs(b.x - a.x)), dy = Math.round(Math.abs(b.y - a.y)), dz = Math.round(Math.abs(b.z - a.z));
    return { d, parts: `X ${dx}　Z ${dz}　高 ${dy}` };
  };
  function tapeMove() {
    const r = pickPoint(tape.a, tape.lock); if (!r) { V.snapMark = null; return; }
    tape.last = r;
    V.snapMark = { p: r.p.clone(), type: r.snap };
    labels.length = 0;
    if (tape.a) {
      tapeLine(tape.a, r.p, r.axis);
      const f = fmtD(tape.a, r.p);
      labels.push({ p: tape.a.clone().add(r.p).multiplyScalar(0.5), text: f.d + ' mm', cls: 'draw' });
      App.status(`捲尺：點擊終點　鎖點【${r.snap}】${tape.lock ? '（Shift 鎖定）' : ''}　距離 ${f.d} mm（${f.parts}）　按住 Shift 可鎖定軸向`);
    } else App.status(`捲尺：點擊起點　鎖點【${r.snap}】`);
  }
  function tapeClick() {
    const r = pickPoint(tape.a, tape.lock); if (!r) return;
    if (!tape.a) { tape.a = r.p.clone(); tape.aType = r.snap; return; }
    const f = fmtD(tape.a, r.p);
    App.toast(`量測距離：${f.d} mm（${f.parts}）`);
    tapeLine(tape.a, r.p, r.axis);
    labels.length = 0;
    labels.push({ p: tape.a.clone().add(r.p).multiplyScalar(0.5), text: f.d + ' mm', cls: 'draw' });
    tape.a = null; tape.lock = null;
  }
  V.clearTape = function () { tape.a = null; tape.lock = null; V.snapMark = null; if (tape.line) helperGroup.remove(tape.line); tape.line = null; labels.length = 0; };
  // Shift：鎖定目前推導的軸向
  window.addEventListener('keydown', e => {
    if (e.key === 'Shift' && V.tool === 'tape' && tape.a && tape.last && tape.last.axis && !tape.lock) { tape.lock = tape.last.axis; tapeMove(); }
  });
  window.addEventListener('keyup', e => { if (e.key === 'Shift' && tape.lock) { tape.lock = null; if (V.tool === 'tape') tapeMove(); } });
  V.tapeStart = () => tape.a;

  /* ---------- 工具切換 ---------- */
  V.setTool = function (t) {
    if (V.tool === 'place' && t !== 'place') { placeCab = null; if (ghost) { helperGroup.remove(ghost); ghost = null; } V.checkOverlaps(); }
    if (V.tool === 'line' && t !== 'line') V.cancelLine();
    if (V.tool === 'tape' && t !== 'tape') V.clearTape();
    if (move.active) endMove(false);
    V.tool = t;
    V.refreshGaps();
    controls.mouseButtons.LEFT = t === 'orbit' ? THREE.MOUSE.ROTATE : t === 'pan' ? THREE.MOUSE.PAN : t === 'zoom' ? THREE.MOUSE.DOLLY : null;
    renderer.domElement.style.cursor = { orbit: 'grab', pan: 'grab', zoom: 'zoom-in', line: 'crosshair', tape: 'crosshair', place: 'copy' }[t] || 'default';
    const hints = {
      select: '選取：點選櫃體或牆面；拖曳櫃體可移動（自動靠牆，按住 Alt 自由移動）。中鍵環轉、Shift+中鍵平移、滾輪縮放',
      move: '移動：點擊櫃體開始移動，再點擊放下（可輸入距離）',
      rotate: '旋轉：點擊櫃體旋轉 90°（Shift 反向）',
      orbit: '環轉：左鍵拖曳旋轉視角', pan: '平移：左鍵拖曳平移視角', zoom: '縮放：左鍵上下拖曳縮放',
      line: '畫線：在地面點擊各轉角，雙擊或點回起點完成（可輸入長度）', tape: '捲尺：點擊兩點量測距離'
    };
    if (t !== 'place') App.status(hints[t] || '');
    App.ui && App.ui.syncToolbar();
  };
  V.escape = function () {
    if (grip.active) { endGrip(false); return; }
    if (move.active) { endMove(false); return; }
    if (V.tool === 'line' && draw.pts.length) { V.cancelLine(); return; }
    V.setTool('select');
    App.select(null);
  };

  /* ---------- 輸出影像 ---------- */
  /* outMarks（選填）：傳 [{ id, p: THREE.Vector3 }]，畫完會在每個元素補上這張圖裡的像素座標
     { x, y, vis }（vis=false 代表在鏡頭後方）。報價單用它把項次圓圈畫在對應的櫃體上。 */
  V.renderImage = function (w, h, scn, outMarks) {
    const prev = { size: renderer.getSize(new THREE.Vector2()), pr: renderer.getPixelRatio() };
    const hideList = [grid, axes, helperGroup];
    const vis = hideList.map(o => o.visible);
    hideList.forEach(o => { o.visible = false; });
    const saved = V.getCamera();
    const bg = scene.background.clone();
    const lightSaved = V.getLight(), wallSaved = V.wallMode;
    if (scn) { V.applyScene(scn, false); }
    updateWalls();
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    const cam = camera;
    if (cam === persp) { persp.aspect = w / h; persp.updateProjectionMatrix(); }
    else {
      const dist = V._orthoDist || 8000; const fh = 2 * dist * Math.tan(persp.fov * deg / 2);
      ortho.left = -fh * w / h / 2; ortho.right = fh * w / h / 2; ortho.top = fh / 2; ortho.bottom = -fh / 2; ortho.updateProjectionMatrix();
    }
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/jpeg', 0.92);
    // 鏡頭還原之前先投影，否則座標會對不上這張圖
    if (outMarks && outMarks.length) {
      cam.updateMatrixWorld();
      outMarks.forEach(m => {
        const v = m.p.clone().project(cam);
        m.x = (v.x + 1) / 2 * w;
        m.y = (1 - v.y) / 2 * h;
        m.vis = v.z <= 1;
      });
    }
    hideList.forEach((o, i) => { o.visible = vis[i]; });
    renderer.setPixelRatio(prev.pr);
    renderer.setSize(prev.size.x, prev.size.y);
    scene.background = bg;
    V.setLight(lightSaved);
    V.wallMode = wallSaved;
    V.setCamera(saved, false);
    resize();
    return url;
  };

  // AI 控制圖：clay = 白模（無材質素模）、line = 線稿（白面會擋住後方的線＝隱藏線）
  // 和 renderImage 共用同一台相機與尺寸處理，只換材質，畫完一律還原。
  V.renderControl = function (kind, w, h) {
    const prev = { size: renderer.getSize(new THREE.Vector2()), pr: renderer.getPixelRatio() };
    const hideList = [grid, axes, helperGroup];
    const vis = hideList.map(o => o.visible);
    hideList.forEach(o => { o.visible = false; });
    const bg = scene.background;
    const line = kind === 'line';
    const faceMat = line
      ? new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
      : new THREE.MeshLambertMaterial({ color: 0xe9e7e2 });
    const lineMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a });
    const lineGroup = new THREE.Group();
    const swapped = [];
    const shown = o => { let p = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; };

    scene.background = new THREE.Color(0xffffff);
    scene.traverse(o => {
      if (!o.isMesh || !o.material || !shown(o)) return;
      swapped.push([o, o.material]);
      o.material = faceMat;
      if (!line || !o.geometry) return;
      let eg = o.geometry.userData && o.geometry.userData.__edges;
      if (!eg) {
        try { eg = new THREE.EdgesGeometry(o.geometry, 22); } catch (e) { return; }
        o.geometry.userData = o.geometry.userData || {};
        o.geometry.userData.__edges = eg;   // 同一個幾何只算一次，之後重用
      }
      const seg = new THREE.LineSegments(eg, lineMat);
      o.updateWorldMatrix(true, false);
      seg.matrixAutoUpdate = false;
      seg.matrix.copy(o.matrixWorld);
      lineGroup.add(seg);
    });
    if (line) scene.add(lineGroup);

    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    const cam = camera;
    if (cam === persp) { persp.aspect = w / h; persp.updateProjectionMatrix(); }
    else {
      const dist = V._orthoDist || 8000; const fh = 2 * dist * Math.tan(persp.fov * deg / 2);
      ortho.left = -fh * w / h / 2; ortho.right = fh * w / h / 2; ortho.top = fh / 2; ortho.bottom = -fh / 2; ortho.updateProjectionMatrix();
    }
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/jpeg', 0.95);

    if (line) scene.remove(lineGroup);
    swapped.forEach(([o, m]) => { o.material = m; });
    faceMat.dispose(); lineMat.dispose();
    scene.background = bg;
    hideList.forEach((o, i) => { o.visible = vis[i]; });
    renderer.setPixelRatio(prev.pr);
    renderer.setSize(prev.size.x, prev.size.y);
    resize();
    return url;
  };

  // 單一櫃體等角視圖（三視圖用）
  V.renderCabinetIso = function (cab, size = 700) {
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(0xffffff);
    sc.add(new THREE.HemisphereLight(0xffffff, 0xbbbbbb, 1.1));
    const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(3000, 5000, 4000); sc.add(dl);
    const g = M().buildCabinet({ ...cab, x: 0, z: 0, rot: 0 });
    sc.add(g);
    const box = new THREE.Box3().setFromObject(g);
    const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
    const cam = new THREE.OrthographicCamera(-r, r, r, -r, -50000, 50000);
    cam.position.copy(c).add(new THREE.Vector3(1, 0.75, 1.3).normalize().multiplyScalar(r * 3));
    cam.lookAt(c);
    const prev = { size: renderer.getSize(new THREE.Vector2()), pr: renderer.getPixelRatio() };
    renderer.setPixelRatio(1); renderer.setSize(size, size, false);
    renderer.render(sc, cam);
    const url = renderer.domElement.toDataURL('image/png');
    renderer.setPixelRatio(prev.pr); renderer.setSize(prev.size.x, prev.size.y);
    resize();
    g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    return url;
  };

  /* ---------- 燈光 / 場景 ---------- */
  const LIGHTS = {
    day: { hemi: 1.0, amb: 0.35, dir: 1.3, dirColor: 0xffffff, hemiSky: 0xffffff, exposure: 1.05 },
    warm: { hemi: 0.7, amb: 0.25, dir: 1.3, dirColor: 0xffd7a8, hemiSky: 0xfff1dc, exposure: 1.0 },
    soft: { hemi: 1.25, amb: 0.45, dir: 0.6, dirColor: 0xffffff, hemiSky: 0xffffff, exposure: 1.0 },
    night: { hemi: 0.35, amb: 0.15, dir: 0.5, dirColor: 0xaec6ff, hemiSky: 0x9fb4d8, exposure: 0.9 }
  };
  V.LIGHT_NAMES = { day: '日光', warm: '暖色', soft: '柔光', night: '夜景' };
  let curLight = 'day';
  V.setLight = function (name) {
    const L = LIGHTS[name] || LIGHTS.day; curLight = name;
    hemi.intensity = L.hemi; hemi.color.setHex(L.hemiSky); amb.intensity = L.amb;
    dir.intensity = L.dir; dir.color.setHex(L.dirColor);
    renderer.toneMappingExposure = L.exposure;
  };
  V.getLight = () => curLight;
  V.setBackground = function (hex) { scene.background = new THREE.Color(hex); };
  V.getBackground = () => '#' + scene.background.getHexString();
  V.applyScene = function (s, animate = true) {
    V.setLight(s.light || 'day');
    V.setBackground(s.bg || '#eef1f4');
    if (s.wallMode) V.wallMode = s.wallMode;
    V.setCamera(s.cam, animate);
  };
  V.setRenderMode = function (mode) {
    App.renderMode = mode === 'shaded' ? '' : mode;
    M().clearMatCache();
    V.rebuildAll();
  };

  V.getScene = () => scene;
  V.getCabObject = id => cabObjs.get(id);
  V.getRoomObject = () => roomGroup;
  V.getCabGroup = () => cabGroup;
  V.isMoving = () => move.active;
  window.Viewer = V;
})();
