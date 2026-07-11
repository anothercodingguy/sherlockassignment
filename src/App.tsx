import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { demoScenarios, resetEvents } from '../shared/fixtures';
import { decisionThresholds } from '../shared/scoring';
import type { Evidence, IdentityDecision, MeetingEvent, Participant, SessionSnapshot } from '../shared/types';

const API = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);

type ApiState = 'connecting' | 'ready' | 'error';

const event = (payload: Record<string, unknown>): MeetingEvent => ({
  ...payload,
  id: crypto.randomUUID(),
  timestamp: new Date().toISOString()
} as unknown as MeetingEvent);

const statusLabel: Record<IdentityDecision['status'], string> = {
  identified: 'Candidate identified',
  needs_review: 'Needs review',
  unassigned: 'Awaiting evidence'
};

const initials = (name: string) => name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
const percentage = (value: number) => `${Math.round(value * 100)}%`;

async function localVisualSimilarity(referenceUrl: string, video: HTMLVideoElement): Promise<number> {
  const image = new Image();
  image.src = referenceUrl;
  await image.decode();
  if (!video.videoWidth || !video.videoHeight) throw new Error('Start your camera before comparing the local visual reference.');
  const referenceCanvas = document.createElement('canvas');
  const liveCanvas = document.createElement('canvas');
  referenceCanvas.width = liveCanvas.width = 32;
  referenceCanvas.height = liveCanvas.height = 32;
  referenceCanvas.getContext('2d')!.drawImage(image, 0, 0, 32, 32);
  liveCanvas.getContext('2d')!.drawImage(video, 0, 0, 32, 32);
  const a = referenceCanvas.getContext('2d')!.getImageData(0, 0, 32, 32).data;
  const b = liveCanvas.getContext('2d')!.getImageData(0, 0, 32, 32).data;
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let index = 0; index < a.length; index += 4) {
    const luminanceA = 0.2126 * a[index] + 0.7152 * a[index + 1] + 0.0722 * a[index + 2];
    const luminanceB = 0.2126 * b[index] + 0.7152 * b[index + 1] + 0.0722 * b[index + 2];
    dot += luminanceA * luminanceB;
    magnitudeA += luminanceA ** 2;
    magnitudeB += luminanceB ** 2;
  }
  return dot / Math.sqrt(magnitudeA * magnitudeB);
}

function ParticipantTile({ participant, localVideo }: { participant: Participant; localVideo?: React.RefObject<HTMLVideoElement | null> }) {
  const isCandidateLeader = participant.id === 'p-rahul';
  return <article className={`participant-tile ${isCandidateLeader ? 'candidate-tile' : ''}`}>
    {localVideo ? (
      <video ref={localVideo} autoPlay muted playsInline className="local-video" />
    ) : (
      <div className="avatar" aria-hidden="true">{initials(participant.displayName)}</div>
    )}
    <div className="tile-shade" />
    <div className="tile-top">
      <div className="tile-badges">
        {participant.media.webcamOn ? (
          <span className="badge badge-camera active">
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" style={{marginRight: 4}}>
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            <span>Live</span>
          </span>
        ) : (
          <span className="badge badge-camera">
            <span>CAM OFF</span>
          </span>
        )}
      </div>
      {participant.speakingSeconds > 0 && <span className="speaking-dot" title="Speaking activity observed" />}
    </div>
    <div className="tile-bottom">
      <strong className="displayName">{participant.displayName}</strong>
      <span className="subtext">{participant.email ?? (localVideo ? 'Local browser feed' : 'Audio feed only')}</span>
    </div>
  </article>;
}

function EvidenceRow({ item }: { item: Evidence }) {
  return <li className={`evidence-row ${item.impact < 0 ? 'negative' : item.impact === 0 ? 'neutral' : 'positive'}`}>
    <span className="impact">{item.impact > 0 ? '+' : ''}{item.impact.toFixed(2)}</span>
    <span><strong>{item.label}</strong><small>{item.detail}</small></span>
  </li>;
}

export default function App() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>();
  const [apiState, setApiState] = useState<ApiState>('connecting');
  const [error, setError] = useState<string>();
  const [scenarioRunning, setScenarioRunning] = useState<string>();
  const [customText, setCustomText] = useState("Hi, I'm Rahul Mehta. Thanks for having me.");
  const [speakerId, setSpeakerId] = useState('p-rahul');
  const [history, setHistory] = useState<Array<{ at: string; confidence: number }>>([]);
  const [mediaState, setMediaState] = useState<'idle' | 'active' | 'denied'>('idle');
  const [faceConsent, setFaceConsent] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState<string>();
  const [referenceName, setReferenceName] = useState<string>();
  const [visualMessage, setVisualMessage] = useState('No reference image is retained by the server.');
  const [reviewer, setReviewer] = useState('Demo reviewer');
  const [reviewTarget, setReviewTarget] = useState('p-rahul');
  const [reviewMessage, setReviewMessage] = useState<string>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const audioTimer = useRef<number | undefined>(undefined);

  const postEvent = async (meetingEvent: MeetingEvent) => {
    if (!snapshot) return;
    const response = await fetch(`${API}/api/sessions/${snapshot.id}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meetingEvent)
    });
    if (!response.ok) throw new Error('Could not add meeting event.');
    const next = await response.json() as SessionSnapshot;
    setSnapshot(next);
  };

  const reset = async () => {
    setApiState('connecting');
    setError(undefined);
    setHistory([]);
    const response = await fetch(`${API}/api/sessions`, { method: 'POST' });
    if (!response.ok) throw new Error('Could not create the demo session.');
    let next = await response.json() as SessionSnapshot;
    for (const meetingEvent of resetEvents()) {
      const seeded = await fetch(`${API}/api/sessions/${next.id}/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meetingEvent)
      });
      next = await seeded.json() as SessionSnapshot;
    }
    setSnapshot(next);
    setApiState('ready');
  };

  useEffect(() => { void reset().catch((reason) => { setError(reason.message); setApiState('error'); }); }, []);

  useEffect(() => {
    if (!snapshot) return;
    const socket = new WebSocket(`${API.replace(/^http/, 'ws')}/ws?sessionId=${snapshot.id}`);
    socket.onmessage = (message) => {
      const data = JSON.parse(message.data) as { type: string; snapshot: SessionSnapshot };
      if (data.type === 'snapshot') setSnapshot(data.snapshot);
    };
    return () => socket.close();
  }, [snapshot?.id]);

  useEffect(() => {
    if (!snapshot) return;
    setHistory((previous) => {
      const point = { at: snapshot.decision.updatedAt, confidence: snapshot.decision.confidence };
      if (previous.at(-1)?.at === point.at) return previous;
      return [...previous, point].slice(-24);
    });
  }, [snapshot?.decision.updatedAt]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioTimer.current) window.clearInterval(audioTimer.current);
  }, []);

  const runScenario = async (id: typeof demoScenarios[number]['id']) => {
    const scenario = demoScenarios.find((item) => item.id === id)!;
    setScenarioRunning(id);
    try {
      for (const item of scenario.events) {
        await postEvent({ ...item, id: crypto.randomUUID(), timestamp: new Date().toISOString() });
        await new Promise((resolve) => window.setTimeout(resolve, 280));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Scenario failed.');
    } finally {
      setScenarioRunning(undefined);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setMediaState('active');
      await postEvent(event({ type: 'participant.media_updated', participantId: 'p-rahul', media: { webcamOn: true, audioOn: true } }));
      const context = new AudioContext();
      const analyzer = context.createAnalyser();
      analyzer.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyzer);
      const data = new Uint8Array(analyzer.frequencyBinCount);
      audioTimer.current = window.setInterval(() => {
        analyzer.getByteFrequencyData(data);
        const energy = data.reduce((sum, value) => sum + value, 0) / data.length;
        if (energy > 14) void postEvent(event({ type: 'participant.speaking', participantId: 'p-rahul', seconds: 1 }));
      }, 1300);
    } catch {
      setMediaState('denied');
      await postEvent(event({ type: 'participant.media_updated', participantId: 'p-rahul', media: { webcamOn: false, audioOn: false } }));
    }
  };

  const addTranscript = async () => {
    if (!customText.trim()) return;
    await postEvent(event({ type: 'transcript.final', participantId: speakerId, text: customText.trim(), source: 'browser' }));
    await postEvent(event({ type: 'participant.speaking', participantId: speakerId, seconds: 8 }));
  };

  const onReferenceSelected = (selected: ChangeEvent<HTMLInputElement>) => {
    const file = selected.target.files?.[0];
    if (!file) return;
    if (referenceUrl) URL.revokeObjectURL(referenceUrl);
    setReferenceUrl(URL.createObjectURL(file));
    setReferenceName(file.name);
    setVisualMessage('Reference ready locally. Consent is required before comparison.');
  };

  const compareReference = async () => {
    if (!referenceUrl || !faceConsent || !videoRef.current) return;
    try {
      const similarity = await localVisualSimilarity(referenceUrl, videoRef.current);
      await postEvent(event({ type: 'face.match', participantId: 'p-rahul', similarity, consented: true }));
      setVisualMessage(`Local prototype visual comparison completed: ${percentage(similarity)} similarity. No image bytes left this browser.`);
    } catch (reason) {
      setVisualMessage(reason instanceof Error ? reason.message : 'Visual comparison failed.');
    }
  };

  const clearReference = () => {
    if (referenceUrl) URL.revokeObjectURL(referenceUrl);
    setReferenceUrl(undefined);
    setReferenceName(undefined);
    setFaceConsent(false);
    setVisualMessage('Local reference deleted from this browser session.');
  };

  const submitReview = async () => {
    if (!snapshot) return;
    const response = await fetch(`${API}/api/sessions/${snapshot.id}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedParticipantId: snapshot.decision.selectedParticipantId, correctParticipantId: reviewTarget, reviewer, featureSummary: { confidence: snapshot.decision.confidence, status: snapshot.decision.status } })
    });
    setReviewMessage(response.ok ? 'Review label saved for offline calibration.' : 'Could not save review label.');
  };

  const leader = snapshot?.decision.alternatives[0];
  const nonLeaders = useMemo(() => snapshot?.decision.alternatives.slice(1, 3) ?? [], [snapshot]);
  const timeline = history.map((point, index) => `${(index / Math.max(1, history.length - 1)) * 100},${100 - point.confidence * 88}`).join(' ');

  if (!snapshot) {
    return <main className="loading">
      <div className="loading-mark">S</div>
      <p>{apiState === 'error' ? error : 'Starting secure meeting sandbox…'}</p>
      <button onClick={() => void reset()}>Retry</button>
    </main>;
  }

  const { decision } = snapshot;
  const hasIndependentSupport = (leader?.supportedCategories.length ?? 0) >= 2;

  return <main className="app-shell">
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

    {error && <div className="error-banner">{error}<button onClick={() => setError(undefined)}>Dismiss</button></div>}

    <div className="workspace-container">
      {/* LEFT COLUMN: Main Canvas */}
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
            {snapshot.participants.filter((participant) => !participant.leftAt).map((participant) => (
              <ParticipantTile key={participant.id} participant={participant} localVideo={participant.id === 'p-rahul' ? videoRef : undefined} />
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

      {/* RIGHT COLUMN: Sidebar controls & Signals panel */}
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
              <input type="file" accept="image/*" onChange={onReferenceSelected} aria-label="Upload candidate reference image" />
            </div>
            {referenceName && (
              <div className="reference-ready">
                <span>{referenceName}</span>
                <button className="delete-btn" onClick={clearReference}>Remove</button>
              </div>
            )}
            <label className="consent-checkbox-label">
              <input type="checkbox" checked={faceConsent} onChange={(item) => setFaceConsent(item.target.checked)} />
              <span>I have explicit consent to run face comparison.</span>
            </label>
            <button className="primary-button run-biometric-btn" onClick={() => void compareReference()} disabled={!referenceUrl || !faceConsent || mediaState !== 'active'}>
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
            <button className="secondary-button log-outcome-btn" onClick={() => void submitReview()}>Save Outcome</button>
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
    </div>
  </main>;
}
