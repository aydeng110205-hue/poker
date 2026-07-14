const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Hand = require('pokersolver').Hand;
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingTimeout: 30000, pingInterval: 10000 });
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// ============== DATA STORAGE ==============
const DATA_FILE = path.join(__dirname, 'data.json');
let db = { users: {}, sessions: {}, tables: [] };
if (fs.existsSync(DATA_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch(e) {}
}
function saveDB() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(db)); } catch(e) {} }

// ============== AUTH ==============
function genToken() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function getUser(req) {
  const m = (req.headers.cookie || '').match(/session=([^;]+)/);
  if (!m) return null;
  const s = db.sessions[m[1]];
  return s ? db.users[s.user] : null;
}
function setCookie(res, token) {
  res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Lax`);
}

// ============== DECK ==============
const SUITS = ['h','d','c','s'];
const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
function newDeck() { const d = []; for (const s of SUITS) for (const r of RANKS) d.push(r+s); return d; }
function shuffle(d) { for (let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d; }

// ============== STYLES ==============
const CSS = `
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;}
body{background:linear-gradient(135deg,#0a0e1a 0%,#1a1f2e 100%);color:#e8e8f0;min-height:100vh;}
.wrap{max-width:1100px;margin:0 auto;padding:24px;}
h1{font-size:32px;background:linear-gradient(135deg,#f59e0b,#10b981);-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:inline-block;}
.btn{padding:10px 20px;border:none;border-radius:8px;cursor:pointer;font-weight:600;transition:all 0.2s;font-size:14px;display:inline-flex;align-items:center;gap:6px;}
.btn:hover{transform:translateY(-1px);}
.btn-gold{background:linear-gradient(135deg,#f59e0b,#eab308);color:#0a0e1a;}
.btn-gold:hover{box-shadow:0 4px 16px rgba(245,158,11,0.4);}
.btn-green{background:#10b981;color:white;}
.btn-green:hover{box-shadow:0 4px 16px rgba(16,185,129,0.4);}
.btn-red{background:#ef4444;color:white;}
.btn-blue{background:#3b82f6;color:white;}
.btn-ghost{background:rgba(255,255,255,0.06);color:#e8e8f0;border:1px solid rgba(255,255,255,0.1);}
.btn:disabled{opacity:0.3;cursor:not-allowed;transform:none!important;}
.input{padding:10px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:white;outline:none;width:100%;font-size:14px;transition:border 0.2s;}
.input:focus{border-color:#f59e0b;}
.card{background:rgba(255,255,255,0.04);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;}
.muted{color:rgba(255,255,255,0.45);font-size:14px;}
.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px;}
.badge{padding:6px 14px;background:rgba(245,158,11,0.12);color:#f59e0b;border-radius:6px;font-size:13px;font-weight:600;border:1px solid rgba(245,158,11,0.2);}
a{text-decoration:none;color:inherit;}
.pcard{width:46px;height:64px;background:white;border-radius:6px;display:flex;flex-direction:column;justify-content:space-between;padding:4px;font-family:Georgia,serif;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.5);user-select:none;transition:transform 0.2s;}
.pcard:hover{transform:translateY(-2px);}
.pcard.red{color:#dc2626;}
.pcard.black{color:#111;}
.pcard.back{background:linear-gradient(135deg,#1e40af,#3b82f6);background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0.08) 0px 6px,transparent 6px 12px);}
.pcard.empty{background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.12);box-shadow:none;}
.ptop{font-size:11px;line-height:1;}
.pmid{font-size:18px;line-height:1;text-align:center;}
.pbot{font-size:11px;line-height:1;transform:rotate(180deg);}
.seat.turn > div{border-color:#f59e0b!important;box-shadow:0 0 0 3px #f59e0b;animation:pulse 1.5s infinite;}
@keyframes pulse{0%,100%{box-shadow:0 0 0 3px #f59e0b;}50%{box-shadow:0 0 0 6px rgba(245,158,11,0.3);}}
.seat.folded > div{opacity:0.35;}
.seat.allin > div{border-color:#ef4444!important;}
</style>`;

// ============== ROUTES ==============
app.get('/', (req, res) => {
  const u = getUser(req);
  res.send(`<!DOCTYPE html><html><head><title>POKER ROYALE</title>${CSS}</head><body>
  <div class="wrap" style="text-align:center;padding-top:120px;">
    <div style="font-size:64px;margin-bottom:10px;">♠♥♦♣</div>
    <h1 style="font-size:52px;">POKER ROYALE</h1>
    <p class="muted" style="font-size:16px;margin:16px 0 32px;">Real-time Multiplayer Texas Hold'em — Up to 8 Players Per Table</p>
    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
      ${u ? `<a href="/lobby" class="btn btn-gold" style="font-size:16px;padding:14px 28px;">Enter Lobby</a><a href="/api/logout" class="btn btn-ghost" style="font-size:16px;padding:14px 28px;">Sign Out</a>`
         : `<a href="/register" class="btn btn-gold" style="font-size:16px;padding:14px 28px;">Create Account</a><a href="/login" class="btn btn-ghost" style="font-size:16px;padding:14px 28px;">Sign In</a>`}
    </div>
  </div></body></html>`);
});

app.get('/register', (req, res) => {
  if (getUser(req)) return res.redirect('/lobby');
  res.send(`<!DOCTYPE html><html><head><title>Register</title>${CSS}</head><body>
  <div class="wrap" style="max-width:400px;padding-top:100px;">
    <div class="card">
      <h2 style="margin-bottom:16px;">Create Account</h2>
      <p class="muted" style="margin-bottom:16px;">Join and play with others at real poker tables.</p>
      <form action="/api/register" method="POST" style="display:flex;flex-direction:column;gap:12px;">
        <input class="input" name="username" placeholder="Username" required minlength="3" maxlength="16" autofocus>
        <input class="input" name="password" type="password" placeholder="Password" required minlength="4">
        <button class="btn btn-gold" type="submit">Create Account</button>
      </form>
      <p class="muted" style="margin-top:12px;text-align:center;">Already have an account? <a href="/login" style="color:#f59e0b;font-weight:600;">Sign in</a></p>
    </div>
  </div></body></html>`);
});

app.post('/api/register', (req, res) => {
  const username = (req.body.username||'').trim().toLowerCase();
  const password = req.body.password || '';
  if (!username || username.length < 3 || password.length < 4) return res.redirect('/register');
  if (db.users[username]) return res.redirect('/register');
  db.users[username] = { password, chips: 1000, created: Date.now() };
  const token = genToken();
  db.sessions[token] = { user: username, ts: Date.now() };
  saveDB();
  setCookie(res, token);
  res.redirect('/lobby');
});

app.get('/login', (req, res) => {
  if (getUser(req)) return res.redirect('/lobby');
  res.send(`<!DOCTYPE html><html><head><title>Login</title>${CSS}</head><body>
  <div class="wrap" style="max-width:400px;padding-top:100px;">
    <div class="card">
      <h2 style="margin-bottom:16px;">Sign In</h2>
      <form action="/api/login" method="POST" style="display:flex;flex-direction:column;gap:12px;">
        <input class="input" name="username" placeholder="Username" required autofocus>
        <input class="input" name="password" type="password" placeholder="Password" required>
        <button class="btn btn-gold" type="submit">Sign In</button>
      </form>
      <p class="muted" style="margin-top:12px;text-align:center;">New here? <a href="/register" style="color:#f59e0b;font-weight:600;">Create account</a></p>
    </div>
  </div></body></html>`);
});

app.post('/api/login', (req, res) => {
  const username = (req.body.username||'').trim().toLowerCase();
  const password = req.body.password || '';
  const u = db.users[username];
  if (!u || u.password !== password) return res.redirect('/login');
  const token = genToken();
  db.sessions[token] = { user: username, ts: Date.now() };
  saveDB();
  setCookie(res, token);
  res.redirect('/lobby');
});

app.get('/api/logout', (req, res) => {
  const m = (req.headers.cookie || '').match(/session=([^;]+)/);
  if (m) delete db.sessions[m[1]];
  saveDB();
  res.setHeader('Set-Cookie', 'session=; Path=/; Max-Age=0; HttpOnly');
  res.redirect('/');
});

// ============== LOBBY ==============
app.get('/lobby', (req, res) => {
  const u = getUser(req);
  if (!u) return res.redirect('/login');
  if (!db.tables) db.tables = [];
  if (db.tables.length === 0) {
    db.tables.push({ id: 'main', name: 'Main Table', smallBlind: 10, bigBlind: 20, maxPlayers: 8, created: Date.now() });
    saveDB();
  }
  const tablesHtml = db.tables.map(t => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:rgba(255,255,255,0.03);border-radius:10px;border:1px solid rgba(255,255,255,0.04);">
      <div>
        <div style="font-weight:600;font-size:15px;">${t.name}</div>
        <div class="muted" style="font-size:12px;">Blinds: ${t.smallBlind}/${t.bigBlind} • Up to ${t.maxPlayers} players</div>
      </div>
      <a href="/table/${t.id}" class="btn btn-green">Join</a>
    </div>
  `).join('');
  res.send(`<!DOCTYPE html><html><head><title>Lobby</title>${CSS}</head><body>
  <div class="wrap">
    <div class="topbar">
      <h1>♠ Lobby</h1>
      <div style="display:flex;gap:12px;align-items:center;">
        <span class="badge">💰 ${u.chips} chips</span>
        <span style="font-size:14px;color:rgba(255,255,255,0.5);">@${u.username}</span>
        <a href="/api/logout" class="btn btn-ghost">Sign Out</a>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-bottom:12px;font-size:16px;">Create a New Table</h3>
      <form action="/api/tables/create" method="POST" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
        <div style="flex:1;min-width:160px;">
          <label class="muted" style="font-size:11px;display:block;margin-bottom:4px;">Table Name</label>
          <input class="input" name="name" placeholder="My Table" required>
        </div>
        <div>
          <label class="muted" style="font-size:11px;display:block;margin-bottom:4px;">Small Blind</label>
          <input class="input" type="number" name="sb" value="10" min="1" max="100" style="width:80px;">
        </div>
        <div>
          <label class="muted" style="font-size:11px;display:block;margin-bottom:4px;">Big Blind</label>
          <input class="input" type="number" name="bb" value="20" min="2" max="200" style="width:80px;">
        </div>
        <button class="btn btn-gold" type="submit">Create Table</button>
      </form>
    </div>
    <div class="card">
      <h3 style="margin-bottom:14px;font-size:16px;">Available Tables</h3>
      <div style="display:flex;flex-direction:column;gap:8px;">${tablesHtml}</div>
    </div>
  </div></body></html>`);
});

app.post('/api/tables/create', (req, res) => {
  const u = getUser(req);
  if (!u) return res.redirect('/login');
  if (!db.tables) db.tables = [];
  const id = 't_' + Date.now();
  db.tables.push({
    id,
    name: (req.body.name||'Poker Table').trim().slice(0, 40) || 'Poker Table',
    smallBlind: Math.max(1, parseInt(req.body.sb) || 10),
    bigBlind: Math.max(2, parseInt(req.body.bb) || 20),
    maxPlayers: 8,
    created: Date.now()
  });
  saveDB();
  res.redirect(`/table/${id}`);
});

// ============== TABLE PAGE (with full client code) ==============
app.get('/table/:id', (req, res) => {
  const u = getUser(req);
  if (!u) return res.redirect('/login');
  const t = (db.tables||[]).find(t => t.id === req.params.id);
  if (!t) return res.redirect('/lobby');

  res.send(`<!DOCTYPE html>
<html><head><title>${t.name} — POKER ROYALE</title>${CSS}
<script src="/socket.io/socket.io.js"></script>
<style>
.pcard{width:46px;height:64px;background:white;border-radius:6px;display:flex;flex-direction:column;justify-content:space-between;padding:4px;font-family:Georgia,serif;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.5);user-select:none;transition:transform 0.2s;}
.pcard:hover{transform:translateY(-2px);}
.pcard.red{color:#dc2626;}
.pcard.black{color:#111;}
.pcard.back{background:linear-gradient(135deg,#1e40af,#3b82f6);background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0.08) 0px 6px,transparent 6px 12px);}
.pcard.empty{background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.12);box-shadow:none;}
.ptop{font-size:11px;line-height:1;}
.pmid{font-size:18px;line-height:1;text-align:center;}
.pbot{font-size:11px;line-height:1;transform:rotate(180deg);}
.seat.turn > div{border-color:#f59e0b!important;box-shadow:0 0 0 3px #f59e0b;animation:pulse 1.5s infinite;}
@keyframes pulse{0%,100%{box-shadow:0 0 0 3px #f59e0b;}50%{box-shadow:0 0 0 6px rgba(245,158,11,0.3);}}
.seat.folded > div{opacity:0.35;}
.seat.allin > div{border-color:#ef4444!important;}
#chatLog::-webkit-scrollbar{width:4px;}
#chatLog::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:2px;}
</style>
</head><body>
<div class="wrap" style="max-width:1200px;">
  <div class="topbar">
    <div>
      <h1>♠ ${t.name}</h1>
      <span class="muted" style="font-size:13px;">Blinds: ${t.smallBlind} / ${t.bigBlind}</span>
    </div>
    <div style="display:flex;gap:12px;align-items:center;">
      <span class="badge">💰 <span id="myChips">${u.chips}</span></span>
      <span style="font-size:13px;color:rgba(255,255,255,0.5);">${u.username}</span>
      <a href="/lobby" class="btn btn-ghost" style="font-size:13px;">← Lobby</a>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 260px;gap:16px;">
    <div class="card" style="min-height:520px;padding:16px;position:relative;border-radius:16px;background:linear-gradient(135deg,rgba(16,185,129,0.04) 0%,rgba(16,185,129,0.01) 100%);">
      <div id="seats" style="position:relative;height:480px;"></div>
    </div>
    <div class="card" style="display:flex;flex-direction:column;height:520px;padding:14px;">
      <h3 style="font-size:15px;margin-bottom:10px;">💬 Chat</h3>
      <div id="chatLog" style="flex:1;overflow-y:auto;margin-bottom:8px;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px;font-size:13px;display:flex;flex-direction:column;gap:4px;"></div>
      <div style="display:flex;gap:6px;">
        <input id="chatInput" class="input" placeholder="Type here..." style="flex:1;font-size:13px;">
        <button id="chatSend" class="btn btn-blue" style="font-size:13px;padding:10px 16px;">Send</button>
      </div>
    </div>
  </div>
</div>
<div id="actionBar" style="position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,0.92);backdrop-filter:blur(16px);padding:14px 24px;display:flex;gap:8px;justify-content:center;align-items:center;border-top:1px solid rgba(255,255,255,0.06);z-index:100;"></div>
<script>
const MY_USER = ${JSON.stringify(u.username)};
const TABLE_ID = ${JSON.stringify(t.id)};
const TABLE_BB = ${t.bigBlind};
const TABLE_SB = ${t.smallBlind};
const socket = io({ query: { table: TABLE_ID, user: MY_USER } });

const seatPos = [
  { x: 50, y: 88 }, { x: 18, y: 72 }, { x: 7, y: 42 },
  { x: 18, y: 13 }, { x: 50, y: 2 }, { x: 82, y: 13 },
  { x: 93, y: 42 }, { x: 82, y: 72 }
];
const SUIT = { h:'♥', d:'♦', c:'♣', s:'♠' };
const RANK = { T:'10', J:'J', Q:'Q', K:'K', A:'A' };

function cardHTML(c, hidden) {
  if (hidden) return '<div class="pcard back"></div>';
  const r = c[0], s = c[1];
  const isRed = s === 'h' || s === 'd';
  return '<div class="pcard ' + (isRed ? 'red' : 'black') + '">' +
    '<div class="ptop">' + (RANK[r]||r) + SUIT[s] + '</div>' +
    '<div class="pmid">' + SUIT[s] + '</div>' +
    '<div class="pbot">' + (RANK[r]||r) + SUIT[s] + '</div></div>';
}

function render(state) {
  const seats = document.getElementById('seats');
  seats.innerHTML = '';

  // Center — community cards, pot, phase
  const center = document.createElement('div');
  center.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;';
  let comm = '<div style="display:flex;justify-content:center;gap:5px;min-height:70px;align-items:center;">';
  if (state.communityCards.length === 0 && state.phase === 'waiting') {
    comm += '<span class="muted" style="font-size:15px;">⌛ Waiting for players...</span>';
  } else {
    for (let i = 0; i < 5; i++) {
      comm += state.communityCards[i] ? cardHTML(state.communityCards[i]) : '<div class="pcard empty"></div>';
    }
  }
  comm += '</div>';
  comm += '<div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.4);margin-top:4px;">' + state.phase + '</div>';
  if (!state.handOver) comm += '<div style="font-size:22px;font-weight:700;color:#f59e0b;margin-top:4px;">Pot: ' + state.pot + '</div>';
  center.innerHTML = comm;
  seats.appendChild(center);

  // Players
  const me = state.players.find(p => p.name === MY_USER);
  state.players.forEach((p, i) => {
    const pos = seatPos[i] || { x: 50, y: 50 };
    const el = document.createElement('div');
    const classes = ['seat'];
    if (p.isTurn && !state.handOver) classes.push('turn');
    if (p.folded) classes.push('folded');
    if (p.allIn) classes.push('allin');
    el.className = classes.join(' ');
    el.style.cssText = 'position:absolute;left:' + pos.x + '%;top:' + pos.y + '%;transform:translate(-50%,-50%);transition:all 0.3s;z-index:' + (p.name === MY_USER ? 10 : 1) + ';';
    const isMe = p.name === MY_USER;
    const showCards = p.showCards || isMe;
    const cards = p.holeCards ? (showCards
      ? p.holeCards
      : [null, null]
    ) : null;
    const cardHtml = cards
      ? '<div style="display:flex;gap:3px;justify-content:center;margin:5px 0;">' + cardHTML(cards[0], !cards[0]) + cardHTML(cards[1], !cards[1]) + '</div>'
      : '<div style="height:48px;"></div>';
    el.innerHTML = '<div style="background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);padding:6px 10px;border-radius:10px;min-width:110px;text-align:center;border:2px solid ' +
      (p.isTurn && !state.handOver ? '#f59e0b' : 'transparent') + ';">' +
      '<div style="font-weight:600;font-size:12px;">' + (isMe ? '<span style="color:#f59e0b;">You</span>' : p.name) + (p.isDealer ? ' <span style="background:rgba(245,158,11,0.2);color:#f59e0b;padding:1px 5px;border-radius:4px;font-size:10px;">D</span>' : '') + (p.allIn ? ' <span style="color:#ef4444;font-size:10px;">ALL-IN</span>' : '') + '</div>' +
      '<div style="font-size:11px;color:#10b981;font-weight:500;">' + p.chips + ' chips</div>' +
      (p.bet > 0 ? '<div style="font-size:10px;color:rgba(255,255,255,0.5);">Bet: ' + p.bet + '</div>' : '') +
      cardHtml +
      (p.lastAction ? '<div style="font-size:10px;color:rgba(255,255,255,0.4);font-style:italic;">' + p.lastAction + '</div>' : '') +
      '</div>';
    seats.appendChild(el);
  });

  // Bottom action bar
  const myTurn = me && state.players[state.turnIdx] && state.players[state.turnIdx].name === MY_USER;
  const ar = document.getElementById('actionBar');
  if (state.phase === 'waiting' || state.handOver) {
    ar.innerHTML = '<span class="muted" style="margin-right:8px;">' + state.players.length + ' player(s) at table</span>' + (state.players.length >= 2 ? '<button class="btn btn-gold" id="startBtn">Start Hand</button>' : '<span class="muted">Need at least 2 players</span>');
    const sb = document.getElementById('startBtn');
    if (sb) sb.onclick = () => socket.emit('start_hand');
    return;
  }
  if (!me || me.folded || me.allIn || !myTurn || state.handOver) {
    const turnName = state.players[state.turnIdx] ? state.players[state.turnIdx].name + "'s turn" : '';
    ar.innerHTML = '<span class="muted">' + (turnName ? '⏳ ' + turnName : '') + '</span>';
    return;
  }
  const toCall = state.currentBet - me.bet;
  const canCheck = toCall <= 0;
  const minRaise = state.currentBet + Math.max(state.minRaise || TABLE_BB, TABLE_BB);
  ar.innerHTML = '<button class="btn btn-red" id="foldBtn">Fold</button>' +
    (canCheck ? '<button class="btn btn-ghost" id="checkBtn">Check</button>' : '<button class="btn btn-blue" id="callBtn">Call ' + toCall + '</button>') +
    '<button class="btn btn-green" id="raiseBtn">Raise</button>' +
    '<input id="raiseAmt" class="input" type="number" value="' + minRaise + '" min="' + minRaise + '" max="' + (me.chips + me.bet) + '" style="width:100px;height:38px;font-size:14px;">' +
    '<button class="btn btn-gold" id="allinBtn">All-in (' + me.chips + ')</button>';
  document.getElementById('foldBtn').onclick = () => socket.emit('action', { action: 'fold' });
  if (canCheck) document.getElementById('checkBtn').onclick = () => socket.emit('action', { action: 'check' });
  else document.getElementById('callBtn').onclick = () => socket.emit('action', { action: 'call' });
  document.getElementById('raiseBtn').onclick = () => {
    const amt = parseInt(document.getElementById('raiseAmt').value);
    socket.emit('action', { action: 'raise', amount: amt });
  };
  document.getElementById('allinBtn').onclick = () => socket.emit('action', { action: 'allin' });
  document.getElementById('myChips').textContent = me.chips;
}

// Chat
document.getElementById('chatSend').onclick = () => {
  const inp = document.getElementById('chatInput');
  if (inp.value.trim()) { socket.emit('chat', inp.value); inp.value = ''; }
};
document.getElementById('chatInput').onkeydown = e => { if (e.key === 'Enter') document.getElementById('chatSend').click(); };
socket.on('chat_msg', m => {
  const log = document.getElementById('chatLog');
  const d = document.createElement('div');
  d.innerHTML = '<span style="color:#f59e0b;font-weight:600;">' + m.name + ':</span> ' + m.msg;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
});
socket.on('state', render);
socket.on('error_msg', m => alert(m));
</script>
</body></html>`);
});

// ============== POKER ENGINE ==============
const liveTables = new Map();

function getTable(id) {
  if (!liveTables.has(id)) {
    const tdef = (db.tables||[]).find(t => t.id === id);
    if (!tdef) return null;
    liveTables.set(id, {
      id, name: tdef.name, sb: tdef.smallBlind, bb: tdef.bigBlind,
      maxPlayers: 8, players: [],
      deck: [], communityCards: [],
      pot: 0, currentBet: 0, minRaise: 0,
      dealerIdx: -1, turnIdx: 0, phase: 'waiting', handOver: true,
      lastAggressor: -1, acted: new Set()
    });
  }
  return liveTables.get(id);
}

function publicView(t) {
  return {
    id: t.id, name: t.name, sb: t.sb, bb: t.bb,
    communityCards: t.communityCards, pot: t.pot,
    currentBet: t.currentBet, phase: t.phase,
    dealerIdx: t.dealerIdx, turnIdx: t.turnIdx, handOver: t.handOver,
    players: t.players.map((p, i) => ({
      name: p.name, chips: p.chips, bet: p.bet, totalBet: p.totalBet,
      folded: p.folded, allIn: p.allIn, holeCards: p.holeCards,
      showCards: p.showCards, lastAction: p.lastAction,
      isDealer: i === t.dealerIdx, isTurn: i === t.turnIdx,
      connected: p.connected
    }))
  };
}

function broadcast(t) { io.to(t.id).emit('state', publicView(t)); }

function postBlind(t, idx, amt) {
  const p = t.players[idx];
  const a = Math.min(amt, p.chips);
  p.chips -= a; p.bet = a; p.totalBet = a; p.allIn = p.chips === 0;
  t.pot += a;
}

function nextActive(t, from) {
  const n = t.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (!t.players[i].folded && !t.players[i].allIn) return i;
  }
  return -1;
}

function countActive(t) { return t.players.filter(p => !p.folded && !p.allIn).length; }

function doShowdown(t) {
  const active = t.players.filter(p => !p.folded);
  if (active.length === 1) {
    active[0].chips += t.pot;
    active[0].lastAction = 'Wins ' + t.pot;
  } else {
    const allInPlayers = t.players.filter(p => p.allIn && !p.folded);
    const totalContributions = t.players.reduce((s, p) => s + p.totalBet, 0);
    t.pot = totalContributions;
    const hands = active.map(p => ({ p, hand: Hand.solve([...p.holeCards, ...t.communityCards]) }));
    const winners = Hand.winners(hands.map(h => h.hand));
    const winningPlayers = hands.filter(h => winners.includes(h.hand));
    const share = Math.floor(t.pot / winningPlayers.length);
    const rem = t.pot - share * winningPlayers.length;
    winningPlayers.forEach((w, i) => {
      w.p.chips += share + (i === 0 ? rem : 0);
      w.p.lastAction = 'Wins ' + (share + (i === 0 ? rem : 0)) + ' (' + w.hand.descr + ')';
    });
    active.forEach(p => p.showCards = true);
  }
  active.forEach(p => {
    if (db.users[p.name]) db.users[p.name].chips = p.chips;
  });
  saveDB();
  broadcast(t);
  setTimeout(() => {
    t.players = t.players.filter(p => p.chips > 0);
    if (t.players.length >= 2) startHand(t);
    else { t.phase = 'waiting'; t.handOver = true; broadcast(t); }
  }, 6000);
}

function endBettingRound(t) {
  if (t.phase === 'preflop') {
    t.phase = 'flop';
    t.communityCards.push(t.deck.pop(), t.deck.pop(), t.deck.pop());
  } else if (t.phase === 'flop') {
    t.phase = 'turn';
    t.communityCards.push(t.deck.pop());
  } else if (t.phase === 'turn') {
    t.phase = 'river';
    t.communityCards.push(t.deck.pop());
  } else if (t.phase === 'river') {
    doShowdown(t);
    return;
  }
  t.players.forEach(p => { p.bet = 0; });
  t.currentBet = 0;
  t.minRaise = t.bb;
  t.acted = new Set();
  t.lastAggressor = -1;
  t.turnIdx = nextActive(t, t.dealerIdx);
  if (t.turnIdx === -1) {
    while (t.communityCards.length < 5) t.communityCards.push(t.deck.pop());
    doShowdown(t);
    return;
  }
  broadcast(t);
}

function startHand(t) {
  if (t.players.length < 2) return;
  t.players = t.players.filter(p => p.chips > 0);
  if (t.players.length < 2) return;
  t.deck = shuffle(newDeck());
  t.communityCards = [];
  t.pot = 0;
  t.currentBet = 0;
  t.minRaise = t.bb;
  t.handOver = false;
  t.acted = new Set();
  t.lastAggressor = -1;
  t.dealerIdx = (t.dealerIdx + 1) % t.players.length;
  const n = t.players.length;
  const sbIdx = (t.dealerIdx + 1) % n;
  const bbIdx = (t.dealerIdx + 2) % n;
  t.players.forEach(p => { p.holeCards = []; p.bet = 0; p.totalBet = 0; p.folded = false; p.allIn = false; p.showCards = false; p.lastAction = null; });
  postBlind(t, sbIdx, t.sb);
  postBlind(t, bbIdx, t.bb);
  t.currentBet = t.bb;
  for (let i = 0; i < 2; i++) for (let p = 0; p < n; p++) t.players[p].holeCards.push(t.deck.pop());
  t.phase = 'preflop';
  t.turnIdx = (bbIdx + 1) % n;
  broadcast(t);
}

function handleAction(t, idx, action, amount) {
  const p = t.players[idx];
  if (idx !== t.turnIdx || t.handOver || p.folded || p.allIn) return;
  const toCall = t.currentBet - p.bet;
  if (action === 'fold') { p.folded = true; p.lastAction = 'Folds'; }
  else if (action === 'check') { if (toCall > 0) return; p.lastAction = 'Checks'; }
  else if (action === 'call') {
    const pay = Math.min(toCall, p.chips);
    p.chips -= pay; p.bet += pay; p.totalBet += pay; p.allIn = p.chips === 0;
    t.pot += pay;
    p.lastAction = p.allIn ? 'All-in ' + (p.bet) : 'Calls ' + toCall;
  } else if (action === 'raise') {
    const raiseTo = parseInt(amount) || 0;
    const needed = raiseTo - p.bet;
    if (needed <= 0 || (raiseTo < t.currentBet + t.minRaise && p.chips > raiseTo)) return;
    const pay = Math.min(needed, p.chips);
    p.chips -= pay; p.bet += pay; p.totalBet += pay; p.allIn = p.chips === 0;
    t.pot += pay;
    if (p.bet > t.currentBet) { t.minRaise = p.bet - t.currentBet; t.currentBet = p.bet; t.lastAggressor = idx; t.acted = new Set([idx]); }
    p.lastAction = p.allIn ? 'All-in ' + p.bet : 'Raises to ' + p.bet;
  } else if (action === 'allin') {
    const pay = p.chips;
    p.bet += pay; p.totalBet += pay; p.chips = 0; p.allIn = true;
    t.pot += pay;
    if (p.bet > t.currentBet) { t.minRaise = p.bet - t.currentBet; t.currentBet = p.bet; t.lastAggressor = idx; t.acted = new Set([idx]); }
    p.lastAction = 'All-in ' + p.bet;
  }
  t.acted.add(idx);
  const alive = t.players.filter(p => !p.folded);
  if (alive.length === 1) { doShowdown(t); return; }
  const next = nextActive(t, t.turnIdx);
  if (next === -1) {
    while (t.communityCards.length < 5) t.communityCards.push(t.deck.pop());
    doShowdown(t);
    return;
  }
  const allMatched = t.players.every((pl, i) => pl.folded || pl.allIn || (t.acted.has(i) && pl.bet === t.currentBet));
  if (allMatched) { endBettingRound(t); return; }
  t.turnIdx = next;
  broadcast(t);
}

// ============== SOCKET.IO ==============
io.on('connection', (socket) => {
  const tableId = socket.handshake.query.table;
  const username = socket.handshake.query.user;
  if (!tableId || !username || !db.users[username]) return socket.disconnect();
  const t = getTable(tableId);
  if (!t) return socket.disconnect();
  socket.join(tableId);

  let pi = t.players.findIndex(p => p.name === username);
  if (pi === -1) {
    if (t.players.length >= t.maxPlayers) { socket.emit('error_msg', 'Table is full'); return socket.disconnect(); }
    t.players.push({ name: username, chips: db.users[username].chips, holeCards: [], bet: 0, totalBet: 0, folded: false, allIn: false, showCards: false, lastAction: null, connected: true });
    pi = t.players.length - 1;
  } else {
    t.players[pi].connected = true;
    t.players[pi].chips = db.users[username].chips;
  }
  t.players[pi].socket = socket;
  socket.data.idx = pi;
  socket.emit('state', publicView(t));

  socket.on('chat', msg => {
    if (typeof msg !== 'string') return;
    const clean = msg.slice(0, 200).replace(/[<>]/g, '');
    if (clean.trim()) io.to(tableId).emit('chat_msg', { name: username, msg: clean.trim(), ts: Date.now() });
  });

  socket.on('start_hand', () => {
    if (t.players.length >= 2 && (t.handOver || t.phase === 'waiting')) startHand(t);
  });

  socket.on('action', ({ action, amount }) => handleAction(t, pi, action, amount));

  socket.on('disconnect', () => {
    const p = t.players[pi];
    if (p) {
      p.connected = false;
      if (db.users[username]) db.users[username].chips = p.chips;
      saveDB();
      broadcast(t);
    }
  });
  broadcast(t);
});

server.listen(PORT, () => console.log('♠ POKER ROYALE running on http://localhost:' + PORT));