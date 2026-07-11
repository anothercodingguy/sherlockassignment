import React, { useState } from 'react';
import type { SessionSnapshot, MeetingEvent } from '../../shared/types';
import { demoScenarios } from '../../shared/fixtures';
import { EvidenceRow } from './EvidenceRow';
import { LOCAL_USER_ID } from '../constants';
import type { MediaStateStatus } from '../hooks/useMediaStream';

interface SidebarProps {
  snapshot: SessionSnapshot;
  scenarioRunning: string | undefined;
  runScenario: (id: string) => Promise<void>;
  postEvent: (event: MeetingEvent) => Promise<void>;
  submitReview: (reviewer: string, targetId: string) => Promise<void>;
  mediaState: MediaStateStatus;
  faceConsent: boolean;
  setFaceConsent: (val: boolean) => void;
  referenceUrl?: string;
  referenceName?: string;
  visualMessage: string;
  onReferenceSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  compareReference: (video: HTMLVideoElement | null) => Promise<void>;
  clearReference: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

const percentage = (value: number) => `${Math.round(value * 100)}%`;

export function Sidebar({
  snapshot, scenarioRunning, runScenario, postEvent, submitReview,
  mediaState, faceConsent, setFaceConsent, referenceUrl, referenceName,
  visualMessage, onReferenceSelected, compareReference, clearReference, videoRef
}: SidebarProps) {
  const { decision } = snapshot;
  const nonLeaders = snapshot.decision.alternatives.slice(1, 3);
  
  const [activeTab, setActiveTab] = useState<'evidence' | 'simulator' | 'settings'>('evidence');
  
  const [customText, setCustomText] = useState("Hi, I'm Rahul Mehta. Thanks for having me.");
  const [speakerId, setSpeakerId] = useState(LOCAL_USER_ID);
  
  const [reviewer, setReviewer] = useState('Demo reviewer');
  const [reviewTarget, setReviewTarget] = useState(LOCAL_USER_ID);
  const [reviewMessage, setReviewMessage] = useState<string>();

  const addTranscript = async () => {
    if (!customText.trim()) return;
    await postEvent({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: 'transcript.final',
      participantId: speakerId,
      text: customText.trim(),
      source: 'browser'
    });
    await postEvent({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: 'participant.speaking',
      participantId: speakerId,
      seconds: 8
    });
  };

  const handleReviewSubmit = async () => {
    try {
      await submitReview(reviewer, reviewTarget);
      setReviewMessage('Review label saved.');
    } catch {
      setReviewMessage('Failed to save review.');
    }
  };

  return (
    <div className="workspace-tabs">
      <nav className="tab-nav">
        <button className={`tab-btn ${activeTab === 'evidence' ? 'active' : ''}`} onClick={() => setActiveTab('evidence')}>Analysis & Evidence</button>
        <button className={`tab-btn ${activeTab === 'simulator' ? 'active' : ''}`} onClick={() => setActiveTab('simulator')}>Dev Simulator</button>
        <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Advanced Settings</button>
      </nav>

      <div className="tab-content">
        {/* TAB 1: EVIDENCE */}
        {activeTab === 'evidence' && (
          <>
            <div className="sidebar-card">
              <h3>Probability Ranking</h3>
              <ol className="rank-list">
                {snapshot.decision.alternatives.map((rank, index) => (
                  <li key={rank.participantId} className={index === 0 ? 'leader' : ''}>
                    <span className="rank-badge">{index + 1}</span>
                    <div className="rank-details">
                      <span className="name">{rank.displayName}</span>
                      <span className="categories">{rank.supportedCategories.length ? rank.supportedCategories.join(' · ') : 'No positive evidence'}</span>
                    </div>
                    <span className="probability-score">{percentage(rank.posterior)}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="sidebar-card">
              <h3>Real-time Evidence Ledger</h3>
              {decision.evidence.length ? (
                <ul className="evidence-list">
                  {decision.evidence.map((item) => <EvidenceRow key={`${item.id}-${item.impact}`} item={item} />)}
                </ul>
              ) : (
                <p className="settings-desc">Awaiting meeting events to gather evidence...</p>
              )}
            </div>
          </>
        )}

        {/* TAB 2: SIMULATOR */}
        {activeTab === 'simulator' && (
          <>
            <div className="sidebar-card">
              <h3>Inject Testing Scenarios</h3>
              <div className="scenario-list">
                {demoScenarios.map((scenario) => (
                  <button key={scenario.id} className="scenario-button" disabled={Boolean(scenarioRunning)} onClick={() => void runScenario(scenario.id)}>
                    <div className="scenario-text">
                      <strong>{scenario.label}</strong>
                      <span className="desc">{scenario.description}</span>
                    </div>
                    <span className="action-tag">{scenarioRunning === scenario.id ? 'Running' : 'Replay'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="sidebar-card">
              <h3>Manual Speech Injection</h3>
              <div style={{display: 'flex', gap: 10, marginTop: 12}}>
                <select className="select-input" value={speakerId} onChange={(item) => setSpeakerId(item.target.value)} style={{flex: 1}}>
                  {snapshot.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayName}</option>)}
                </select>
                <button className="secondary-button" onClick={() => void addTranscript()}>Inject Audio</button>
              </div>
              <textarea className="text-input" value={customText} onChange={(item) => setCustomText(item.target.value)} aria-label="Speaker transcript" style={{height: 60}} />
            </div>
          </>
        )}

        {/* TAB 3: SETTINGS */}
        {activeTab === 'settings' && (
          <>
            <div className="sidebar-card">
              <h3>Prototype Visual Validation</h3>
              <p className="settings-desc">Run isolated local face comparison using WebGL APIs. No media sent to backend.</p>
              <div className="file-input-wrapper">
                <input type="file" id="referenceUpload" accept="image/*" onChange={onReferenceSelected} aria-label="Upload candidate reference image" />
              </div>
              {referenceName && (
                <div className="reference-ready">
                  {referenceUrl && <img src={referenceUrl} alt="Thumbnail preview" style={{width: 24, height: 24, objectFit: 'cover', borderRadius: 4, marginRight: 8}} />}
                  <span style={{flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{referenceName}</span>
                  <button className="delete-btn" onClick={clearReference}>Remove</button>
                </div>
              )}
              <label className="consent-checkbox-label" htmlFor="faceConsentCheck">
                <input id="faceConsentCheck" type="checkbox" checked={faceConsent} onChange={(item) => setFaceConsent(item.target.checked)} />
                <span>I have explicit consent to run face comparison.</span>
              </label>
              <button className="primary-button run-biometric-btn" onClick={() => void compareReference(videoRef.current)} disabled={!referenceUrl || !faceConsent || mediaState !== 'active'}>
                Execute Frame Analysis
              </button>
              {visualMessage && <div className="biometric-status-msg">{visualMessage}</div>}
            </div>

            <div className="sidebar-card">
              <h3>Invite Profile & Offline Sync</h3>
              <div className="metadata-list">
                <div className="meta-item"><span className="meta-label">Candidate</span><span className="meta-val">{snapshot.profile.name}</span></div>
                <div className="meta-item"><span className="meta-label">Calendar Subject</span><span className="meta-val">{snapshot.profile.calendarInvite}</span></div>
                <div className="meta-item"><span className="meta-label">Scheduled Panel</span><span className="meta-val">{snapshot.profile.interviewerNames.join(', ')}</span></div>
              </div>
              <div style={{borderTop: '1px solid var(--border-default)', margin: '20px 0', padding: 0}}></div>
              <p className="settings-desc">Save manual calibration label.</p>
              <div style={{display: 'flex', gap: 10, marginBottom: 12}}>
                <input className="text-input" value={reviewer} onChange={(item) => setReviewer(item.target.value)} style={{marginBottom: 0, flex: 1}} aria-label="Reviewer name" placeholder="Reviewer initials" />
                <select className="select-input" value={reviewTarget} onChange={(item) => setReviewTarget(item.target.value)} style={{flex: 1}}>
                  {snapshot.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayName}</option>)}
                </select>
              </div>
              <button className="secondary-button log-outcome-btn" onClick={() => void handleReviewSubmit()}>Sync Calibration Label</button>
              {reviewMessage && <div className="outcome-status-msg">{reviewMessage}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
