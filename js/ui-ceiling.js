/* 介面（天花與電路面板）：天花板／燈具與空調／冷氣系統／電路與弱電／迴路區塊的 HTML、畫線放置流程、
   以及屬性面板裡屬於天花與電路的欄位變更與按鈕處理（由 js/ui-props.js 的 onPropsChange／onPropsClick 轉呼叫）。
   拆自 js/ui.js；需在 js/ui-core.js 之後載入。 */
(function () {
  const V = () => window.Viewer;
  const M = () => window.Model;
  const UI = window.UI;
  const esc = UI.esc, icon = UI.icon;
  const num = UI._num;

  function ceilingSection(r) {
    const C = window.Ceiling; if (!C) return '';
    const c = C.ensure(r), v = V();
    const sel = (key, list, cur) => `<select data-key="${key}" data-f="${key}">${list.map(([k, n]) => `<option value="${k}"${String(cur) === String(k) ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
    const C2 = C; const zones = c.zones.map((z, i) => `<div class="lrow ceil-row"><span><b>${C.KINDS[z.kind] || z.kind}</b>${z.kind === 'box' ? `　${M().wallName(z.wall != null ? z.wall : 0)}` : ''}</span>
      ${z.kind === 'box' ? '<span class="muted">開口到樓板</span>' : `<span class="inline">H ${num('zh' + i, z.h, 'step="10" min="2000" max="6000"')}</span>`}
      ${z.kind === 'box' ? '<span></span>' : `<label class="inline" title="沿此區邊緣做間接光燈槽"><input type="checkbox" data-key="zc${i}" data-f="zc${i}"${z.cove ? ' checked' : ''} style="width:auto"> 間接光</label>`}
      <button class="icon-btn del" data-a="ceil-zdel" data-i="${i}" title="刪除">${icon('x')}</button></div>`).join('');
    const strips = c.strips.filter(st => (st.kind || 'alu') === 'alu').map(st => [st, c.strips.indexOf(st)]).map(([st, i]) => `<div class="lrow ceil-row"><span><b>鋁槽燈</b></span><span class="muted">${Math.round(Math.hypot(st.x2 - st.x1, st.z2 - st.z1))} mm</span><span class="inline">${sel('sk' + i, [[2700, '2700K'], [3000, '3000K'], [4000, '4000K'], [6500, '6500K']], st.kelvin || 3000)}</span><button class="icon-btn del" data-a="ceil-sdel" data-i="${i}" title="刪除">${icon('x')}</button></div>`).join('');
    return `<div class="sec"><div class="sec-title">天花板 <small>${c.on ? '基本高 ' + c.h + ' mm' : '未啟用'}</small></div><div class="kv">
      <label>顯示</label><label class="inline"><input type="checkbox" data-key="ceil-on" data-f="ceil-on"${c.on ? ' checked' : ''} style="width:auto"> 做天花板（相機在天花下方才看得到）</label>
      <label>基本高</label><div class="inline">${num('ceil-h', c.h, 'step="10" min="2000" max="6000"')}<span class="unit">mm（平釘，牆高 ${r.height}）</span></div>
      <label>顏色</label><div class="inline"><span class="floor-chip" style="background:${c.color || '#f4f3ef'}"></span><span class="pick-name">${c.paint ? esc(c.paint.code + ' ' + c.paint.name) : '白色（預設）'}</span><button class="btn small" data-a="pick-paint-ceil">${icon('image')}選擇塗料</button></div>
      <label>線板</label>${sel('ceil-mold', C.MOLDINGS, c.molding || 'none')}
      <label>3D 顯示</label>${sel('ceil-mode', [['auto', '自動（相機在天花下方顯示）'], ['ghost', '從上方半透明（看天花配置）'], ['hide', '永遠隱藏']], v.ceilMode || 'auto')}
      <label></label><div class="inline"><button class="btn small" data-a="ceil-lookup">${icon('orbit')}仰視天花</button><span class="unit">鏡頭放到室內往上看</span></div>
    </div>
    <div class="btn-row"><button class="btn small${v.ceilEdit ? ' primary' : ''}" data-a="ceil-edit">${icon('move')}${v.ceilEdit ? '結束編輯' : '編輯（拖曳調整）'}</button>${v.ceilEdit && v.ceilSel ? `<button class="btn small danger" data-a="ceil-delsel">${icon('delete')}刪除選取</button>` : ''}</div>
    ${v.ceilEdit ? '<p class="muted" style="font-size:11.5px;margin:4px 0 0">拖曳掣點：橘＝燈具、綠＝天花頂點、淺綠＝邊中點（拖曳新增頂點）、藍＝線型端點、紅＝冷氣室內／室外機、棕＝冷媒管轉折、淺棕＝管線中點（拖曳新增轉折）、桃紅＝插座。點一下選取後按 Delete 刪除。上視圖最好操作。</p>' : ''}
    <div class="sec-title" style="margin-top:10px">燈具與空調 <small>畫在天花上</small></div>
    <div class="kv"><label>設備</label><select data-key="fx-type" data-f="fx-type">${[['燈具', ['dl_big', 'dl_small', 'ar111', 'pendant', 'wall_lt']], ['空調／設備', ['ac', 'drain', 'access']], ['天花弱電／設備', ['smoke', 'sprinkler', 'cam', 'spk', 'exhaust', 'heater', 'emerg']]].map(([gn, l]) => `<optgroup label="${gn}">${l.map(t => `<option value="${t}"${UI.fxType === t ? ' selected' : ''}>${C.FIX[t].name}</option>`).join('')}</optgroup>`).join('')}</select></div>
    <div class="btn-row"><button class="btn small" data-a="fx-place">${icon('plus')}逐顆放置</button><button class="btn small" data-a="fx-row">${icon('line')}排一排</button><button class="btn small" data-a="fx-grid">${icon('rect')}區域內矩陣</button><button class="btn small" data-a="fx-undo" title="刪除最後放的一個">退一個</button></div>
    <div class="btn-row"><button class="btn small" data-a="ceil-track">${icon('line')}軌道燈</button><button class="btn small" data-a="ceil-supply">${icon('line')}線型出風口</button><button class="btn small" data-a="ceil-ret">${icon('line')}回風口</button></div>
    ${(() => { const rows = [...C.counts(r, 'light'), ...C.counts(r, 'hvac')]; return rows.length ? `<div class="list" style="margin-top:6px">${rows.map(x => `<div class="lrow ceil-row"><span>${esc(x.name)}</span><span class="muted">${x.qty} ${x.unit}</span><span></span>${x.kind === 'fix' || (x.kind === 'line' && x.t !== 'alu') ? `<button class="icon-btn del" data-a="fx-clear" data-t="${x.t}" data-k="${x.kind}" title="全部刪除">${icon('x')}</button>` : '<span></span>'}</div>`).join('')}</div>` : ''; })()}
    <div class="sec-title" style="margin-top:10px">冷氣系統 <small>室內機＋室外機＋冷媒管</small></div>
    <div class="btn-row"><button class="btn small" data-a="ac-add">${icon('plus')}新增冷氣（點室內機→室外機）</button></div>
    ${(r.acs || []).length ? `<div class="list" style="margin-top:6px">${r.acs.map((ac, i) => { const sp = C.acSpec(ac.kw), L = C.acLength(r, ac); return `<div class="lrow ac-row"><input data-key="acn${i}" data-f="acn${i}" value="${esc(ac.name || '冷氣')}" style="width:70px"><select data-key="ack${i}" data-f="ack${i}">${C.AC_KW.map(k2 => `<option value="${k2}"${+ac.kw === k2 ? ' selected' : ''}>${k2}kW</option>`).join('')}</select><span class="inline" title="室外機離地高度（0＝落地）">外機H ${num('aco' + i, ac.oy || 0, 'step="50" min="0" max="6000"')}</span><span class="inline" title="冷媒管走管高度（離地 mm）">管高 ${num('acp' + i, C.pipeH(r, ac), 'step="10" min="300" max="6000"')}</span><button class="icon-btn del" data-a="ac-del" data-i="${i}" title="刪除">${icon('x')}</button>
      <span class="muted ac-spec">冷媒管 ${sp.liq}＋${sp.gas}　L≈${(L / 1000).toFixed(1)}m（${(L / 303).toFixed(1)} 尺）　電源 ${sp.v} ${sp.wire}　無熔絲 ${sp.brk}</span></div>`; }).join('')}</div><p class="muted" style="font-size:11.5px;margin:4px 0 0">按「編輯」可拖曳室內機、室外機與冷媒管轉折點，拖管線中點可新增轉折，「管高」可改走管高度（例如走樑下或貼樓板）。管徑、線徑依常見 R32 分離式估計，以原廠安裝手冊為準。</p>` : ''}
    <div class="sec-title" style="margin-top:10px">電路／弱電 <small>插座、開關、對講機、電箱…點牆邊放置</small></div>
    <div class="kv"><label>類型</label><select data-key="ol-type" data-f="ol-type">${C.OUTLET_GROUPS.map(([gn, l]) => `<optgroup label="${gn}">${l.map(k2 => `<option value="${k2}"${UI.olType === k2 ? ' selected' : ''}>${C.OUTLETS[k2].name}</option>`).join('')}</optgroup>`).join('')}</select>
      <label>高度</label><div class="inline">${num('ol-h', UI.olH != null ? UI.olH : C.OUTLETS[UI.olType].h, 'step="10" min="0" max="2400"')}<span class="unit">mm（H=${Math.round((UI.olH != null ? UI.olH : C.OUTLETS[UI.olType].h) / 10)}）</span></div></div>
    <div class="btn-row"><button class="btn small" data-a="ol-place">${icon('plus')}點牆邊放置</button><button class="btn small" data-a="ol-undo">退一個</button></div>
    ${(() => { const rows = C.counts(r, 'power'); return rows.length ? `<div class="list" style="margin-top:6px">${rows.map(x => `<div class="lrow ceil-row"><span>${esc(x.name)}</span><span class="muted">${x.qty} ${x.unit}</span><span></span><button class="icon-btn del" data-a="ol-clear" data-t="${x.t}" title="全部刪除">${icon('x')}</button></div>`).join('')}</div>` : ''; })()}
    <div class="sec-title" style="margin-top:10px">迴路 <small>出圖時依迴路顏色區分</small></div>
    <div class="btn-row"><button class="btn small" data-a="ckt-auto">${icon('snap')}自動分迴路</button><select data-key="ckt-newtype" data-f="ckt-newtype" style="width:auto">${Object.entries(C.CKT_TYPES).map(([k2, d]) => `<option value="${k2}"${UI.cktNewType === k2 ? ' selected' : ''}>${k2} ${d.name}</option>`).join('')}</select><button class="btn small" data-a="ckt-add">${icon('plus')}新增迴路</button></div>
    ${(r.circuits || []).length ? `<div class="btn-row"><select data-key="ckt-cur" data-f="ckt-cur" style="width:auto">${r.circuits.map(ck => `<option value="${ck.id}"${v.cktAssign === ck.id ? ' selected' : ''}>${esc(ck.code + ' ' + ck.name)}</option>`).join('')}</select><button class="btn small${v.cktAssign ? ' primary' : ''}" data-a="ckt-assign">${icon('select')}${v.cktAssign ? '結束指派' : '指派模式（點設備）'}</button></div>
    ${v.cktAssign ? '<p class="muted" style="font-size:11.5px;margin:4px 0 0">點畫面上的設備圓點即指派到選定迴路（灰色＝未指派，再點一次同迴路可取消）。上視圖最好操作。</p>' : ''}
    <div class="list" style="margin-top:6px">${r.circuits.map((ck, i) => { const n = C.circuitLoads(r, ck).length; return `<div class="lrow ckt-row"><input type="color" data-key="ckc${i}" data-f="ckc${i}" value="${ck.color}" title="迴路顏色"><input data-key="cko${i}" data-f="cko${i}" value="${esc(ck.code)}" title="迴路編號"><input data-key="ckn${i}" data-f="ckn${i}" value="${esc(ck.name)}" title="名稱"><button class="icon-btn del" data-a="ckt-del" data-i="${i}" title="刪除迴路">${icon('x')}</button>
      <span class="ckt-sub"><select data-key="ckv${i}" data-f="ckv${i}">${[110, 220].map(v2 => `<option value="${v2}"${+ck.v === v2 ? ' selected' : ''}>${v2}V</option>`).join('')}</select><select data-key="ckb${i}" data-f="ckb${i}">${['15A', '20A', '30A', '40A', '50A'].map(v2 => `<option${ck.brk === v2 ? ' selected' : ''}>${v2}</option>`).join('')}</select><select data-key="ckw${i}" data-f="ckw${i}">${['1.6mm', '2.0mm', '3.5mm²', '5.5mm²', '8.0mm²'].map(v2 => `<option${ck.wire === v2 ? ' selected' : ''}>${v2}</option>`).join('')}</select><span class="muted">${n} 個設備</span></span></div>`; }).join('')}</div>` : '<p class="muted" style="font-size:11.5px;margin:6px 0 0">按「自動分迴路」依設備自動分配：照明約 10 個一迴（同降板區優先同迴）、插座依牆每 6 個一迴、220V／專用插座與暖風機各一迴、冷氣依能力各一迴。也可自行新增迴路後用指派模式調整。</p>'}
    <div class="btn-row" style="margin-top:10px"><button class="btn small" data-a="ceil-zone">${icon('line')}畫降板區</button><button class="btn small" data-a="ceil-raise">${icon('line')}畫灑水頭下高區</button><button class="btn small" data-a="ceil-beam">${icon('line')}畫包樑</button><button class="btn small" data-a="ceil-box">${icon('window')}自動窗簾盒</button><button class="btn small" data-a="ceil-strip">${icon('open')}畫鋁槽燈</button></div>
    ${zones || strips ? `<div class="list" style="margin-top:8px">${zones}${strips}</div>` : '<p class="muted" style="font-size:11.5px;margin:6px 0 0">目前整間平釘。用上方按鈕在平面上畫降板區（可勾間接光）、包樑、窗簾盒或鋁槽燈；高度單位 mm，圖面標註以 cm 顯示。</p>'}
    <p class="muted" style="font-size:11.5px;margin:6px 0 0">報價：平釘與造型依坪數、包樑／窗簾盒／燈槽／線板／鋁槽燈依尺數計價，單價可在「板材售價」修改。</p></div>`;
  }
  UI.startCeilDraw = function (kind) {
    if (!App.state.room) { App.toast('請先建立空間'); return; }
    V().lineTarget = kind; UI.action('line');
    const nm = k2 => (window.Ceiling.FIX[k2] || {}).name || '';
    App.toast(kind === 'acsys' ? '先點室內機位置（天花內），再點室外機位置（陽台／外牆）' : /^ol:/.test(kind) ? `在牆邊點擊放置「${window.Ceiling.OUTLETS[kind.slice(3)].name}」，可連續點；按「取消」或 Esc 結束` : /^fx:/.test(kind) ? `點天花位置放置「${nm(kind.slice(3))}」，可連續點；按「取消」或 Esc 結束` : /^row:/.test(kind) ? `點「${nm(kind.slice(4))}」一排的起點與終點` : /^grid:/.test(kind) ? `點矩形區域的兩個對角，排「${nm(kind.slice(5))}」矩陣` : ({ zone: '在平面上點降板區各轉角，點回起點完成', raise: '點灑水頭下高區各轉角，點回起點完成', beam: '點樑的起點與終點', strip: '點鋁槽燈的起點與終點', track: '點軌道的起點與終點', supply: '點線型出風口的起點與終點', ret: '點回風口的起點與終點' }[kind]));
  };
  UI.finishCeilDraw = async function (kind, pts) {
    const r = App.state.room, C = window.Ceiling; if (!r || !C) return;
    const c = C.ensure(r);
    if (kind === 'zone' || kind === 'raise') {
      const res = await UI.modal({ title: kind === 'zone' ? '降板區' : '灑水頭下高區', body: `<div class="kv"><label>高度</label><div class="inline"><input name="h" type="number" value="${kind === 'zone' ? Math.max(2000, c.h - 100) : Math.min(r.height - 20, c.h + 150)}" step="10"><span class="unit">mm（基本高 ${c.h}）</span></div>
        ${kind === 'zone' ? `<label>間接光</label><label class="inline"><input type="checkbox" name="cove" checked style="width:auto"> 沿區域邊緣做燈槽（封板內縮 10cm）</label><label>色溫</label><select name="k"><option value="2700">2700K 暖黃</option><option value="3000">3000K 暖白</option><option value="4000">4000K 自然白</option></select>` : ''}</div>`,
        buttons: [{ label: '取消', value: null }, { label: '建立', primary: true, value: 'ok' }] });
      if (!res) return;
      App.mutate(kind === 'zone' ? '新增降板區' : '新增高區', x => { const z = C.addZone(x.room, kind === 'zone' ? 'drop' : 'raise', pts, +res.data.h, kind === 'zone' && res.data.cove); if (res.data.k) z.kelvin = +res.data.k; }, 'room');
    } else if (kind === 'beam') {
      const res = await UI.modal({ title: '包樑', body: `<div class="kv"><label>樑寬</label><div class="inline"><input name="w" type="number" value="400" step="10"><span class="unit">mm</span></div><label>樑底高</label><div class="inline"><input name="h" type="number" value="${Math.max(2000, c.h - 150)}" step="10"><span class="unit">mm（基本高 ${c.h}）</span></div></div>`, buttons: [{ label: '取消', value: null }, { label: '建立', primary: true, value: 'ok' }] });
      if (!res) return;
      App.mutate('新增包樑', x => { C.addBeam(x.room, pts[0], pts[1], +res.data.w, +res.data.h); }, 'room');
    } else if (kind === 'strip') {
      App.mutate('新增鋁槽燈', x => { C.addStrip(x.room, pts[0], pts[1], 30, 3000); }, 'room');
    } else if (kind === 'acsys') {
      const zn = (c.zones.find(z => z.pts && z.pts.length >= 3 && M().pointInPoly(pts[0][0], pts[0][1], z.pts)) || {}).pts || r.points, sug = C.suggestKw(zn);
      const res = await UI.modal({ title: '新增冷氣', body: `<div class="kv"><label>名稱</label><input name="n" value="冷氣${(r.acs || []).length + 1}"><label>能力</label><select name="kw">${C.AC_KW.map(k2 => `<option value="${k2}"${k2 === sug ? ' selected' : ''}>${k2} kW${k2 === sug ? '（建議）' : ''}</option>`).join('')}</select><label>室外機</label><div class="inline"><input name="oy" type="number" value="0" step="50" style="width:90px"><span class="unit">mm 離地（0＝落地，壁掛約 1800）</span></div></div><p class="muted" style="font-size:11.5px">建議能力依所在區域面積約每坪 0.6kW 估算。冷媒管會先拉成 L 形，之後可在「編輯」模式拖曳調整路徑。</p>`, buttons: [{ label: '取消', value: null }, { label: '建立', primary: true, value: 'ok' }] });
      if (!res) return;
      App.mutate('新增冷氣', x => { C.addAC(x.room, pts[0], pts[1], +res.data.kw, String(res.data.n || '冷氣'), +res.data.oy || 0); }, 'room');
    } else if (kind === 'track' || kind === 'supply' || kind === 'ret') {
      App.mutate('新增' + C.LINES[kind].name, x => { C.addStrip(x.room, pts[0], pts[1], 30, 3000, kind); }, 'room');
    } else if (/^row:/.test(kind)) {
      const t = kind.slice(4), L = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
      const res = await UI.modal({ title: '排一排：' + C.FIX[t].name, body: `<div class="kv"><label>數量</label><div class="inline"><input name="n" type="number" value="${Math.max(2, Math.round(L / 900) + 1)}" min="1" max="60"><span class="unit">顆（含兩端，長 ${Math.round(L)} mm）</span></div></div>`, buttons: [{ label: '取消', value: null }, { label: '放置', primary: true, value: 'ok' }] });
      if (!res) return;
      App.mutate('排一排 ' + C.FIX[t].name, x => { C.addRow(x.room, t, pts[0], pts[1], +res.data.n); }, 'room');
    } else if (/^grid:/.test(kind)) {
      const t = kind.slice(5), a = pts[0], b = pts[1], rect = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
      const res = await UI.modal({ title: '區域內矩陣：' + C.FIX[t].name, body: `<div class="kv"><label>間距</label><div class="inline"><input name="g" type="number" value="1200" step="50"><span class="unit">mm</span></div><label>離邊</label><div class="inline"><input name="m" type="number" value="600" step="50"><span class="unit">mm</span></div></div>`, buttons: [{ label: '取消', value: null }, { label: '放置', primary: true, value: 'ok' }] });
      if (!res) return;
      let n = 0; App.mutate('矩陣 ' + C.FIX[t].name, x => { n = C.addGrid(x.room, t, rect, Math.max(300, +res.data.g), Math.max(0, +res.data.m)).length; }, 'room'); App.toast(`已放置 ${n} 個${C.FIX[t].name}`);
    }
  };
  UI.fxType = 'dl_small'; UI.cktNewType = 'L'; UI.olType = 'socket'; UI.olH = null;
  UI.placeOutlet = function (type, p) {
    const C = window.Ceiling; if (!App.state.room || !C) return;
    const h = UI.olH != null ? UI.olH : C.OUTLETS[type].h;
    App.mutate('放置 ' + C.OUTLETS[type].name, x => { C.addOutlet(x.room, type, p[0], p[1], h); }, 'room');
    App.status(`已放置 ${C.OUTLETS[type].name}（H=${Math.round(h / 10)}）；繼續點牆邊放置，按「取消」或 Esc 結束`);
  };
  UI.placeFixture = function (type, p) {
    const C = window.Ceiling; if (!App.state.room || !C) return;
    App.mutate('放置 ' + C.FIX[type].name, x => { C.addFixture(x.room, type, p); }, 'room');
    const n = App.state.room.ceiling.fixtures.filter(f => f.type === type).length;
    App.status(`已放置 ${C.FIX[type].name} ${n} 個；繼續點擊放置，按「取消」或 Esc 結束`);
  };
  UI._ceilingSection = ceilingSection;

  // 屬性面板欄位變更（天花／燈具／冷氣／插座／迴路）；回傳 true 表示已處理
  UI._onCeilingChange = function (t, val) {
    if (t.dataset.f === 'fx-type') { UI.fxType = String(val); return true; }
    if (t.dataset.f === 'ckt-newtype') { UI.cktNewType = String(val); return true; }
    if (t.dataset.f === 'ckt-cur') { if (V().cktAssign) { V().cktAssign = String(val); V().updateCeilGrips(); } return true; }
    { const mk = /^ck([convbw])(\d+)$/.exec(t.dataset.f || ''); if (mk) { const i0 = +mk[2], raw = t.value; App.mutate('迴路設定', x => { const ck = x.room.circuits[i0]; if (!ck) return; ({ c: () => { ck.color = raw; }, o: () => { ck.code = String(raw).trim() || ck.code; }, n: () => { ck.name = String(raw).trim() || ck.name; }, v: () => { ck.v = +raw; }, b: () => { ck.brk = raw; }, w: () => { ck.wire = raw; } })[mk[1]](); }, 'room'); if (V().cktAssign) V().updateCeilGrips(); return true; } }
    if (t.dataset.f === 'ol-type') { UI.olType = String(val); UI.olH = null; UI.refresh(); return true; }
    if (t.dataset.f === 'ol-h') { UI.olH = Math.max(0, Math.min(2400, Math.round(+val || 0))); UI.refresh(); return true; }
    { const m1 = /^ac([nkop])(\d+)$/.exec(t.dataset.f || ''); if (m1) { const i0 = +m1[2]; App.mutate('冷氣設定', x => { const ac = x.room.acs[i0]; if (!ac) return; if (m1[1] === 'n') ac.name = String(t.value).trim() || '冷氣'; else if (m1[1] === 'k') ac.kw = +val; else if (m1[1] === 'p') ac.ph = Math.max(300, Math.min(6000, Math.round(+val || 0))); else ac.oy = Math.max(0, Math.round(+val || 0)); }, 'room'); return true; } }
    if (t.dataset.f === 'ceil-on') { App.mutate('天花板顯示', x => { window.Ceiling.ensure(x.room).on = !!val; }, 'room'); return true; }
    if (t.dataset.f === 'ceil-h') { const v = Math.max(2000, Math.min(6000, Math.round(+val || 2600))); App.mutate('天花基本高', x => { window.Ceiling.ensure(x.room).h = v; }, 'room'); return true; }
    if (t.dataset.f === 'ceil-mold') { App.mutate('線板', x => { window.Ceiling.ensure(x.room).molding = String(val); }, 'room'); return true; }
    if (t.dataset.f === 'ceil-mode') { V().ceilMode = String(val); UI.refresh(); return true; }
    { const mz = /^zh(\d+)$/.exec(t.dataset.f || ''); if (mz) { const v = Math.max(2000, Math.min(6000, Math.round(+val || 2500))); App.mutate('天花區域高度', x => { x.room.ceiling.zones[+mz[1]].h = v; }, 'room'); return true; } }
    { const mc = /^zc(\d+)$/.exec(t.dataset.f || ''); if (mc) { App.mutate('間接光', x => { x.room.ceiling.zones[+mc[1]].cove = !!val; }, 'room'); return true; } }
    { const ms = /^sk(\d+)$/.exec(t.dataset.f || ''); if (ms) { App.mutate('鋁槽燈色溫', x => { x.room.ceiling.strips[+ms[1]].kelvin = +val; }, 'room'); return true; } }
    return false;
  };
  // 屬性面板按鈕（天花／燈具／冷氣／插座／迴路）；回傳 true 表示已處理
  UI._onCeilingClick = async function (a, b) {
    if (a === 'pick-paint-ceil') { UI.pickPaint('ceil'); return true; }
    if (a === 'ceil-zone') { UI.startCeilDraw('zone'); return true; }
    if (a === 'ceil-raise') { UI.startCeilDraw('raise'); return true; }
    if (a === 'ceil-beam') { UI.startCeilDraw('beam'); return true; }
    if (a === 'ceil-strip') { UI.startCeilDraw('strip'); return true; }
    if (a === 'ceil-track' || a === 'ceil-supply' || a === 'ceil-ret') { UI.startCeilDraw(a.slice(5)); return true; }
    if (a === 'fx-place') { UI.startCeilDraw('fx:' + UI.fxType); return true; }
    if (a === 'ceil-lookup') { V().lookUpCeiling(); return true; }
    if (a === 'ceil-edit') { V().cktAssign = null; V().setCeilEdit(!V().ceilEdit); UI.refresh(); return true; }
    if (a === 'ckt-auto') { const has = (App.state.room.circuits || []).length; if (has && !(await UI.confirm('自動分迴路', '會清除目前的迴路設定重新分配，確定？（可 Ctrl+Z 復原）'))) return true; let n = 0; App.mutate('自動分迴路', x => { n = window.Ceiling.autoCircuits(x.room); }, 'room'); App.toast(n ? `已分成 ${n} 個迴路` : '目前沒有需要配電的設備'); return true; }
    if (a === 'ckt-add') { let ck = null; App.mutate('新增迴路', x => { ck = window.Ceiling.addCircuit(x.room, UI.cktNewType || 'C'); }, 'room'); if (ck) { V().cktAssign = ck.id; V().ceilEdit = true; V().ceilSel = null; V().updateCeilGrips(); UI.refresh(); App.toast(`已新增 ${ck.code}，點畫面上的設備指派`); } return true; }
    if (a === 'ckt-assign') { const v2 = V(); if (v2.cktAssign) { v2.cktAssign = null; v2.setCeilEdit(false); } else { const sel = document.querySelector('[data-f="ckt-cur"]'); v2.cktAssign = sel ? sel.value : null; v2.ceilEdit = true; v2.ceilSel = null; v2.updateCeilGrips(); App.status('迴路指派：點設備圓點指派到選定迴路'); } UI.refresh(); return true; }
    if (a === 'ckt-del') { const i0 = +b.dataset.i; const ck = App.state.room.circuits[i0]; if (V().cktAssign === ck.id) V().cktAssign = null; App.mutate('刪除迴路', x => { window.Ceiling.removeCircuit(x.room, ck.id); }, 'room'); return true; }
    if (a === 'ceil-delsel') { V().deleteCeilSel(); return true; }
    if (a === 'ac-add') { UI.startCeilDraw('acsys'); return true; }
    if (a === 'ac-del') { const i0 = +b.dataset.i; App.mutate('刪除冷氣', x => { x.room.acs.splice(i0, 1); }, 'room'); return true; }
    if (a === 'ol-place') { UI.startCeilDraw('ol:' + UI.olType); return true; }
    if (a === 'ol-undo') { if (!(App.state.room.outlets || []).length) { App.toast('沒有可刪除的插座'); return true; } App.mutate('刪除最後一個插座', x => { x.room.outlets.pop(); }, 'room'); return true; }
    if (a === 'ol-clear') { const t0 = b.dataset.t; if (!(await UI.confirm('全部刪除', '刪除這個空間所有此類插座？（可 Ctrl+Z 復原）'))) return true; App.mutate('刪除插座', x => { x.room.outlets = x.room.outlets.filter(o => o.type !== t0); }, 'room'); return true; }
    if (a === 'fx-row') { UI.startCeilDraw('row:' + UI.fxType); return true; }
    if (a === 'fx-grid') { UI.startCeilDraw('grid:' + UI.fxType); return true; }
    if (a === 'fx-undo') { if (!App.state.room.ceiling || !App.state.room.ceiling.fixtures.length) { App.toast('沒有可刪除的設備'); return true; } App.mutate('刪除最後一個設備', x => { x.room.ceiling.fixtures.pop(); }, 'room'); return true; }
    if (a === 'fx-clear') { const t0 = b.dataset.t, k0 = b.dataset.k; if (!(await UI.confirm('全部刪除', '刪除這個空間所有此類設備？（可 Ctrl+Z 復原）'))) return true; App.mutate('刪除設備', x => { const c = x.room.ceiling; if (k0 === 'fix') c.fixtures = c.fixtures.filter(f => f.type !== t0); else c.strips = c.strips.filter(st => (st.kind || 'alu') !== (t0 === 'spot' ? 'track' : t0)); }, 'room'); return true; }
    if (a === 'ceil-box') { let n = 0; App.mutate('自動窗簾盒', x => { n = window.Ceiling.addCurtainBoxes(x.room); }, 'room'); App.toast(n ? `已在 ${n} 面有窗的牆加窗簾盒（深 180）` : '沒有新增：每面有窗的牆已有窗簾盒，或此空間沒有窗'); return true; }
    if (a === 'ceil-zdel') { const i0 = +b.dataset.i; App.mutate('刪除天花區域', x => { x.room.ceiling.zones.splice(i0, 1); }, 'room'); return true; }
    if (a === 'ceil-sdel') { const i0 = +b.dataset.i; App.mutate('刪除鋁槽燈', x => { x.room.ceiling.strips.splice(i0, 1); }, 'room'); return true; }
    return false;
  };
})();
