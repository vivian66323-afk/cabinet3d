/* 設定登入帳號密碼：產生 js/auth-config.js（只存雜湊，不存明碼）
   用法：
     node tools/set-password.js            新增帳號或修改密碼
     node tools/set-password.js --list     列出帳號
     node tools/set-password.js --remove 帳號   刪除帳號
   改完要 git commit + push 才會套用到網站。 */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), readline = require('readline');

const FILE = path.join(__dirname, '..', 'js', 'auth-config.js');
const ITER = 150000;

function load() {
  if (!fs.existsSync(FILE)) return { salt: crypto.randomBytes(16).toString('hex'), iter: ITER, users: [] };
  const window = {};
  new Function('window', fs.readFileSync(FILE, 'utf8'))(window);
  return window.AUTH_CONFIG;
}
function save(cfg) {
  fs.writeFileSync(FILE, '/* 由 tools/set-password.js 產生，請勿手動修改 */\nwindow.AUTH_CONFIG = ' +
    JSON.stringify(cfg, null, 2) + ';\n');
}
const hashOf = (cfg, u, p) => crypto.pbkdf2Sync(p, cfg.salt + ':' + u, cfg.iter, 32, 'sha256').toString('hex');

function ask(q, hidden) {
  return new Promise(res => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = s => { if (s.includes(q)) rl.output.write(q); else if (!/[\r\n]/.test(s)) rl.output.write('*'); };
    }
    rl.question(q, a => { rl.close(); if (hidden) process.stdout.write('\n'); res(a); });
  });
}

(async () => {
  const cfg = load();
  const args = process.argv.slice(2);
  if (args[0] === '--list') {
    console.log(cfg.users.length ? '目前帳號：' + cfg.users.map(x => x.u).join('、') : '尚未設定任何帳號');
    return;
  }
  if (args[0] === '--remove') {
    const before = cfg.users.length;
    cfg.users = cfg.users.filter(x => x.u !== args[1]);
    if (cfg.users.length === before) { console.log('找不到帳號：' + args[1]); return; }
    save(cfg); console.log('已刪除帳號：' + args[1]);
    return;
  }
  const u = (await ask('帳號：')).trim();
  if (!u) { console.log('帳號不能空白，已取消'); return; }
  const p1 = await ask('密碼（輸入時顯示 *）：', true);
  if (p1.length < 6) { console.log('密碼至少 6 個字元，已取消'); return; }
  const p2 = await ask('再輸入一次密碼：', true);
  if (p1 !== p2) { console.log('兩次密碼不一致，已取消'); return; }
  const h = hashOf(cfg, u, p1);
  const ex = cfg.users.find(x => x.u === u);
  if (ex) ex.h = h; else cfg.users.push({ u, h });
  save(cfg);
  console.log((ex ? '已更新密碼：' : '已新增帳號：') + u + '\n目前帳號：' + cfg.users.map(x => x.u).join('、'));
})();
