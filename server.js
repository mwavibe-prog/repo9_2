const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const QRCode = require('qrcode');
const {
  COLS, ROWS, MAX_TIER, FROG_TIERS,
  createGameState, dropFrog, undo, serializeState,
} = require('./public/js/game-logic.js');

const BASE_URL = process.env.BASE_URL || 'https://repo92-production.up.railway.app';
const ROUND_DURATION = 90; // seconds

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

// ── Room management ──────────────────────────────────────────────────
const MAX_PLAYERS = 15;
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateRoomCode() : code;
}

function createRoom() {
  const code = generateRoomCode();
  const room = {
    code,
    players: new Map(),
    tvClients: new Set(),
    nextPlayerId: 1,
    roundStartTime: null,   // set when first player joins or round starts
    roundTimer: null,        // interval handle
    roundEnded: false,
  };
  rooms.set(code, room);
  return room;
}

function getTimeLeft(room) {
  if (!room.roundStartTime) return ROUND_DURATION;
  const elapsed = Math.floor((Date.now() - room.roundStartTime) / 1000);
  return Math.max(0, ROUND_DURATION - elapsed);
}

function startRound(room) {
  if (room.roundTimer) clearInterval(room.roundTimer);
  room.roundStartTime = Date.now();
  room.roundEnded = false;

  // Reset all players
  for (const [, p] of room.players) {
    const bestScore = p.gameState.bestScore;
    p.gameState = createGameState();
    p.gameState.bestScore = bestScore;
  }

  // Broadcast round start
  broadcastTimer(room);
  broadcastToTV(room);
  broadcastAll(room, { type: 'roundStart', duration: ROUND_DURATION });

  // Tick every second
  room.roundTimer = setInterval(() => {
    const left = getTimeLeft(room);
    broadcastTimer(room);
    if (left <= 0) {
      endRound(room);
    }
  }, 1000);
}

function endRound(room) {
  if (room.roundEnded) return;
  room.roundEnded = true;
  if (room.roundTimer) {
    clearInterval(room.roundTimer);
    room.roundTimer = null;
  }

  // Mark all players as game over
  for (const [, p] of room.players) {
    p.gameState.gameOver = true;
    if (p.gameState.score > p.gameState.bestScore) {
      p.gameState.bestScore = p.gameState.score;
    }
  }

  // Build final rankings
  const rankings = [];
  for (const [id, p] of room.players) {
    rankings.push({ id, name: p.name, score: p.gameState.score });
  }
  rankings.sort((a, b) => b.score - a.score);

  broadcastAll(room, { type: 'roundEnd', rankings, timeLeft: 0 });
  broadcastToTV(room);

  // Send updated state to each player
  for (const [, p] of room.players) {
    if (p.ws.readyState === 1) {
      p.ws.send(JSON.stringify({
        type: 'stateUpdate',
        state: serializeState(p.gameState),
        timeLeft: 0,
      }));
    }
  }
}

function broadcastTimer(room) {
  const timeLeft = getTimeLeft(room);
  const msg = JSON.stringify({ type: 'timer', timeLeft });
  for (const tvWs of room.tvClients) {
    if (tvWs.readyState === 1) tvWs.send(msg);
  }
  for (const [, p] of room.players) {
    if (p.ws.readyState === 1) p.ws.send(msg);
  }
}

function broadcastAll(room, data) {
  const msg = JSON.stringify(data);
  for (const tvWs of room.tvClients) {
    if (tvWs.readyState === 1) tvWs.send(msg);
  }
  for (const [, p] of room.players) {
    if (p.ws.readyState === 1) p.ws.send(msg);
  }
}

function broadcastToTV(room) {
  const timeLeft = getTimeLeft(room);
  const playerData = [];
  for (const [id, p] of room.players) {
    playerData.push({ id, name: p.name, state: serializeState(p.gameState) });
  }
  const msg = JSON.stringify({ type: 'gameUpdate', players: playerData, timeLeft });
  for (const tvWs of room.tvClients) {
    if (tvWs.readyState === 1) tvWs.send(msg);
  }
}

function broadcastPlayerList(room) {
  const list = [];
  for (const [id, p] of room.players) {
    list.push({ id, name: p.name, score: p.gameState.score });
  }
  const msg = JSON.stringify({ type: 'playerList', players: list });
  for (const tvWs of room.tvClients) {
    if (tvWs.readyState === 1) tvWs.send(msg);
  }
  for (const [, p] of room.players) {
    if (p.ws.readyState === 1) p.ws.send(msg);
  }
}

// ── WebSocket handling ───────────────────────────────────────────────
wss.on('connection', (ws) => {
  let currentRoom = null;
  let playerId = null;
  let role = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'createRoom': {
        const room = createRoom();
        currentRoom = room;
        role = 'tv';
        room.tvClients.add(ws);
        // Use the origin sent by the TV client so the QR code always
        // points to the correct server (works on localhost AND production)
        const origin = msg.origin || BASE_URL;
        const joinUrl = `${origin}/phone.html?room=${room.code}`;
        QRCode.toDataURL(joinUrl, {
          width: 280, margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        }).then(qrDataUrl => {
          ws.send(JSON.stringify({
            type: 'roomCreated', code: room.code, joinUrl, qrCode: qrDataUrl,
          }));
        }).catch(() => {
          ws.send(JSON.stringify({
            type: 'roomCreated', code: room.code, joinUrl, qrCode: null,
          }));
        });
        break;
      }

      case 'tvJoin': {
        const room = rooms.get(msg.code);
        if (!room) { ws.send(JSON.stringify({ type: 'error', message: 'Room not found' })); return; }
        currentRoom = room;
        role = 'tv';
        room.tvClients.add(ws);
        broadcastToTV(room);
        broadcastPlayerList(room);
        break;
      }

      case 'joinRoom': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) { ws.send(JSON.stringify({ type: 'error', message: 'Room not found. Check the code on the TV screen.' })); return; }
        if (room.players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ type: 'error', message: 'Room is full (max 15 players).' })); return; }
        if (room.roundEnded) { ws.send(JSON.stringify({ type: 'error', message: 'Round ended. Wait for the host to start a new round.' })); return; }

        const name = (msg.name || 'Player').substring(0, 16);
        playerId = room.nextPlayerId++;
        const gameState = createGameState();
        room.players.set(playerId, { ws, name, gameState, role: 'player' });
        currentRoom = room;
        role = 'player';

        // Auto-start round when first player joins
        if (!room.roundStartTime) {
          startRound(room);
        }

        const timeLeft = getTimeLeft(room);
        ws.send(JSON.stringify({
          type: 'joined', playerId, name,
          state: serializeState(gameState),
          timeLeft, duration: ROUND_DURATION,
        }));
        broadcastToTV(room);
        broadcastPlayerList(room);
        break;
      }

      case 'drop': {
        if (!currentRoom || role !== 'player') return;
        if (currentRoom.roundEnded) return;
        const player = currentRoom.players.get(playerId);
        if (!player) return;
        const col = parseInt(msg.col);
        if (isNaN(col)) return;

        const success = dropFrog(player.gameState, col);
        if (success) {
          const timeLeft = getTimeLeft(currentRoom);
          ws.send(JSON.stringify({
            type: 'stateUpdate',
            state: serializeState(player.gameState),
            timeLeft,
          }));
          broadcastToTV(currentRoom);
        }
        break;
      }

      case 'undo': {
        if (!currentRoom || role !== 'player') return;
        if (currentRoom.roundEnded) return;
        const player = currentRoom.players.get(playerId);
        if (!player) return;
        if (undo(player.gameState)) {
          const timeLeft = getTimeLeft(currentRoom);
          ws.send(JSON.stringify({
            type: 'stateUpdate',
            state: serializeState(player.gameState),
            timeLeft,
          }));
          broadcastToTV(currentRoom);
        }
        break;
      }

      case 'restart': {
        if (!currentRoom || role !== 'player') return;
        if (currentRoom.roundEnded) return;
        const player = currentRoom.players.get(playerId);
        if (!player) return;
        const bestScore = player.gameState.bestScore;
        player.gameState = createGameState();
        player.gameState.bestScore = bestScore;
        const timeLeft = getTimeLeft(currentRoom);
        ws.send(JSON.stringify({
          type: 'stateUpdate',
          state: serializeState(player.gameState),
          timeLeft,
        }));
        broadcastToTV(currentRoom);
        break;
      }

      // ── TV starts a new round ──
      case 'newRound': {
        if (!currentRoom || role !== 'tv') return;
        startRound(currentRoom);
        broadcastPlayerList(currentRoom);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!currentRoom) return;
    if (role === 'tv') {
      currentRoom.tvClients.delete(ws);
      if (currentRoom.tvClients.size === 0 && currentRoom.players.size === 0) {
        if (currentRoom.roundTimer) clearInterval(currentRoom.roundTimer);
        rooms.delete(currentRoom.code);
      }
    } else if (role === 'player' && playerId) {
      currentRoom.players.delete(playerId);
      broadcastToTV(currentRoom);
      broadcastPlayerList(currentRoom);
      if (currentRoom.tvClients.size === 0 && currentRoom.players.size === 0) {
        if (currentRoom.roundTimer) clearInterval(currentRoom.roundTimer);
        rooms.delete(currentRoom.code);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Frog Drop server running on port ${PORT}`);
  console.log(`TV screen:  http://localhost:${PORT}/tv.html`);
  console.log(`Phone join: http://localhost:${PORT}/phone.html`);
});
