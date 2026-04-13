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

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

// ── Room management ──────────────────────────────────────────────────
const MAX_PLAYERS = 15;
const rooms = new Map(); // roomCode -> Room

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateRoomCode() : code;
}

function createRoom() {
  const code = generateRoomCode();
  const room = {
    code,
    players: new Map(),   // playerId -> { ws, name, gameState, role }
    tvClients: new Set(),  // WebSocket connections from TV screens
    nextPlayerId: 1,
  };
  rooms.set(code, room);
  return room;
}

function broadcastToTV(room) {
  const playerData = [];
  for (const [id, p] of room.players) {
    playerData.push({
      id,
      name: p.name,
      state: serializeState(p.gameState),
    });
  }
  const msg = JSON.stringify({ type: 'gameUpdate', players: playerData });
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
  let role = null; // 'player' or 'tv'

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      // ── TV creates a new room ──
      case 'createRoom': {
        const room = createRoom();
        currentRoom = room;
        role = 'tv';
        room.tvClients.add(ws);
        const joinUrl = `${BASE_URL}/phone.html?room=${room.code}`;
        QRCode.toDataURL(joinUrl, {
          width: 280,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        }).then(qrDataUrl => {
          ws.send(JSON.stringify({
            type: 'roomCreated',
            code: room.code,
            joinUrl,
            qrCode: qrDataUrl,
          }));
        }).catch(() => {
          ws.send(JSON.stringify({
            type: 'roomCreated',
            code: room.code,
            joinUrl,
            qrCode: null,
          }));
        });
        break;
      }

      // ── TV joins an existing room ──
      case 'tvJoin': {
        const room = rooms.get(msg.code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
          return;
        }
        currentRoom = room;
        role = 'tv';
        room.tvClients.add(ws);
        broadcastToTV(room);
        broadcastPlayerList(room);
        break;
      }

      // ── Player joins a room ──
      case 'joinRoom': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found. Check the code on the TV screen.' }));
          return;
        }
        if (room.players.size >= MAX_PLAYERS) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room is full (max 15 players).' }));
          return;
        }
        const name = (msg.name || 'Player').substring(0, 16);
        playerId = room.nextPlayerId++;
        const gameState = createGameState();
        room.players.set(playerId, { ws, name, gameState, role: 'player' });
        currentRoom = room;
        role = 'player';

        ws.send(JSON.stringify({
          type: 'joined',
          playerId,
          name,
          state: serializeState(gameState),
        }));
        broadcastToTV(room);
        broadcastPlayerList(room);
        break;
      }

      // ── Player drops a frog ──
      case 'drop': {
        if (!currentRoom || role !== 'player') return;
        const player = currentRoom.players.get(playerId);
        if (!player) return;
        const col = parseInt(msg.col);
        if (isNaN(col)) return;

        const success = dropFrog(player.gameState, col);
        if (success) {
          ws.send(JSON.stringify({
            type: 'stateUpdate',
            state: serializeState(player.gameState),
          }));
          broadcastToTV(currentRoom);
        }
        break;
      }

      // ── Player undoes ──
      case 'undo': {
        if (!currentRoom || role !== 'player') return;
        const player = currentRoom.players.get(playerId);
        if (!player) return;

        if (undo(player.gameState)) {
          ws.send(JSON.stringify({
            type: 'stateUpdate',
            state: serializeState(player.gameState),
          }));
          broadcastToTV(currentRoom);
        }
        break;
      }

      // ── Player restarts ──
      case 'restart': {
        if (!currentRoom || role !== 'player') return;
        const player = currentRoom.players.get(playerId);
        if (!player) return;
        const bestScore = player.gameState.bestScore;
        player.gameState = createGameState();
        player.gameState.bestScore = bestScore;
        ws.send(JSON.stringify({
          type: 'stateUpdate',
          state: serializeState(player.gameState),
        }));
        broadcastToTV(currentRoom);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!currentRoom) return;
    if (role === 'tv') {
      currentRoom.tvClients.delete(ws);
      // If no TV clients and no players, clean up room
      if (currentRoom.tvClients.size === 0 && currentRoom.players.size === 0) {
        rooms.delete(currentRoom.code);
      }
    } else if (role === 'player' && playerId) {
      currentRoom.players.delete(playerId);
      broadcastToTV(currentRoom);
      broadcastPlayerList(currentRoom);
      if (currentRoom.tvClients.size === 0 && currentRoom.players.size === 0) {
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
