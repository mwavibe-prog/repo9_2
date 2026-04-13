/**
 * TV Display - All player boards, timer, leaderboard, sounds
 */

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const renderer = new FrogRenderer(canvas);

let roomCode = null;
let players = [];
let ws = null;
let timeLeft = 90;
let lastTickSec = -1;
let roundEnded = false;

// Init sounds on first user interaction with the page
document.addEventListener('click', () => { sfx.init(); sfx.resume(); }, { once: true });

// ── WebSocket ──
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'createRoom', origin: location.origin }));
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    switch (msg.type) {
      case 'roomCreated':
        roomCode = msg.code;
        document.getElementById('room-code-display').textContent = msg.code;
        document.getElementById('corner-code').textContent = msg.code;
        if (msg.qrCode) document.getElementById('qr-code').src = msg.qrCode;
        if (msg.joinUrl) document.getElementById('join-url').textContent = msg.joinUrl;
        break;

      case 'gameUpdate':
        players = msg.players;
        if (msg.timeLeft !== undefined) timeLeft = msg.timeLeft;
        if (players.length > 0) showGameArea();
        break;

      case 'playerList':
        updatePlayerList(msg.players);
        updateLeaderboard(msg.players);
        break;

      case 'timer':
        timeLeft = msg.timeLeft;
        updateTimerDisplay();
        handleTVTimerTick();
        break;

      case 'roundStart':
        timeLeft = msg.duration;
        roundEnded = false;
        lastTickSec = -1;
        document.getElementById('new-round-btn').style.display = 'none';
        sfx.init(); sfx.resume(); sfx.playRoundStart();
        break;

      case 'roundEnd':
        timeLeft = 0;
        roundEnded = true;
        updateTimerDisplay();
        sfx.playTimeUp();
        document.getElementById('new-round-btn').style.display = 'block';
        if (msg.rankings) updateLeaderboard(msg.rankings);
        break;

      case 'error':
        console.error('Server error:', msg.message);
        break;
    }
  };

  ws.onclose = () => { setTimeout(connect, 2000); };
}

// ── New Round button ──
document.getElementById('new-round-btn').addEventListener('click', () => {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'newRound' }));
  }
});

function handleTVTimerTick() {
  if (timeLeft === lastTickSec) return;
  lastTickSec = timeLeft;
  if (timeLeft <= 5 && timeLeft > 0) sfx.playUrgentTick();
  else if (timeLeft <= 10 && timeLeft > 0) sfx.playTick();
}

function updateTimerDisplay() {
  const el = document.getElementById('tv-timer-value');
  el.textContent = timeLeft;
  const container = document.getElementById('tv-timer');
  if (timeLeft <= 10) container.classList.add('urgent');
  else container.classList.remove('urgent');
}

function showGameArea() {
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game-area').style.display = 'block';
  resizeCanvas();
}

function updatePlayerList(list) {
  document.getElementById('player-count').textContent =
    `${list.length} player${list.length !== 1 ? 's' : ''} connected`;
  document.getElementById('player-names').textContent = list.map(p => p.name).join(', ');
}

function updateLeaderboard(list) {
  const sorted = [...list].sort((a, b) => b.score - a.score);
  const lbEl = document.getElementById('lb-list');
  lbEl.innerHTML = '';
  sorted.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'lb-entry';
    div.innerHTML = `<span><span class="rank">#${i + 1}</span>${p.name}</span><span>${p.score}</span>`;
    lbEl.appendChild(div);
  });
}

// ── Canvas ──
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);

function calculateLayout() {
  const count = players.length;
  if (count === 0) return { cols: 1, rows: 1, cellSize: 40 };
  const screenW = canvas.width;
  const screenH = canvas.height;
  let bestCols = 1, bestRows = 1, bestCellSize = 0;
  for (let c = 1; c <= Math.min(count, 8); c++) {
    const r = Math.ceil(count / c);
    const headerH = 70;
    const cellW = (screenW / c) / COLS;
    const cellH = ((screenH / r) - headerH) / ROWS;
    const cs = Math.floor(Math.min(cellW, cellH));
    if (cs > bestCellSize) { bestCellSize = cs; bestCols = c; bestRows = r; }
  }
  return { cols: bestCols, rows: bestRows, cellSize: Math.max(20, bestCellSize) };
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (players.length === 0) { requestAnimationFrame(render); return; }

  const layout = calculateLayout();
  const headerHeight = Math.min(70, layout.cellSize * 1.2);

  players.forEach((player, i) => {
    const gridCol = i % layout.cols;
    const gridRow = Math.floor(i / layout.cols);
    const boardW = COLS * layout.cellSize;
    const boardH = ROWS * layout.cellSize + headerHeight;
    const slotW = canvas.width / layout.cols;
    const slotH = canvas.height / layout.rows;
    const ox = gridCol * slotW + (slotW - boardW) / 2;
    const oy = gridRow * slotH + (slotH - boardH) / 2;

    renderer.cellSize = layout.cellSize;
    renderer.offsetX = ox;
    renderer.offsetY = oy;
    renderer.headerHeight = headerHeight;

    renderer.drawBoard(player.state, player.name, timeLeft);

    if (player.state.mergeEvents) {
      player.state.mergeEvents.forEach(evt => {
        renderer.spawnParticles(evt.col, evt.row, evt.toTier, 18);
        renderer.spawnScorePopup(evt.col, evt.row, evt.score, evt.chain);
      });
      player.state.mergeEvents = [];
    }
  });

  renderer.drawParticles();
  renderer.drawScorePopups();
  requestAnimationFrame(render);
}

// ── Start ──
resizeCanvas();
connect();
requestAnimationFrame(render);
