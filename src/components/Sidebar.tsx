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
  
  // Visual Face Match props
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
      setReviewMessage('Review label saved for offline calibration.');
    } catch {
      setReviewMessage('Could not save review label.');
    }
  };

  return (
    <aside className="workspace-sidebar">
      {/* GROUP 1: BIOMETRIC ANALYSIS */}
      <div className="sidebar-group">
        <div className="group-header">Biometric Analysis</div>
        
        {/* RANK LADDER */}
        <div className="sidebar-card card">
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

        {/* EVIDENCE LEDGER */}
        <div className="sidebar-card card">
          <h3>Evidence Ledger</h3>
          {decision.evidence.length ? (
            <ul className="evidence-list">
              {decision.evidence.map((item) => <EvidenceRow key={`${item.id}-${item.impact}`} item={item} />)}
            </ul>
          ) : (
            <p className="empty-state">Awaiting meeting events to gather evidence...</p>
          )}
          {nonLeaders.length > 0 && (
            <div className="why-not">
              <h4>Why not alternatives?</h4>
              {nonLeaders.map((participant) => (
                <div key={participant.participantId} className="alternative-item">
                  <strong>{participant.displayName}</strong>: {participant.evidence.filter((item) => item.impact < 0).map((item) => item.label).join(', ') || 'Insufficient signal'}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* GROUP 2: SIMULATION & INPUTS */}
      <div className="sidebar-group">
        <div className="group-header">Simulators & Playground</div>
        
        {/* SCENARIOS */}
        <div className="sidebar-card card">
          <h3>Inject Scenarios</h3>
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

          <div className="transcript-injector">
            <h4>Manual Speech Attribution</h4>
            <div className="input-row">
              <select id="speaker" value={speakerId} onChange={(item) => setSpeakerId(item.target.value)}>
                {snapshot.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayName}</option>)}
              </select>
              <button className="secondary-button" onClick={() => void addTranscript()}>Attribute</button>
            </div>
            <textarea value={customText} onChange={(item) => setCustomText(item.target.value)} aria-label="Speaker transcript" />
          </div>
        </div>
      </div>

      {/* GROUP 3: SETTINGS & METADATA */}
      <div className="sidebar-group">
        <div className="group-header">System Settings & Data</div>

        {/* VISUAL VERIFICATION */}
        <div className="sidebar-card card">
          <h3>Visual Verification</h3>
          <p className="settings-desc">Run consented image comparison locally inside this browser session against the webcam input feed.</p>
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
            Compare Reference Frame
          </button>
          {visualMessage && <div className="biometric-status-msg">{visualMessage}</div>}
        </div>

        {/* LEARNING LOOP */}
        <div className="sidebar-card card">
          <h3>Offline Review Logs</h3>
          <p className="settings-desc">Save labels locally to feed the offline calibration loop. No media bytes leave the container.</p>
          <input className="text-input" value={reviewer} onChange={(item) => setReviewer(item.target.value)} aria-label="Reviewer name" placeholder="Reviewer initials/name" />
          <select className="select-input" value={reviewTarget} onChange={(item) => setReviewTarget(item.target.value)} aria-label="Correct participant">
            {snapshot.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayName}</option>)}
          </select>
          <button className="secondary-button log-outcome-btn" onClick={() => void handleReviewSubmit()}>Save Outcome</button>
          {reviewMessage && <div className="outcome-status-msg">{reviewMessage}</div>}
        </div>

        {/* INVITE METADATA */}
        <div className="sidebar-card card">
          <h3>Candidate Invite Metadata</h3>
          <div className="metadata-list">
            <div className="meta-item"><span className="meta-label">Candidate</span><span className="meta-val">{snapshot.profile.name}</span></div>
            <div className="meta-item"><span className="meta-label">Scheduled Email</span><span className="meta-val">{snapshot.profile.email}</span></div>
            <div className="meta-item"><span className="meta-label">Calendar Subject</span><span className="meta-val">{snapshot.profile.calendarInvite}</span></div>
            <div className="meta-item"><span className="meta-label">Scheduled Panel</span><span className="meta-val">{snapshot.profile.interviewerNames.join(', ')}</span></div>
          </div>
        </div>
      </div>
    </aside>
  );
}
