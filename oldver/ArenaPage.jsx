import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

const SERVER = import.meta.env.VITE_SERVER_URL || `http://129.12.120.52:3001`;
const MAX_SCORE = 5;

// ── QR via Google Charts (no dep needed) ──────────────────────────────────────
function QRCode({ url, size = 160 }) {
  const encoded = encodeURIComponent(url);
  return (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&bgcolor=0a0a0f&color=f5c842&margin=6`}
      alt="QR"
      style={{ width: size, height: size, borderRadius: 8, display: "block" }}
    />
  );
}



// ── Fighter SVG characters ────────────────────────────────────────────────────
function Fighter({ slot, hit, attacking }) {
  const flip = slot === 1;
  const color = slot === 0 ? "#e63946" : "#4cc9f0";
  const shakeClass = hit ? "fighter-hit" : attacking ? "fighter-attack" : "";

  return (
    <div
      className={`fighter ${shakeClass}`}
      style={{
        transform: flip ? "scaleX(-1)" : "scaleX(1)",
        filter: hit ? `drop-shadow(0 0 20px ${color})` : `drop-shadow(0 0 6px ${color})`,
      }}
    >
      <svg width="90" height="160" viewBox="0 0 90 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Head */}
        <circle cx="45" cy="22" r="18" fill={color} opacity="0.9" />
        <circle cx="38" cy="19" r="3" fill="#0a0a0f" />
        <circle cx="52" cy="19" r="3" fill="#0a0a0f" />
        <path d="M39 28 Q45 33 51 28" stroke="#0a0a0f" strokeWidth="2" strokeLinecap="round" fill="none" />
        {/* Body */}
        <rect x="28" y="42" width="34" height="52" rx="6" fill={color} opacity="0.85" />
        {/* Belt */}
        <rect x="28" y="70" width="34" height="7" rx="2" fill="#0a0a0f" opacity="0.5" />
        {/* Arms */}
        <rect x="8" y="44" width="18" height="10" rx="5" fill={color} opacity="0.8" />
        <rect x="64" y="44" width="18" height="10" rx="5" fill={color} opacity="0.8" />
        {/* Weapon (right arm extended) */}
        <rect x="72" y="38" width="6" height="50" rx="3" fill="#f5c842" opacity="0.9" />
        <polygon points="75,30 71,40 79,40" fill="#f5c842" />
        {/* Legs */}
        <rect x="30" y="96" width="12" height="52" rx="6" fill={color} opacity="0.8" />
        <rect x="48" y="96" width="12" height="52" rx="6" fill={color} opacity="0.8" />
        {/* Feet */}
        <ellipse cx="36" cy="150" rx="10" ry="5" fill={color} opacity="0.7" />
        <ellipse cx="54" cy="150" rx="10" ry="5" fill={color} opacity="0.7" />
      </svg>
    </div>
  );
}

// ── Health bar ────────────────────────────────────────────────────────────────
function HealthBar({ score, slot, name }) {
  const pct = Math.max(0, ((MAX_SCORE - score) / MAX_SCORE) * 100);
  const color = slot === 0 ? "#e63946" : "#4cc9f0";
  const isLow = pct < 40;

  return (
    <div style={{ flex: 1, padding: "0 12px" }}>
      <div style={{ display: "flex", justifyContent: slot === 0 ? "flex-start" : "flex-end", marginBottom: 6 }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color, letterSpacing: 2 }}>
          {name || (slot === 0 ? "PLAYER 1" : "PLAYER 2")}
        </span>
      </div>
      <div style={{
        height: 22, background: "#1a1a2e", borderRadius: 3,
        border: `1px solid ${color}33`, overflow: "hidden",
        direction: slot === 1 ? "rtl" : "ltr",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: isLow
            ? `repeating-linear-gradient(90deg, ${color} 0px, ${color} 8px, ${color}88 8px, ${color}88 12px)`
            : color,
          transition: "width 0.3s cubic-bezier(.4,2,.6,1)",
          boxShadow: `0 0 12px ${color}88`,
        }} />
      </div>
      <div style={{ textAlign: slot === 0 ? "left" : "right", marginTop: 4 }}>
        {Array.from({ length: MAX_SCORE }).map((_, i) => (
          <span key={i} style={{ fontSize: 14, marginRight: 3, color: i < score ? color : "#333" }}>
            {i < score ? "✦" : "◇"}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Scanline + grain overlay ──────────────────────────────────────────────────
function Scanlines() {
  return (
    <div style={{
      position: "fixed", inset: 0, pointerEvents: "none", zIndex: 100,
      backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
    }} />
  );
}

// ── Hit flash ─────────────────────────────────────────────────────────────────
function HitFlash({ slot }) {
  const color = slot === 0 ? "#e63946" : "#4cc9f0";
  return (
    <div className="hit-flash" style={{
      position: "absolute", inset: 0,
      background: `radial-gradient(ellipse at ${slot === 0 ? "75%" : "25%"} 50%, ${color}66 0%, transparent 70%)`,
      pointerEvents: "none",
    }} />
  );
}

// ── Main Arena ────────────────────────────────────────────────────────────────
export default function ArenaPage() {
  const [gameState, setGameState] = useState({ players: [], phase: "waiting", winner: null });
  const [countdown, setCountdown] = useState(null);
  const [hitSlot, setHitSlot] = useState(null);       // which fighter was hit
  const [attackSlot, setAttackSlot] = useState(null); // who attacked
  const [hitFlash, setHitFlash] = useState(null);
  const [sparks, setSparks] = useState([]);
  const [showRules, setShowRules] = useState(false);
  const socketRef = useRef(null);
  const hitTimer = useRef(null);

  const controllerUrl = import.meta.env.VITE_CONTROLLER_URL || `http://129.12.120.52:3001/controller`;

  const flashHit = useCallback((attackerSlot, defenderSlot) => {
    clearTimeout(hitTimer.current);
    setHitSlot(defenderSlot);
    setAttackSlot(attackerSlot);
    setHitFlash(defenderSlot);
    // Spark burst
    setSparks(Array.from({ length: 8 }, (_, i) => ({ id: Date.now() + i, slot: defenderSlot })));
    hitTimer.current = setTimeout(() => {
      setHitSlot(null); setAttackSlot(null); setHitFlash(null); setSparks([]);
    }, 500);
  }, []);

  useEffect(() => {
    const socket = io(SERVER);
    socketRef.current = socket;
    socket.emit("join_arena");
    socket.on("state", setGameState);
    socket.on("countdown", setCountdown);
    socket.on("hit", ({ attackerSlot, defenderSlot }) => flashHit(attackerSlot, defenderSlot));
    return () => socket.disconnect();
  }, [flashHit]);

  const p0 = gameState.players.find((p) => p.slot === 0);
  const p1 = gameState.players.find((p) => p.slot === 1);
  const winner = gameState.winner !== null ? gameState.players.find((p) => p.slot === gameState.winner) : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Saira+Condensed:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0f; overflow: hidden; }

        .fighter { transition: transform 0.15s ease; }
        .fighter-hit {
          animation: fighter-hit 0.4s ease;
        }
        .fighter-attack {
          animation: fighter-lunge 0.3s ease;
        }
        @keyframes fighter-hit {
          0%   { transform: translateX(0) scaleX(var(--flip,1)); }
          25%  { transform: translateX(-18px) scaleX(var(--flip,1)); }
          75%  { transform: translateX(8px) scaleX(var(--flip,1)); }
          100% { transform: translateX(0) scaleX(var(--flip,1)); }
        }
        @keyframes fighter-lunge {
          0%   { transform: translateX(0) scaleX(var(--flip,1)); }
          40%  { transform: translateX(22px) scaleX(var(--flip,1)); }
          100% { transform: translateX(0) scaleX(var(--flip,1)); }
        }
        .hit-flash { animation: flash 0.4s ease forwards; }
        @keyframes flash {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
        .spark {
          position: absolute;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #f5c842;
          animation: spark-fly 0.5s ease forwards;
        }
        @keyframes spark-fly {
          0%   { transform: translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
        }
        .winner-card {
          animation: winner-in 0.5s cubic-bezier(.17,.67,.35,1.3) forwards;
        }
        @keyframes winner-in {
          0%   { transform: scale(0.6) translateY(30px); opacity: 0; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        .ground-line {
          position: absolute; bottom: 20%; left: 8%; right: 8%;
          height: 2px;
          background: linear-gradient(90deg, transparent, #f5c84244, #f5c842, #f5c84244, transparent);
        }
        .vs-text {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 52px;
          color: #f5c842;
          text-shadow: 0 0 30px #f5c842, 0 0 60px #f5c84266;
          letter-spacing: 4px;
          animation: vs-pulse 2s ease-in-out infinite;
        }
        @keyframes vs-pulse {
          0%, 100% { text-shadow: 0 0 20px #f5c842, 0 0 40px #f5c84266; }
          50%       { text-shadow: 0 0 40px #f5c842, 0 0 80px #f5c842aa; }
        }
        .countdown-num {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 200px;
          color: #f5c842;
          text-shadow: 0 0 60px #f5c842;
          animation: count-pop 0.3s cubic-bezier(.17,.67,.35,1.5);
          line-height: 1;
        }
        @keyframes count-pop {
          0%   { transform: scale(0.4); opacity: 0.4; }
          100% { transform: scale(1); opacity: 1; }
        }
        .phase-label {
          font-family: 'Bebas Neue', sans-serif;
          letter-spacing: 6px;
          font-size: 14px;
          color: #f5c84288;
        }
        .grid-bg {
          position: fixed; inset: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(245,200,66,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(245,200,66,0.04) 1px, transparent 1px);
          background-size: 40px 40px;
        }
      `}</style>

      <Scanlines />
      <div className="grid-bg" />

      <div style={{
        width: "100vw", height: "100vh", display: "flex", flexDirection: "column",
        fontFamily: "'Saira Condensed', sans-serif", color: "#e8e8f0", position: "relative",
      }}>

        {/* ── Top HUD ── */}
        <div style={{ display: "flex", alignItems: "center", padding: "16px 24px 8px", gap: 12 }}>
          {p0 ? <HealthBar score={p0.score} slot={0} name={p0.name} /> : <div style={{ flex: 1 }} />}
          <div style={{ textAlign: "center", minWidth: 80 }}>
            <div className="phase-label">
              {gameState.phase === "waiting" ? "WAITING" :
               gameState.phase === "countdown" ? "READY" :
               gameState.phase === "duel" ? "DUEL" : "GAME OVER"}
            </div>
          </div>
          {p1 ? <HealthBar score={p1.score} slot={1} name={p1.name} /> : <div style={{ flex: 1 }} />}
        </div>

        {/* ── Arena ── */}
        <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>

          {/* Flash overlay */}
          {hitFlash !== null && <HitFlash slot={hitFlash} />}

          {/* Sparks */}
          {sparks.map((s, i) => {
            const angle = (i / sparks.length) * Math.PI * 2;
            const dist = 40 + Math.random() * 40;
            return (
              <div key={s.id} className="spark" style={{
                left: s.slot === 0 ? "30%" : "70%",
                bottom: "25%",
                "--tx": `${Math.cos(angle) * dist}px`,
                "--ty": `${Math.sin(angle) * dist}px`,
                background: i % 2 === 0 ? "#f5c842" : "#e63946",
              }} />
            );
          })}

          {/* Ground */}
          <div className="ground-line" />

          {/* Fighters */}
          <div style={{
            position: "absolute", bottom: "20%", left: "18%",
            "--flip": 1,
          }}>
            {p0 && <Fighter slot={0} hit={hitSlot === 0} attacking={attackSlot === 0} />}
          </div>
          <div style={{
            position: "absolute", bottom: "20%", right: "18%",
            "--flip": -1,
          }}>
            {p1 && <Fighter slot={1} hit={hitSlot === 1} attacking={attackSlot === 1} />}
          </div>


          {/* Countdown */}
          {gameState.phase === "countdown" && countdown !== null && (
            <div key={countdown} style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div className="countdown-num">{countdown > 0 ? countdown : "FIGHT!"}</div>
            </div>
          )}

          {/* FIGHT! flash when duel starts */}
          {gameState.phase === "duel" && countdown === 0 && (
            <div key="fight" style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none",
            }}>
              <div className="countdown-num" style={{ fontSize: 120 }}>FIGHT!</div>
            </div>
          )}

          {/* Winner overlay */}
          {gameState.phase === "gameover" && winner && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: "rgba(10,10,15,0.85)",
            }}>
              <div className="winner-card" style={{
                textAlign: "center", padding: "48px 64px",
                border: "2px solid #f5c842", borderRadius: 4,
                background: "rgba(10,10,15,0.95)",
                boxShadow: "0 0 80px #f5c84244, inset 0 0 40px #f5c84211",
              }}>
                <div style={{ fontSize: 13, letterSpacing: 8, color: "#f5c84299", marginBottom: 12 }}>
                  WINNER
                </div>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 72,
                  color: winner.slot === 0 ? "#e63946" : "#4cc9f0",
                  textShadow: `0 0 40px ${winner.slot === 0 ? "#e63946" : "#4cc9f0"}`,
                  letterSpacing: 6, lineHeight: 1,
                }}>
                  {winner.name}
                </div>
                <div style={{ marginTop: 16, fontSize: 13, color: "#f5c84266", letterSpacing: 4 }}>
                  PRESS REMATCH ON PHONE
                </div>
              </div>
            </div>
          )}
        </div>


        {/* ── Waiting / QR (NEW DESIGN) ── */}
        {gameState.phase === "waiting" && (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            textAlign: "center",
          }}>

            {/* Title */}
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 48,
              letterSpacing: 6,
              color: "#f5c842",
              textShadow: "0 0 20px #f5c84288",
              marginBottom: 10,
            }}>
              PHONE DUELS
            </div>

            {/* Waiting status */}
            <div style={{
              fontSize: 16,
              letterSpacing: 4,
              color: "#f5c84288",
              marginBottom: 6,
            }}>
              WAITING FOR PLAYERS…
            </div>

            {/* Left + QR + Right */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 40,
            }}>
              <img src="/left.png" style={{ width: 120, opacity: 0.8 }} />

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <QRCode url={controllerUrl} size={180} />
                <div style={{ fontSize: 12, letterSpacing: 3, color: "#f5c84266" }}>
                  SCAN TO JOIN
                </div>
              </div>

              <img src="/right.png" style={{ width: 120, opacity: 0.8 }} />
            </div>

            {/* Player count */}
            <div style={{
              fontSize: 14,
              letterSpacing: 3,
              color: "#888",
              marginTop: 10,
            }}>
              {gameState.players.length}/2 PLAYERS CONNECTED
            </div>

            {/* Rules button */}
            <button
              onClick={() => setShowRules(true)}
              style={{
                marginTop: 20,
                padding: "10px 20px",
                fontSize: 16,
                letterSpacing: 3,
                background: "#f5c842",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                color: "#0a0a0f",
                fontFamily: "'Bebas Neue', sans-serif",
              }}
            >
              RULES
            </button>

          </div>
        )}
        //the rules overlay modal
        {showRules && (
          <div style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
          }}>
            <div style={{
              background: "#111",
              padding: 30,
              borderRadius: 6,
              width: "80%",
              maxWidth: 400,
              color: "#f5c842",
              textAlign: "center",
              fontFamily: "'Saira Condensed', sans-serif",
            }}>
              <h2 style={{ marginBottom: 20, letterSpacing: 4 }}>RULES</h2>
              <p style={{ marginBottom: 20, color: "#ccc" }}>
                • Tap to attack  
                • First to 5 hits wins  
                • Don’t spam — timing matters  
                • Rematch available after game over  
              </p>
              <button
                onClick={() => setShowRules(false)}
                style={{
                  padding: "8px 16px",
                  background: "#f5c842",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  color: "#0a0a0f",
                  fontFamily: "'Bebas Neue', sans-serif",
                  letterSpacing: 3,
                }}
              >
                CLOSE
              </button>
            </div>
          </div>
        )}



        {/* ── Bottom border ── */}
        <div style={{
          height: 3,
          background: "linear-gradient(90deg, #e63946, #f5c842, #4cc9f0)",
        }} />
      </div>
    </>
  );
}
