import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMotionAttack } from '../hooks/useMotionAttack.js';
import { haptics } from '../hooks/useVibration.js';
import { sounds, resumeAudio } from '../sounds/audio.js';
import './PhoneScreen.css';

export default function PhoneScreen({ socket, connected }) {
  const [phase, setPhase] = useState('join'); // join | waiting | ready | battle | winner
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');
  const [playerIndex, setPlayerIndex] = useState(0);
  const [roomData, setRoomData] = useState(null);
  const [isBlocking, setIsBlocking] = useState(false);
  const [feedback, setFeedback] = useState(null); // 'attack' | 'hit' | 'blocked' | 'damage' | 'win' | 'lose'
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [motionSupported, setMotionSupported] = useState(true);
  const [playerHealth, setPlayerHealth] = useState(5);

  // Refs for values that the motion handler or socket listeners need
  // to read without going stale.
  const roomCodeRef = useRef(roomCode);
  const phaseRef = useRef(phase);
  const socketRef = useRef(socket);
  const blockTimerRef = useRef(null);

  // Keep refs current on every render.
  roomCodeRef.current = roomCode;
  phaseRef.current = phase;
  socketRef.current = socket;

  // The socket id is stable once connected.
  const myId = socket?.id;

  // Show a temporary feedback label (e.g. "HIT!", "BLOCKED").
  const showFeedback = useCallback((type) => {
    setFeedback(type);
    const duration = type === 'damage' ? 800 : 500;
    setTimeout(() => setFeedback(null), duration);
  }, []);

  // Called by both the motion hook and the fallback button.
  // Uses refs so it is never stale inside the motion listener.
  const handleAttack = useCallback(() => {
    if (phaseRef.current !== 'battle') return;
    sounds.swing();
    haptics.attack();
    showFeedback('attack');
    socketRef.current?.emit('attack', { code: roomCodeRef.current });
  }, [showFeedback]);

  // Pass handleAttack to the motion hook.
  // The hook stores it in a ref internally, so stale-closure issues are avoided.
  const { requestPermission } = useMotionAttack({
    onAttack: handleAttack,
    enabled: motionEnabled,
  });

  // --- Socket event listeners ---
  useEffect(() => {
    if (!socket) return;

    socket.on('joined_room', ({ code, playerIndex: idx }) => {
      setPlayerIndex(idx);
      setPhase('waiting');
      setError('');
    });

    // Server renamed this event to join_error to avoid colliding with built-in 'error'.
    socket.on('join_error', ({ message }) => {
      setError(message);
    });

    socket.on('room_update', (data) => {
      setRoomData(data);

      if (data.state === 'rules' || data.state === 'countdown') {
        setPhase('ready');
      }

      if (data.state === 'battle') {
        setPhase('battle');
      }

      // Host triggered a rematch — drop back to waiting so player can rejoin.
      if (data.state === 'waiting') {
        setPhase('waiting');
        setPlayerHealth(5);
        setIsBlocking(false);
        setRoomData(null);
      }

      if (data.state === 'winner') {
        const amWinner = data.gameData?.winnerId === myId;
        setPhase('winner');
        showFeedback(amWinner ? 'win' : 'lose');
        if (amWinner) haptics.win();
        else haptics.lose();
      }

      // Keep local health in sync for the HP bar.
      const me = data.players?.find(p => p.id === myId);
      if (me) setPlayerHealth(me.health);
    });

    socket.on('you_took_hit', () => {
      haptics.takeDamage();
      showFeedback('damage');
    });

    socket.on('your_hit_landed', () => {
      showFeedback('hit');
    });

    socket.on('you_blocked', () => {
      haptics.blockSuccess();
    });

    socket.on('your_attack_blocked', () => {
      haptics.blocked();
      showFeedback('blocked');
    });

    socket.on('host_disconnected', () => {
      setPhase('join');
      setError('Host disconnected. Please rejoin.');
    });

    return () => {
      socket.off('joined_room');
      socket.off('join_error');
      socket.off('room_update');
      socket.off('you_took_hit');
      socket.off('your_hit_landed');
      socket.off('you_blocked');
      socket.off('your_attack_blocked');
      socket.off('host_disconnected');
    };
  }, [socket, myId, showFeedback]);

  // --- Actions ---

  const handleJoin = () => {
    resumeAudio();
    const code = roomCode.trim().toUpperCase();
    const name = playerName.trim();
    if (code.length < 4) {
      setError('Enter the 4-letter room code.');
      return;
    }
    if (!name) {
      setError('Enter your name.');
      return;
    }
    setError('');
    socket?.emit('join_room', { code, name });
  };

  const enableMotion = async () => {
    const granted = await requestPermission();
    if (granted) {
      setMotionEnabled(true);
    } else {
      setMotionSupported(false);
    }
  };

  const handleBlockStart = () => {
    if (phaseRef.current !== 'battle' || isBlocking) return;
    setIsBlocking(true);
    socketRef.current?.emit('block_start', { code: roomCodeRef.current });

    // Auto-release after 1.5 seconds so players do not get stuck blocking.
    if (blockTimerRef.current) clearTimeout(blockTimerRef.current);
    blockTimerRef.current = setTimeout(() => {
      setIsBlocking(false);
      socketRef.current?.emit('block_end', { code: roomCodeRef.current });
    }, 1500);
  };

  const handleBlockEnd = () => {
    if (blockTimerRef.current) clearTimeout(blockTimerRef.current);
    setIsBlocking(false);
    socketRef.current?.emit('block_end', { code: roomCodeRef.current });
  };

  // --- Derived display values ---

  // P1 = blue, P2 = red. Matches host screen stickman colors.
  const playerColor = playerIndex === 0 ? '#2563eb' : '#dc2626';
  const myName = roomData?.players?.[playerIndex]?.name || playerName;
  const opponent = roomData?.players?.[1 - playerIndex];
  const countdownStep = roomData?.gameData?.countdownStep;

  const feedbackLabels = {
    attack: 'ATTACKING',
    hit: 'HIT!',
    blocked: 'BLOCKED',
    damage: 'OUCH!',
    win: 'VICTORY',
    lose: 'DEFEATED',
  };

  const feedbackColors = {
    attack: playerColor,
    hit: '#16a34a',
    blocked: '#6b7280',
    damage: '#dc2626',
    win: '#ca8a04',
    lose: '#374151',
  };

  return (
    <div className={`phone-screen ${feedback ? `feedback-${feedback}` : ''}`}>

      {/* JOIN FORM */}
      {phase === 'join' && (
        <div className="phone-join">
          <div className="phone-logo">
            <h1 className="phone-title">PHONE DUELS</h1>
            <p className="phone-sub">JOIN THE BATTLE</p>
          </div>

          <div className="phone-form">
            <div className="form-group">
              <label className="form-label">ROOM CODE</label>
              <input
                className="form-input code-input"
                type="text"
                placeholder="ABCD"
                maxLength={4}
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                autoComplete="off"
                autoCapitalize="characters"
                inputMode="text"
              />
            </div>

            <div className="form-group">
              <label className="form-label">YOUR NAME</label>
              <input
                className="form-input"
                type="text"
                placeholder="Enter name"
                maxLength={12}
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                autoComplete="off"
              />
            </div>

            {error && <div className="form-error">{error}</div>}

            <button
              className="join-btn"
              style={{ borderColor: '#111', color: '#111' }}
              onClick={handleJoin}
              disabled={!connected}
            >
              {connected ? 'JOIN BATTLE' : 'CONNECTING...'}
            </button>
          </div>
        </div>
      )}

      {/* WAITING FOR OPPONENT */}
      {phase === 'waiting' && (
        <div className="phone-waiting">
          <div className="waiting-badge" style={{ borderColor: playerColor }}>
            <div className="badge-label">PLAYER {playerIndex + 1}</div>
            <div className="badge-name" style={{ color: playerColor }}>{myName}</div>
          </div>

          <div className="waiting-status">
            <div className="waiting-spinner" style={{ borderTopColor: playerColor }} />
            <div className="waiting-text">Waiting for opponent...</div>
          </div>

          {/* Motion permission — must be triggered by user gesture before battle starts */}
          {!motionEnabled && (
            <div className="motion-section">
              <p className="motion-info">
                Enable motion to swing-attack with your phone.
              </p>
              <button
                className="motion-btn"
                style={{ borderColor: playerColor, color: playerColor }}
                onClick={enableMotion}
              >
                ENABLE SWING ATTACK
              </button>
              {!motionSupported && (
                <p className="motion-unavailable">
                  Motion not supported — use the ATTACK button.
                </p>
              )}
            </div>
          )}

          {motionEnabled && (
            <div className="motion-ready-badge">
              Motion ready — swing to attack!
            </div>
          )}

          <div className="room-display">
            Room: <strong>{roomCode}</strong>
          </div>
        </div>
      )}

      {/* RULES + COUNTDOWN */}
      {phase === 'ready' && (
        <div className="phone-ready">
          {roomData?.state === 'rules' && (
            <div className="ready-label" style={{ color: playerColor }}>GET READY</div>
          )}
          {roomData?.state === 'countdown' && countdownStep > 0 && (
            <div key={countdownStep} className="ready-number" style={{ color: playerColor }}>
              {countdownStep}
            </div>
          )}
          {roomData?.state === 'countdown' && countdownStep === 0 && (
            <div key="fight" className="ready-fight" style={{ color: playerColor }}>
              FIGHT!
            </div>
          )}
        </div>
      )}

      {/* BATTLE CONTROLLER */}
      {phase === 'battle' && (
        <div className="phone-battle">

          {/* Status bar: HP + names */}
          <div className="battle-bar">
            <div className="battle-hp">
              <span className="hp-label">HP</span>
              <div className="hp-pips">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="hp-pip"
                    style={{ background: i < playerHealth ? playerColor : '#d1d5db' }}
                  />
                ))}
              </div>
            </div>
            <span className="battle-name" style={{ color: playerColor }}>{myName}</span>
            {opponent && (
              <span className="battle-opponent">vs {opponent.name}</span>
            )}
          </div>

          {/* Feedback flash */}
          {feedback && (
            <div
              className="phone-feedback"
              style={{ color: feedbackColors[feedback] }}
            >
              {feedbackLabels[feedback]}
            </div>
          )}

          {/* Block zone — large tap area in the middle of the screen */}
          <div
            className={`block-zone ${isBlocking ? 'blocking-active' : ''}`}
            style={isBlocking ? { borderColor: playerColor, background: playerColor + '18' } : {}}
            onPointerDown={handleBlockStart}
            onPointerUp={handleBlockEnd}
            onPointerLeave={handleBlockEnd}
          >
            {isBlocking ? (
              <div className="block-label-active" style={{ color: playerColor }}>
                BLOCKING
              </div>
            ) : (
              <div className="block-label-idle">
                <div className="block-label-main">TAP TO BLOCK</div>
                <div className="block-label-sub">Hold to keep blocking</div>
              </div>
            )}
          </div>

          {/* Attack section — always visible */}
          <div className="attack-section">
            {motionEnabled && (
              <div className="motion-hint">
                Swing your phone to attack
              </div>
            )}

            {/* Fallback attack button — shown always, primary when motion is off */}
            <button
              className="attack-btn"
              style={{
                background: playerColor,
                borderColor: playerColor,
              }}
              onPointerDown={handleAttack}
            >
              ATTACK
            </button>

            {!motionEnabled && (
              <button
                className="enable-motion-link"
                onClick={enableMotion}
              >
                Enable swing attack
              </button>
            )}
          </div>
        </div>
      )}

      {/* WINNER / LOSER */}
      {phase === 'winner' && (
        <div className="phone-winner">
          <div className="winner-result" style={{ color: roomData?.gameData?.winnerId === myId ? '#ca8a04' : '#9ca3af' }}>
            {roomData?.gameData?.winnerId === myId ? 'VICTORY' : 'DEFEATED'}
          </div>
          <div className="winner-detail">
            {roomData?.gameData?.winnerId === myId
              ? `You defeated ${opponent?.name}`
              : `${roomData?.gameData?.winnerName} wins`}
          </div>
          <div className="winner-wait">Waiting for host to start rematch...</div>
        </div>
      )}

      {/* Connection status dot */}
      <div className={`conn-dot ${connected ? 'conn-on' : 'conn-off'}`} />
    </div>
  );
}
