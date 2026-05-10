const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// All active rooms, keyed by room code.
const rooms = new Map();

const CLASH_WINDOW_MS = 200;
const ATTACK_COOLDOWN_MS = 500;

// --- Room helpers ---

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function createRoom(hostSocketId) {
  let code;
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  const room = {
    code,
    hostSocketId,
    players: [],
    // states: waiting | rules | countdown | battle | winner
    state: 'waiting',
    gameData: null,
    // Tracks in-flight countdown so we can cancel it if players leave.
    countdownActive: false,
  };

  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  if (!code) return null;
  return rooms.get(code.toUpperCase());
}

// Send the full room state to every socket in the room (host + both players).
function broadcastRoom(room) {
  io.to(room.code).emit('room_update', {
    code: room.code,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      health: p.health,
      isBlocking: p.isBlocking,
    })),
    state: room.state,
    gameData: room.gameData,
  });
}

// --- Game flow ---

function startGame(room) {
  // Do not start if the room disappeared or lost a player while we were waiting.
  if (!rooms.has(room.code) || room.players.length < 2) return;

  room.state = 'rules';
  room.countdownActive = true;

  room.players.forEach(p => {
    p.health = 5;
    p.isBlocking = false;
    p.lastAttackTime = 0;
  });

  broadcastRoom(room);

  // Show the rules screen for 5 seconds, then run the countdown.
  setTimeout(() => {
    if (!rooms.has(room.code) || !room.countdownActive) return;

    runCountdown(room, [3, 2, 1, 0]);
  }, 5000);
}

// Sends each countdown step 900ms apart, then transitions to battle.
function runCountdown(room, steps) {
  if (!steps.length) return;

  const step = steps[0];
  const remaining = steps.slice(1);

  room.state = 'countdown';
  room.gameData = { countdownStep: step };
  broadcastRoom(room);

  if (step === 0) {
    // "FIGHT" step — wait a beat then open battle.
    setTimeout(() => {
      if (!rooms.has(room.code) || !room.countdownActive) return;
      room.state = 'battle';
      room.gameData = null;
      room.countdownActive = false;
      broadcastRoom(room);
    }, 800);
    return;
  }

  setTimeout(() => {
    if (!rooms.has(room.code) || !room.countdownActive) return;
    runCountdown(room, remaining);
  }, 900);
}

// --- Socket events ---

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // HOST: creates a room and gets back the stable room code.
  socket.on('create_room', () => {
    const room = createRoom(socket.id);
    socket.join(room.code);
    socket.emit('room_created', { code: room.code });
    console.log(`Room ${room.code} created by host ${socket.id}`);
  });

  // PLAYER: joins an existing room by code.
  socket.on('join_room', ({ code, name }) => {
    const room = getRoom(code);
    if (!room) {
      socket.emit('join_error', { message: 'Room not found. Check the code and try again.' });
      return;
    }
    if (room.state !== 'waiting') {
      socket.emit('join_error', { message: 'Game already in progress.' });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('join_error', { message: 'Room is full.' });
      return;
    }
    if (!name || !name.trim()) {
      socket.emit('join_error', { message: 'Enter your name.' });
      return;
    }

    const player = {
      id: socket.id,
      name: name.trim().slice(0, 12),
      health: 5,
      isBlocking: false,
      lastAttackTime: 0,
    };

    room.players.push(player);
    socket.join(room.code);

    // Tell the joining player their index (0 = P1 blue, 1 = P2 red).
    socket.emit('joined_room', {
      code: room.code,
      playerIndex: room.players.length - 1,
    });

    broadcastRoom(room);
    console.log(`Player "${player.name}" joined room ${room.code} (slot ${room.players.length})`);

    // Auto-start when two players are in.
    if (room.players.length === 2) {
      // Short delay so the second player sees the "waiting" update first.
      setTimeout(() => startGame(room), 800);
    }
  });

  // PLAYER: sends an attack.
  socket.on('attack', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.state !== 'battle') return;

    const attacker = room.players.find(p => p.id === socket.id);
    const defender = room.players.find(p => p.id !== socket.id);
    if (!attacker || !defender) return;

    const now = Date.now();

    // Enforce per-player attack cooldown.
    if (now - attacker.lastAttackTime < ATTACK_COOLDOWN_MS) return;
    attacker.lastAttackTime = now;

    // Clash: defender also attacked within the clash window.
    if (now - (defender.lastAttackTime || 0) < CLASH_WINDOW_MS) {
      io.to(room.code).emit('clash', {
        attackerId: attacker.id,
        defenderId: defender.id,
        players: room.players.map(p => ({ id: p.id, name: p.name, health: p.health })),
      });
      return;
    }

    if (defender.isBlocking) {
      // Attack was blocked — no damage.
      io.to(room.code).emit('blocked', {
        attackerId: attacker.id,
        defenderId: defender.id,
        attackerName: attacker.name,
        defenderName: defender.name,
      });
      io.to(defender.id).emit('you_blocked');
      io.to(attacker.id).emit('your_attack_blocked');
    } else {
      // Clean hit — deal 1 damage.
      defender.health = Math.max(0, defender.health - 1);

      io.to(room.code).emit('hit', {
        attackerId: attacker.id,
        defenderId: defender.id,
        attackerName: attacker.name,
        defenderName: defender.name,
        players: room.players.map(p => ({ id: p.id, name: p.name, health: p.health })),
      });

      io.to(defender.id).emit('you_took_hit');
      io.to(attacker.id).emit('your_hit_landed');

      // Check win condition.
      if (defender.health <= 0) {
        room.state = 'winner';
        room.gameData = {
          winnerId: attacker.id,
          winnerName: attacker.name,
          loserId: defender.id,
          loserName: defender.name,
        };
        broadcastRoom(room);
      }
    }
  });

  // PLAYER: begins blocking.
  socket.on('block_start', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.state !== 'battle') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    player.isBlocking = true;
    io.to(room.code).emit('player_blocking', { playerId: socket.id, isBlocking: true });
  });

  // PLAYER: stops blocking.
  socket.on('block_end', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    player.isBlocking = false;
    io.to(room.code).emit('player_blocking', { playerId: socket.id, isBlocking: false });
  });

  // HOST: resets the room for a rematch.
  // The room CODE is preserved — only players and game state are cleared.
  socket.on('rematch', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    if (socket.id !== room.hostSocketId) return; // Only the host can reset.

    room.state = 'waiting';
    room.gameData = null;
    room.countdownActive = false;
    room.players = [];

    broadcastRoom(room);
    console.log(`Room ${room.code} reset for rematch`);
  });

  // Handle disconnects for both hosts and players.
  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);

    for (const [code, room] of rooms.entries()) {
      if (room.hostSocketId === socket.id) {
        // Host left — tear down the room and notify players.
        io.to(code).emit('host_disconnected');
        rooms.delete(code);
        break;
      }

      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        const playerName = room.players[playerIndex].name;
        room.players.splice(playerIndex, 1);

        // If a player leaves mid-game, return to waiting so a new player can join.
        if (room.state !== 'waiting' && room.state !== 'winner') {
          room.state = 'waiting';
          room.gameData = null;
          room.countdownActive = false;
        }

        broadcastRoom(room);
        console.log(`Player "${playerName}" left room ${code}`);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
