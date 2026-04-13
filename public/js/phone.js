/**
 * Phone Controller - Drag & drop frogs on the canvas
 */

let ws = null;
let playerId = null;
let gameState = null;
let playerName = '';

const boardCanvas = document.getElementById('phone-board-canvas');
const boardCtx = boardCanvas.getContext('2d');
const renderer = new FrogRenderer(boardCanvas);

// ── Drag state ────────────────────────────────────────────────────────
let dragging = false;
let dragX = 0;          // current finger X (canvas coords)
let dragY = 0;          // current finger Y (canvas coords)
let hoverCol = -1;      // column the finger is over
let dragZoneH = 0;      // height of the drag-start zone at the top
let cellSize = 60;
let boardOffsetY = 0;   // where the grid rows start (below drag zone)
let animFrameId = null;

// ── Auto-fill room code from URL (?room=ABCD) ───────────────────────
const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get('room');
if (urlRoom) {
  document.getElementById('room-code-input').value = urlRoom.toUpperCase();
}

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
        break;

      case 'stateUpdate':
        gameState = deserializeState(msg.state);
        if (msg.state.mergeEvents && msg.state.mergeEvents.length > 0) {
          msg.state.mergeEvents.forEach(evt => {
            renderer.spawnParticles(evt.col, evt.row, evt.toTier, 20);
            renderer.spawnScorePopup(evt.col, evt.row, evt.score, evt.chain);
          });
        }
        updateUI();
        checkGameOver();
        break;

      case 'error':
        showError(msg.message);
        break;
    }
  };

  ws.onclose = () => {
    setTimeout(() => {
      if (playerId) connectToServer(code, name);
    }, 2000);
  };
}

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// ── Game Screen Setup ─────────────────────────────────────────────────
function showGameScreen() {
  document.getElementById('join-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'flex';
  document.getElementById('display-name').textContent = playerName;

  setupActionButtons();
  resizeBoard();
  buildLegend();
  startRenderLoop();
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

// ── Board Sizing ──────────────────────────────────────────────────────
function resizeBoard() {
  const maxWidth = Math.min(window.innerWidth - 10, 420);
  cellSize = Math.floor(maxWidth / COLS);
  dragZoneH = Math.floor(cellSize * 1.6);       // space for next frog + "then" frog
  boardOffsetY = dragZoneH;
  boardCanvas.width = COLS * cellSize;
  boardCanvas.height = dragZoneH + ROWS * cellSize;
  renderer.cellSize = cellSize;
  renderer.offsetX = 0;
  renderer.offsetY = boardOffsetY;
  renderer.headerHeight = 0;
}

window.addEventListener('resize', () => {
  resizeBoard();
});

// ── Touch / Mouse Drag Handling ───────────────────────────────────────
function getCanvasPos(e) {
  const rect = boardCanvas.getBoundingClientRect();
  const scaleX = boardCanvas.width / rect.width;
  const scaleY = boardCanvas.height / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function colFromX(x) {
  const col = Math.floor(x / cellSize);
  return Math.max(0, Math.min(COLS - 1, col));
}

boardCanvas.addEventListener('touchstart', onDragStart, { passive: false });
boardCanvas.addEventListener('mousedown', onDragStart);

boardCanvas.addEventListener('touchmove', onDragMove, { passive: false });
boardCanvas.addEventListener('mousemove', onDragMove);

boardCanvas.addEventListener('touchend', onDragEnd);
boardCanvas.addEventListener('mouseup', onDragEnd);
boardCanvas.addEventListener('touchcancel', onDragCancel);
boardCanvas.addEventListener('mouseleave', onDragCancel);

function onDragStart(e) {
  e.preventDefault();
  if (!gameState || gameState.gameOver) return;
  const pos = getCanvasPos(e);
  dragging = true;
  dragX = pos.x;
  dragY = pos.y;
  hoverCol = colFromX(pos.x);
}

function onDragMove(e) {
  e.preventDefault();
  if (!dragging) return;
  const pos = getCanvasPos(e);
  dragX = pos.x;
  dragY = pos.y;
  hoverCol = colFromX(pos.x);
}

function onDragEnd(e) {
  if (!dragging) return;
  dragging = false;
  if (!gameState || gameState.gameOver) return;

  // Drop the frog into hoverCol
  const col = hoverCol;
  hoverCol = -1;
  if (col >= 0 && col < COLS && gameState.grid[col][0] === 0) {
    send({ type: 'drop', col });
  }
}

function onDragCancel() {
  dragging = false;
  hoverCol = -1;
}

// ── Render Loop ───────────────────────────────────────────────────────
function startRenderLoop() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  renderFrame();
}

function renderFrame() {
  renderBoard();
  updateUI();
  animFrameId = requestAnimationFrame(renderFrame);
}

function updateUI() {
  if (!gameState) return;
  document.getElementById('score-value').textContent = gameState.score;
  const undoBtn = document.getElementById('undo-btn');
  undoBtn.textContent = `Undo (${gameState.undoCount || 0})`;
  buildLegend();
}

function renderBoard() {
  if (!gameState) return;
  const ctx = boardCtx;
  const cs = cellSize;
  const w = boardCanvas.width;
  const h = boardCanvas.height;

  ctx.clearRect(0, 0, w, h);

  // ── Drag zone background ──
  ctx.fillStyle = '#101528';
  ctx.fillRect(0, 0, w, dragZoneH);

  // Separator line
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, dragZoneH);
  ctx.lineTo(w, dragZoneH);
  ctx.stroke();

  // ── "Then" frog (small, top-left) ──
  const thenSize = cs * 0.55;
  const thenX = 30;
  const thenY = dragZoneH * 0.35;
  ctx.font = `${Math.max(10, cs * 0.18)}px Arial, sans-serif`;
  ctx.fillStyle = '#777';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Then', thenX, thenY - thenSize * 0.42);
  drawFrogAt(ctx, thenX, thenY, gameState.previewFrog, thenSize);

  // ── "Next" frog (the one you drag) ──
  const nextSize = cs * 0.95;
  let nextX, nextY;
  if (dragging) {
    nextX = dragX;
    nextY = dragY;
  } else {
    nextX = w / 2;
    nextY = dragZoneH * 0.5;
  }

  // Draw instruction text
  if (!dragging) {
    ctx.font = `bold ${Math.max(12, cs * 0.24)}px Arial, sans-serif`;
    ctx.fillStyle = '#aaa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Drag the frog to a column', w / 2, dragZoneH - 6);
  }

  // ── Grid background ──
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, boardOffsetY, w, ROWS * cs);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cs, boardOffsetY);
    ctx.lineTo(c * cs, boardOffsetY + ROWS * cs);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, boardOffsetY + r * cs);
    ctx.lineTo(w, boardOffsetY + r * cs);
    ctx.stroke();
  }

  // ── Column highlight while dragging ──
  if (dragging && hoverCol >= 0) {
    const colFull = gameState.grid[hoverCol][0] !== 0;
    ctx.fillStyle = colFull
      ? 'rgba(244,67,54,0.15)'
      : 'rgba(76,175,80,0.18)';
    ctx.fillRect(hoverCol * cs, boardOffsetY, cs, ROWS * cs);

    // Also highlight in drag zone
    ctx.fillStyle = colFull
      ? 'rgba(244,67,54,0.10)'
      : 'rgba(76,175,80,0.10)';
    ctx.fillRect(hoverCol * cs, 0, cs, dragZoneH);

    // Ghost frog showing where it will land
    if (!colFull) {
      let landRow = -1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (gameState.grid[hoverCol][r] === 0) { landRow = r; break; }
      }
      if (landRow >= 0) {
        ctx.globalAlpha = 0.35;
        drawFrogAt(ctx, hoverCol * cs + cs / 2, boardOffsetY + landRow * cs + cs / 2, gameState.nextFrog, cs);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ── Draw placed frogs ──
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const tier = gameState.grid[c][r];
      if (tier > 0) {
        drawFrogAt(ctx, c * cs + cs / 2, boardOffsetY + r * cs + cs / 2, tier, cs);
      }
    }
  }

  // ── Particles and popups ──
  renderer.drawParticles();
  renderer.drawScorePopups();

  // ── Draw the draggable "next" frog on top of everything ──
  if (dragging) {
    // Scale up slightly while dragging for tactile feel
    drawFrogAt(ctx, nextX, nextY, gameState.nextFrog, nextSize * 1.15);
  } else {
    drawFrogAt(ctx, nextX, nextY, gameState.nextFrog, nextSize);
  }

  // ── Game over overlay on canvas ──
  if (gameState.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, boardOffsetY, w, ROWS * cs);
    ctx.font = `bold ${cs * 0.55}px Arial, sans-serif`;
    ctx.fillStyle = '#FF5555';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER', w / 2, boardOffsetY + ROWS * cs / 2);
  }
}

function drawFrogAt(ctx, x, y, tier, size) {
  const radius = size * 0.38;
  const tierInfo = FROG_TIERS[tier] || FROG_TIERS[1];

  // Body
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = tierInfo.color;
  ctx.fill();
  ctx.strokeStyle = darkenColor(tierInfo.color, 0.3);
  ctx.lineWidth = Math.max(1.5, size * 0.03);
  ctx.stroke();

  // Eyes
  const eyeOx = radius * 0.35;
  const eyeOy = -radius * 0.25;
  const eyeR = radius * 0.18;
  ctx.fillStyle = '#FFF';
  ctx.beginPath(); ctx.arc(x - eyeOx, y + eyeOy, eyeR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + eyeOx, y + eyeOy, eyeR, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  const pupilR = eyeR * 0.55;
  ctx.beginPath(); ctx.arc(x - eyeOx, y + eyeOy, pupilR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + eyeOx, y + eyeOy, pupilR, 0, Math.PI * 2); ctx.fill();

  // Smile
  ctx.beginPath();
  ctx.arc(x, y + radius * 0.05, radius * 0.25, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.stroke();

  // Number on tummy
  const numSize = Math.max(10, radius * 0.75);
  ctx.font = `bold ${numSize}px Arial, sans-serif`;
  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tierInfo.number.toString(), x, y + radius * 0.25);
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
