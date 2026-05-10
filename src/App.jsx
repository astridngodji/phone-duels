import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import HostScreen from './components/HostScreen.jsx';
import PhoneScreen from './components/PhoneScreen.jsx';
import { resumeAudio } from './sounds/audio.js';
import './App.css';

// The server URL can be overridden via .env.local for local-network play.
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  `${window.location.protocol}//${window.location.hostname}:3001`;

export default function App() {
  const [mode, setMode] = useState(null); // null | 'host' | 'phone'
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  // Create a single socket connection that persists for the app lifetime.
  useEffect(() => {
    const s = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = s;
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    return () => s.disconnect();
  }, []);

  const selectMode = (selectedMode) => {
    resumeAudio();
    setMode(selectedMode);
  };

  if (mode === 'host') {
    return <HostScreen socket={socketRef.current} connected={connected} />;
  }

  if (mode === 'phone') {
    return <PhoneScreen socket={socketRef.current} connected={connected} />;
  }

  // Landing — choose host or player.
  return (
    <div className="landing">
      <div className="landing-inner">
        <h1 className="landing-title">PHONE DUELS</h1>
        <p className="landing-sub">Motion-controlled multiplayer battle</p>

        <div className="landing-buttons">
          <button className="landing-btn btn-host" onClick={() => selectMode('host')}>
            HOST
            <span className="btn-desc">Display the arena (laptop)</span>
          </button>

          <button className="landing-btn btn-player" onClick={() => selectMode('phone')}>
            PLAYER
            <span className="btn-desc">Join from your phone</span>
          </button>
        </div>

        <p className="landing-footer">
          Host opens on laptop &bull; Players join on phones
        </p>
      </div>
    </div>
  );
}
