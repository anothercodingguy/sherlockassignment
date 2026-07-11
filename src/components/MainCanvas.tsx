import React from 'react';
import type { SessionSnapshot, IdentityDecision } from '../../shared/types';
import { decisionThresholds } from '../../shared/scoring';
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
  identified: 'Candidate identified',
  needs_review: 'Needs review',
  unassigned: 'Awaiting evidence'
};

const percentage = (value: number) => `${Math.round(value * 100)}%`;

export function MainCanvas({ snapshot, timeline, mediaState, startCamera, videoRef }: MainCanvasProps) {
  const { decision } = snapshot;
  const leader = decision.alternatives[0];
  const hasIndependentSupport = (leader?.supportedCategories.length ?? 0) >= 2;

  return (
    <section className="main-canvas">
      {/* HERO AREA */}
      <header className="canvas-header">
        <div className="title-area">
          <span className="eyebrow">Identity Engine</span>
          <h1>Biometric Verification</h1>
          <p className="lede">Real-time candidate identity scoring system. Continuous multi-signal checks route automatically once verification gates are cleared.</p>
        </div>
        <div className={`decision-hero ${decision.status}`}>
          <span className="status-kicker">{statusLabel[decision.status]}</span>
          <div className="metrics-row">
            <strong className="confidence-value">{percentage(decision.confidence)}</strong>
            <div className="metrics-sub">
              <span className="confidence-label">confidence</span>
              <span className="margin-value">+{percentage(Math.max(0, decision.margin))} separation</span>
            </div>
          </div>
        </div>
      </header>

      {/* MEETING ROOM */}
      <div className="meeting-stage-card card">
        <header className="card-header">
          <div className="header-title">
            <span className="status-indicator-active"></span>
            <h2>Active Meeting Room</h2>
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
            <span>{mediaState === 'active' ? 'Camera & Voice Activity Detector Active' : 'Local media input is optional'}</span>
          </div>
          <button className="primary-button media-toggle-btn" onClick={() => void startCamera()} disabled={mediaState === 'active'}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: 6}}>
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            {mediaState === 'active' ? 'Camera Connected' : 'Connect Camera & Mic'}
          </button>
        </footer>
      </div>

      {/* DETECTOR STATUS ROUTING CARD */}
      <div className={`decision-status-card card ${decision.status}`}>
        <header className="card-header">
          <h2>Detector Routing Target</h2>
          <div className={`status-badge ${decision.status}`}>
            {statusLabel[decision.status]}
          </div>
        </header>
        
        <div className="decision-info-row">
          <div className="decision-target-display">
            <span className="label">Assigned Target</span>
            <strong className="target-name">
              {decision.detectorTargetParticipantId 
                ? snapshot.participants.find((p) => p.id === decision.detectorTargetParticipantId)?.displayName 
                : 'No Target Assigned'}
            </strong>
            <p className="reason-text">{decision.reason}</p>
          </div>
          
          <div className="decision-gates-list">
            <span className="label">Verification Gates</span>
            <ul className="gates">
              <li className={leader && leader.posterior >= decisionThresholds.confidence ? 'passed' : 'failed'}>
                <span className="checkbox-icon"></span>
                <span>Confidence &ge; {percentage(decisionThresholds.confidence)}</span>
              </li>
              <li className={decision.margin >= decisionThresholds.margin ? 'passed' : 'failed'}>
                <span className="checkbox-icon"></span>
                <span>Margin &ge; {percentage(decisionThresholds.margin)}</span>
              </li>
              <li className={hasIndependentSupport ? 'passed' : 'failed'}>
                <span className="checkbox-icon"></span>
                <span>&ge; 2 Independent Categories</span>
              </li>
            </ul>
          </div>
        </div>

        <footer className="decision-footer">
          <div className="confidence-chart">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={timeline || '0,100 100,100'} /></svg>
          </div>
          <div className="chart-label">Real-time Biometric Confidence Stream</div>
        </footer>
      </div>
    </section>
  );
}
