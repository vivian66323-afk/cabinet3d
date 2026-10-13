/* 雲端專案：Dropbox（OAuth2 PKCE，純前端、不需伺服器）
   專案以 .json 存在 Dropbox「應用程式／系統櫃3D」資料夾，檔名「專案名稱__專案id.json」。
   連線後每次修改會自動儲存（延遲 4 秒），並可在「雲端專案」視窗開啟歷屆專案。 */
(function () {
  const C = {};
  const KEY = 'cab3d.dropbox', AUTO_KEY = 'cab3d.dropbox.auto', VERIFIER = 'cab3d.pkce';
  const cfg = () => window.CLOUD_CONFIG || {};
  const $ = s => document.querySelector(s);
  let tok = null, busy = false, timer = null, lastSaved = null, lastFile = null;
  try { tok = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { tok = null; }
  C.auto = localStorage.getItem(AUTO_KEY) !== 'off';
  C.connected = () => !!(tok && tok.refresh_token);
  C.ready = () => !!cfg().dropboxAppKey;

  /* ---------- OAuth PKCE ---------- */
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');
  C.connect = async function () {
    if (!C.ready()) { App.ui.alert('尚未設定 Dropbox', '請先在 js/cloud-config.js 填入 Dropbox App key。'); return; }
    const raw = crypto.getRandomValues(new Uint8Array(48)), verifier = b64url(raw.buffer);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    sessionStorage.setItem(VERIFIER, verifier);
    const u = new URL('https://www.dropbox.com/oauth2/authorize');
    Object.entries({ client_id: cfg().dropboxAppKey, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', redirect_uri: redirectUri(), token_access_type: 'offline' })
      .forEach(([k, v]) => u.searchParams.set(k, v));
    location.href = u.toString();
  };
  async function tokenRequest(params) {
    const r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cfg().dropboxAppKey, ...params }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.error || ('HTTP ' + r.status));
    return j;
  }
  function saveTok(j) {
    tok = { ...(tok || {}), ...j, expires: Date.now() + (j.expires_in || 14400) * 1000 - 60000 };
    localStorage.setItem(KEY, JSON.stringify(tok));
  }
  // 從 Dropbox 授權頁回來：?code=… → 換取 token
  C.handleRedirect = async function () {
    const q = new URLSearchParams(location.search), code = q.get('code');
    if (!code) return false;
    history.replaceState(null, '', location.pathname + location.hash);
    const verifier = sessionStorage.getItem(VERIFIER); sessionStorage.removeItem(VERIFIER);
    if (!verifier) return false;
    try {
      saveTok(await tokenRequest({ code, grant_type: 'authorization_code', code_verifier: verifier, redirect_uri: redirectUri() }));
      try { const acc = await api('users/get_current_account', null); tok.name = acc && acc.name ? acc.name.display_name : ''; tok.email = (acc && acc.email) || ''; localStorage.setItem(KEY, JSON.stringify(tok)); } catch (e) { /* 沒有帳號權限也能用 */ }
      App.toast('已連線 Dropbox' + (tok.name ? '：' + tok.name : '') + '，之後修改會自動儲存到雲端');
      if (App.hasContent()) C.touch();
    } catch (e) { App.ui.alert('Dropbox 連線失敗', String(e.message || e)); }
    C.badge();
    return true;
  };
  async function access() {
    if (!tok) throw new Error('尚未連線 Dropbox');
    if (!tok.access_token || Date.now() > (tok.expires || 0)) saveTok(await tokenRequest({ grant_type: 'refresh_token', refresh_token: tok.refresh_token }));
    return tok.access_token;
  }
  C.disconnect = async function () {
    try { if (tok && tok.access_token) await fetch('https://api.dropboxapi.com/2/auth/token/revoke', { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token } }); } catch (e) { /* 忽略 */ }
    tok = null; lastSaved = null; lastFile = null; localStorage.removeItem(KEY); C.badge();
  };

  /* ---------- Dropbox API ---------- */
  const argHeader = o => JSON.stringify(o).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const dbxErr = (t, st) => { try { const j = JSON.parse(t); return j.error_summary || j.error || t; } catch (e) { return t || ('HTTP ' + st); } };
  async function api(path, body) {
    const r = await fetch('https://api.dropboxapi.com/2/' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + await access(), ...(body === null ? {} : { 'Content-Type': 'application/json' }) }, body: body === null ? undefined : JSON.stringify(body) });
    const t = await r.text();
    if (!r.ok) { if (r.status === 401) tok.access_token = ''; throw new Error(dbxErr(t, r.status)); }
    return t ? JSON.parse(t) : null;
  }
  async function upload(path, text) {
    const r = await fetch('https://content.dropboxapi.com/2/files/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + await access(), 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': argHeader({ path, mode: 'overwrite', mute: true }) }, body: new Blob([text], { type: 'application/octet-stream' }) });
    if (!r.ok) throw new Error(dbxErr(await r.text(), r.status));
    return r.json();
  }
  async function download(path) {
    const r = await fetch('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { Authorization: 'Bearer ' + await access(), 'Dropbox-API-Arg': argHeader({ path }) } });
    if (!r.ok) throw new Error(dbxErr(await r.text(), r.status));
    return r.text();
  }
  const safeName = n => (n || '未命名專案').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80);
  const fileOf = st => '/' + safeName(st.name) + '__' + st.id + '.json';
  C.list = async function () {
    const out = []; let r = await api('files/list_folder', { path: '', limit: 500 });
    for (;;) {
      r.entries.forEach(e => { const m = e['.tag'] === 'file' && /^(.*)__([a-z0-9]+)\.json$/i.exec(e.name); if (m) out.push({ path: e.path_lower, name: m[1], id: m[2], modified: e.server_modified, size: e.size }); });
      if (!r.has_more) break;
      r = await api('files/list_folder/continue', { cursor: r.cursor });
    }
    return out.sort((a, b) => (a.modified < b.modified ? 1 : -1));
  };

  /* ---------- 儲存／開啟 ---------- */
  C.save = async function (manual) {
    if (!C.connected() || busy) return false;
    busy = true; C.badge('儲存中…');
    try {
      const st = App.state, path = fileOf(st);
      await upload(path, App.projectJSON(false));
      if (lastFile && lastFile !== path && lastFile.includes('__' + st.id + '.json')) { try { await api('files/delete_v2', { path: lastFile }); } catch (e) { /* 舊檔名刪不掉就留著 */ } }
      lastFile = path; lastSaved = new Date(); App.dirty = false; App.ui.refresh();
      if (manual) App.toast('已儲存到 Dropbox：' + st.name);
      return true;
    } catch (e) {
      C.badge('儲存失敗'); if (manual) App.ui.alert('Dropbox 儲存失敗', String(e.message || e)); else App.toast('雲端儲存失敗：' + (e.message || e));
      return false;
    } finally { busy = false; C.badge(); }
  };
  // 每次修改後呼叫：連線且開啟自動儲存時，4 秒後上傳
  C.touch = function () {
    if (!C.connected() || !C.auto) return;
    clearTimeout(timer); timer = setTimeout(() => { if (App.hasContent()) C.save(false); }, 4000);
  };
  C.open = async function (entry) {
    const text = await download(entry.path);
    const data = JSON.parse(text);
    if (!data || data.app !== 'cab3d') throw new Error('不是本平台的專案檔');
    App.loadProject(data); lastFile = entry.path; lastSaved = new Date(entry.modified); C.badge();
    App.toast('已開啟雲端專案「' + App.state.name + '」');
  };
  C.remove = entry => api('files/delete_v2', { path: entry.path });
  C.newProjectReset = () => { lastFile = null; lastSaved = null; C.badge(); };

  /* ---------- 狀態標示 ---------- */
  const hhmm = d => d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  C.badge = function (txt) {
    const el = $('#cloudBadge'); if (!el) return;
    if (!C.connected()) { el.textContent = '☁ 未連線'; el.title = '尚未連線 Dropbox，按「雲端專案」連線後會自動儲存'; el.className = 'cloud-badge off'; return; }
    el.className = 'cloud-badge on';
    el.textContent = '☁ ' + (txt || (lastSaved ? '已儲存 ' + hhmm(lastSaved) : (C.auto ? '自動儲存' : '手動儲存')));
    el.title = 'Dropbox' + (tok.name ? '：' + tok.name : '') + (C.auto ? '　每次修改後自動儲存' : '　自動儲存已關閉');
  };

  /* ---------- 視窗 ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = s => { const d = new Date(s); return isNaN(d) ? '' : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${hhmm(d)}`; };
  C.dialog = async function () {
    const UI = window.UI;
    if (!C.ready()) {
      await UI.modal({ title: '雲端專案（Dropbox）', body: `<p>尚未設定 Dropbox App key。</p><ol style="padding-left:18px;font-size:13px;line-height:1.7"><li>到 <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noopener">dropbox.com/developers/apps</a> 建立 App：Scoped access、App folder。</li><li>Permissions 勾 files.metadata.read、files.content.read、files.content.write。</li><li>Settings 的 Redirect URIs 加入 <code>${esc(redirectUri())}</code>。</li><li>把 App key 填入 <code>js/cloud-config.js</code>。</li></ol>`, buttons: [{ label: '關閉', primary: true, value: 'ok' }] });
      return;
    }
    if (!C.connected()) {
      const r = await UI.modal({ title: '雲端專案（Dropbox）', body: `<p>連線你的 Dropbox 後，專案會自動儲存到「應用程式／系統櫃3D」資料夾，並可在任何電腦開啟歷屆專案。</p><p class="muted" style="font-size:12px">按「連線」會跳到 Dropbox 授權頁，授權後自動回到本站。</p>`, buttons: [{ label: '取消', value: null }, { label: '連線 Dropbox', primary: true, value: 'ok' }] });
      if (r) C.connect();
      return;
    }
    let list = null, err = '';
    try { list = await C.list(); } catch (e) { err = String(e.message || e); }
    const cur = App.state.id;
    const rows = !list ? `<p class="note danger">讀取失敗：${esc(err)}</p>` : !list.length ? `<p class="muted">雲端還沒有專案，按「儲存目前專案」即可上傳。</p>` :
      `<div class="list cloud-list">${list.map((e, i) => `<div class="lrow cloud-row${e.id === cur ? ' on' : ''}"><div><b>${esc(e.name)}</b>${e.id === cur ? '<span class="muted">（目前開啟）</span>' : ''}<br><span class="muted">${fmtDate(e.modified)}　${(e.size / 1024).toFixed(0)} KB</span></div><button class="btn small" data-open="${i}">開啟</button><button class="icon-btn del" data-del="${i}" title="刪除"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`).join('')}</div>`;
    const res = await UI.modal({
      title: '雲端專案（Dropbox）', wide: true,
      body: `<p class="muted" style="font-size:12px;margin:0 0 8px">已連線：${esc(tok.name || '')} ${esc(tok.email || '')}　<label style="display:inline-flex;align-items:center;gap:4px"><input type="checkbox" name="auto"${C.auto ? ' checked' : ''} style="width:auto">每次修改後自動儲存</label></p>${rows}`,
      buttons: [{ label: '中斷連線', value: 'logout', cls: 'danger' }, { label: '關閉', value: null }, { label: '儲存目前專案', primary: true, value: 'save' }],
      onOpen: back => {
        back.querySelector('[name=auto]').addEventListener('change', e => { C.auto = e.target.checked; localStorage.setItem(AUTO_KEY, C.auto ? 'on' : 'off'); C.badge(); });
        back.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', async () => {
          const e = list[+b.dataset.open];
          if (e.id !== cur && App.dirty && !(await UI.leaveDialog('開啟雲端專案', '開啟雲端專案'))) return;
          b.disabled = true; b.textContent = '讀取中…';
          try { await C.open(e); back.querySelector('.mfoot button[data-i="1"]').click(); } catch (x) { b.disabled = false; b.textContent = '開啟'; UI.alert('開啟失敗', String(x.message || x)); }
        }));
        back.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
          const e = list[+b.dataset.del];
          if (!(await UI.confirm('刪除雲端專案', `從 Dropbox 刪除「${e.name}」？（Dropbox 網站 30 天內可還原）`))) return;
          try { await C.remove(e); b.closest('.lrow').remove(); if (e.path === lastFile) { lastFile = null; lastSaved = null; C.badge(); } } catch (x) { UI.alert('刪除失敗', String(x.message || x)); }
        }));
      }
    });
    if (!res) return;
    if (res.button === 'save') { if (!App.hasContent()) { App.toast('目前專案是空的，沒有內容可儲存'); return; } await C.save(true); }
    else if (res.button === 'logout') { if (await UI.confirm('中斷 Dropbox 連線', '中斷後不再自動儲存；雲端上的專案檔會保留。')) { await C.disconnect(); App.toast('已中斷 Dropbox 連線'); } }
  };

  C.init = function () {
    const b = $('#btnCloud'); if (b) b.addEventListener('click', () => C.dialog());
    C.badge();
    C.handleRedirect();
  };
  window.Cloud = C;
})();
