import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();
const io = new Server(httpServer, { cors: { origin: "*" } });

// ─── Constants ─────────────────────────────────────────────────────────────────
const MAX_SCORE = 5;
const HIT_COOLDOWN_MS = 800;

let room = freshRoom();

function freshRoom() {
  return {
    players: {},      // socketId → { name, slot: 0|1, score, lastHit }
    phase: "waiting", // waiting | countdown | duel | gameover
    winner: null,
  };
}

function getSlots() {
  return Object.values(room.players).map((p) => p.slot);
}

function sanitize(r) {
  const players = Object.entries(r.players).map(([id, p]) => ({
    id, name: p.name, slot: p.slot, score: p.score,
  }));
  return { players, phase: r.phase, winner: r.winner };
}

function broadcast() {
  io.emit("state", sanitize(room));
}

function startCountdown() {
  room.phase = "countdown";
  broadcast();
  let count = 3;
  const tick = setInterval(() => {
    io.emit("countdown", count);
    count--;
    if (count < 0) {
      clearInterval(tick);
      room.phase = "duel";
      broadcast();
    }
  }, 1000);
}

// ─── Socket handlers ───────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[+] ${socket.id}`);

  socket.on("join", ({ name }) => {
    const usedSlots = getSlots();
    if (usedSlots.length >= 2) { socket.emit("join_rejected", "Room full"); return; }
    const slot = usedSlots.includes(0) ? 1 : 0;
    room.players[socket.id] = { name: name || `Player ${slot + 1}`, slot, score: 0, lastHit: 0 };
    socket.join("game");
    broadcast();
    console.log(`  ${name} → slot ${slot}`);
    if (getSlots().length === 2 && room.phase === "waiting") setTimeout(startCountdown, 600);
  });

  socket.on("join_arena", () => {
    socket.join("game");
    socket.emit("state", sanitize(room));
  });

  socket.on("swing", ({ magnitude }) => {
    if (room.phase !== "duel") return;
    const attacker = room.players[socket.id];
    if (!attacker) return;
    const now = Date.now();
    if (now - attacker.lastHit < HIT_COOLDOWN_MS) return;
    attacker.lastHit = now;

    const defender = Object.values(room.players).find((p) => p.slot !== attacker.slot);
    if (!defender) return;

    attacker.score++;
    io.emit("hit", { attackerSlot: attacker.slot, defenderSlot: defender.slot, magnitude });
    broadcast();

    if (defender.score >= MAX_SCORE) {
      room.phase = "gameover";
      room.winner = attacker.slot;
      broadcast();
    }
  });

  socket.on("rematch", () => {
    if (room.phase !== "gameover") return;
    Object.values(room.players).forEach((p) => { p.score = 0; p.lastHit = 0; });
    room.phase = "waiting";
    room.winner = null;
    broadcast();
    setTimeout(startCountdown, 600);
  });

  socket.on("disconnect", () => {
    console.log(`[-] ${socket.id}`);
    if (room.players[socket.id]) {
      delete room.players[socket.id];
      if (room.phase !== "waiting") room = freshRoom();
      broadcast();
    }
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => console.log(`⚔  Phone Duel server → http://localhost:${PORT}`));
