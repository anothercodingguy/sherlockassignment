import React from 'react';
import type { SessionSnapshot, IdentityDecision } from '../../shared/types';
import { ParticipantTile } from './ParticipantTile';
import { LOCAL_USER_ID } from '../constants';
import type { MediaStateStatus } from '../hooks/useMediaStream';

interface MainCanvasProps {
  snapshot: SessionSnapshot;
  timeline: string;
  mediaState: MediaStateStatus;
  startCamera: () => Promise<void>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

const statusLabel: Record<IdentityDecision['status'], string> = {
  identified: 'Candidate verified',
  needs_review: 'Verification incomplete',
  unassigned: 'Awaiting biometric signals'
};

const percentage = (value: number) => `${Math.round(value * 100)}%`;

export function MainCanvas({ snapshot, mediaState, startCamera, videoRef }: MainCanvasProps) {
  const { decision } = snapshot;

  return (
    <section className="main-canvas">
      {/* CONSOLIDATED STATUS BAR */}
      <header className="status-bar">
        <div className="status-info">
          <h1>Identity Engine</h1>
          <p>Real-time candidate biometric scoring and validation.</p>
        </div>
        <div className={`decision-hero ${decision.status}`}>
          <span className="status-kicker">{statusLabel[decision.status]}</span>
          <div className="metrics-row">
            <strong className="confidence-value">{percentage(decision.confidence)}</strong>
            <div className="metrics-sub">
              <span className="margin-value">+{percentage(Math.max(0, decision.margin))} margin</span>
            </div>
          </div>
        </div>
      </header>

      {/* MEETING ROOM - LARGE GRID */}
      <div className="meeting-stage-card card">
        <header className="card-header">
          <div className="header-title">
            <span className="status-indicator-active"></span>
            <h2>Active Interview Room</h2>
          </div>
          <span className="participant-count-pill">{snapshot.participants.filter((p) => !p.leftAt).length} Active Tiles</span>
        </header>

        <div className="participant-grid">
          {snapshot.participants
            .filter((participant) => !participant.leftAt)
            .map((participant) => (
              <ParticipantTile 
                key={participant.id} 
                participant={participant} 
                localVideo={participant.id === LOCAL_USER_ID ? videoRef : undefined} 
              />
          ))}
        </div>

        <footer className="stage-footer">
          <div className="media-status-wrapper">
            <span className={`status-dot ${mediaState === 'active' ? 'active' : ''}`}></span>
            <span>{mediaState === 'active' ? 'Local webcam and microphone active' : 'Connect media to begin biometric ingestion'}</span>
          </div>
          <button className="primary-button media-toggle-btn" onClick={() => void startCamera()} disabled={mediaState === 'active'}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: 8}}>
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            {mediaState === 'active' ? 'Connected' : 'Connect Camera'}
          </button>
        </footer>
      </div>
    </section>
  );
}
