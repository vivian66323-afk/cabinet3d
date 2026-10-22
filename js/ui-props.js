/* 介面（屬性面板）：專案面板（樓層、空間、新櫃體預設、專案）、櫃體／桌面／設備／補板面板、牆面面板（門窗），
   以及右側面板的欄位變更與按鈕事件（色板與天花部分分別轉呼叫 js/ui-swatch.js、js/ui-ceiling.js）。
   拆自 js/ui.js；需在 js/ui-core.js 之後載入。 */
(function () {
  const D = window.DATA;
  const P = () => window.Pricing;
  const V = () => window.Viewer;
  const M = () => window.Model;
  const $ = s => document.querySelector(s);
  const UI = window.UI;
  const esc = UI.esc, icon = UI.icon;
  const withFocus = UI._withFocus, num = UI._num, evalNum = UI._evalNum;

  // 把手選項：空值＝依門板款式預設
  function handleOptions(cur, styleId) {
    const st = D.DOOR_STYLES.find(s => s.id === styleId) || D.DOOR_STYLES[0];
    const def = D.HANDLE_BY_ID[(st.visual || {}).handle || 'bar'];
    const gen = D.HANDLES.filter(h => h.type !== 'ikea'), ik = D.HANDLES.filter(h => h.type === 'ikea');
    const KN = { bar: '把手', knob: '門鈕', edge: '夾式／邊緣把手', cup: '貝殼把手', leather: '皮革把手' };
    const grpIk = ['bar', 'knob', 'edge', 'cup', 'leather'].map(k => { const l = ik.filter(h => h.kind === k); return l.length ? `<optgroup label="IKEA ${KN[k]}（單支價）">${l.map(h => `<option value="${h.id}"${h.id === cur ? ' selected' : ''}>${esc(h.series)} ${esc(h.facts || h.name.replace('IKEA ' + h.series + ' ', ''))}　$${h.price}</option>`).join('')}</optgroup>` : ''; }).join('');
    return `<option value=""${!cur ? ' selected' : ''}>依門板款式（${def ? def.name : '款式一體把手'}）</option><optgroup label="系統櫃把手（含於門板價）">` +
      gen.map(h => `<option value="${h.id}"${h.id === cur ? ' selected' : ''}>${h.name}${h.pair ? '（雙門片適用）' : ''}</option>`).join('') + '</optgroup>' + grpIk;
  }

  /* ================= 屬性面板 ================= */
  UI.showProps = function (switchTab) {
    const el = $('#tab-props');
    const s = App.sel;
    if (switchTab && s) UI.showTab('props');
    withFocus(el, () => {
      if (s && s.type === 'cab' && App.selectedCab()) el.innerHTML = cabPanel(App.selectedCab());
      else if (s && s.type === 'wall' && App.state.room) el.innerHTML = wallPanel(s.index);
      else el.innerHTML = projectPanel();
    });
    UI.syncToolbar();
  };

  const matOptions = (use, cur) => App.state.pricing.materials.filter(m => m.use === use || m.use === 'both').map(m => `<option value="${m.code}"${m.code === cur ? ' selected' : ''}>${m.code}　${esc(m.name)}${m.cat !== '規格色' ? '（' + m.cat + '）' : ''}</option>`).join('');
  const styleOptions = cur => D.DOOR_STYLES.map(s => `<option value="${s.id}"${s.id === cur ? ' selected' : ''}>${s.name}</option>`).join('');

  function projectPanel() {
    const st = App.state, r = st.room;
    let html = `<div class="sec"><div class="sec-title">樓層 <small>目前：${esc(st.floors[st.floor].name)}</small></div>
      <div class="list">${st.floors.map((f, i) => {
        const n = i === st.floor ? st.cabinets.length : (f.cabinets || []).length, hasRoom = i === st.floor ? !!st.room : !!f.room;
        return `<div class="lrow floor-row${i === st.floor ? ' on' : ''}"><input data-key="fn${i}" data-fn="${i}" value="${esc(f.name)}"><span class="muted">${hasRoom ? '有空間' : '無空間'} · ${n} 件</span>
          ${i === st.floor ? '<span class="muted">目前</span>' : `<button class="btn small" data-a="floor-go" data-i="${i}">切換</button>`}
          <button class="icon-btn del" data-a="floor-del" data-i="${i}" title="刪除樓層"${st.floors.length <= 1 ? ' disabled' : ''}>${icon('x')}</button></div>`;
      }).join('')}</div>
      <div class="btn-row"><button class="btn small" data-a="floor-add">${icon('plus')}新增樓層</button></div>
      <p class="muted" style="font-size:11.5px;margin:6px 0 0">新樓層會沿用目前樓層的空間外框（不含門窗與櫃體）；報價、拆料清單、平立面圖會包含全部樓層。</p></div>`;
    html += window.Underlay ? window.Underlay.panel(st) : '';
    html += '<div class="sec"><div class="sec-title">空間 <small>模型空間由使用者自訂</small></div>';
    if (!r) {
      html += `<p class="note">尚未建立空間。可輸入矩形寬／深／高，或以多線段自由繪製後封閉並輸入高度。</p>
        <div class="btn-row"><button class="btn primary" data-a="room-rect">${icon('rect')}矩形空間</button><button class="btn" data-a="room-line">${icon('line')}自由繪製</button></div>`;
    } else {
      const area = Math.abs(M().polyArea(r.points)) / 1e6;
      let per = 0; r.points.forEach((_, i) => { per += M().wallInfo(r, i).len; });
      html += `<div class="kv">
        <label>面積</label><span><b>${area.toFixed(2)}</b> m²（約 ${(area * 0.3025).toFixed(2)} 坪）</span>
        <label>周長</label><span>${Math.round(per).toLocaleString()} mm · ${r.points.length} 面牆</span>
        <label>牆高</label><div class="inline">${num('room-height', r.height, 'min="1800" max="6000" step="10"')}<span class="unit">mm</span></div>
        <label>牆厚</label><div class="inline">${num('room-thick', r.thickness, 'min="50" max="400" step="5"')}<span class="unit">mm</span></div>
        <label>地板</label><div class="inline"><span class="floor-chip" style="background:${M().floorDef(r).color}${M().floorDef(r).thumb ? `;background-image:url(${M().floorDef(r).thumb});background-size:cover` : ''}"></span><span class="pick-name">${esc(M().floorDef(r).name)}</span><button class="btn small" data-a="pick-floor">${icon('image')}選擇地板</button></div>
        <label>牆面</label><div class="inline"><span class="floor-chip" style="background:${r.wallColor || '#f1efea'}"></span><span class="pick-name">${r.wallPaint ? esc(r.wallPaint.code + ' ' + r.wallPaint.name) : '白色（預設）'}</span><button class="btn small" data-a="pick-paint">${icon('image')}選擇塗料</button>${r.wallColor ? `<button class="btn small" data-a="paint-clear" title="恢復預設白">清除</button>` : ''}</div>
      </div>
      ${UI._ceilingSection(r)}
      <div class="list wall-list" style="margin-top:10px">${r.points.map((_, i) => {
        const w = r.walls[i], wi = M().wallInfo(r, i);
        return `<div class="lrow" data-a="wall" data-i="${i}"><span>${M().wallName(i)}　<span class="muted">${Math.round(wi.len)} mm</span></span><span class="muted">${w.openings.length ? w.openings.length + ' 門窗' : ''}</span><span title="${w.locked ? '已鎖定' : '未鎖定'}" style="color:${w.locked ? '#5f6368' : '#b0b7bf'}">${icon(w.locked ? 'lock' : 'unlock')}</span></div>`;
      }).join('')}</div>
      <p class="muted" style="font-size:11.5px;margin:6px 0 0">點選牆面（清單或 3D 視窗）即可放置門／窗並鎖定。</p>
      <div class="btn-row"><button class="btn small" data-a="room-rect">重建矩形</button><button class="btn small" data-a="room-line">重新繪製</button><button class="btn small danger" data-a="room-del">刪除空間</button></div>`;
    }
    html += '</div>';
    const df = st.defaults;
    html += `<div class="sec"><div class="sec-title">新櫃體預設 <small>之後放置的櫃體套用</small></div><div class="kv">
      <label>門板款式</label><select data-key="def-style" data-f="def-style">${styleOptions(df.doorStyle)}</select>
      <label>把手</label><select data-key="def-handle" data-f="def-handle">${handleOptions(df.handle, df.doorStyle)}</select>
    </div><div class="btn-row"><button class="btn small" data-a="apply-all">預設色號與款式套用至所有櫃體</button></div></div>` + UI._swatchPicker(df, 'def');
    const q = P().quote(st);
    html += `<div class="sec"><div class="sec-title">專案</div><div class="kv">
      <label>客戶名稱</label><input data-key="client" data-f="client" value="${esc(st.client)}" placeholder="選填，顯示於報價單">
      <label>櫃體數量</label><span>${st.cabinets.length} 件</span>
      <label>報價總計</label><span class="price-big">${P().fmt(q.total)}</span>
    </div></div>
    <div class="sec"><div class="sec-title">操作方式（同 SketchUp）</div>${UI._shortcutsHTML()}</div>`;
    return html;
  }

  // 鎖定按鈕（型號旁）：鎖定後不能移動、旋轉、改尺寸、換型號或刪除；色號與備註仍可改
  const favBtn = code => `<button class="icon-btn fav-hero${UI.isFav(code) ? ' on' : ''}" data-a="fav" data-code="${esc(code)}" title="${UI.isFav(code) ? '移出我的最愛' : '加入我的最愛'}">${UI.isFav(code) ? '★' : '☆'}</button>`;
  const lockBtn = cab => `<button class="btn small lock-btn${cab.locked ? ' on' : ''}" data-a="lock-toggle" title="${cab.locked ? '已鎖定：無法移動、旋轉、改尺寸或刪除，點一下解鎖' : '鎖定位置與尺寸，避免誤動'}">${icon(cab.locked ? 'lock' : 'unlock')}${cab.locked ? '已鎖定' : '鎖定'}</button>`;
  function deskPanel(cab) {
    const it = D.byCode[cab.code];
    const pr = P().cabinetPrice(cab, App.state.pricing);
    const g = M().deskGeom(cab), dz = M().footDepth(cab);
    const ov = window.Viewer.overlaps && window.Viewer.overlaps.get(cab.id);
    let html = `<div class="hero">${UI.thumb(it)}<div><h3>${esc(D.DESK_SHAPES[cab.shape])}桌面 ${lockBtn(cab)} ${favBtn(cab.code)}</h3>
      <p>${cab.w} × ${dz} mm${cab.shape !== 'R' ? `，深 ${cab.d}` : ''}，厚 ${cab.thick}mm</p>
      <p>${P().deskCai(cab)} 才（面積 ${(g.area / D.CAI).toFixed(2)} 才，無條件進位）　外露邊 ${(g.exposed / D.CHI).toFixed(1)} 尺</p></div></div>
      ${ov ? `<p class="note danger">⚠ 此桌面與 ${esc([...ov.why].join('、'))} 重疊，請調整位置（紅色線框）。</p>` : ''}
      <div class="sec"><div class="sec-title">報價 <small>依才數計價</small></div>
      <div class="price-big">${P().fmt(pr.total)}</div>
      <table class="qt">${pr.lines.map(l => `<tr><td>${esc(l.name)}</td><td class="num">${P().fmt(l.amount)}</td></tr>`).join('')}</table></div>
      <div class="sec"><div class="sec-title">尺寸 <small>mm</small></div><div class="kv">
        <label>${cab.shape === 'R' ? '寬' : '總寬'}</label>${num('dw', cab.w, 'step="10" min="300"')}
        ${cab.shape === 'R' ? `<label>深</label>${num('dd', cab.d, 'step="10" min="200"')}` : `<label>${cab.shape === 'L' ? '側翼長' : '兩側長'}</label>${num('dl2', cab.l2, 'step="10"')}<label>桌面深</label>${num('dd', cab.d, 'step="10" min="200"')}`}
        <label>桌面高度</label><div class="inline">${num('dtop', cab.y + cab.thick, 'step="10" min="0"')}<span class="unit">上緣離地</span></div>
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">3D 中拖曳桌面兩側<b style="color:#5a8f00">綠色掣點</b>調整寬度、前緣<b style="color:#1e88e5">藍色掣點</b>調整深度（背面固定，可吸附櫃體前緣／前緣＋20mm）。</p></div>
      <div class="sec"><div class="sec-title">材質 / 加工</div><div class="kv">
        <label>材質</label><select data-key="deskMat" data-f="deskMat">${D.DESK_MATS.map(m => `<option value="${m.id}"${m.id === cab.deskMat ? ' selected' : ''}>${m.name}${m.id === 'SYS' ? '（預設）' : ''}　${(App.state.pricing.desk.prices[m.id] || {})[cab.thick] || '-'} 元/才</option>`).join('')}</select>
        <label>厚度</label><select data-key="thick" data-f="thick">${D.DESK_THICK.map(t => `<option value="${t}"${t === cab.thick ? ' selected' : ''}>${t} mm${t === 18 ? '（預設）' : ''}</option>`).join('')}</select>
        <label>端部</label><select data-key="edge" data-f="edge">${D.DESK_EDGES.map(e => `<option value="${e.id}"${e.id === cab.edge ? ' selected' : ''}>${e.name}${e.id === 'none' ? '（預設）' : ''}</option>`).join('')}</select>
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">每才單價與端部加工單價可於「板材售價」分頁修改。</p></div>
      <div class="sec"><div class="sec-title">位置 <small>mm</small></div><div class="kv">
        <label>X</label>${num('x', cab.x, 'step="10"')}
        <label>Z</label>${num('z', cab.z, 'step="10"')}
        <label>旋轉</label><div class="inline"><select data-key="rot" data-f="rot">${[0, 90, 180, 270].map(a => `<option value="${a}"${a === Math.round(cab.rot) ? ' selected' : ''}>${a}°</option>`).join('')}</select><button class="btn small" data-a="rot90">${icon('rotate')}90°</button></div>
        <label></label><div class="inline"><button class="btn small" data-a="snapwall">${icon('magnet')}靠最近牆面</button></div>
      </div></div>`;
    html += UI._swatchPicker(cab, 'cab', [['topColor', '桌面']]);
    html += `<div class="kv" style="margin-bottom:10px"><label>備註</label><input data-key="note" data-f="note" value="${esc(cab.note || '')}" placeholder="顯示於報價單"></div>
      <div class="btn-row"><button class="btn" data-a="dup">${icon('dup')}複製</button><button class="btn danger" data-a="del">${icon('delete')}刪除</button></div>`;
    return html;
  }

  function applPanel(cab) {
    const it = D.byCode[cab.code];
    const pr = P().cabinetPrice(cab, App.state.pricing);
    const ov = window.Viewer.overlaps && window.Viewer.overlaps.get(cab.id);
    const same = D.items.filter(a => a.kind === 'appl' && a.at === cab.at);
    const mountTxt = { ceiling: cab.at === 'lamp_pendant' ? '吊燈：天花懸吊，「離地高度」＝燈罩底部離地（預設天花高－700）' : '吸頂安裝（離地高度＝燈具底部）', counter: '嵌入檯面（放在櫃體上方自動對齊、桌面自動開孔）', floor: '落地嵌入（置於櫃體之間）', builtin: '嵌入櫃內', wall: '壁掛／掛桿掛式（可調離地高度）', top: cab.y === 0 ? '落地放置' : '放置於檯面或地面（不開孔，可調離地高度）' }[cab.mount];
    let html = `<div class="hero">${UI.thumb(it)}<div><h3>${esc(cab.code)} ${lockBtn(cab)} ${favBtn(cab.code)}</h3>
      <p>${esc(D.APPL_TYPES[cab.at])}｜${esc(it.brand)}</p><p>${esc(it.name)}</p></div></div>
      ${ov ? `<p class="note danger">⚠ 與 ${esc([...ov.why].join('、'))} 重疊，請調整位置（紅色線框）。</p>` : ''}
      <div class="sec"><div class="sec-title">報價 <small>設備單價</small></div>
      <div class="price-big">${P().fmt(pr.total)}</div>
      <div class="kv"><label>設備售價</label><div class="inline"><input type="number" data-key="override" data-f="override" value="${App.state.pricing.codeOverrides[cab.code] != null ? App.state.pricing.codeOverrides[cab.code] : ''}" placeholder="${it.price}"><span class="unit">空白＝${it.est ? '估計價' : '建議售價'} ${it.price.toLocaleString()}</span></div></div></div>
      <div class="sec"><div class="sec-title">型號規格</div><div class="kv">
        <label>型號</label><select data-key="applCode" data-f="applCode">${[...new Set(same.map(a => a.brand))].map(b => { const l = same.filter(a => a.brand === b); return l.length ? `<optgroup label="${esc(b)}">${l.map(a => `<option value="${a.code}"${a.code === cab.code ? ' selected' : ''}>${a.code}　${esc(a.name)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select>
        <label>品牌</label><div>${esc(it.brand)}</div>
        <label>規格</label><div>${esc(it.spec)}${it.url ? ` <a href="${esc(it.url)}" target="_blank" rel="noopener">官網頁面 ↗</a>` : ''}</div>
        <label>尺寸</label>${/^(furn|ikea|muji)$/.test(it.group) ? `<div class="inline">${num('cw', cab.w, 'step="10" min="200" max="4000"')}<span class="unit">W</span>${num('cd', cab.d, 'step="10" min="200" max="3000"')}<span class="unit">D</span>${num('ch', cab.h, 'step="10" min="100" max="2600"')}<span class="unit">H</span></div>` : `<div>W${cab.w} × D${cab.d} × H${cab.h} mm</div>`}
        ${it.cut ? `<label>檯面開孔</label><div>${it.cut[0]} × ${it.cut[1]} mm</div>` : ''}
        <label>安裝方式</label><div>${mountTxt}</div>
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">參考 ${esc(it.brand)} 官方／通路公開規格${it.est ? '；此型號查無公開售價，目前為估計價，請依實際報價修改' : ''}。實際尺寸、開孔與售價以原廠最新資料為準。</p></div>
      <div class="sec"><div class="sec-title">位置 <small>mm</small></div><div class="kv">
        <label>X</label>${num('x', cab.x, 'step="10"')}
        <label>Z</label>${num('z', cab.z, 'step="10"')}
        <label>${cab.mount === 'counter' ? '上緣高度' : '離地高度'}</label><div class="inline">${num(cab.mount === 'counter' ? 'atop' : 'y', cab.mount === 'counter' ? cab.y + cab.h : cab.y, 'step="10" min="0"')}<span class="unit">${cab.mount === 'counter' ? '＝檯面高' : '底部離地'}</span></div>
        <label>旋轉</label><div class="inline"><select data-key="rot" data-f="rot">${[0, 90, 180, 270].map(a => `<option value="${a}"${a === Math.round(cab.rot) ? ' selected' : ''}>${a}°</option>`).join('')}</select><button class="btn small" data-a="rot90">${icon('rotate')}90°</button></div>
        <label></label><div class="inline"><button class="btn small" data-a="snapwall">${icon('magnet')}靠最近牆面</button></div>
      </div></div>`;
    if (it.finish === 'panel') html += UI._swatchPicker(cab, 'cab', [['doorColor', '嵌門板']]);
    if (cab.at === 'slidedoor') {
      const sel = (f, list, cur) => `<select data-key="${f}" data-f="${f}">${list.map(([k, n]) => `<option value="${k}"${String(cur) === String(k) ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
      html += `<div class="sec"><div class="sec-title">外掛門組</div><div class="kv">
        <label>開門方式</label>${sel('smode', [['slide', '推拉（上下軌）'], ['swing', '平開（鉸鍊）']], cab.smode || 'slide')}
        <label>片數</label>${sel('panels', [[2, '2 片'], [3, '3 片'], [4, '4 片']], cab.panels || 2)}
        <label>款式</label>${sel('sstyle', [['board', '板材門片（系統色板）'], ['wood', '木門片（原木／胡桃／烤漆）'], ['alu', '鋁框玻璃門']], cab.sstyle || 'board')}
        ${cab.sstyle === 'wood' ? `<label>木門色</label>${sel('dcolor', M().DOOR_COLORS.slice(0, 5), cab.dcolor || 'wood')}` : ''}
        ${cab.sstyle === 'alu' ? `<label>鋁框色</label>${sel('aluColor', M().ALU_COLORS, cab.aluColor || 'silver')}<label>玻璃</label>${sel('glassType', M().GLASS_TYPES, cab.glassType || 'glass')}<label>框寬</label><select data-key="aluSlim" data-f="aluSlim"><option value=""${!cab.aluSlim ? ' selected' : ''}>標準 32mm</option><option value="1"${cab.aluSlim ? ' selected' : ''}>細框 20mm</option></select>` : `<label>軌道色</label>${sel('aluColor', M().ALU_COLORS, cab.aluColor || 'silver')}`}
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">放在開放櫃／衣櫃前方，寬＝整組寬度、高＝門高、深＝軌道深（推拉雙軌約 80，平開可改 25）。每片依寬高以門板價表計價（木門片 1.6 倍估），軌道或鉸鍊五金另計，可在上方售價欄覆寫總價。「開門預覽」推拉會推開第一片、平開會全部旋開。</p></div>`;
      if ((cab.sstyle || 'board') === 'board') html += UI._swatchPicker(cab, 'cab', [['doorColor', '門片色板']]);
    }
    if (/^lamp_/.test(cab.at)) {
      const sel = (f, list, cur) => `<select data-key="${f}" data-f="${f}">${list.map(([k, n]) => `<option value="${k}"${String(cur) === String(k) ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
      html += `<div class="sec"><div class="sec-title">燈光</div><div class="kv">
        <label>開燈</label><label class="inline"><input type="checkbox" data-key="lit" data-f="lit"${cab.lit !== false ? ' checked' : ''} style="width:auto"> 顯示光源（工具列「燈光」可整體開關）</label>
        <label>色溫</label>${sel('kelvin', [[2200, '2200K 燭光'], [2700, '2700K 暖黃'], [3000, '3000K 暖白'], [3500, '3500K'], [4000, '4000K 自然白'], [5000, '5000K'], [6500, '6500K 白光']], cab.kelvin || 2700)}
        <label>亮度</label>${sel('lum', [[200, '200 lm 微光'], [300, '300 lm'], [500, '500 lm'], [800, '800 lm（約 60W）'], [1200, '1200 lm'], [2000, '2000 lm'], [3000, '3000 lm']], cab.lum || 800)}
        <label>燈罩色</label>${sel('lcolor', M().LAMP_COLORS, cab.lcolor || 'white')}
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">${it.designer ? '設計：' + esc(it.designer) + '　' : ''}${it.colors && it.colors.length ? '原廠顏色：' + esc(it.colors.join('／')) : ''}<br>3D 為依外型分類的近似模型；搭配右上「夜景」光照可看打光效果。</p></div>`;
    }
    if (cab.at === 'partition') {
      const sel = (f, list, cur) => `<select data-key="${f}" data-f="${f}">${list.map(([k, n]) => `<option value="${k}"${cur === k ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
      html += `<div class="sec"><div class="sec-title">固定牆板</div><div class="kv">
        <label>面材</label><select data-key="pcolor" data-f="pcolor"><optgroup label="牆面">${[['wall', '白牆（油漆）'], ['gray', '灰色'], ['dark', '深色'], ['wood', '木紋'], ['walnut', '胡桃木紋']].map(([k, n]) => `<option value="${k}"${(cab.pcolor || 'wall') === k ? ' selected' : ''}>${n}</option>`).join('')}</optgroup><optgroup label="玻璃／鏡（固定隔屏，上下鋁框）">${M().GLASS_TYPES.map(([k, n]) => `<option value="${k}"${cab.pcolor === k ? ' selected' : ''}>${n}</option>`).join('')}</optgroup></select>
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">寬＝牆板長度、深＝牆板厚度、高通常＝天花高；在上方「尺寸」修改。放在門片或櫃體旁會自動吸附對齊。</p></div>`;
    }
    if (cab.at === 'curtain') {
      const sel = (f, list, cur) => `<select data-key="${f}" data-f="${f}">${list.map(([k, n]) => `<option value="${k}"${cur === k ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
      const st = cab.cstyle || 'wave', isRoll = ['roller', 'zebra', 'roman', 'honeycomb', 'venetian'].includes(st);
      html += `<div class="sec"><div class="sec-title">窗簾款式</div><div class="kv">
        <label>款式</label>${sel('cstyle', M().CURTAIN_STYLES, st)}
        <label>顏色</label>${sel('ccolor', M().CURTAIN_COLORS, cab.ccolor || 'beige')}
        ${!isRoll && st !== 'vertical' ? `<label>片數</label>${sel('cpanels', [['2', '雙開（左右各一片）'], ['1', '單開（一片）']], cab.cpanels || '2')}` : ''}
        <label>${isRoll ? '拉起' : '拉開'}</label><div class="inline">${num('copen', cab.copen != null ? cab.copen : 0, 'step="10" min="0" max="100"')}<span class="unit">%（0＝全部放下／拉上）</span></div>
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">寬、高、深在上方「尺寸」修改：布簾高度通常到地（離地 0、高＝天花高或 2400）；捲簾類高＝窗高＋100，離地＝窗台高－50。選取牆面可一鍵為該牆的窗加窗簾。</p></div>`;
    }
    if (cab.at === 'doorleaf') {
      const sel = (f, list, cur) => `<select data-key="${f}" data-f="${f}">${list.map(([k, n]) => `<option value="${k}"${cur === k ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
      html += `<div class="sec"><div class="sec-title">門片款式</div><div class="kv">
        <label>款式</label><select data-key="dstyle" data-f="dstyle">${M().DOOR_STYLE_GROUPS.map(([gn, list]) => `<optgroup label="${gn}">${list.map(([k, n]) => `<option value="${k}"${(cab.dstyle || 'single') === k ? ' selected' : ''}>${n}</option>`).join('')}</optgroup>`).join('')}</select>
        <label>門片色</label><select data-key="dcolor" data-f="dcolor"><optgroup label="板材">${M().DOOR_COLORS.slice(0, 5).map(([k, n]) => `<option value="${k}"${(cab.dcolor || 'wood') === k ? ' selected' : ''}>${n}</option>`).join('')}</optgroup><optgroup label="玻璃／鏡">${M().GLASS_TYPES.map(([k, n]) => `<option value="${k}"${cab.dcolor === k ? ' selected' : ''}>${n}</option>`).join('')}</optgroup></select>
        <label>門框</label>${sel('noframe', [['0', '有門框'], ['1', '無門框（只有門片）']], cab.noframe === '1' || cab.noframe === true ? '1' : '0')}
        <label>框色</label>${sel('dframe', M().FRAME_COLORS, cab.dframe || 'white')}
        <label>鉸鏈側</label>${sel('hinge', [['R', '右側（把手在左）'], ['L', '左側（把手在右）']], cab.hinge || 'R')}
        <label>固定牆板</label><div class="inline"><button class="btn small" data-a="add-part-l" title="在門片左側加一塊固定牆板（到天花）">${icon('rect')}左側加牆板</button><button class="btn small" data-a="add-part-r" title="在門片右側加一塊固定牆板">${icon('rect')}右側加牆板</button></div>
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">寬、高、深在上方「尺寸」修改；深度＝門框深。放在櫃體旁會自動與櫃體吸附對齊。</p></div>`;
    }
    html += `<div class="kv" style="margin-bottom:10px"><label>備註</label><input data-key="note" data-f="note" value="${esc(cab.note || '')}" placeholder="顯示於報價單"></div>
      <div class="btn-row">${['wardrobe', 'tvstand', 'nightstand', 'drawers', 'shoecab', 'changingtable', 'slidedoor'].includes(cab.at) ? `<button class="btn" data-a="toggle-open">${icon('open')}開門預覽</button>` : ''}<button class="btn" data-a="dup">${icon('dup')}複製</button><button class="btn danger" data-a="del">${icon('delete')}刪除</button></div>`;
    return html;
  }

  // 補板：寬、高、深自訂，色號只有一個部位
  function fillerPanel(cab) {
    const pr = P().cabinetPrice(cab, App.state.pricing);
    let html = `<div class="hero"><div class="filler-ico" style="width:56px;height:56px;border:1px solid var(--line);border-radius:6px;background:var(--panel-2)"></div><div>
      <h3>${esc(M().cabName(cab))} ${lockBtn(cab)} ${favBtn(cab.code)}</h3><p>補板 W${cab.w} × H${cab.h} mm，前緣到牆 ${cab.d} mm</p><p class="muted">前方補板＋後方 50mm 固定條</p></div></div>
      <div class="sec"><div class="sec-title">報價 <small>色板才數計價</small></div><div class="price-big">${P().fmt(pr.total)}</div>
      <table class="qt">${pr.lines.map(l => `<tr><td>${esc(l.name)}</td><td class="num">${P().fmt(l.amount)}</td></tr>`).join('')}</table></div>
      <div class="sec"><div class="sec-title">位置 <small>mm</small></div><div class="kv">
      <label>X</label>${num('x', cab.x, 'step="10"')}<label>Z</label>${num('z', cab.z, 'step="10"')}
      <label>離地高度</label>${num('y', cab.y, 'step="10" min="0"')}
      <label>旋轉</label><select data-key="rot" data-f="rot">${[0, 90, 180, 270].map(a => `<option value="${a}"${a === Math.round(cab.rot) ? ' selected' : ''}>${a}°</option>`).join('')}</select>
      <label></label><div class="inline"><button class="btn small" data-a="snapwall">${icon('magnet')}靠最近牆面</button></div></div></div>
      <div class="sec"><div class="sec-title">尺寸 <small>依現場空隙輸入</small></div><div class="kv">
        <label>寬 W</label><div class="inline">${num('cw', cab.w, 'step="5" min="20" max="600"')}<span class="unit">mm（空隙寬）</span></div>
        <label>高 H</label><div class="inline">${num('ch', cab.h, 'step="10" min="100" max="2800"')}<span class="unit">mm</span></div>
        <label>深 D</label><div class="inline">${num('cd', cab.d, 'step="10" min="50" max="900"')}<span class="unit">mm（牆面到補板前緣，通常＝櫃深＋門片 18）</span></div>
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">放在櫃體旁邊會自動靠齊；前緣請對齊相鄰櫃體的門片面。</p></div>`;
    html += UI._swatchPicker(cab, 'cab', [['bodyColor', '補板']]);
    html += `<div class="kv" style="margin-bottom:10px"><label>備註</label><input data-key="note" data-f="note" value="${esc(cab.note || '')}" placeholder="顯示於報價單"></div>
      <div class="btn-row"><button class="btn" data-a="dup">${icon('dup')}複製</button><button class="btn danger" data-a="del">${icon('delete')}刪除</button></div>`;
    return html;
  }
  function cabPanel(cab) {
    if (cab.kind === 'filler') return fillerPanel(cab);
    if (cab.kind === 'appl') return applPanel(cab);
    if (cab.kind === 'desk') return deskPanel(cab);
    const it = D.byCode[cab.code];
    const pr = P().cabinetPrice(cab, App.state.pricing);
    const rows = cab.fronts;
    const sum = rows.reduce((a, r) => a + r.h, 0);
    const Hc = Math.round(cab.h / 10);
    const isTri = cab.kind === 'tri';
    const frontsEditable = !isTri;
    let html = `<div class="hero">${UI.thumb({ ...it, fronts: cab.fronts, hanging: cab.hanging })}<div>
      <h3>${esc(M().cabName(cab))} ${lockBtn(cab)} ${favBtn(cab.code)}</h3>
      <p>W${cab.w} × D${cab.d} × H${cab.h} mm${cab.hanging ? '　吊櫃' : ''}</p>
      <p>${esc(isTri ? '三角邊櫃 · ' + D.TRI_TYPE_NAME[cab.triType] : P().describe(cab))}</p></div></div>
      ${window.Viewer.overlaps && window.Viewer.overlaps.get(cab.id) ? `<p class="note danger">⚠ 此櫃體與 ${esc([...window.Viewer.overlaps.get(cab.id).why].join('、'))} 重疊，請調整位置（紅色線框）。</p>` : ''}
      <div class="sec"><div class="sec-title">報價 <small>色板才數計價</small></div>
      <div class="price-big">${P().fmt(pr.total)}</div>
      <table class="qt">${pr.lines.map(l => `<tr><td>${esc(l.name)}</td><td class="num">${P().fmt(l.amount)}</td></tr>`).join('')}</table></div>`;

    html += `<div class="sec"><div class="sec-title">位置 <small>mm</small></div><div class="kv">
      <label>X</label>${num('x', cab.x, 'step="10"')}
      <label>Z</label>${num('z', cab.z, 'step="10"')}
      <label>離地高度</label><div class="inline">${num('y', cab.y, 'step="10" min="0"')}<span class="unit">${cab.hanging ? '吊櫃底' : '櫃體底（含踢腳）'}</span></div>
      <label>旋轉</label><div class="inline"><select data-key="rot" data-f="rot">${[0, 90, 180, 270].map(a => `<option value="${a}"${a === Math.round(cab.rot) ? ' selected' : ''}>${a}°</option>`).join('')}${[0, 90, 180, 270].includes(Math.round(cab.rot)) ? '' : `<option selected>${Math.round(cab.rot)}°</option>`}</select><button class="btn small" data-a="rot90">${icon('rotate')}90°</button></div>
      <label></label><div class="inline"><button class="btn small" data-a="snapwall">${icon('magnet')}靠最近牆面</button></div>
      <label>門片</label><div class="inline"><button class="btn small" data-a="add-leaf-l" title="在櫃體左側加一片獨立門片（更衣室／房間入口）">${icon('door')}左側加門片</button><button class="btn small" data-a="add-leaf-r" title="在櫃體右側加一片獨立門片">${icon('door')}右側加門片</button></div>
      <label>推拉門</label><div class="inline"><button class="btn small" data-a="add-slide" title="在此櫃體（或整排開放櫃）前方外掛一組門（推拉或平開、板材／木門／鋁框玻璃），寬高同櫃體">${icon('door')}外掛門組</button></div>
      <label>固定牆板</label><div class="inline"><button class="btn small" data-a="add-part-l" title="在櫃體左側加一塊固定牆板（到天花）">${icon('rect')}左側加牆板</button><button class="btn small" data-a="add-part-r" title="在櫃體右側加一塊固定牆板">${icon('rect')}右側加牆板</button></div>
      ${isTri ? `<label>方向</label><label class="inline"><input type="checkbox" data-f="mirror" data-key="mirror"${cab.mirror ? ' checked' : ''} style="width:auto"> 左右鏡射</label>` : ''}
    </div></div>`;

    if (['std', 'tv', 'double', 'hang'].includes(cab.kind)) {
      const custom = P().isCustom(cab);
      html += `<div class="sec"><div class="sec-title">尺寸 <small>${custom ? '非規格尺寸（板材才數依實際尺寸重算）' : '型錄規格'}</small></div><div class="kv">
        <label>寬 W</label><div class="inline">${num('cw', cab.w, 'step="10" min="200" max="3600"')}<span class="unit">mm（型錄 ${it.w}）</span></div>
        <label>高 H</label><div class="inline">${num('ch', cab.h, 'step="10" min="200" max="2800"')}<span class="unit">mm（型錄 ${it.h}）</span></div>
        <label>深 D</label><div class="inline">${num('cd', cab.d, 'step="10" min="150" max="900"')}<span class="unit">mm（型錄 ${it.d}）</span></div>
        ${custom ? `<label></label><div class="inline"><button class="btn small" data-a="size-reset">還原型錄尺寸</button></div>` : ''}
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">改了尺寸後名稱結尾會從「-S」變成「-M」（已修改，板材才數依實際尺寸重算）。改高度時門片/抽屜依比例調整，層板重新排列；改深度時層板與背板跟著變，五金仍以型錄深度碼計價。</p></div>`;
    }
    html += UI._swatchPicker(cab, 'cab');
    if (frontsEditable) {
      const isPair = cab.fronts.some(r => ['P', 'GP', 'F'].includes(r.t));
      html += `<div class="sec"><div class="sec-title">門板款式 / 把手</div><div class="kv">
      <label>款式</label><select data-key="doorStyle" data-f="doorStyle">${styleOptions(cab.doorStyle)}</select>
      ${(cab.fronts || []).some(r => r.t === 'G' || r.t === 'GP') ? `<label>鋁框色</label><select data-key="aluColor" data-f="aluColor">${M().ALU_COLORS.map(([k, n]) => `<option value="${k}"${(cab.aluColor || 'silver') === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <label>玻璃</label><select data-key="glassType" data-f="glassType">${M().GLASS_TYPES.map(([k, n]) => `<option value="${k}"${(cab.glassType || 'glass') === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <label>框寬</label><select data-key="aluSlim" data-f="aluSlim"><option value=""${!cab.aluSlim ? ' selected' : ''}>標準 32mm</option><option value="1"${cab.aluSlim ? ' selected' : ''}>細框 20mm</option></select>` : ''}
      <label>把手</label><select data-key="handle" data-f="handle">${handleOptions(cab.handle, cab.doorStyle)}</select>${(() => { const hd = cab.handle && D.HANDLE_BY_ID[cab.handle]; return hd && hd.type === 'ikea' ? `<label></label><div class="inline" style="gap:8px"><img src="${hd.img}" alt="" style="width:56px;height:56px;object-fit:contain;border:1px solid var(--line);border-radius:6px;background:#fff"><span class="muted" style="font-size:11.5px">${esc(hd.name)}<br>${hd.len ? (hd.kind === 'knob' ? 'Ø' : '長 ') + hd.len + ' mm' : ''}${hd.cc ? '　孔距 ' + hd.cc : ''}　每包 ${hd.pack} 支 $${hd.packPrice}　<a href="${esc(hd.href)}" target="_blank" rel="noopener">IKEA ↗</a></span></div>` : ''; })()}</div>
      ${(D.HANDLE_BY_ID[cab.handle] || {}).pair && !isPair ? '<p class="note">「中間」把手為雙門片（對開）適用；單門片會放在開啟側、抽屜放在上緣。</p>' : ''}</div>`;
    }

    if (frontsEditable) {
      const typeOpts = cur => Object.entries(D.FRONT_NAME).filter(([t]) => cab.kind !== 'corner' || ['O', 'L', 'R'].includes(t)).map(([t, n]) => `<option value="${t}"${t === cur ? ' selected' : ''}>${n}</option>`).join('');
      const hOpts = cur => { const hs = [...new Set([...D.FRONT_HEIGHTS, cur])].filter(h => h <= Hc).sort((a, b) => a - b); return hs.map(h => `<option value="${h}"${h === cur ? ' selected' : ''}>${h * 10} mm</option>`).join(''); };
      html += `<div class="sec"><div class="sec-title">門片 / 抽屜 <small>由上而下</small></div>
        <div class="list">${Math.round(Hc - sum) > 0 ? `<div class="lrow fronts" style="background:var(--panel-2)"><span class="muted">開放空間（自動）</span><span class="muted">${(Hc - sum) * 10} mm</span><span></span><span></span><span></span><span></span></div>` : ''}
        ${rows.map((r, i) => `<div class="lrow fronts"><select data-key="rt${i}" data-rf="t" data-i="${i}">${typeOpts(r.t)}</select><select data-key="rh${i}" data-rf="h" data-i="${i}">${hOpts(r.h)}</select>
          ${r.t === 'L' || r.t === 'R' ? `<button class="btn small flip" data-ra="flip" data-i="${i}" title="左開 ⇄ 右開">⇄ 換邊</button>` : '<span></span>'}
          <button class="icon-btn" data-ra="up" data-i="${i}" title="上移">${icon('up')}</button><button class="icon-btn" data-ra="down" data-i="${i}" title="下移">${icon('down')}</button><button class="icon-btn del" data-ra="del" data-i="${i}" title="移除">${icon('x')}</button></div>`).join('')}</div>
        <div class="rows-meter${sum > Hc ? ' err' : ''}">已配置 ${sum * 10} / ${cab.h} mm${sum > Hc ? '（超過櫃高）' : ''}</div>
        <div class="btn-row"><button class="btn small" data-a="row-add-door">${icon('plus')}加門片</button><button class="btn small" data-a="row-add-drawer">${icon('plus')}加抽屜</button><button class="btn small" data-a="row-reset">還原型錄配置</button></div>
        <p class="muted" style="font-size:11.5px;margin:6px 0 0">變更門片配置後，層板會依新配置自動重排；門片、屜頭的板材才數會自動重算。</p></div>`;
    }

    const shelves = cab.shelves.slice().sort((a, b) => b.y - a.y);
    if (!(isTri && cab.triType === '00')) {
      html += `<div class="sec"><div class="sec-title">層板 <small>高度＝距櫃體底部 mm</small></div>
        <div class="list">${shelves.length ? shelves.map((s, i) => {
          const idx = cab.shelves.indexOf(s);
          return `<div class="lrow shelf"><span class="muted">${shelves.length - i}</span>${`<input type="number" data-key="sy${idx}" data-sf="y" data-i="${idx}" value="${Math.round(s.y)}" step="10" min="${D.BOARD}" max="${cab.h - 2 * D.BOARD}">`}
          <select data-key="sfx${idx}" data-sf="fixed" data-i="${idx}"${isTri ? ' disabled' : ''}><option value="0"${!s.fixed ? ' selected' : ''}>活動層板</option><option value="1"${s.fixed ? ' selected' : ''}>固定隔板</option></select>
          <button class="icon-btn del" data-sa="del" data-i="${idx}" title="移除">${icon('x')}</button></div>`;
        }).join('') : '<p class="muted" style="margin:0">無層板</p>'}</div>
        <div class="btn-row"><button class="btn small" data-a="shelf-add">${icon('plus')}加層板</button><button class="btn small" data-a="shelf-even">平均分配</button><button class="btn small" data-a="shelf-reset">預設層板</button></div>
        ${!isTri ? `<label class="inline" style="margin-top:8px"><input type="checkbox" data-f="rod" data-key="rod"${cab.rod ? ' checked' : ''}> 加裝吊衣桿</label>` : ''}</div>`;
    }

    const hw = (key, label, autoN) => `<label>${label}</label><div class="inline"><input type="number" min="0" step="1" data-key="${key}" data-f="${key}" value="${cab[key] != null ? cab[key] : autoN}">
      <span class="unit">個 ${cab[key] != null ? `（自動 ${autoN}）` : '自動'}</span>${cab[key] != null ? `<button class="btn small" data-a="hw-auto" data-k="${key}">還原自動</button>` : ''}</div>`;
    if (P().hasDoor(cab) || cab.hingeQty || cab.footQty) {
      html += `<div class="sec"><div class="sec-title">五金 <small>依門片自動帶入，可修改數量</small></div><div class="kv">
        ${hw('hingeQty', '西德鉸鍊', P().autoHinges(cab))}
        ${!cab.hanging && cab.kind !== 'tri' ? hw('footQty', '調整腳', P().autoFeet(cab)) : ''}
      </div><p class="muted" style="font-size:11.5px;margin:6px 0 0">鉸鍊：門高 ≤80cm 2 個、81–150 3 個、151–220 4 個、221–265 5 個（每片門）。調整腳：櫃寬 ≤90cm 4 個、>90–120cm 6 個。</p></div>`;
    }
    html += `<div class="sec"><div class="sec-title">配件</div><div class="kv">
      ${!cab.hanging && !isTri ? `<label>踢腳板</label><label class="inline"><input type="checkbox" data-f="kick" data-key="kick"${cab.kick ? ' checked' : ''} style="width:auto"> 100mm 踢腳板</label>` : ''}
      ${!isTri ? `<label>檯面</label><select data-key="top" data-f="top">${Object.entries(D.PARTS.TOP).map(([k2, t]) => `<option value="${k2}"${k2 === cab.top ? ' selected' : ''}>${t.name}</option>`).join('')}</select>` : ''}
      <label>備註</label><input data-key="note" data-f="note" value="${esc(cab.note || '')}" placeholder="顯示於報價單">
    </div></div>
    <div class="btn-row"><button class="btn" data-a="toggle-open">${icon('open')}開門預覽</button><button class="btn" data-a="dup">${icon('dup')}複製</button><button class="btn danger" data-a="del">${icon('delete')}刪除</button></div>`;
    return html;
  }

  function pIsLeft(wi) { const right = [-wi.nOut[1], wi.nOut[0]]; return wi.dir[0] * right[0] + wi.dir[1] * right[1] > 0; }
  function leftOffset(wi, o) { return pIsLeft(wi) ? o.offset : wi.len - o.offset - o.width; }
  function fromLeft(wi, left, width) { return pIsLeft(wi) ? left : wi.len - left - width; }

  function wallPanel(i) {
    const r = App.state.room, w = r.walls[i], wi = M().wallInfo(r, i);
    const dis = w.locked ? ' disabled' : '';
    let html = `<div class="hero"><svg class="thumb" viewBox="0 0 64 64"><rect x="6" y="14" width="52" height="40" fill="${w.locked ? '#bdbdbd' : '#f1efea'}" stroke="#3b4450"/>${w.openings.map(o => {
      const x = 6 + 52 * leftOffset(wi, o) / wi.len, ww = 52 * o.width / wi.len, y = 54 - 40 * (o.sill + o.height) / r.height, hh = 40 * o.height / r.height;
      return `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${o.type === 'door' ? '#c9a57a' : '#cfe6ec'}" stroke="#3b4450" stroke-width=".7"/>`;
    }).join('')}</svg><div><h3>${M().wallName(i)}</h3><p>長 ${Math.round(wi.len)} mm × 高 ${r.height} mm</p><p>${w.locked ? '已鎖定（灰色）' : '未鎖定'}</p></div></div>`;
    if (w.locked) html += `<p class="note lock">${icon('lock')} 此牆面已確認並鎖定，門窗無法修改。需要調整請先解鎖。</p>`;
    html += `<div class="sec"><div class="sec-title">牆面塗料 <small>此面牆單獨上色（跳色牆）</small></div><div class="kv">
      <label>顏色</label><div class="inline"><span class="floor-chip" style="background:${w.color || r.wallColor || '#f1efea'}"></span><span class="pick-name">${w.paint ? esc(w.paint.code + ' ' + w.paint.name) : (w.color ? w.color : '同整體牆面')}</span><button class="btn small" data-a="pick-paint-wall" data-i="${i}"${dis}>${icon('image')}選擇塗料</button>${w.color ? `<button class="btn small" data-a="paint-wall-clear" data-i="${i}"${dis}>同整體</button>` : ''}</div>
    </div></div>`;
    html += `<div class="sec"><div class="sec-title">門 / 窗 <small>從室內面向此牆，尺寸 mm</small></div>`;
    html += w.openings.length ? w.openings.map((o, j) => `<div class="opening"><div class="opening-head"><span>${icon(o.type === 'door' ? 'door' : 'window')} ${o.type === 'door' ? '門' : '窗'} ${j + 1}</span>${w.locked ? '' : `<button class="icon-btn del" data-oa="del" data-j="${j}" title="刪除">${icon('x')}</button>`}</div>
      <div class="kv"><label>寬</label><input type="number" data-key="ow${j}" data-of="width" data-j="${j}" value="${o.width}" step="10"${dis}>
      <label>高</label><input type="number" data-key="oh${j}" data-of="height" data-j="${j}" value="${o.height}" step="10"${dis}>
      <label>抬高</label><input type="number" data-key="os${j}" data-of="sill" data-j="${j}" value="${o.sill}" step="10"${dis}>
      <label>距左</label><input type="number" data-key="ol${j}" data-of="left" data-j="${j}" value="${Math.round(leftOffset(wi, o))}" step="10"${dis}>
      <label>款式</label><select data-key="ost${j}" data-of="style" data-j="${j}"${dis}>${o.type === 'door' ? M().DOOR_STYLE_GROUPS.map(([gn, list]) => `<optgroup label="${gn}">${list.map(([k, n]) => `<option value="${k}"${(o.style || 'single') === k ? ' selected' : ''}>${n}</option>`).join('')}</optgroup>`).join('') : M().WIN_STYLES.map(([k, n]) => `<option value="${k}"${(o.style || 'slide') === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
      ${o.type === 'door' ? `<label>門片色</label><select data-key="oc${j}" data-of="color" data-j="${j}"${dis}><optgroup label="板材">${M().DOOR_COLORS.slice(0, 5).map(([k, n]) => `<option value="${k}"${(o.color || 'wood') === k ? ' selected' : ''}>${n}</option>`).join('')}</optgroup><optgroup label="玻璃／鏡">${M().GLASS_TYPES.map(([k, n]) => `<option value="${k}"${o.color === k ? ' selected' : ''}>${n}</option>`).join('')}</optgroup></select>` : ''}
      <label>框色</label><select data-key="of${j}" data-of="frame" data-j="${j}"${dis}>${M().FRAME_COLORS.map(([k, n]) => `<option value="${k}"${(o.frame || 'white') === k ? ' selected' : ''}>${n}</option>`).join('')}</select></div></div>`).join('') : '<p class="muted" style="margin:0 0 6px">此牆面尚無門窗</p>';
    if (!w.locked) html += `<div class="btn-row"><button class="btn small" data-a="add-door">${icon('door')}房間門 900×2100</button><button class="btn small" data-a="add-aluslide" title="細鋁框玻璃推拉門（兩扇），黑框清玻">${icon('door')}鋁框拉門 1600×2100</button><button class="btn small" data-a="add-balcony">${icon('door')}陽台門 800×2100</button><button class="btn small" data-a="add-entry">${icon('door')}玄關門 1000×2100</button><button class="btn small" data-a="add-window">${icon('window')}加窗 1200×1200</button>${w.openings.some(o => o.type === 'window' || /^(balcony3|aluglass|patio2|patio4|bifold)$/.test(o.style || '')) ? `<button class="btn small" data-a="add-curtains" title="為這面牆的每個窗（含陽台門）各加一組窗簾，寬度＝窗寬左右各加 10cm：高窗用捲簾、落地窗用蛇形簾">${icon('window')}加窗簾（窗寬＋20cm）</button><button class="btn small" data-a="add-curtain-wall" title="一組蛇形簾與這面牆同寬、到地">${icon('window')}加窗簾（與牆同寬）</button>` : ''}</div>`;
    html += `</div><div class="btn-row">${w.locked ? `<button class="btn" data-a="unlock">${icon('unlock')}解鎖牆面</button>` : `<button class="btn primary" data-a="lock">${icon('lock')}確認並鎖定牆面</button>`}
      <button class="btn" data-a="back">返回專案</button></div>`;
    return html;
  }

  function clampOpening(r, wi, o) {
    o.width = Math.max(300, Math.min(Math.round(o.width), Math.round(wi.len - 20)));
    o.height = Math.max(200, Math.min(Math.round(o.height), r.height - 10));
    o.sill = Math.max(0, Math.min(Math.round(o.sill), r.height - o.height - 10));
    if (o.type === 'door') o.sill = 0;
    o.offset = Math.max(10, Math.min(Math.round(o.offset), Math.round(wi.len - o.width - 10)));
  }

  function onPropsChange(e) {
    const t = e.target;
    const st = App.state;
    const s = App.sel;
    // 只有數值欄位（.numf 文字框或 type=number）才算算式；備註、客戶名稱、樓層名稱（例如「1-2」）、色板廠商／系列這些文字欄位照原樣存
    const isNum = t.classList.contains('numf') || t.type === 'number';
    const val = t.type === 'checkbox' ? t.checked : isNum ? evalNum(t.value) : t.value;
    if (t.classList.contains('numf') && val !== t.value) t.value = val;
    if (t.dataset.swq) return;
    if (t.dataset.fn != null) { App.renameFloor(+t.dataset.fn, val); return; }
    if (t.dataset.f && t.dataset.f.startsWith('ul-')) { window.Underlay.change(t.dataset.f, val); return; }
    if (t.dataset.sws) { UI.swSeries = val; UI.showProps(); return; }
    if (t.dataset.swb) { if (val === '__more') { UI.loadSwatches(); return; } UI.swBrand = val; UI.swSeries = 'all'; UI.showProps(); return; }
    // 專案層級
    if (t.dataset.f === 'room-height') { const v = Math.max(1800, Math.min(6000, +val || 2800)); App.mutate('牆高', x => { x.room.height = v; x.room.walls.forEach(w => w.openings.forEach(o => { o.height = Math.min(o.height, v - o.sill - 10); })); }, 'room'); return; }
    if (UI._onCeilingChange(t, val)) return;   // 天花／燈具／冷氣／插座／迴路（js/ui-ceiling.js）
    if (t.dataset.f === 'room-floor') { const f = D.FLOORS.find(x => x.id === val); App.mutate('地板 ' + (f ? f.name : val), x => { x.room.floor = val; }, 'room'); App.toast('地板已改為「' + (f ? f.name : val) + '」'); return; }
    if (t.dataset.f === 'room-thick') { const v = Math.max(50, Math.min(400, +val || 120)); App.mutate('牆厚', x => { x.room.thickness = v; }, 'room'); return; }
    if (t.dataset.f === 'def-body') { App.mutate('預設櫃體色', x => { x.defaults.bodyColor = val; }); return; }
    if (t.dataset.f === 'def-door') { App.mutate('預設門板色', x => { x.defaults.doorColor = val; }); return; }
    if (t.dataset.f === 'def-style') { App.mutate('預設門板款式', x => { x.defaults.doorStyle = val; }); return; }
    if (t.dataset.f === 'def-handle') { App.mutate('預設把手', x => { x.defaults.handle = val; }); return; }
    if (t.dataset.f === 'client') { App.mutate('客戶名稱', x => { x.client = val; }); return; }
    // 牆面門窗
    if (s && s.type === 'wall' && t.dataset.of) {
      const r = st.room, wi = M().wallInfo(r, s.index);
      const j = +t.dataset.j;
      App.mutate('修改門窗', x => {
        const o = x.room.walls[s.index].openings[j];
        const left = leftOffset(wi, o);
        if (t.dataset.of === 'left') o.offset = fromLeft(wi, +val, o.width);
        else if (['style', 'color', 'frame'].includes(t.dataset.of)) o[t.dataset.of] = String(val);
        else { o[t.dataset.of] = +val; if (t.dataset.of === 'width') o.offset = fromLeft(wi, left, o.width); }
        clampOpening(x.room, wi, o);
      }, 'room');
      return;
    }
    const cab = App.selectedCab(); if (!cab) return;
    const f = t.dataset.f;
    if (cab.locked && ['x', 'z', 'y', 'atop', 'rot', 'cw', 'ch', 'cd', 'applCode', 'dw', 'dd', 'dl2', 'dtop', 'thick', 'mirror'].includes(f)) { App.toast('此物件已鎖定，請先解鎖再修改位置或尺寸'); UI.showProps(); return; }
    if (cab.kind === 'desk' && ['dw', 'dd', 'dl2', 'dtop', 'deskMat', 'thick', 'edge'].includes(f)) {
      const v = +val;
      App.updateCab(cab.id, '修改桌面', c => {
        const top = c.y + c.thick;
        if (f === 'dw') c.w = Math.max(c.shape === 'U' ? 2 * c.d + 200 : c.shape === 'L' ? c.d + 200 : 300, Math.round(v));
        if (f === 'dd') c.d = Math.max(200, Math.min(Math.round(v), c.shape === 'U' ? (c.w - 200) / 2 : c.shape === 'L' ? Math.min(c.w, c.l2) - 200 : 3000));
        if (f === 'dl2') c.l2 = Math.max(c.d + 200, Math.round(v));
        if (f === 'dtop') c.y = Math.max(0, Math.round(v) - c.thick);
        if (f === 'thick') { c.thick = v; c.h = v; c.y = top - v; }
        if (f === 'deskMat' || f === 'edge') c[f] = val;
      });
      return;
    }
    if (f === 'applCode') {
      const nx = D.byCode[val]; if (!nx) return;
      App.updateCab(cab.id, '更換設備型號', c => {
        const top = c.y + c.h;
        Object.assign(c, { code: nx.code, w: nx.w, d: nx.d, h: nx.h, mount: nx.mount, hanging: nx.hanging });
        if (nx.cstyle) c.cstyle = nx.cstyle;
        if (nx.mount === 'counter') c.y = top - nx.h;
      });
      return;
    }
    if (f === 'atop') { App.updateCab(cab.id, '修改設備高度', c => { c.y = Math.round(+val || 0) - c.h; }); return; }
    if ((f === 'cw' || f === 'ch' || f === 'cd') && cab.kind === 'appl') {
      const v = Math.max(100, Math.min(4000, Math.round(+val || 0)));
      App.updateCab(cab.id, '修改家具尺寸', c => { c[f === 'cw' ? 'w' : f === 'ch' ? 'h' : 'd'] = v; });
      return;
    }
    if (f === 'cw' || f === 'ch' || f === 'cd') {
      const v = Math.round(+val || 0);
      const fl = cab.kind === 'filler';   // 補板可以很窄
      const w = f === 'cw' ? Math.max(fl ? 20 : 200, Math.min(fl ? 600 : 3600, v)) : cab.w;
      const h = f === 'ch' ? Math.max(fl ? 100 : 200, Math.min(2800, v)) : cab.h;
      const d = f === 'cd' ? Math.max(fl ? 50 : 150, Math.min(900, v)) : cab.d;
      App.updateCab(cab.id, '修改櫃體尺寸', c => M().resizeCabinet(c, w, h, d));
      return;
    }
    if (f === 'override') {
      App.mutate('設備售價', x => { if (val === '') delete x.pricing.codeOverrides[cab.code]; else x.pricing.codeOverrides[cab.code] = Math.max(0, +val); });
      return;
    }
    if (f) {
      const numF = ['x', 'z', 'y'];
      if (f === 'panels') { App.updateCab(cab.id, '推拉門片數', c => { c.panels = Math.max(2, Math.min(4, +val || 2)); }); return; }
      if (f === 'aluSlim') { App.updateCab(cab.id, '鋁框寬度', c => { c.aluSlim = val === '1'; }); return; }
      if (f === 'kelvin' || f === 'lum') { App.updateCab(cab.id, '燈光設定', c => { c[f] = +val; }); return; }
      if (f === 'copen') { App.updateCab(cab.id, '窗簾開合', c => { c.copen = Math.max(0, Math.min(100, Math.round(+val || 0))); }); return; }
      if (f === 'cstyle') { const nx = D.byCode['CURTAIN-' + String(val).toUpperCase()]; App.updateCab(cab.id, '窗簾款式', c => { c.cstyle = String(val); if (nx) c.code = nx.code; }); return; }
      App.updateCab(cab.id, '修改櫃體', c => {
        if (numF.includes(f)) c[f] = Math.round(+val || 0);
        else if (f === 'rot') c.rot = parseInt(val, 10) || 0;
        else if (f === 'hingeQty' || f === 'footQty') c[f] = Math.max(0, Math.round(+val || 0));
        else if (f === 'kick') { c.kick = val; if (!c.hanging) c.y = val ? Math.max(c.y, D.KICK) : (c.y === D.KICK ? 0 : c.y); }
        else c[f] = val;
      });
      return;
    }
    if (t.dataset.rf) {
      const i = +t.dataset.i;
      const next = cab.fronts.map(r => ({ ...r }));
      next[i][t.dataset.rf] = t.dataset.rf === 'h' ? +val : val;
      if (next.reduce((a, r) => a + r.h, 0) * 10 > cab.h) { App.toast('門片總高超過櫃體高度，請先縮小其他列'); UI.showProps(); return; }
      setFronts(cab, next);
      return;
    }
    if (t.dataset.sf) {
      const i = +t.dataset.i;
      App.updateCab(cab.id, '修改層板', c => {
        if (t.dataset.sf === 'y') c.shelves[i].y = Math.max(D.BOARD, Math.min(c.h - 2 * D.BOARD, Math.round(+val)));
        else c.shelves[i].fixed = val === '1';
        c.shelves.sort((a, b) => a.y - b.y);
      });
    }
  }
  function setFronts(cab, next) {
    App.updateCab(cab.id, '修改門片', c => {
      c.fronts = next;
      c.shelves = M().genShelves(c);
    });
  }

  async function onPropsClick(e) {
    const sb = e.target.closest('[data-swt],[data-swc],[data-swg],[data-a="sw-all"]');
    if (sb && UI._onSwatchClick(sb)) return;
    if (e.target.closest('[data-a="sw-more"]')) { UI.loadSwatches(); return; }
    const b = e.target.closest('[data-a],[data-ra],[data-sa],[data-oa]'); if (!b) return;
    const st = App.state, s = App.sel;
    const a = b.dataset.a;
    if (a === 'floor-add') { App.addFloor(); return; }
    if (a === 'floor-go') { App.switchFloor(+b.dataset.i); return; }
    if (a === 'floor-del') {
      const i = +b.dataset.i, f = App.state.floors[i];
      if (await UI.confirm('刪除樓層', `刪除「${f.name}」與該層所有空間、櫃體？（可用 Ctrl+Z 復原）`)) App.deleteFloor(i);
      return;
    }
    if (a === 'pick-floor') { UI.pickFloor(); return; }
    if (await UI._onCeilingClick(a, b)) return;   // 天花／燈具／冷氣／插座／迴路（js/ui-ceiling.js）
    if (a === 'pick-paint') { UI.pickPaint(null); return; }
    if (a === 'paint-clear') { App.mutate('牆面恢復預設', x => { delete x.room.wallColor; delete x.room.wallPaint; }, 'room'); return; }
    if (a === 'pick-paint-wall') { UI.pickPaint(+b.dataset.i); return; }
    if (a === 'paint-wall-clear') { const wi0 = +b.dataset.i; App.mutate('牆面同整體', x => { delete x.room.walls[wi0].color; delete x.room.walls[wi0].paint; }, 'room'); return; }
    if (a === 'room-rect') { UI.roomDialog(); return; }
    if (a && a.startsWith('ul-')) { window.Underlay.click(a); return; }   // 門片列／層板／門窗的按鈕只有 data-ra／data-sa／data-oa，沒有 data-a
    if (a === 'room-line') { UI.action('line'); return; }
    if (a === 'room-del') { if (await UI.confirm('刪除空間', '刪除牆面與門窗（櫃體保留）？')) { App.sel = null; App.mutate('刪除空間', x => { x.room = null; }, 'room'); } return; }
    if (a === 'wall') { App.select({ type: 'wall', index: +b.dataset.i }); return; }
    if (a === 'apply-all') {
      if (!st.cabinets.length) return;
      App.mutate('套用材質', x => x.cabinets.forEach(c => { ['bodyColor', 'doorColor', 'topColor', 'kickColor', 'doorStyle'].forEach(k2 => { c[k2] = x.defaults[k2]; }); }), 'all');
      App.toast('已套用至 ' + st.cabinets.length + ' 件櫃體'); return;
    }
    if (a === 'back') { App.select(null); return; }
    if (s && s.type === 'wall') {
      const r = st.room, wi = M().wallInfo(r, s.index);
      if (a === 'add-curtain-wall') {   // 一組蛇形簾與牆同寬、到地（天花軌道）
        const c = M().createCabinet('CURTAIN-WAVE', App.state.defaults); if (!c) return;
        const T = r.thickness || 120, L = Math.max(600, Math.round(wi.len - T));   // 扣掉兩側牆厚，避免插進鄰牆
        Object.assign(c, { w: L, h: r.height - 20, y: 0, d: 120, rot: Math.round(Math.atan2(wi.nIn[0], wi.nIn[1]) * 180 / Math.PI) });
        const cx = wi.len / 2, off = c.d / 2 + 5;
        c.x = Math.round(wi.p[0] + wi.dir[0] * cx + wi.nIn[0] * off); c.z = Math.round(wi.p[1] + wi.dir[1] * cx + wi.nIn[1] * off);
        App.addCabinet(c); App.select({ type: 'cab', id: c.id });
        App.toast(`已加入與牆同寬（${L} mm）的蛇形簾，可在右側面板改款式、顏色與開合`);
        return;
      }
      if (a === 'add-curtains') {   // 每個窗／陽台門前各放一組窗簾（室內側貼牆）
        const H = r.height, made = [];
        r.walls[s.index].openings.forEach(o => {
          if (!(o.type === 'window' || /^(balcony3|aluglass|patio2|patio4|bifold)$/.test(o.style || ''))) return;
          const high = o.type === 'window' && o.sill >= 600;
          const c = M().createCabinet(high ? 'CURTAIN-ROLLER' : 'CURTAIN-WAVE', App.state.defaults); if (!c) return;
          // 寬度＝窗寬左右各加 10cm；高窗捲簾貼窗、落地窗蛇形簾到地
          if (high) { Object.assign(c, { cstyle: 'roller', w: o.width + 200, h: o.height + 100, y: Math.max(0, o.sill - 50), d: 80 }); }
          else { Object.assign(c, { cstyle: 'wave', w: o.width + 200, h: Math.min(H - 20, o.sill + o.height + 250), y: 0, d: 120 }); }
          c.rot = Math.round(Math.atan2(wi.nIn[0], wi.nIn[1]) * 180 / Math.PI);
          const cx = o.offset + o.width / 2, off = c.d / 2 + 5;
          c.x = Math.round(wi.p[0] + wi.dir[0] * cx + wi.nIn[0] * off); c.z = Math.round(wi.p[1] + wi.dir[1] * cx + wi.nIn[1] * off);
          made.push(c);
        });
        if (!made.length) { App.toast('這面牆沒有窗或陽台門'); return; }
        App.mutate('加窗簾', x => made.forEach(c => x.cabinets.push(c)), made.map(c => c.id));
        App.select({ type: 'cab', id: made[0].id });
        App.toast(`已加入 ${made.length} 組窗簾，可在右側面板改款式、顏色與開合`);
        return;
      }
      if (a === 'add-door' || a === 'add-window' || a === 'add-balcony' || a === 'add-entry' || a === 'add-aluslide') {
        const o = a === 'add-aluslide' ? { id: M().uid('o'), type: 'door', width: 1600, height: 2100, sill: 0, style: 'aluslide2', color: 'glass', frame: 'black' } : a === 'add-door' ? { id: M().uid('o'), type: 'door', width: 900, height: 2100, sill: 0, style: 'single' } : a === 'add-balcony' ? { id: M().uid('o'), type: 'door', width: 800, height: 2100, sill: 0, style: 'balcony3', frame: 'silver' } : a === 'add-entry' ? { id: M().uid('o'), type: 'door', width: 1000, height: 2100, sill: 0, style: 'entry', color: 'walnut', frame: 'black' } : { id: M().uid('o'), type: 'window', width: 1200, height: 1200, sill: 900 };
        o.offset = (wi.len - o.width) / 2;
        clampOpening(r, wi, o);
        App.mutate('新增' + (o.type === 'door' ? '門' : '窗'), x => x.room.walls[s.index].openings.push(o), 'room');
      } else if (b.dataset.oa === 'del') App.mutate('刪除門窗', x => x.room.walls[s.index].openings.splice(+b.dataset.j, 1), 'room');
      else if (a === 'lock') { App.mutate('鎖定牆面', x => { x.room.walls[s.index].locked = true; }, 'room'); App.toast(M().wallName(s.index) + ' 已鎖定'); }
      else if (a === 'unlock') App.mutate('解鎖牆面', x => { x.room.walls[s.index].locked = false; }, 'room');
      return;
    }
    const cab = App.selectedCab(); if (!cab) return;
    if (a === 'hw-auto') { App.updateCab(cab.id, '五金數量還原自動', c => { c[b.dataset.k] = null; }); return; }
    if (a === 'lock-toggle') {
      const cab = App.selectedCab(); if (!cab) return;
      App.updateCab(cab.id, cab.locked ? '解鎖' : '鎖定', c => { c.locked = !c.locked; });
      App.toast(M().cabName(cab) + (cab.locked ? ' 已鎖定' : ' 已解鎖'));
      return;
    }
    if (['snapwall', 'rot90', 'del', 'size-reset'].includes(a)) { const cab = App.selectedCab(); if (cab && cab.locked) { App.toast('此物件已鎖定，請先解鎖'); return; } }
    if (a === 'snapwall') {
      if (!App.state.room) { App.toast('尚未建立空間'); return; }
      const s2 = V().snap(cab, cab.x, cab.z, cab.id, { force: true });
      App.updateCab(cab.id, '靠牆', c => { Object.assign(c, { x: s2.x, z: s2.z, rot: s2.rot }); });
      App.toast(s2.info || '已靠牆'); return;
    }
    if (a === 'size-reset') {
      const it0 = D.byCode[cab.code];
      App.updateCab(cab.id, '還原型錄尺寸', c => { c.w = it0.w; c.h = it0.h; c.d = it0.d; c.fronts = c.base.fronts.map(r => ({ ...r })); c.shelves = M().genShelves(c); });
      return;
    }
    if (a === 'fav') { UI.toggleFav(b.dataset.code); App.toast(UI.isFav(b.dataset.code) ? '已加入我的最愛' : '已移出我的最愛'); UI.showProps(); UI._buildFilters(); UI._renderCatalog(); return; }
    if (a === 'add-slide') {   // 外掛推拉門：寬高同櫃體，貼在櫃體前方
      const sd = M().createCabinet('SLIDE-DOOR', App.state.defaults); if (!sd) return;
      const r = (cab.rot || 0) * Math.PI / 180, fx = Math.sin(r), fz = Math.cos(r), fd = M().footDepth(cab);
      sd.w = cab.w; sd.h = cab.y + cab.h; sd.y = 0; sd.rot = cab.rot || 0; sd.doorColor = cab.doorColor || sd.doorColor;
      sd.x = Math.round(cab.x + fx * (fd / 2 + sd.d / 2)); sd.z = Math.round(cab.z + fz * (fd / 2 + sd.d / 2));
      App.addCabinet(sd); App.select({ type: 'cab', id: sd.id });
      App.toast('已在櫃體前方加入外掛門組；可改推拉／平開、板材／木門／鋁框玻璃，罩整排請把寬度改成總寬');
      return;
    }
    if (a === 'add-part-l' || a === 'add-part-r') {   // 在櫃體／門片側邊放固定牆板，前緣對齊、高到天花
      const p = M().createCabinet('WALL-FIX', App.state.defaults); if (!p) return;
      const s = a === 'add-part-r' ? 1 : -1, r = (cab.rot || 0) * Math.PI / 180, rx = Math.cos(r), rz = -Math.sin(r), fx = Math.sin(r), fz = Math.cos(r);
      const fd = M().footDepth(cab);
      p.h = App.state.room ? App.state.room.height : Math.max(p.h, cab.y + cab.h);
      p.d = cab.at === 'doorleaf' ? cab.d : Math.min(fd, 100);
      const along = s * (cab.w / 2 + p.w / 2), fwd = (fd - p.d) / 2;
      p.x = Math.round(cab.x + rx * along + fx * fwd); p.z = Math.round(cab.z + rz * along + fz * fwd); p.rot = cab.rot || 0;
      App.addCabinet(p); App.select({ type: 'cab', id: p.id });
      App.toast('已在' + (s > 0 ? '右' : '左') + '側加入固定牆板，可改寬度（牆板長）、厚度與面材');
      return;
    }
    if (a === 'add-leaf-l' || a === 'add-leaf-r') {   // 在櫃體側邊放一片獨立門片，前緣對齊櫃體門片面
      const leaf = M().createCabinet('DOOR-LEAF', App.state.defaults); if (!leaf) return;
      const s = a === 'add-leaf-r' ? 1 : -1, r = (cab.rot || 0) * Math.PI / 180, rx = Math.cos(r), rz = -Math.sin(r), fx = Math.sin(r), fz = Math.cos(r);
      const fd = M().footDepth(cab), along = s * (cab.w / 2 + leaf.w / 2), fwd = (fd - leaf.d) / 2;
      leaf.x = Math.round(cab.x + rx * along + fx * fwd); leaf.z = Math.round(cab.z + rz * along + fz * fwd); leaf.rot = cab.rot || 0;
      leaf.hinge = s > 0 ? 'L' : 'R';   // 鉸鏈靠櫃體那一側
      App.addCabinet(leaf); App.select({ type: 'cab', id: leaf.id });
      App.toast('已在櫃體' + (s > 0 ? '右' : '左') + '側加入門片，可在右側面板改款式、顏色與尺寸');
      return;
    }
    if (a === 'rot90') App.rotateSelected(90);
    else if (a === 'dup') App.duplicateSelected();
    else if (a === 'del') App.deleteSelected();
    else if (a === 'toggle-open') V().toggleOpen(cab.id);
    else if (a === 'row-add-door' || a === 'row-add-drawer') {
      const next = cab.fronts.map(r => ({ ...r }));
      const drawer = a === 'row-add-drawer';
      const t = drawer ? 'D' : (cab.w >= 900 ? 'P' : 'L');
      let rest = Math.round(cab.h / 10 - next.reduce((x, r) => x + r.h, 0));
      if (rest < 16) {
        // 無剩餘高度：由最高的門片列讓出空間
        const donor = next.filter(r => r.t !== 'D').sort((p, q) => q.h - p.h)[0];
        const need = drawer ? 16 : Math.floor((donor ? donor.h : 0) / 2);
        if (!donor || donor.h - need < 16) { App.toast('沒有足夠高度，請先縮小或移除其他列'); return; }
        donor.h -= need; rest += need;
        const i = next.indexOf(donor);
        next.splice(drawer ? next.length : i, 0, { t: drawer ? 'D' : donor.t, h: need });
        setFronts(cab, next);
        return;
      }
      const hs = drawer ? [16, 24, 32].filter(h => h <= rest) : D.FRONT_HEIGHTS.filter(h => h <= rest);
      const h = drawer ? hs[hs.length - 1] : (hs.includes(rest) ? rest : hs[hs.length - 1]);
      setFronts(cab, [{ t, h }, ...next]);
    } else if (a === 'row-reset') setFronts(cab, cab.base.fronts.map(r => ({ ...r })));
    else if (b.dataset.ra === 'flip') {
      const i = +b.dataset.i;
      App.updateCab(cab.id, '門片換邊', c => { c.fronts[i].t = c.fronts[i].t === 'L' ? 'R' : 'L'; });
    } else if (b.dataset.ra) {
      const i = +b.dataset.i, next = cab.fronts.map(r => ({ ...r }));
      if (b.dataset.ra === 'del') next.splice(i, 1);
      if (b.dataset.ra === 'up' && i > 0) [next[i - 1], next[i]] = [next[i], next[i - 1]];
      if (b.dataset.ra === 'down' && i < next.length - 1) [next[i + 1], next[i]] = [next[i], next[i + 1]];
      setFronts(cab, next);
    } else if (a === 'shelf-add') {
      App.updateCab(cab.id, '加層板', c => {
        const lo = D.BOARD, hi = c.h - D.BOARD;
        const ys = [lo - D.BOARD, ...c.shelves.map(x => x.y), hi].sort((p, q) => p - q);
        let best = [0, 0];
        for (let i = 0; i < ys.length - 1; i++) { const gap = ys[i + 1] - (ys[i] + D.BOARD); if (gap > best[1]) best = [i, gap]; }
        if (best[1] < 80) { App.toast('空間不足以再加層板'); return; }
        c.shelves.push({ y: Math.round(ys[best[0]] + D.BOARD + best[1] / 2 - D.BOARD / 2), fixed: false });
        c.shelves.sort((p, q) => p.y - q.y);
      });
    } else if (a === 'shelf-even') {
      App.updateCab(cab.id, '平均分配層板', c => {
        const n = c.shelves.length; const lo = D.BOARD, hi = c.h - D.BOARD;
        c.shelves.sort((p, q) => p.y - q.y).forEach((x, i) => { x.y = Math.round(lo + (hi - lo) * (i + 1) / (n + 1) - D.BOARD / 2); });
      });
    } else if (a === 'shelf-reset') App.updateCab(cab.id, '預設層板', c => { c.shelves = M().genShelves(c); });
    else if (b.dataset.sa === 'del') App.updateCab(cab.id, '移除層板', c => c.shelves.splice(+b.dataset.i, 1));
  }
  /* 初始化（由 UI.init 呼叫） */
  UI._initProps = function () {
    $('#tab-props').addEventListener('change', onPropsChange);
    $('#tab-props').addEventListener('click', onPropsClick);
  };
})();
