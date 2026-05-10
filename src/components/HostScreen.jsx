import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sounds } from '../sounds/audio.js';
import './HostScreen.css';

// Player 1 is always blue, Player 2 is always red.
const PLAYER_COLORS = ['#2563eb', '#dc2626'];
const PLAYER_LABELS = ['P1', 'P2'];

// SVG stickman drawn in the player's color.
// The `facing` prop determines which direction the character faces.
function Stickman({ color, facing, state }) {
  // state: 'idle' | 'attack' | 'knockback' | 'blocking'
  const scaleX = facing === 'right' ? 1 : -1;

  return (
    <svg
      className={`stickman stickman-${state}`}
      style={{ '--stickman-color': color, transform: `scaleX(${scaleX})` }}
      viewBox="0 0 60 100"
      width="80"
      height="133"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Head */}
      <circle cx="30" cy="12" r="10" stroke={color} strokeWidth="3.5" />

      {/* Body */}
      <line x1="30" y1="22" x2="30" y2="58" stroke={color} strokeWidth="3.5" strokeLinecap="round" />

      {/* Left arm — raised if attacking */}
      {state === 'attack' ? (
        <line x1="30" y1="32" x2="8" y2="16" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
      ) : state === 'blocking' ? (
        // Blocking: arm forward, bent up
        <line x1="30" y1="32" x2="12" y2="26" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
      ) : (
        <line x1="30" y1="32" x2="10" y2="48" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
      )}

      {/* Right arm */}
      {state === 'attack' ? (
        <line x1="30" y1="32" x2="52" y2="24" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
      ) : (
        <line x1="30" y1="32" x2="50" y2="48" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
      )}

      {/* Left leg */}
      <line x1="30" y1="58" x2="14" y2="88" stroke={color} strokeWidth="3.5" strokeLinecap="round" />

      {/* Right leg */}
      <line x1="30" y1="58" x2="46" y2="88" stroke={color} strokeWidth="3.5" strokeLinecap="round" />

      {/* Shield indicator when blocking */}
      {state === 'blocking' && (
        <rect x="2" y="22" width="16" height="24" rx="3"
          fill="none" stroke={color} strokeWidth="2.5" opacity="0.8" />
      )}
    </svg>
  );
}

// Five-pip health bar.
function HealthBar({ health, color, align }) {
  return (
    <div className={`health-bar health-bar-${align}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="health-pip"
          style={{ background: i < health ? color : '#e5e7eb' }}
        />
      ))}
    </div>
  );
}

export default function HostScreen({ socket, connected }) {
  const [roomCode, setRoomCode] = useState(null);
  const [roomState, setRoomState] = useState('idle');
  const [players, setPlayers] = useState([]);
  const [gameData, setGameData] = useState(null);

  // Per-player animation state: 'idle' | 'attack' | 'knockback' | 'blocking'
  const [stickmanStates, setStickmanStates] = useState(['idle', 'idle']);
  const [blockingIds, setBlockingIds] = useState(new Set());

  // Clash effect: brief full-screen flash.
  const [clashFlash, setClashFlash] = useState(false);

  const prevCountdownStep = useRef(null);
  const animTimers = useRef([null, null]);

  // Set a stickman animation for a player by index, then reset to idle.
  const setStickmanAnim = useCallback((playerIndex, animState, durationMs) => {
    if (animTimers.current[playerIndex]) {
      clearTimeout(animTimers.current[playerIndex]);
    }
    setStickmanStates(prev => {
      const next = [...prev];
      next[playerIndex] = animState;
      return next;
    });
    animTimers.current[playerIndex] = setTimeout(() => {
      setStickmanStates(prev => {
        const next = [...prev];
        next[playerIndex] = 'idle';
        return next;
      });
    }, durationMs);
  }, []);

  useEffect(() => {
    if (!socket) return;

    // Host creates a room once on mount.
    socket.emit('create_room');

    socket.on('room_created', ({ code }) => {
      setRoomCode(code);
      setRoomState('waiting');
    });

    socket.on('room_update', (data) => {
      setPlayers(data.players || []);
      setRoomState(data.state);
      setGameData(data.gameData);

      if (data.state === 'waiting') {
        // Reset stickman states on rematch.
        setStickmanStates(['idle', 'idle']);
        setBlockingIds(new Set());
      }
    });

    socket.on('hit', (data) => {
      setPlayers(data.players);
      sounds.hit();

      // Find which player index was the defender and animate knockback.
      const defenderIndex = data.players.findIndex(p => p.id === data.defenderId);
      const attackerIndex = data.players.findIndex(p => p.id === data.attackerId);
      if (defenderIndex !== -1) setStickmanAnim(defenderIndex, 'knockback', 400);
      if (attackerIndex !== -1) setStickmanAnim(attackerIndex, 'attack', 300);
    });

    socket.on('blocked', (data) => {
      sounds.block();
    });

    socket.on('clash', (data) => {
      setPlayers(data.players);
      sounds.clash();
      // Both stickmen react.
      setStickmanAnim(0, 'knockback', 400);
      setStickmanAnim(1, 'knockback', 400);
      // Brief white flash overlay.
      setClashFlash(true);
      setTimeout(() => setClashFlash(false), 200);
    });

    socket.on('player_blocking', ({ playerId, isBlocking }) => {
      setBlockingIds(prev => {
        const next = new Set(prev);
        isBlocking ? next.add(playerId) : next.delete(playerId);
        return next;
      });
    });

    socket.on('host_disconnected', () => {
      setRoomState('idle');
    });

    return () => {
      socket.off('room_created');
      socket.off('room_update');
      socket.off('hit');
      socket.off('blocked');
      socket.off('clash');
      socket.off('player_blocking');
      socket.off('host_disconnected');
    };
  }, [socket, setStickmanAnim]);

  // Sound cues on countdown step changes.
  useEffect(() => {
    if (roomState !== 'countdown') return;
    const step = gameData?.countdownStep;
    if (step === undefined) return;
    if (step === prevCountdownStep.current) return;
    prevCountdownStep.current = step;
    sounds.countdown(step);
  }, [roomState, gameData]);

  // Sound on winner.
  useEffect(() => {
    if (roomState === 'winner') sounds.winner();
  }, [roomState]);

  const handleRematch = () => {
    if (socket && roomCode) socket.emit('rematch', { code: roomCode });
  };

  const p1 = players[0];
  const p2 = players[1];

  // Resolve stickman animation, taking blocking into account.
  const getStickmanState = (playerIndex) => {
    const player = players[playerIndex];
    if (player && blockingIds.has(player.id)) return 'blocking';
    return stickmanStates[playerIndex];
  };

  return (
    <div className="host-screen">
      {/* Clash flash overlay */}
      {clashFlash && <div className="clash-flash" />}

      {/* Connection indicator */}
      <div className={`host-conn-dot ${connected ? 'conn-on' : 'conn-off'}`} />

      {/* ====== WAITING ====== */}
      {roomState === 'waiting' && (
        <div className="host-waiting">
          <h1 className="host-title">PHONE DUELS</h1>

          <div className="code-block">
            <div className="code-label">ROOM CODE</div>
            <div className="code-value">{roomCode}</div>
            <div className="code-hint">Open the app on your phone and tap Player</div>
          </div>

          <div className="player-slots">
            {[0, 1].map(i => {
              const player = players[i];
              const color = PLAYER_COLORS[i];
              return (
                <div
                  key={i}
                  className={`player-slot ${player ? 'slot-filled' : ''}`}
                  style={player ? { borderColor: color } : {}}
                >
                  {player ? (
                    <>
                      <div className="slot-dot" style={{ background: color }} />
                      <span style={{ color }}>{player.name}</span>
                      <span className="slot-ready">READY</span>
                    </>
                  ) : (
                    <>
                      <div className="slot-dot slot-dot-empty" />
                      <span className="slot-waiting">{PLAYER_LABELS[i]} — Waiting...</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="waiting-rules">
            <div className="rules-row">Swing phone to attack</div>
            <div className="rules-row">Tap screen to block</div>
            <div className="rules-row">First to 5 hits wins</div>
          </div>

          <div className="player-count">{players.length} / 2 players joined</div>
        </div>
      )}

      {/* ====== RULES OVERLAY ====== */}
      {roomState === 'rules' && (
        <div className="host-rules">
          <div className="rules-pre">GET READY</div>
          <h2 className="rules-heading">BATTLE RULES</h2>
          <ul className="rules-list">
            <li><strong>SWING</strong> your phone fast to attack</li>
            <li><strong>TAP</strong> the screen to block</li>
            <li>Land <strong>5 hits</strong> to win</li>
          </ul>
          <div className="rules-matchup">
            <span style={{ color: PLAYER_COLORS[0] }}>{p1?.name}</span>
            <span className="rules-vs">VS</span>
            <span style={{ color: PLAYER_COLORS[1] }}>{p2?.name}</span>
          </div>
        </div>
      )}

      {/* ====== COUNTDOWN ====== */}
      {roomState === 'countdown' && (
        <div className="host-countdown">
          <div className="countdown-matchup">
            <span style={{ color: PLAYER_COLORS[0] }}>{p1?.name}</span>
            <span className="countdown-vs">VS</span>
            <span style={{ color: PLAYER_COLORS[1] }}>{p2?.name}</span>
          </div>
          <div
            key={gameData?.countdownStep}
            className={`countdown-num ${gameData?.countdownStep === 0 ? 'countdown-fight' : ''}`}
          >
            {gameData?.countdownStep === 0 ? 'FIGHT!' : gameData?.countdownStep}
          </div>
        </div>
      )}

      {/* ====== BATTLE ARENA ====== */}
      {roomState === 'battle' && p1 && p2 && (
        <div className="host-battle">
          {/* Top bar: names + health */}
          <div className="arena-top">
            <div className="arena-player-info left-info">
              <div className="arena-name" style={{ color: PLAYER_COLORS[0] }}>{p1.name}</div>
              <HealthBar health={p1.health} color={PLAYER_COLORS[0]} align="left" />
            </div>
            <div className="arena-center-label">ROUND 1</div>
            <div className="arena-player-info right-info">
              <div className="arena-name" style={{ color: PLAYER_COLORS[1] }}>{p2.name}</div>
              <HealthBar health={p2.health} color={PLAYER_COLORS[1]} align="right" />
            </div>
          </div>

          {/* Arena floor with stickmen */}
          <div className="arena-floor">
            <div className="stickman-wrap left-stickman">
              <Stickman
                color={PLAYER_COLORS[0]}
                facing="right"
                state={getStickmanState(0)}
              />
              <div className="stickman-name" style={{ color: PLAYER_COLORS[0] }}>{p1.name}</div>
            </div>

            <div className="arena-divider-line" />

            <div className="stickman-wrap right-stickman">
              <Stickman
                color={PLAYER_COLORS[1]}
                facing="left"
                state={getStickmanState(1)}
              />
              <div className="stickman-name" style={{ color: PLAYER_COLORS[1] }}>{p2.name}</div>
            </div>
          </div>
        </div>
      )}

      {/* ====== WINNER SCREEN ====== */}
      {roomState === 'winner' && gameData && (
        <div className="host-winner">
          <div className="winner-pre">WINNER</div>
          <div
            className="winner-name"
            style={{
              color: players[0]?.id === gameData.winnerId
                ? PLAYER_COLORS[0]
                : PLAYER_COLORS[1],
            }}
          >
            {gameData.winnerName}
          </div>
          <div className="winner-loser">{gameData.loserName} was defeated</div>
          <button className="rematch-btn" onClick={handleRematch}>
            REMATCH
          </button>
        </div>
      )}
    </div>
  );
}
