import React, { useEffect, useState } from 'react';
import './LandingScreen.css';

export default function LandingScreen({ onSelect }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
  }, []);

  return (
    <div className="landing">
      <div className="landing-grid" />
      <div className="landing-particles">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="particle" style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${2 + Math.random() * 3}s`,
          }} />
        ))}
      </div>

      <div className={`landing-content ${visible ? 'visible' : ''}`}>
        <div className="landing-logo">
          <div className="logo-sub">⚡ ARCADE BATTLE ⚡</div>
          <h1 className="logo-title">PHONE<br />DUELS</h1>
          <div className="logo-tagline">Your phone is your weapon</div>
        </div>

        <div className="mode-select">
          <button className="mode-btn host-btn" onClick={() => onSelect('host')}>
            <div className="mode-icon">🖥️</div>
            <div className="mode-label">HOST</div>
            <div className="mode-desc">Display the arena screen</div>
          </button>

          <div className="mode-divider">
            <span>OR</span>
          </div>

          <button className="mode-btn phone-btn" onClick={() => onSelect('phone')}>
            <div className="mode-icon">📱</div>
            <div className="mode-label">PLAYER</div>
            <div className="mode-desc">Join with your phone</div>
          </button>
        </div>

        <div className="landing-footer">
          Use laptop as HOST · Players join on phones
        </div>
      </div>
    </div>
  );
}
