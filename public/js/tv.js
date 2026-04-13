/**
 * TV Display - Connects to server, shows all player boards on one canvas
 */

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const renderer = new FrogRenderer(canvas);

let roomCode = null;
let players = []; // [{ id, name, state }]
let ws = null;

// ── WebSocket connection ──────────────────────────────────────────────
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'createRoom' }));
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    switch (msg.type) {
      case 'roomCreated':
        roomCode = msg.code;
        document.getElementById('room-code-display').textContent = msg.code;
        document.getElementById('corner-code').textContent = msg.code;
        break;

      case 'gameUpdate':
        players = msg.players;
        if (players.length > 0) {
          showGameArea();
        }
        break;

      case 'playerList':
        updatePlayerList(msg.players);
        updateLeaderboard(msg.players);
        break;

      case 'error':
        console.error('Server error:', msg.message);
        break;
    }
  };

  ws.onclose = () => {
    setTimeout(connect, 2000);
  };
}

function showGameArea() {
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game-area').style.display = 'block';
  resizeCanvas();
}

function updatePlayerList(list) {
  const countEl = document.getElementById('player-count');
  const namesEl = document.getElementById('player-names');
  countEl.textContent = `${list.length} player${list.length !== 1 ? 's' : ''} connected`;
  namesEl.textContent = list.map(p => p.name).join(', ');
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

// ── Canvas sizing ─────────────────────────────────────────────────────
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);

// ── Rendering loop ────────────────────────────────────────────────────
function calculateLayout() {
  const count = players.length;
  if (count === 0) return { cols: 1, rows: 1, cellSize: 40 };

  // Auto-grid: try to fit all boards nicely
  const screenW = canvas.width;
  const screenH = canvas.height;

  let bestCols = 1, bestRows = 1, bestCellSize = 0;

  for (let c = 1; c <= Math.min(count, 8); c++) {
    const r = Math.ceil(count / c);
    const boardW = screenW / c;
    const boardH = screenH / r;

    // Each board: COLS cells wide, ROWS cells tall + header
    const headerH = 70;
    const cellW = boardW / COLS;
    const cellH = (boardH - headerH) / ROWS;
    const cellSize = Math.floor(Math.min(cellW, cellH));

    if (cellSize > bestCellSize) {
      bestCellSize = cellSize;
      bestCols = c;
      bestRows = r;
    }
  }

  return { cols: bestCols, rows: bestRows, cellSize: Math.max(20, bestCellSize) };
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (players.length === 0) {
    // Nothing to draw yet
    requestAnimationFrame(render);
    return;
  }

  const layout = calculateLayout();
  const headerHeight = Math.min(70, layout.cellSize * 1.2);

  players.forEach((player, i) => {
    const gridCol = i % layout.cols;
    const gridRow = Math.floor(i / layout.cols);

    const boardW = COLS * layout.cellSize;
    const boardH = ROWS * layout.cellSize + headerHeight;

    // Center boards in their allocated space
    const slotW = canvas.width / layout.cols;
    const slotH = canvas.height / layout.rows;
    const ox = gridCol * slotW + (slotW - boardW) / 2;
    const oy = gridRow * slotH + (slotH - boardH) / 2;

    renderer.cellSize = layout.cellSize;
    renderer.offsetX = ox;
    renderer.offsetY = oy;
    renderer.headerHeight = headerHeight;

    renderer.drawBoard(player.state, player.name);

    // Spawn animations for merge events
    if (player.state.mergeEvents) {
      player.state.mergeEvents.forEach(evt => {
        renderer.spawnParticles(evt.col, evt.row, evt.toTier, 15);
        renderer.spawnScorePopup(evt.col, evt.row, evt.score, evt.chain);
      });
      player.state.mergeEvents = [];
    }
  });

  // Draw particles and popups on top
  renderer.drawParticles();
  renderer.drawScorePopups();

  requestAnimationFrame(render);
}

// ── Start ─────────────────────────────────────────────────────────────
resizeCanvas();
connect();
requestAnimationFrame(render);
