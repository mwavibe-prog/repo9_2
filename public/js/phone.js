/**
 * Phone Controller - Simple touch interface for elderly players
 */

let ws = null;
let playerId = null;
let gameState = null;
let playerName = '';

const boardCanvas = document.getElementById('phone-board-canvas');
const boardCtx = boardCanvas.getContext('2d');
const renderer = new FrogRenderer(boardCanvas);
const previewCanvas = document.getElementById('preview-canvas');
const previewCtx = previewCanvas.getContext('2d');
const previewRenderer = new FrogRenderer(previewCanvas);
const previewCanvas2 = document.getElementById('preview-canvas-2');
const previewCtx2 = previewCanvas2.getContext('2d');
const previewRenderer2 = new FrogRenderer(previewCanvas2);

// ── Join Screen ───────────────────────────────────────────────────────
document.getElementById('join-btn').addEventListener('click', joinGame);
document.getElementById('room-code-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinGame();
});

function joinGame() {
  const name = document.getElementById('name-input').value.trim() || 'Player';
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();

  if (code.length !== 4) {
    showError('Please enter the 4-letter room code from the TV');
    return;
  }

  playerName = name;
  connectToServer(code, name);
}

function showError(msg) {
  document.getElementById('join-error').textContent = msg;
}

// ── WebSocket ─────────────────────────────────────────────────────────
function connectToServer(code, name) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'joinRoom', code, name }));
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    switch (msg.type) {
      case 'joined':
        playerId = msg.playerId;
        playerName = msg.name;
        gameState = deserializeState(msg.state);
        showGameScreen();
        renderAll();
        break;

      case 'stateUpdate':
        const oldState = gameState;
        gameState = deserializeState(msg.state);
        // Trigger animations for merges
        if (msg.state.mergeEvents && msg.state.mergeEvents.length > 0) {
          msg.state.mergeEvents.forEach(evt => {
            renderer.spawnParticles(evt.col, evt.row, evt.toTier, 20);
            renderer.spawnScorePopup(evt.col, evt.row, evt.score, evt.chain);
          });
        }
        renderAll();
        checkGameOver();
        break;

      case 'error':
        showError(msg.message);
        break;
    }
  };

  ws.onclose = () => {
    // Try to reconnect
    setTimeout(() => {
      if (playerId) {
        connectToServer(code, name);
      }
    }, 2000);
  };
}

function send(msg) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(msg));
  }
}

// ── Game Screen Setup ─────────────────────────────────────────────────
function showGameScreen() {
  document.getElementById('join-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'flex';
  document.getElementById('display-name').textContent = playerName;

  setupDropButtons();
  setupActionButtons();
  resizeBoard();
  buildLegend();
}

function setupDropButtons() {
  const container = document.getElementById('drop-buttons');
  container.innerHTML = '';
  for (let c = 0; c < COLS; c++) {
    const btn = document.createElement('button');
    btn.className = 'drop-btn';
    btn.textContent = (c + 1).toString();
    btn.dataset.col = c;
    btn.addEventListener('click', () => {
      send({ type: 'drop', col: c });
      // Brief visual feedback
      btn.style.background = '#4CAF50';
      btn.style.color = '#fff';
      setTimeout(() => {
        btn.style.background = '';
        btn.style.color = '';
      }, 150);
    });
    container.appendChild(btn);
  }
}

function setupActionButtons() {
  document.getElementById('undo-btn').addEventListener('click', () => {
    send({ type: 'undo' });
  });
  document.getElementById('restart-btn').addEventListener('click', () => {
    if (confirm('Start over? Your score will reset.')) {
      send({ type: 'restart' });
      hideGameOver();
    }
  });
  document.getElementById('restart-overlay-btn').addEventListener('click', () => {
    send({ type: 'restart' });
    hideGameOver();
  });
}

// ── Board Rendering ───────────────────────────────────────────────────
function resizeBoard() {
  const maxWidth = Math.min(window.innerWidth - 10, 400);
  const cellSize = Math.floor(maxWidth / COLS);
  boardCanvas.width = COLS * cellSize;
  boardCanvas.height = ROWS * cellSize;
  renderer.cellSize = cellSize;
  renderer.offsetX = 0;
  renderer.offsetY = 0;
  renderer.headerHeight = 0;
}

window.addEventListener('resize', () => {
  resizeBoard();
  renderAll();
});

function renderAll() {
  if (!gameState) return;

  // Score
  document.getElementById('score-value').textContent = gameState.score;

  // Board
  renderBoard();

  // Preview frogs
  renderPreview();

  // Update drop button states
  updateDropButtons();

  // Update legend
  buildLegend();

  // Undo button state
  const undoBtn = document.getElementById('undo-btn');
  undoBtn.textContent = `Undo (${gameState.undoCount || 0})`;
}

function renderBoard() {
  const cs = renderer.cellSize;
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  // Background
  boardCtx.fillStyle = '#1a1a2e';
  boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

  // Grid lines
  boardCtx.strokeStyle = 'rgba(255,255,255,0.08)';
  boardCtx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    boardCtx.beginPath();
    boardCtx.moveTo(c * cs, 0);
    boardCtx.lineTo(c * cs, ROWS * cs);
    boardCtx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    boardCtx.beginPath();
    boardCtx.moveTo(0, r * cs);
    boardCtx.lineTo(COLS * cs, r * cs);
    boardCtx.stroke();
  }

  // Frogs
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const tier = gameState.grid[c][r];
      if (tier > 0) {
        const x = c * cs + cs / 2;
        const y = r * cs + cs / 2;
        drawFrogAt(boardCtx, x, y, tier, cs);
      }
    }
  }

  // Particles and popups
  renderer.drawParticles();
  renderer.drawScorePopups();

  // Keep animating if particles are active
  if (renderer.hasActiveAnimations()) {
    requestAnimationFrame(renderBoard);
  }
}

function drawFrogAt(ctx, x, y, tier, cellSize) {
  const radius = cellSize * 0.38;
  const tierInfo = FROG_TIERS[tier] || FROG_TIERS[1];

  // Body
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = tierInfo.color;
  ctx.fill();
  ctx.strokeStyle = darkenColor(tierInfo.color, 0.3);
  ctx.lineWidth = 2;
  ctx.stroke();

  // Eyes
  const eyeOx = radius * 0.35;
  const eyeOy = -radius * 0.25;
  const eyeR = radius * 0.18;
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(x - eyeOx, y + eyeOy, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + eyeOx, y + eyeOy, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(x - eyeOx, y + eyeOy, eyeR * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + eyeOx, y + eyeOy, eyeR * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Number
  const numSize = Math.max(10, radius * 0.75);
  ctx.font = `bold ${numSize}px Arial, sans-serif`;
  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tierInfo.number.toString(), x, y + radius * 0.25);
}

function renderPreview() {
  if (!gameState) return;

  // Next frog
  previewCtx.clearRect(0, 0, 60, 60);
  previewRenderer.drawPreviewFrog(30, 30, gameState.nextFrog, 60);

  // Then frog (smaller)
  previewCtx2.clearRect(0, 0, 46, 46);
  previewRenderer2.drawPreviewFrog(23, 23, gameState.previewFrog, 46);
}

function updateDropButtons() {
  const buttons = document.querySelectorAll('.drop-btn');
  buttons.forEach(btn => {
    const col = parseInt(btn.dataset.col);
    const isFull = gameState.grid[col][0] !== 0;
    btn.classList.toggle('disabled', isFull || gameState.gameOver);
    btn.disabled = isFull || gameState.gameOver;
  });
}

// ── Legend ─────────────────────────────────────────────────────────────
function buildLegend() {
  if (!gameState) return;
  const row = document.getElementById('legend-row');
  row.innerHTML = '';
  for (let t = 1; t <= MAX_TIER; t++) {
    const info = FROG_TIERS[t];
    const discovered = gameState.discoveredTiers.has(t);
    const item = document.createElement('div');
    item.className = 'legend-item' + (discovered ? '' : ' legend-locked');
    item.innerHTML = `<span class="legend-swatch" style="background:${discovered ? info.color : '#444'}"></span>
      <span>${discovered ? info.number + ' ' + info.name : '???'}</span>`;
    row.appendChild(item);
  }
}

// ── Game Over ─────────────────────────────────────────────────────────
function checkGameOver() {
  if (gameState && gameState.gameOver) {
    document.getElementById('final-score').textContent = `Score: ${gameState.score}`;
    document.getElementById('best-score-display').textContent = `Best: ${gameState.bestScore}`;
    document.getElementById('game-over-overlay').classList.add('visible');
  }
}

function hideGameOver() {
  document.getElementById('game-over-overlay').classList.remove('visible');
}
