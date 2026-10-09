/* 簡易登入頁：輸入帳號密碼才進得了系統。
   帳號與密碼雜湊放在 js/auth-config.js（用 tools/set-password.js 產生），網頁不存明碼。
   注意：這是純前端的門檻，靜態檔案本身仍可被直接下載，只能擋一般使用者。 */
(function () {
  const KEY = 'cab3d_auth';
  const cfg = window.AUTH_CONFIG || { users: [] };

  async function hashOf(user, pass) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(cfg.salt + ':' + user), iterations: cfg.iter },
      key, 256);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const findUser = (u, h) => cfg.users.some(x => x.u === u && x.h === h);

  function remembered() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && findUser(s.u, s.h) ? s.u : null; }
    catch (e) { return null; }
  }

  function gate(resolve) {
    const css = `
      .auth-gate{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;
        background:linear-gradient(135deg,#26331a,#34461c);padding:16px}
      .auth-card{width:100%;max-width:340px;background:#fff;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.3);padding:28px 26px}
      .auth-card h1{margin:0 0 4px;font-size:18px;letter-spacing:.06em}
      .auth-card p{margin:0 0 18px;color:#69727d;font-size:12px}
      .auth-card label{display:block;font-size:12px;color:#475467;margin:10px 0 4px}
      .auth-card input{width:100%;padding:9px 10px;border:1px solid #c9cfd6;border-radius:6px;font-size:14px}
      .auth-card input:focus{outline:none;border-color:#5b8c0a;box-shadow:0 0 0 3px #eef6dd}
      .auth-card button{width:100%;margin-top:18px;padding:10px;border:0;border-radius:6px;background:#5b8c0a;color:#fff;font-size:14px;cursor:pointer}
      .auth-card button:disabled{opacity:.6;cursor:default}
      .auth-err{color:#d0342c;font-size:12px;min-height:16px;margin-top:10px}`;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const el = document.createElement('div');
    el.className = 'auth-gate';
    const none = !cfg.users.length;
    el.innerHTML = `<form class="auth-card" autocomplete="on">
        <h1>系統櫃 3D 設計平台</h1>
        <p>${none ? '尚未設定任何帳號，請先執行 tools/set-password.js。' : '請輸入帳號密碼登入'}</p>
        <label for="authUser">帳號</label><input id="authUser" name="username" autocomplete="username" required ${none ? 'disabled' : ''}>
        <label for="authPass">密碼</label><input id="authPass" name="password" type="password" autocomplete="current-password" required ${none ? 'disabled' : ''}>
        <button type="submit" ${none ? 'disabled' : ''}>登入</button>
        <div class="auth-err" id="authErr"></div>
      </form>`;
    document.body.appendChild(el);
    const f = el.querySelector('form'), err = el.querySelector('#authErr'), btn = el.querySelector('button');
    if (!none) setTimeout(() => el.querySelector('#authUser').focus(), 0);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const u = f.username.value.trim(), p = f.password.value;
      btn.disabled = true; err.textContent = '';
      const h = await hashOf(u, p);
      if (findUser(u, h)) {
        try { localStorage.setItem(KEY, JSON.stringify({ u, h })); } catch (e2) { /* 無痕模式存不了，下次再登入 */ }
        el.remove(); resolve(u);
      } else {
        err.textContent = '帳號或密碼錯誤';
        f.password.value = ''; f.password.focus(); btn.disabled = false;
      }
    });
  }

  const Auth = {};
  Auth.ready = new Promise(resolve => {
    const u = remembered();
    if (u) return resolve(u);
    if (document.body) gate(resolve); else document.addEventListener('DOMContentLoaded', () => gate(resolve));
  });
  Auth.logout = function () {
    try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ }
    location.reload();
  };
  window.Auth = Auth;
})();
