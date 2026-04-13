/**
 * Phone Controller - Drag & drop frogs with sound + timer
 */

let ws = null;
let playerId = null;
let gameState = null;
let playerName = '';
let timeLeft = 90;
let lastTickSec = -1;

const boardCanvas = document.getElementById('phone-board-canvas');
const boardCtx = boardCanvas.getContext('2d');
const renderer = new FrogRenderer(boardCanvas);

// ── Drag state ────────────────────────────────────────────────────────
let dragging = false;
let dragX = 0;
let dragY = 0;
let hoverCol = -1;
let dragZoneH = 0;
let cellSize = 60;
let boardOffsetY = 0;
let animFrameId = null;

// ── Detect QR-based join (room code in URL) ──
const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get('room');
let activeErrorEl = 'join-error';

if (urlRoom) {
  // QR join mode: show simplified screen
  document.getElementById('manual-join').style.display = 'none';
  document.getElementById('qr-join').style.display = 'block';
  document.getElementById('qr-room-code').textContent = urlRoom.toUpperCase();
  activeErrorEl = 'join-error-qr';

  document.getElementById('join-btn-qr').addEventListener('click', joinViaQR);
  document.getElementById('name-input-qr').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinViaQR();
  });
} else {
  // Manual join mode
  document.getElementById('qr-join').style.display = 'none';
  document.getElementById('manual-join').style.display = 'block';

  document.getElementById('join-btn').addEventListener('click', joinManual);
  document.getElementById('room-code-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinManual();
  });
}

function joinViaQR() {
  const name = document.getElementById('name-input-qr').value.trim() || 'Player';
  const code = urlRoom.toUpperCase().trim();
  if (code.length !== 4) { showError('Invalid room code in link'); return; }
  playerName = name;
  sfx.init(); sfx.resume();
  connectToServer(code, name);
}

function joinManual() {
  const name = document.getElementById('name-input').value.trim() || 'Player';
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (code.length !== 4) { showError('Please enter the 4-letter room code from the TV'); return; }
  playerName = name;
  sfx.init(); sfx.resume();
  connectToServer(code, name);
}

function showError(msg) {
  document.getElementById(activeErrorEl).textContent = msg;
}

// ── WebSocket ──
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
        timeLeft = msg.timeLeft !== undefined ? msg.timeLeft : 90;
        showGameScreen();
        sfx.playRoundStart();
        break;

      case 'stateUpdate':
        const prevScore = gameState ? gameState.score : 0;
        gameState = deserializeState(msg.state);
        if (msg.timeLeft !== undefined) timeLeft = msg.timeLeft;
        if (msg.state.mergeEvents && msg.state.mergeEvents.length > 0) {
          msg.state.mergeEvents.forEach(evt => {
            renderer.spawnParticles(evt.col, evt.row, evt.toTier, 25);
            renderer.spawnScorePopup(evt.col, evt.row, evt.score, evt.chain);
            if (evt.chain > 0) sfx.playChain(evt.chain);
            else sfx.playMerge(evt.toTier);
          });
        }
        checkGameOver();
        break;

      case 'timer':
        timeLeft = msg.timeLeft;
        handleTimerTick();
        break;

      case 'roundStart':
        timeLeft = msg.duration;
        lastTickSec = -1;
        hideGameOver();
        sfx.playRoundStart();
        break;

      case 'roundEnd':
        timeLeft = 0;
        sfx.playTimeUp();
        showRoundResults(msg.rankings);
        break;

      case 'error':
        showError(msg.message);
        break;
    }
  };

  ws.onclose = () => {
    setTimeout(() => { if (playerId) connectToServer(code, name); }, 2000);
  };
}

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function handleTimerTick() {
  if (timeLeft === lastTickSec) return;
  lastTickSec = timeLeft;
  if (timeLeft <= 5 && timeLeft > 0) sfx.playUrgentTick();
  else if (timeLeft <= 10 && timeLeft > 0) sfx.playTick();
}

// ── Game Screen Setup ──
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
  document.getElementById('undo-btn').addEventListener('click', () => { send({ type: 'undo' }); });
  document.getElementById('restart-btn').addEventListener('click', () => {
    if (confirm('Start over? Your score will reset.')) { send({ type: 'restart' }); hideGameOver(); }
  });
  document.getElementById('restart-overlay-btn').addEventListener('click', () => {
    send({ type: 'restart' }); hideGameOver();
  });
}

// ── Board Sizing ──
function resizeBoard() {
  const maxWidth = Math.min(window.innerWidth - 10, 420);
  cellSize = Math.floor(maxWidth / COLS);
  dragZoneH = Math.floor(cellSize * 1.6);
  boardOffsetY = dragZoneH;
  boardCanvas.width = COLS * cellSize;
  boardCanvas.height = dragZoneH + ROWS * cellSize;
  renderer.cellSize = cellSize;
  renderer.offsetX = 0;
  renderer.offsetY = boardOffsetY;
  renderer.headerHeight = 0;
}

window.addEventListener('resize', () => { resizeBoard(); });

// ── Touch / Mouse Drag ──
function getCanvasPos(e) {
  const rect = boardCanvas.getBoundingClientRect();
  const scaleX = boardCanvas.width / rect.width;
  const scaleY = boardCanvas.height / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function colFromX(x) { return Math.max(0, Math.min(COLS - 1, Math.floor(x / cellSize))); }

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
  sfx.resume();
  if (!gameState || gameState.gameOver || timeLeft <= 0) return;
  const pos = getCanvasPos(e);
  dragging = true; dragX = pos.x; dragY = pos.y; hoverCol = colFromX(pos.x);
}

function onDragMove(e) {
  e.preventDefault();
  if (!dragging) return;
  const pos = getCanvasPos(e);
  dragX = pos.x; dragY = pos.y; hoverCol = colFromX(pos.x);
}

function onDragEnd() {
  if (!dragging) return;
  dragging = false;
  if (!gameState || gameState.gameOver || timeLeft <= 0) return;
  const col = hoverCol;
  hoverCol = -1;
  if (col >= 0 && col < COLS && gameState.grid[col][0] === 0) {
    sfx.playDrop();
    send({ type: 'drop', col });
  }
}

function onDragCancel() { dragging = false; hoverCol = -1; }

// ── Render Loop ──
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
  document.getElementById('undo-btn').textContent = `Undo (${gameState.undoCount || 0})`;

  // Timer display
  const timerEl = document.getElementById('timer-value');
  if (timerEl) {
    timerEl.textContent = timeLeft;
    timerEl.className = timeLeft <= 10 ? 'timer-urgent' : '';
  }

  buildLegend();
}

function renderBoard() {
  if (!gameState) return;
  const ctx = boardCtx;
  const cs = cellSize;
  const w = boardCanvas.width;

  ctx.clearRect(0, 0, w, boardCanvas.height);

  // ── Drag zone ──
  ctx.fillStyle = '#101528';
  ctx.fillRect(0, 0, w, dragZoneH);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, dragZoneH); ctx.lineTo(w, dragZoneH); ctx.stroke();

  // Timer in drag zone (top right)
  ctx.font = `bold ${Math.max(14, cs * 0.32)}px Arial, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = timeLeft <= 10 ? '#FF5555' : '#6dd3f5';
  ctx.fillText(`${timeLeft}s`, w - 8, 6);

  // "Then" frog (small, top-left)
  const thenSize = cs * 0.55;
  const thenX = 30;
  const thenY = dragZoneH * 0.35;
  ctx.font = `${Math.max(10, cs * 0.18)}px Arial, sans-serif`;
  ctx.fillStyle = '#777'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('Then', thenX, thenY - thenSize * 0.48);
  drawFrogShape(ctx, thenX, thenY, gameState.previewFrog, thenSize);

  // "Next" frog
  const nextSize = cs * 0.95;
  let nextX = w / 2, nextY = dragZoneH * 0.5;
  if (dragging) { nextX = dragX; nextY = dragY; }

  if (!dragging && timeLeft > 0 && !gameState.gameOver) {
    ctx.font = `bold ${Math.max(12, cs * 0.22)}px Arial, sans-serif`;
    ctx.fillStyle = '#aaa'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('Drag the frog to a column', w / 2, dragZoneH - 6);
  }

  // ── Grid ──
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, boardOffsetY, w, ROWS * cs);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * cs, boardOffsetY); ctx.lineTo(c * cs, boardOffsetY + ROWS * cs); ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, boardOffsetY + r * cs); ctx.lineTo(w, boardOffsetY + r * cs); ctx.stroke();
  }

  // Column highlight
  if (dragging && hoverCol >= 0) {
    const colFull = gameState.grid[hoverCol][0] !== 0;
    ctx.fillStyle = colFull ? 'rgba(244,67,54,0.15)' : 'rgba(76,175,80,0.18)';
    ctx.fillRect(hoverCol * cs, boardOffsetY, cs, ROWS * cs);
    ctx.fillStyle = colFull ? 'rgba(244,67,54,0.10)' : 'rgba(76,175,80,0.10)';
    ctx.fillRect(hoverCol * cs, 0, cs, dragZoneH);

    if (!colFull) {
      let landRow = -1;
      for (let r = ROWS - 1; r >= 0; r--) { if (gameState.grid[hoverCol][r] === 0) { landRow = r; break; } }
      if (landRow >= 0) {
        ctx.globalAlpha = 0.3;
        drawFrogShape(ctx, hoverCol * cs + cs / 2, boardOffsetY + landRow * cs + cs / 2, gameState.nextFrog, cs);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Placed frogs
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const tier = gameState.grid[c][r];
      if (tier > 0) {
        drawFrogShape(ctx, c * cs + cs / 2, boardOffsetY + r * cs + cs / 2, tier, cs);
      }
    }
  }

  renderer.drawParticles();
  renderer.drawScorePopups();

  // Dragged frog on top
  if (dragging) {
    drawFrogShape(ctx, nextX, nextY, gameState.nextFrog, nextSize * 1.15);
  } else if (timeLeft > 0 && !gameState.gameOver) {
    drawFrogShape(ctx, nextX, nextY, gameState.nextFrog, nextSize);
  }

  // Time's up / game over overlay
  if (gameState.gameOver || timeLeft <= 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, boardOffsetY, w, ROWS * cs);
    ctx.font = `bold ${cs * 0.55}px Arial, sans-serif`;
    ctx.fillStyle = timeLeft <= 0 ? '#FFD700' : '#FF5555';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(timeLeft <= 0 ? "TIME'S UP!" : 'GAME OVER', w / 2, boardOffsetY + ROWS * cs / 2);
  }
}

// ── Legend ──
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

// ── Game Over / Round End ──
function checkGameOver() {
  if (gameState && gameState.gameOver) {
    sfx.playGameOver();
    document.getElementById('final-score').textContent = `Score: ${gameState.score}`;
    document.getElementById('best-score-display').textContent = `Best: ${gameState.bestScore}`;
    document.getElementById('game-over-overlay').classList.add('visible');
  }
}

function showRoundResults(rankings) {
  const overlay = document.getElementById('game-over-overlay');
  const title = overlay.querySelector('h2');
  title.textContent = "Time's Up!";
  title.style.color = '#FFD700';
  document.getElementById('final-score').textContent = `Score: ${gameState ? gameState.score : 0}`;
  document.getElementById('best-score-display').textContent =
    rankings ? rankings.map((r, i) => `#${i + 1} ${r.name}: ${r.score}`).join('  |  ') : '';
  overlay.classList.add('visible');
}

function hideGameOver() {
  const overlay = document.getElementById('game-over-overlay');
  overlay.classList.remove('visible');
  const title = overlay.querySelector('h2');
  title.textContent = 'Game Over!';
  title.style.color = '#F44336';
}
