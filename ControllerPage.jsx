import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { useMotion } from "./useMotion";

const SERVER = import.meta.env.VITE_SERVER_URL || `http://129.12.120.52:3001`;
const MAX_SCORE = 5;

// ── Weapon SVG ────────────────────────────────────────────────────────────────
function Weapon({ slot, swinging }) {
  const color = slot === 0 ? "#e63946" : "#4cc9f0";
  return (
    <div style={{
      display: "flex", justifyContent: "center", alignItems: "center",
      flex: 1,
      animation: swinging ? "swing-anim 0.3s ease" : "float 3s ease-in-out infinite",
      filter: `drop-shadow(0 0 20px ${color})`,
    }}>
      <svg width="80" height="240" viewBox="0 0 80 240" fill="none">
        {/* Blade */}
        <polygon points="40,0 28,180 40,190 52,180" fill={color} opacity="0.9" />
        <polygon points="40,0 40,180 52,180" fill="white" opacity="0.15" />
        {/* Guard */}
        <rect x="16" y="178" width="48" height="12" rx="4" fill="#f5c842" />
        {/* Grip */}
        <rect x="34" y="190" width="12" height="46" rx="6" fill="#2a2a3e" />
        <rect x="36" y="194" width="8" height="6" rx="2" fill="#f5c84266" />
        <rect x="36" y="206" width="8" height="6" rx="2" fill="#f5c84266" />
        <rect x="36" y="218" width="8" height="6" rx="2" fill="#f5c84266" />
        {/* Pommel */}
        <circle cx="40" cy="238" r="8" fill="#f5c842" />
        {/* Glint */}
        <line x1="40" y1="10" x2="40" y2="40" stroke="white" strokeWidth="2" opacity="0.4" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ── Hit counter pips ──────────────────────────────────────────────────────────
function ScorePips({ score, slot }) {
  const color = slot === 0 ? "#e63946" : "#4cc9f0";
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      {Array.from({ length: MAX_SCORE }).map((_, i) => (
        <div key={i} style={{
          width: 12, height: 12, borderRadius: "50%",
          background: i < score ? color : "transparent",
          border: `2px solid ${i < score ? color : "#333"}`,
          boxShadow: i < score ? `0 0 8px ${color}` : "none",
          transition: "all 0.3s ease",
        }} />
      ))}
    </div>
  );
}

// ── Main controller ───────────────────────────────────────────────────────────
export default function ControllerPage() {
  const [phase, setPhase] = useState("name");    // name | permission | waiting | duel | gameover
  const [name, setName] = useState("");
  const [slot, setSlot] = useState(null);
  const [gamePhase, setGamePhase] = useState("waiting");
  const [players, setPlayers] = useState([]);
  const [countdown, setCountdown] = useState(null);
  const [swinging, setSwinging] = useState(false);
  const [myScore, setMyScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const [winner, setWinner] = useState(null);
  const [hitMe, setHitMe] = useState(false);
  const socketRef = useRef(null);
  const slotRef = useRef(null);

  // ── Socket setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SERVER);
    socketRef.current = socket;

    socket.on("state", (state) => {
      setGamePhase(state.phase);
      setPlayers(state.players);
      setWinner(state.winner);

      const me = state.players.find((p) => p.slot === slotRef.current);
      const opp = state.players.find((p) => p.slot !== slotRef.current);
      if (me) setMyScore(me.score);
      if (opp) setOppScore(opp.score);

      if (state.phase === "duel") setPhase("duel");
      if (state.phase === "gameover") setPhase("gameover");
      if (state.phase === "waiting" && slotRef.current !== null) setPhase("waiting");
    });

    socket.on("countdown", (n) => {
      setCountdown(n);
      if (n === 0) setTimeout(() => setCountdown(null), 900);
    });

    socket.on("hit", ({ defenderSlot }) => {
      if (defenderSlot === slotRef.current) {
        setHitMe(true);
        setTimeout(() => setHitMe(false), 400);
        // Vibrate
        if (navigator.vibrate) navigator.vibrate([80, 30, 120]);
      }
    });

    socket.on("join_rejected", (reason) => alert(`Cannot join: ${reason}`));

    return () => socket.disconnect();
  }, []);

  // ── Swing detection ───────────────────────────────────────────────────────
  const handleSwing = useCallback((magnitude) => {
    if (gamePhase !== "duel") return;
    setSwinging(true);
    setTimeout(() => setSwinging(false), 300);
    if (navigator.vibrate) navigator.vibrate(30);
    socketRef.current?.emit("swing", { magnitude });
  }, [gamePhase]);

  const { requestPermission } = useMotion({ onSwing: handleSwing, threshold: 16 });

  // ── Join flow ─────────────────────────────────────────────────────────────
  const handleJoin = async () => {
    if (!name.trim()) return;
    // Request motion permission (iOS)
    setPhase("permission");
    const granted = await requestPermission();
    if (!granted && /iPhone|iPad/.test(navigator.userAgent)) {
      alert("Motion permission denied. Swing detection may not work on iOS without permission.");
    }
    socketRef.current?.emit("join", { name: name.trim() });
    setPhase("waiting");
  };

  const handleSlotAssign = useCallback(() => {
    // Read slot from state when player list updates
    const me = players.find((p) => p.name === name.trim());
    if (me && slotRef.current === null) {
      slotRef.current = me.slot;
      setSlot(me.slot);
    }
  }, [players, name]);

  useEffect(() => { handleSlotAssign(); }, [handleSlotAssign]);

  const handleRematch = () => socketRef.current?.emit("rematch");

  // ── Colors ────────────────────────────────────────────────────────────────
  const color = slot === 0 ? "#e63946" : slot === 1 ? "#4cc9f0" : "#f5c842";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Saira+Condensed:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        body { background: #07070f; overflow: hidden; touch-action: none; }

        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(-4deg); }
          50%       { transform: translateY(-14px) rotate(-4deg); }
        }
        @keyframes swing-anim {
          0%   { transform: rotate(-4deg) translateX(0); }
          30%  { transform: rotate(30deg) translateX(40px); }
          70%  { transform: rotate(-15deg) translateX(-10px); }
          100% { transform: rotate(-4deg) translateX(0); }
        }
        @keyframes hit-shake {
          0%   { transform: translateX(0); }
          20%  { transform: translateX(-12px); }
          40%  { transform: translateX(12px); }
          60%  { transform: translateX(-8px); }
          80%  { transform: translateX(8px); }
          100% { transform: translateX(0); }
        }
        .screen { 
          width: 100vw; height: 100vh; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          font-family: 'Saira Condensed', sans-serif;
          color: #e8e8f0; padding: 24px; gap: 20px;
          position: relative;
        }
        .title { font-family: 'Bebas Neue', sans-serif; letter-spacing: 6px; }
        .btn {
          font-family: 'Bebas Neue', sans-serif; letter-spacing: 4px;
          border: none; cursor: pointer; border-radius: 2px;
          transition: all 0.15s ease;
        }
        .btn:active { transform: scale(0.95); }
        input {
          font-family: 'Bebas Neue', sans-serif; letter-spacing: 4px; font-size: 24px;
          background: #111122; color: #e8e8f0;
          border: 1px solid #333; border-radius: 2px;
          padding: 14px 20px; width: 100%; text-align: center;
          outline: none;
        }
        input:focus { border-color: #f5c842; box-shadow: 0 0 20px #f5c84233; }
        .hit-screen { animation: hit-shake 0.4s ease; }
      `}</style>

      {/* Name entry */}
      {phase === "name" && (
        <div className="screen" style={{ background: "#07070f" }}>
          <div style={{ fontSize: 11, letterSpacing: 8, color: "#f5c84266" }}>PHONE DUEL</div>
          <div className="title" style={{ fontSize: 48, color: "#f5c842" }}>ENTER NAME</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="WARRIOR"
            maxLength={12}
            autoFocus
          />
          <button
            className="btn"
            onClick={handleJoin}
            style={{
              width: "100%", padding: "18px",
              background: "#f5c842", color: "#07070f",
              fontSize: 28,
            }}
          >
            JOIN DUEL
          </button>
        </div>
      )}

      {/* Waiting */}
      {phase === "waiting" && (
        <div className="screen" style={{ background: "#07070f" }}>
          <div className="title" style={{ fontSize: 36, color }}>
            {slot === 0 ? "PLAYER 1" : "PLAYER 2"}
          </div>
          <div style={{ fontSize: 18, color: "#555", letterSpacing: 3 }}>
            WAITING FOR OPPONENT…
          </div>
          <div style={{
            width: 60, height: 60, borderRadius: "50%",
            border: `3px solid ${color}44`,
            borderTopColor: color,
            animation: "spin 1s linear infinite",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Countdown overlay on duel screen */}
      {(phase === "duel" || phase === "waiting") && countdown !== null && (
        <div style={{
          position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(7,7,15,0.7)", zIndex: 50,
        }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 160, color: "#f5c842",
            textShadow: "0 0 60px #f5c842",
            lineHeight: 1,
          }}>
            {countdown > 0 ? countdown : "FIGHT!"}
          </div>
        </div>
      )}

      {/* Duel */}
      {phase === "duel" && (
        <div
          className={`screen ${hitMe ? "hit-screen" : ""}`}
          style={{
            background: hitMe
              ? `radial-gradient(ellipse at center, ${color}33 0%, #07070f 70%)`
              : "#07070f",
            transition: "background 0.2s ease",
            justifyContent: "space-between",
            paddingTop: 40, paddingBottom: 40,
          }}
        >
          {/* Score row */}
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, letterSpacing: 3, color: "#555" }}>
              <span>YOU</span>
              <span>OPP</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <ScorePips score={myScore} slot={slot} />
              <div style={{ fontSize: 11, letterSpacing: 4, color: "#333" }}>HITS</div>
              <ScorePips score={oppScore} slot={slot === 0 ? 1 : 0} />
            </div>
          </div>

          {/* Weapon */}
          <Weapon slot={slot} swinging={swinging} />

          {/* Swing instructions */}
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 42, color,
              letterSpacing: 4,
              textShadow: `0 0 20px ${color}88`,
            }}>
              SWING!
            </div>
            <div style={{ fontSize: 12, letterSpacing: 4, color: "#444", marginTop: 4 }}>
              SHAKE YOUR PHONE TO ATTACK
            </div>
            {/* Fallback tap button for desktop testing */}
            <button
              className="btn"
              onPointerDown={() => handleSwing(20)}
              style={{
                marginTop: 16, padding: "12px 32px",
                background: "#ffffff0a", color: "#555",
                fontSize: 13, letterSpacing: 3, border: "1px solid #222",
              }}
            >
              TAP TO SWING (TESTING)
            </button>
          </div>
        </div>
      )}

      {/* Game over */}
      {phase === "gameover" && (
        <div className="screen" style={{ background: "#07070f" }}>
          {winner === slot ? (
            <>
              <div style={{ fontSize: 13, letterSpacing: 8, color: "#f5c84288" }}>VICTORY</div>
              <div className="title" style={{ fontSize: 64, color: "#f5c842", textShadow: "0 0 40px #f5c842" }}>
                YOU WIN
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, letterSpacing: 8, color: "#55555599" }}>DEFEATED</div>
              <div className="title" style={{ fontSize: 64, color: "#555" }}>YOU LOSE</div>
            </>
          )}
          <button
            className="btn"
            onClick={handleRematch}
            style={{
              padding: "18px 48px", marginTop: 12,
              background: "#f5c842", color: "#07070f", fontSize: 28,
            }}
          >
            REMATCH
          </button>
        </div>
      )}
    </>
  );
}
