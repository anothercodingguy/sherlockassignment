import React from 'react';
import { useSherlockSession } from './hooks/useSherlockSession';
import { useMediaStream } from './hooks/useMediaStream';
import { useFaceMatch } from './hooks/useFaceMatch';
import { MainCanvas } from './components/MainCanvas';
import { Sidebar } from './components/Sidebar';

export default function App() {
  const {
    snapshot,
    apiState,
    error,
    setError,
    scenarioRunning,
    timeline,
    postEvent,
    reset,
    runScenario,
    submitReview
  } = useSherlockSession();

  const { mediaState, videoRef, startCamera } = useMediaStream(postEvent);

  const faceMatch = useFaceMatch(postEvent);

  if (!snapshot) {
    return (
      <main className="loading">
        <div className="loading-mark">S</div>
        <p>{apiState === 'error' ? error : 'Starting secure meeting sandbox…'}</p>
        <button onClick={() => void reset()}>Retry</button>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>Sherlock <small>Biometric Guard</small></span>
        </div>
        <div className="top-status">
          <span className={`api-dot ${apiState}`} /> 
          <span>Sandbox Connected</span> 
          <span className="divider">·</span> 
          <span className="session-pill">Session {snapshot.id.slice(0, 8)}</span>
        </div>
        <button className="quiet-button reset-button" onClick={() => void reset()}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: 6}}>
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l.73-.73" />
          </svg>
          <span>Reset Session</span>
        </button>
      </header>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(undefined)}>Dismiss</button>
        </div>
      )}

      <div className="workspace-container">
        {/* LEFT COLUMN: Main Canvas */}
        <MainCanvas
          snapshot={snapshot}
          timeline={timeline}
          mediaState={mediaState}
          startCamera={startCamera}
          videoRef={videoRef}
        />

        {/* RIGHT COLUMN: Sidebar controls & Signals panel */}
        <Sidebar
          snapshot={snapshot}
          scenarioRunning={scenarioRunning}
          runScenario={runScenario}
          postEvent={postEvent}
          submitReview={submitReview}
          mediaState={mediaState}
          videoRef={videoRef}
          {...faceMatch}
        />
      </div>
    </main>
  );
}
