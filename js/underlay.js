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
    const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    let pageNo = 1;
    if (pdf.numPages > 1) {
      const r = await UI().modal({ title: 'PDF 有 ' + pdf.numPages + ' 頁', body: `<div class="kv"><label>使用第幾頁</label><div class="inline"><input name="p" type="number" min="1" max="${pdf.numPages}" value="1"><span class="unit">頁</span></div></div>`, buttons: [{ label: '取消', value: null }, { label: '確定', primary: true, value: 'ok' }] });
      if (!r) return null;
      pageNo = Math.max(1, Math.min(pdf.numPages, Math.round(+r.data.p) || 1));
    }
    const page = await pdf.getPage(pageNo);
    const vp1 = page.getViewport({ scale: 1 });
    const k = MAX / Math.max(vp1.width, vp1.height);
    const vp = page.getViewport({ scale: k });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return { src: toJpeg(c), w: c.width, h: c.height };
  }

  U.import = function () { $('#fileUnderlay').click(); };
  U.load = async function (file) {
    if (!file) return;
    App.busy(true, '讀取底圖…');
    let img = null;
    try { img = /\.pdf$/i.test(file.name) || file.type === 'application/pdf' ? await fromPdf(file) : await fromImage(file); }
    catch (e) { App.toast(e.message || '讀取失敗'); }
    App.busy(false);
    if (!img) return;
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
    if (!u) return `<div class="sec"><div class="sec-title">平面圖底圖 <small>JPG／PNG／PDF</small></div>
      <p class="muted" style="font-size:12px;margin:0 0 6px">匯入既有平面圖當半透明底圖，設定比例尺後沿圖描牆線，不必手動量尺寸。</p>
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
