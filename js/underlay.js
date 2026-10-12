/* 平面圖底圖：匯入 JPG／PNG／PDF 放在地面當半透明底圖，設定比例尺後用「自由繪製多線段」沿圖描牆線
   state.underlay = { src(dataURL jpeg), w, h(px), scale(mm/px), x, z(中心 mm), rot(°), opacity, visible, name }，依樓層各自儲存 */
(function () {
  const U = {};
  const V = () => window.Viewer, UI = () => window.UI, $ = s => document.querySelector(s);
  const MAX = 2200;           // 底圖最長邊像素（兼顧清晰與專案檔大小）
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

  function toJpeg(canvas) { return canvas.toDataURL('image/jpeg', 0.82); }
  function scaledCanvas(w, h) {
    const k = Math.min(1, MAX / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    return { c, k };
  }
  async function fromImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('無法讀取影像檔')); i.src = url; });
      const { c } = scaledCanvas(img.naturalWidth, img.naturalHeight), ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      return { src: toJpeg(c), w: c.width, h: c.height };
    } finally { URL.revokeObjectURL(url); }
  }
  async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = PDFJS + 'pdf.min.js'; s.onload = res; s.onerror = () => rej(new Error('無法載入 PDF 解析元件，請確認網路連線')); document.head.appendChild(s); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
    return window.pdfjsLib;
  }
  async function fromPdf(file) {
    const lib = await loadPdfJs();
    const buf = await file.arrayBuffer(), keep = buf.slice(0);   // pdf.js 會把緩衝區轉移給 worker，留一份給之後渲染用
    const docOpts = {};   // 不指定外部 CMap／字型（跨網域抓取可能被擋住而卡死）；CJK 文字多為內嵌字型
    const pdf = await lib.getDocument({ data: buf, ...docOpts }).promise;
    let pageNo = 1;
    if (pdf.numPages > 1) {
      const r = await UI().modal({ title: 'PDF 有 ' + pdf.numPages + ' 頁', body: `<div class="kv"><label>使用第幾頁</label><div class="inline"><input name="p" type="number" min="1" max="${pdf.numPages}" value="1"><span class="unit">頁</span></div></div>`, buttons: [{ label: '取消', value: null }, { label: '確定', primary: true, value: 'ok' }] });
      if (!r) return null;
      pageNo = Math.max(1, Math.min(pdf.numPages, Math.round(+r.data.p) || 1));
    }
    const page = await pdf.getPage(pageNo);
    const vp1 = page.getViewport({ scale: 1 }), PT = 25.4 / 72;
    // 先抽向量（很快）；頁面影像只在需要當底圖時才渲染（CJK 字型載入可能很慢）
    let vec = null;
    try { vec = await pdfVectors(page, lib, vp1); } catch (e) { console.warn('PDF 向量抽取失敗', e); }
    const render = async () => {
      // 取過 operator list 的頁面物件再 render 會卡住：另開一份文件來渲染
      const pdf2 = await lib.getDocument({ data: keep.slice(0), ...docOpts }).promise, page2 = await pdf2.getPage(pageNo);
      const k = MAX / Math.max(vp1.width, vp1.height);
      const vp = page2.getViewport({ scale: k });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      const task = page2.render({ canvasContext: ctx, viewport: vp });
      const ok = await Promise.race([task.promise.then(() => true), new Promise(r => setTimeout(() => r(false), 20000))]);
      if (!ok) { try { task.cancel(); } catch (e) { } try { pdf2.destroy(); } catch (e) { } throw new Error('PDF 頁面渲染逾時'); }
      try { pdf2.destroy(); } catch (e) { }
      return { src: toJpeg(c), w: c.width, h: c.height };
    };
    return { vec, render, paperW: vp1.width * PT, paperH: vp1.height * PT };
  }
  // 抽出 PDF 頁面的向量線段（紙面 mm，y 向上；貝茲曲線以弦近似），依線寬／顏色分成假圖層
  async function pdfVectors(page, lib, vp) {
    const OPS = lib.OPS, ol = await page.getOperatorList();
    const PT = 25.4 / 72, mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
    let ctm = [1, 0, 0, 1, 0, 0], lw = 1, col = '000000'; const stack = [], ents = [];
    const hex = (r, g, b) => [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    // 先到頁面裝置座標（含頁面旋轉與 MediaBox 位移，y 向下），再轉成紙面 mm、y 向上，和渲染出的影像一致
    const VT = vp.transform;
    const ap = (x, y) => { const ux = ctm[0] * x + ctm[2] * y + ctm[4], uy = ctm[1] * x + ctm[3] * y + ctm[5]; const dx = VT[0] * ux + VT[2] * uy + VT[4], dy = VT[1] * ux + VT[3] * uy + VT[5]; return [dx * PT, (vp.height - dy) * PT]; };
    const layerOf = () => { const sc = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1; return `線寬 ${(lw * sc * PT).toFixed(2)} 色 ${col}`; };
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i], a = ol.argsArray[i];
      if (fn === OPS.save) stack.push({ ctm, lw, col });
      else if (fn === OPS.restore) { const s = stack.pop(); if (s) { ctm = s.ctm; lw = s.lw; col = s.col; } }
      else if (fn === OPS.transform) ctm = mul(ctm, a);
      else if (fn === OPS.paintFormXObjectBegin) { stack.push({ ctm, lw, col, form: true }); if (a && a[0]) ctm = mul(ctm, a[0]); }
      else if (fn === OPS.paintFormXObjectEnd) { let s = stack.pop(); while (s && !s.form && stack.length) s = stack.pop(); if (s) { ctm = s.ctm; lw = s.lw; col = s.col; } }
      else if (fn === OPS.setLineWidth) lw = a[0];
      else if (fn === OPS.setStrokeRGBColor) col = hex(a[0], a[1], a[2]);
      else if (fn === OPS.setStrokeGray) col = hex(a[0], a[0], a[0]);
      else if (fn === OPS.setStrokeCMYKColor) col = hex((1 - a[0]) * (1 - a[3]), (1 - a[1]) * (1 - a[3]), (1 - a[2]) * (1 - a[3]));
      else if (fn === OPS.constructPath) {
        const ops = a[0], c = a[1], lay = layerOf(); let k = 0, cur = null, start = null;
        const line = (p, q) => { if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.05) ents.push({ k: 'L', l: lay, p: [p[0], p[1], q[0], q[1]] }); };
        // 貝茲曲線：若是圓弧（門弧等）記成 A（圓心、半徑、起訖角），否則以弦近似
        const curve = (p0, p1, p2, p3) => {
          const c = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
          const mx = (p0[0] + 3 * p1[0] + 3 * p2[0] + p3[0]) / 8, my = (p0[1] + 3 * p1[1] + 3 * p2[1] + p3[1]) / 8;
          const qx = (p0[0] + p3[0]) / 2, qy = (p0[1] + p3[1]) / 2, h = Math.hypot(mx - qx, my - qy);
          if (c < 0.3 || h < 0.08) { line(p0, p3); return; }
          const r = (c * c / 4 + h * h) / (2 * h), ang = 2 * Math.asin(Math.min(1, c / (2 * r))) * 180 / Math.PI;
          if (ang < 20 || r > 60) { line(p0, p3); return; }
          const cx = qx + (qx - mx) / h * (r - h), cy = qy + (qy - my) / h * (r - h);
          let a1 = Math.atan2(p0[1] - cy, p0[0] - cx) * 180 / Math.PI, a2 = Math.atan2(p3[1] - cy, p3[0] - cx) * 180 / Math.PI;
          if (((a2 - a1) % 360 + 360) % 360 > 180) { const t = a1; a1 = a2; a2 = t; }
          ents.push({ k: 'A', l: lay, c: [cx, cy], r, a1, a2, ang });
        };
        for (const op of ops) {
          if (op === OPS.moveTo) { cur = ap(c[k], c[k + 1]); start = cur; k += 2; }
          else if (op === OPS.lineTo) { const q = ap(c[k], c[k + 1]); if (cur) line(cur, q); cur = q; k += 2; }
          else if (op === OPS.curveTo) { const q = ap(c[k + 4], c[k + 5]); if (cur) curve(cur, ap(c[k], c[k + 1]), ap(c[k + 2], c[k + 3]), q); cur = q; k += 6; }
          else if (op === OPS.curveTo2 || op === OPS.curveTo3) { const q = ap(c[k + 2], c[k + 3]); if (cur) line(cur, q); cur = q; k += 4; }
          else if (op === OPS.closePath) { if (cur && start) line(cur, start); cur = start; }
          else if (op === OPS.rectangle) { const x = c[k], y = c[k + 1], w = c[k + 2], h = c[k + 3]; const P = [ap(x, y), ap(x + w, y), ap(x + w, y + h), ap(x, y + h)]; for (let j = 0; j < 4; j++) line(P[j], P[(j + 1) % 4]); cur = start = P[0]; k += 4; }
        }
      }
    }
    const bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    ents.forEach(e => { (e.k === 'L' ? [[e.p[0], e.p[1]], [e.p[2], e.p[3]]] : [[e.c[0] - e.r, e.c[1] - e.r], [e.c[0] + e.r, e.c[1] + e.r]]).forEach(([x, y]) => { if (x < bb.x0) bb.x0 = x; if (y < bb.y0) bb.y0 = y; if (x > bb.x1) bb.x1 = x; if (y > bb.y1) bb.y1 = y; }); });
    return { ents, bbox: bb, warnings: [] };
  }

  U.import = function () { $('#fileUnderlay').click(); };
  U.load = async function (file) {
    if (!file) return;
    if (/\.dxf$/i.test(file.name)) { if (window.DxfIn) window.DxfIn.open(file); else App.toast('DXF 模組未載入'); return; }
    App.busy(true, '讀取底圖…');
    let img = null;
    try { img = /\.pdf$/i.test(file.name) || file.type === 'application/pdf' ? await fromPdf(file) : await fromImage(file); }
    catch (e) { App.toast(e.message || '讀取失敗'); }
    if (!img) { App.busy(false); return; }
    // 向量 PDF（CAD 輸出）：線條交給 DXF 流程自動找牆與門窗；掃描檔則當底圖描圖
    U._lastPdf = img;
    if (img.vec && img.vec.ents.length >= 15 && window.DxfIn) {
      // 比例推測只用深色粗線（牆）：線寬 ≥ 最粗的一半
      const lw = l => +((l.match(/線寬 ([\d.]+)/) || [])[1] || 0), isDark = l => { const m = l.match(/色 ([0-9a-f]{6})/); return !m || parseInt(m[1].slice(0, 2), 16) + parseInt(m[1].slice(2, 4), 16) + parseInt(m[1].slice(4, 6), 16) < 200; };
      const mx = Math.max(...img.vec.ents.filter(e => isDark(e.l)).map(e => lw(e.l)), 0);
      const segs = img.vec.ents.filter(e => e.k === 'L' && isDark(e.l) && lw(e.l) >= mx * 0.5).map(e => e.p);
      const scaleDen = window.DxfIn.guessScale(segs, img.vec.ents.filter(e => e.k === 'A'));
      App.busy(false);
      await window.DxfIn.openFrame(img.vec, file.name, { mode: 'pdf', scaleDen, renderImage: img.render, paperW: img.paperW, paperH: img.paperH });
      return;
    }
    if (img.render) {   // 掃描 PDF：渲染頁面影像當底圖
      App.busy(true, '渲染 PDF 頁面…');
      try { const im = await img.render(); img = Object.assign(img, im); } catch (e) { App.busy(false); App.toast('PDF 渲染失敗：' + (e.message || e)); return; }
    }
    App.busy(false);
    const st = App.state, r = st.room;
    // 初始比例：有空間則貼齊空間寬度，否則底圖寬 10 m；置中於空間或原點
    let scale = 10000 / img.w, cx = 0, cz = 0;
    if (r && r.points.length) {
      const xs = r.points.map(p => p[0]), zs = r.points.map(p => p[1]);
      const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...zs) - Math.min(...zs);
      scale = Math.max(bw / img.w, bh / img.h) * 1.15;
      cx = (Math.max(...xs) + Math.min(...xs)) / 2; cz = (Math.max(...zs) + Math.min(...zs)) / 2;
    }
    App.mutate('匯入底圖', s => { s.underlay = { src: img.src, w: img.w, h: img.h, scale, x: Math.round(cx), z: Math.round(cz), rot: 0, opacity: 0.7, visible: true, name: file.name }; }, 'underlay');
    V().setView('top');
    App.toast('底圖已放到地面，接著請設定比例尺');
    setTimeout(() => U.startScale(), 400);
  };

  // 比例尺：在底圖上點兩點 → 輸入實際距離 → 以第一點為基準縮放
  U.startScale = function () {
    if (!App.state.underlay) return;
    V().onUscaleDone = async (a, b, dist) => {
      V().onUscaleDone = null;
      const u = App.state.underlay;
      const r = await UI().modal({ title: '設定底圖比例尺', body: `<p>剛點的兩點在目前比例下相距 <b>${Math.round(dist).toLocaleString()}</b> mm。請輸入這兩點的<b>實際距離</b>：</p>
        <div class="kv"><label>實際距離</label><div class="inline"><input name="mm" type="number" min="10" step="1" value="${Math.round(dist)}"><span class="unit">mm</span></div></div>
        <p class="muted" style="font-size:12px">建議挑圖上有標註尺寸的一道牆或門寬。設定後仍可在左側「屬性」的底圖區重新量測或微調。</p>`, buttons: [{ label: '取消', value: null }, { label: '套用比例', primary: true, value: 'ok' }] });
      V().setTool('select');
      if (!r) return;
      const real = +r.data.mm; if (!(real > 0) || !(dist > 0)) return;
      const f = real / dist;
      App.mutate('底圖比例尺', s => { const q = s.underlay; q.scale *= f; q.x = Math.round(a.x + (q.x - a.x) * f); q.z = Math.round(a.z + (q.z - a.z) * f); }, 'underlay');
      App.toast(`比例已設定：底圖實際約 ${(u.w * u.scale / 1000).toFixed(2)} × ${(u.h * u.scale / 1000).toFixed(2)} m。接著用「自由繪製」（L）沿底圖描牆線`);
    };
    V().setTool('uscale');
  };

  /* ---------- 屬性面板（空間區塊內） ---------- */
  U.panel = function (st) {
    const u = st.underlay, icon = UI().icon;
    if (!u) return `<div class="sec"><div class="sec-title">平面圖底圖 <small>JPG／PNG／PDF／DXF</small></div>
      <p class="muted" style="font-size:12px;margin:0 0 6px">匯入既有平面圖當半透明底圖，設定比例尺後沿圖描牆線；DXF（CAD）可直接由牆線建立空間。</p>
      <div class="btn-row"><button class="btn small" data-a="ul-import">${icon('image')}匯入底圖</button></div></div>`;
    const W = u.w * u.scale, H = u.h * u.scale;
    return `<div class="sec"><div class="sec-title">平面圖底圖 <small>${UI().esc(u.name || '')}</small></div>
      <div class="ul-prev"><img src="${u.src}" alt=""></div>
      <div class="kv">
        <label>實際尺寸</label><span>${(W / 1000).toFixed(2)} × ${(H / 1000).toFixed(2)} m <span class="muted">（${u.scale.toFixed(2)} mm/px）</span></span>
        <label>底圖寬</label><div class="inline"><input type="number" data-f="ul-w" value="${Math.round(W)}" min="500" step="10"><span class="unit">mm</span></div>
        <label>中心 X</label><div class="inline"><input type="number" data-f="ul-x" value="${u.x}" step="10"><span class="unit">mm</span></div>
        <label>中心 Z</label><div class="inline"><input type="number" data-f="ul-z" value="${u.z}" step="10"><span class="unit">mm</span></div>
        <label>旋轉</label><div class="inline"><input type="number" data-f="ul-rot" value="${u.rot}" step="90" min="-360" max="360"><span class="unit">°</span><button class="btn small" data-a="ul-rot90">⟳ 90°</button></div>
        <label>透明度</label><div class="inline"><input type="range" data-f="ul-op" value="${Math.round(u.opacity * 100)}" min="10" max="100" step="5"><span class="unit">${Math.round(u.opacity * 100)}%</span></div>
      </div>
      <div class="btn-row" style="margin-top:8px"><button class="btn small primary" data-a="ul-scale">${icon('tape')}兩點設定比例尺</button><button class="btn small" data-a="ul-toggle">${u.visible ? '隱藏' : '顯示'}</button><button class="btn small" data-a="ul-import">更換</button><button class="btn small danger" data-a="ul-del">移除</button></div>
      <p class="muted" style="font-size:11.5px;margin:6px 0 0">描圖：按 L 自由繪製，沿底圖牆線點各轉角；可直接輸入長度。底圖只在編輯時顯示，不會出現在報價單與圖面。</p></div>`;
  };
  U.click = async function (a) {
    if (a === 'ul-import') { U.import(); return; }
    if (a === 'ul-scale') { U.startScale(); return; }
    if (a === 'ul-toggle') { App.mutate('底圖顯示', s => { s.underlay.visible = !s.underlay.visible; }, 'underlay'); return; }
    if (a === 'ul-rot90') { App.mutate('底圖旋轉', s => { s.underlay.rot = ((s.underlay.rot || 0) + 90) % 360; }, 'underlay'); return; }
    if (a === 'ul-del') { if (await UI().confirm('移除底圖', '移除平面圖底圖？（空間與櫃體不受影響，可用 Ctrl+Z 復原）')) App.mutate('移除底圖', s => { s.underlay = null; }, 'underlay'); }
  };
  U.change = function (f, val) {
    const v = +val;
    if (f === 'ul-w') { if (!(v >= 500)) return; App.mutate('底圖寬度', s => { s.underlay.scale = v / s.underlay.w; }, 'underlay'); }
    else if (f === 'ul-x') App.mutate('底圖位置', s => { s.underlay.x = Math.round(v || 0); }, 'underlay');
    else if (f === 'ul-z') App.mutate('底圖位置', s => { s.underlay.z = Math.round(v || 0); }, 'underlay');
    else if (f === 'ul-rot') App.mutate('底圖旋轉', s => { s.underlay.rot = ((Math.round(v) || 0) % 360 + 360) % 360; }, 'underlay');
    else if (f === 'ul-op') App.mutate('底圖透明度', s => { s.underlay.opacity = Math.max(0.1, Math.min(1, v / 100)); }, 'underlay');
  };

  document.addEventListener('DOMContentLoaded', () => {
    const inp = $('#fileUnderlay');
    if (inp) inp.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; U.load(f); });
  });
  window.Underlay = U;
})();
