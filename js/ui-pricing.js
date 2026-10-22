/* 介面（報價分頁與板材售價分頁）：自動報價表、折數／稅率／備註；計價方式、材質係數、款式加價、桌面單價、設備售價、配件單價。
   拆自 js/ui.js；需在 js/ui-core.js 之後載入。 */
(function () {
  const D = window.DATA;
  const P = () => window.Pricing;
  const V = () => window.Viewer;
  const M = () => window.Model;
  const $ = s => document.querySelector(s);
  const UI = window.UI;
  const esc = UI.esc, icon = UI.icon;
  const withFocus = UI._withFocus;

  /* ================= 報價 ================= */
  function renderQuote() {
    const el = $('#tab-quote');
    const st = App.state, q = P().quote(st);
    withFocus(el, () => {
      el.innerHTML = `<div class="sec"><div class="sec-title">自動報價 <small>${q.multi ? st.floors.length + ' 層、' : ''}${q.count} 件</small></div>
      ${q.rows.length ? `<table class="qt"><thead><tr><th>型號 / 規格</th><th class="num">數量</th><th class="num">複價</th></tr></thead><tbody>
      ${q.rows.map((r, i) => `<tr class="qrow" data-q="${i}"><td>${r.floor ? `<span class="floor-tag">${esc(r.floor)}</span>` : ''}<b>${esc(P().fullCode(r.cab))}</b><br><span class="muted">${r.cab.w}×${r.cab.d}×${r.cab.h}　${esc(P().describe(r.cab))}</span></td><td class="num">${r.qty}</td><td class="num">${P().fmt(r.price.total * r.qty)}</td></tr>
        ${r.price.lines.length > 1 ? `<tr class="sub"><td colspan="3">${r.price.lines.map(l => `${esc(l.name)} ${P().fmt(l.amount)}`).join('　·　')}</td></tr>` : ''}`).join('')}
      </tbody></table>` : '<p class="note">空間中尚無系統櫃。從左側型錄取用後，報價會自動計算。</p>'}
      ${q.ceiling && q.ceiling.length ? `<div class="sec-title" style="margin-top:10px">天花工程 <small>依坪數／尺數自動計算</small></div><table class="qt"><tbody>${q.ceiling.map(l => `<tr><td>${l.floor ? `<span class="floor-tag">${esc(l.floor)}</span>` : ''}${esc(l.name)}<br><span class="muted">單價 ${P().fmt(l.unit)}/${esc(l.unitName)}</span></td><td class="num">1</td><td class="num">${P().fmt(l.amount)}</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="totals"><span>小計</span><b>${P().fmt(q.subtotal)}</b>
        <span class="inline">折數 <input type="number" class="field" style="width:64px" data-key="q-disc" data-qf="discount" value="${st.pricing.discount}" min="1" max="100"> %</span><span>${q.disc ? '−' + P().fmt(q.disc) : '—'}</span>
        <span class="inline">營業稅 <input type="number" class="field" style="width:64px" data-key="q-tax" data-qf="taxRate" value="${st.pricing.taxRate}" min="0" max="20"> %</span><span>${P().fmt(q.tax)}</span>
        <span class="grand">總計</span><span class="grand">${P().fmt(q.total)}</span></div></div>
      <div class="sec"><div class="sec-title">報價單備註</div><textarea class="field" rows="4" data-key="q-note" data-qf="note">${esc(st.pricing.note)}</textarea></div>
      <div class="btn-row"><button class="btn primary" data-qa="pdf">匯出報價單 PDF</button></div>`;
    });
  }
  function onQuoteChange(e) {
    const f = e.target.dataset.qf; if (!f) return;
    const v = f === 'note' ? e.target.value : Math.max(0, Math.min(f === 'discount' ? 100 : 30, +e.target.value || 0));
    App.mutate('報價設定', s => { s.pricing[f] = f === 'discount' && !v ? 100 : v; });
  }
  function onQuoteClick(e) {
    if (e.target.closest('[data-qa="pdf"]')) { window.Exporter.run('quote'); return; }
    const r = e.target.closest('[data-q]'); if (!r) return;
    const q = P().quote(App.state);
    const id = q.rows[+r.dataset.q].ids[0];
    // 報價表列出全部樓層：點到別層的櫃體要先切到那一層，否則選取框畫不出來、屬性面板也對不上
    const fi = App.floorList().findIndex(f => (f.cabinets || []).some(c => c.id === id));
    if (fi >= 0 && fi !== App.state.floor) App.switchFloor(fi);
    App.select({ type: 'cab', id });
    UI.showTab('quote');
  }
  UI._renderQuote = renderQuote;

  /* ================= 板材售價 ================= */
  function renderPricing() {
    const el = $('#tab-pricing'), pr = App.state.pricing;
    const useName = { body: '櫃體', door: '門板', both: '皆可' };
    withFocus(el, () => {
      el.innerHTML = `<div class="sec"><div class="sec-title">計價方式</div>
          <p class="muted" style="font-size:12px;margin:0 0 6px">櫃體售價＝各色號板材才數 × 色板單價（1 才＝303mm×303mm，每片板材無條件進位到整數才）；另加五金、抽屜組、玻璃門、檯面。桌面依材質每才單價計（整片進位）。</p>
          <div class="kv" style="margin-top:8px"><label>預設單價</label><div class="inline"><input type="number" min="0" data-key="pcai" data-pc="caiDefault" value="${pr.caiDefault != null ? pr.caiDefault : 100}"><span class="unit">元/才（未設定單價的色板 × 材質係數）</span></div></div>
          <div class="btn-row"><button class="btn small primary" data-swadmin="1">色板單價維護</button></div></div>
        <div class="sec"><div class="sec-title">板材材質係數 <small>未設定單價的色號＝預設單價 × 係數</small></div>
        <table class="pt mat"><colgroup><col style="width:26px"><col style="width:58px"><col><col style="width:50px"><col style="width:62px"><col style="width:50px"><col style="width:22px"></colgroup>
        <thead><tr><th></th><th>型號</th><th>名稱</th><th>用途</th><th>類別</th><th>係數%</th><th></th></tr></thead><tbody>
        ${pr.materials.map((m, i) => `<tr><td>${m.tex ? UI.chip(m.code) : `<input type="color" data-key="mc${i}" data-mf="hex" data-i="${i}" value="${m.hex}">`}</td>
          <td><input data-key="mk${i}" data-mf="code" data-i="${i}" value="${esc(m.code)}"${D.MATERIALS.some(x => x.code === m.code) ? ' disabled' : ''}></td>
          <td><input data-key="mn${i}" data-mf="name" data-i="${i}" value="${esc(m.name)}"></td>
          <td><select data-key="mu${i}" data-mf="use" data-i="${i}">${Object.entries(useName).map(([k, n]) => `<option value="${k}"${k === m.use ? ' selected' : ''}>${n}</option>`).join('')}</select></td>
          <td><select data-key="mt${i}" data-mf="cat" data-i="${i}">${['規格色', '訂製色', '色板'].map(c => `<option${c === m.cat ? ' selected' : ''}>${c}</option>`).join('')}</select></td>
          <td><input type="number" data-key="mf${i}" data-mf="factor" data-i="${i}" value="${m.factor}" min="10" max="500"></td>
          <td>${D.MATERIALS.some(x => x.code === m.code) ? '' : `<button class="icon-btn del" data-pa="mdel" data-i="${i}" title="刪除">${icon('x')}</button>`}</td></tr>`).join('')}
        </tbody></table><div class="btn-row"><button class="btn small" data-pa="madd">${icon('plus')}新增材質</button><button class="btn small" data-swadmin="1">色板維護（貼圖）</button></div></div>

        <div class="sec"><div class="sec-title">門板款式加價 <small>門片才數金額 × 款式價差 × 係數</small></div>
        <table class="pt"><tbody>${D.DOOR_STYLES.map(s => `<tr><td>${s.name}</td><td style="width:80px"><input type="number" data-key="st${s.id}" data-stf="${s.id}" value="${pr.styles[s.id] || 100}" min="10" max="500"></td><td class="unit">%</td></tr>`).join('')}</tbody></table></div>

        <div class="sec"><div class="sec-title">桌面每才單價 <small>元 / 才（303×303mm，整片進位）</small></div>
        <table class="pt"><thead><tr><th>材質</th>${D.DESK_THICK.map(t => `<th>${t}mm</th>`).join('')}</tr></thead><tbody>
        ${D.DESK_MATS.map(m => `<tr><td>${m.name}</td>${D.DESK_THICK.map(t => `<td><input type="number" data-key="dp${m.id}${t}" data-dpm="${m.id}" data-dpt="${t}" value="${pr.desk.prices[m.id][t]}"></td>`).join('')}</tr>`).join('')}
        </tbody></table>
        <div class="sec-title" style="margin-top:10px">桌面端部加工 <small>元 / 尺（外露邊長）</small></div>
        <table class="pt"><tbody>${D.DESK_EDGES.map(e => `<tr><td>${e.name}</td><td style="width:90px"><input type="number" data-key="de${e.id}" data-dpe="${e.id}" value="${pr.desk.edge[e.id] || 0}"></td></tr>`).join('')}</tbody></table></div>

        <div class="sec"><div class="sec-title">廚房設備售價 <small>元 / 台（空白＝參考價）</small></div>
        <table class="pt"><tbody>${D.APPLIANCES.map(a => `<tr><td>${esc(a.brand.split(' ')[0])}｜${D.APPL_TYPES[a.at]}｜${a.code}${a.est ? ' <small style="color:#b45309">估</small>' : ''}<br><small class="muted">${esc(a.name)}</small></td><td style="width:100px"><input type="number" data-key="ap${a.code}" data-apc="${a.code}" value="${pr.codeOverrides[a.code] != null ? pr.codeOverrides[a.code] : ''}" placeholder="${a.price}"></td></tr>`).join('')}</tbody></table></div>

        <div class="sec"><div class="sec-title">DAY&DAY／TOTO／和成／大吉熊／家具／IKEA／無印良品 售價 <small>元 / 個（空白＝官網訂價）</small></div>
        ${window.Lazy && window.Lazy.CATALOG.some(n => !window.Lazy.has(n)) ? `<p class="muted" style="font-size:11.5px;margin:0 0 6px">${window.Lazy.CATALOG.filter(n => !window.Lazy.has(n)).map(window.Lazy.label).join('、')}尚未載入，表格只列出已載入的型錄 <button class="btn small" data-pa="loadcat">載入</button></p>` : ''}
        <table class="pt"><tbody>${[...D.DAYDAY, ...D.TOTO, ...D.HCG, ...D.BEAR, ...D.FURN, ...D.IKEA, ...D.MUJI, ...D.LAMPS].map(a => `<tr><td>${a.brand === 'TOTO' ? 'TOTO｜' : a.brand === '和成 HCG' ? 'HCG｜' : a.brand === '大吉熊 LUCKY BEAR' ? '大吉熊｜' : a.group === 'furn' ? '家具｜' : a.group === 'ikea' ? 'IKEA｜' : a.group === 'muji' ? 'MUJI｜' : ''}${D.APPL_TYPES[a.at]}｜${a.code}${a.est ? ' <small style="color:#b45309">估</small>' : ''}<br><small class="muted">${esc(a.name)}　${a.w}×${a.d}×${a.h}</small></td><td style="width:100px"><input type="number" data-key="ap${a.code}" data-apc="${a.code}" value="${pr.codeOverrides[a.code] != null ? pr.codeOverrides[a.code] : ''}" placeholder="${a.price}"></td></tr>`).join('')}</tbody></table></div>

        <div class="sec"><div class="sec-title">其他配件</div><div class="kv">
          <label>吊衣桿</label><div class="inline"><input type="number" data-key="prod" data-po="ROD" value="${pr.parts.ROD}"><span class="unit">元 / 支</span></div>
          <label>西德鉸鍊</label><div class="inline"><input type="number" data-key="phinge" data-po="HINGE" value="${pr.parts.HINGE}"><span class="unit">元 / 個</span></div>
          <label>調整腳</label><div class="inline"><input type="number" data-key="pfoot" data-po="FOOT" value="${pr.parts.FOOT}"><span class="unit">元 / 個</span></div>
          <label>電器抽滑軌</label><div class="inline"><input type="number" data-key="peslide" data-po="ESLIDE" value="${pr.parts.ESLIDE != null ? pr.parts.ESLIDE : D.PARTS.ESLIDE}"><span class="unit">元 / 組（電器抽托盤）</span></div>
        </div></div>
        <div class="btn-row"><button class="btn danger small" data-pa="reset">全部恢復預設售價</button></div>`;
    });
  }
  function onPricingChange(e) {
    const t = e.target, d = t.dataset;
    if (d.mf) {
      const i = +d.i;
      const v = d.mf === 'factor' ? Math.max(10, +t.value || 100) : t.value;
      App.mutate('修改材質', s => { s.pricing.materials[i][d.mf] = v; }, d.mf === 'hex' ? 'all' : null);
      if (d.mf === 'hex') { M().clearMatCache(); V().rebuildAll(); }
    } else if (d.stf) App.mutate('款式係數', s => { s.pricing.styles[d.stf] = Math.max(10, +t.value || 100); });
    else if (d.pk) App.mutate('層板單價', s => { s.pricing.parts[d.pk][d.dc][d.w] = Math.max(0, +t.value || 0); });
    else if (d.apc) App.mutate('設備售價', s => { if (t.value === '') delete s.pricing.codeOverrides[d.apc]; else s.pricing.codeOverrides[d.apc] = Math.max(0, +t.value || 0); });
    else if (d.dpm) App.mutate('桌面每才單價', s => { s.pricing.desk.prices[d.dpm][d.dpt] = Math.max(0, +t.value || 0); });
    else if (d.dpe) App.mutate('桌面端部單價', s => { s.pricing.desk.edge[d.dpe] = Math.max(0, +t.value || 0); });
    else if (d.pc) { App.mutate(d.pc === 'caiDefault' ? '預設單價' : '訂製加工 %', s => { s.pricing[d.pc] = Math.max(0, +t.value || 0); }); if (d.pc === 'caiDefault') UI.refreshCatalog(); }
    else if (d.po) App.mutate('配件單價', s => { s.pricing.parts[d.po] = Math.max(0, +t.value || 0); });
  }
  async function onPricingClick(e) {
    const b = e.target.closest('[data-pa]'); if (!b) return;
    const a = b.dataset.pa;
    if (a === 'loadcat') { if (await window.Lazy.ensure(window.Lazy.CATALOG, '載入型錄…')) { UI._buildFilters(); UI.refreshCatalog(); renderPricing(); } return; }
    if (a === 'madd') {
      App.mutate('新增材質', s => s.pricing.materials.push({ code: 'NEW' + (s.pricing.materials.length + 1), name: '自訂材質', hex: '#c8b89a', use: 'both', cat: '訂製色', factor: 110, grain: false }));
    } else if (a === 'mdel') {
      const m = App.state.pricing.materials[+b.dataset.i];
      if (App.state.cabinets.some(c => c.bodyColor === m.code || c.doorColor === m.code)) { App.toast('此材質仍被櫃體使用中'); return; }
      App.mutate('刪除材質', s => s.pricing.materials.splice(+b.dataset.i, 1));
    } else if (a === 'reset') {
      if (await UI.confirm('恢復預設', '預設單價、材質係數、款式係數、桌面與配件單價、設備售價都將恢復為預設值（色板維護裡的色板單價不受影響）。')) {
        App.mutate('恢復預設售價', s => { const d = window.Pricing.defaultPricing(); d.discount = s.pricing.discount; d.taxRate = s.pricing.taxRate; d.note = s.pricing.note; s.pricing = d; }, 'all');
        M().clearMatCache(); V().rebuildAll();
      }
    }
  }
  UI._renderPricing = renderPricing;

  /* 初始化（由 UI.init 呼叫） */
  UI._initQuote = function () {
    $('#tab-quote').addEventListener('change', onQuoteChange);
    $('#tab-quote').addEventListener('click', onQuoteClick);
  };
  UI._initPricing = function () {
    $('#tab-pricing').addEventListener('change', onPricingChange);
    $('#tab-pricing').addEventListener('click', onPricingClick);
  };
})();
