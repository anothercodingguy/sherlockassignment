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
    {localVideo ? <video ref={localVideo} autoPlay muted playsInline className="local-video" /> : <div className="avatar" aria-hidden="true">{initials(participant.displayName)}</div>}
    <div className="tile-shade" />
    <div className="tile-top">
      {participant.media.webcamOn ? <span className="chip chip-live">camera</span> : <span className="chip">camera off</span>}
      {participant.speakingSeconds > 0 && <span className="speaking-dot" title="Speaking activity observed" />}
    </div>
    <div className="tile-bottom">
      <strong>{participant.displayName}</strong>
      <span>{participant.email ?? (localVideo ? 'local browser stream' : 'meeting participant')}</span>
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

  if (!snapshot) return <main className="loading"><div className="loading-mark">S</div><p>{apiState === 'error' ? error : 'Starting secure meeting sandbox…'}</p><button onClick={() => void reset()}>Retry</button></main>;

  const { decision } = snapshot;
  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">S</span><span>Sherlock <small>Candidate Identity</small></span></div>
      <div className="top-status"><span className={`api-dot ${apiState}`} /> Local event stream <span className="divider" /> Session {snapshot.id.slice(0, 8)}</div>
      <button className="quiet-button" onClick={() => void reset()}>Reset session</button>
    </header>

    {error && <div className="error-banner">{error}<button onClick={() => setError(undefined)}>Dismiss</button></div>}

    <section className="hero-row">
      <div>
        <p className="eyebrow">Live meeting sandbox</p>
        <h1>Identify the human behind the meeting tile.</h1>
        <p className="lede">Signals update continuously. Sherlock only targets detectors when the identity is genuinely supported.</p>
      </div>
      <div className={`decision-hero ${decision.status}`}>
        <span className="status-kicker">{statusLabel[decision.status]}</span>
        <strong>{percentage(decision.confidence)}</strong>
        <span>confidence · {percentage(Math.max(0, decision.margin))} separation</span>
      </div>
    </section>

    <section className="meeting-layout">
      <div className="meeting-stage card">
        <div className="section-heading"><div><p className="eyebrow">Participant media</p><h2>Interview room</h2></div><span className="participant-count">{snapshot.participants.filter((p) => !p.leftAt).length} participants</span></div>
        <div className="participant-grid">
          {snapshot.participants.filter((participant) => !participant.leftAt).map((participant) => <ParticipantTile key={participant.id} participant={participant} localVideo={participant.id === 'p-rahul' ? videoRef : undefined} />)}
        </div>
        <div className="stage-footer">
          <span className={mediaState === 'active' ? 'camera-active' : ''}>{mediaState === 'active' ? 'Local camera and VAD active' : mediaState === 'denied' ? 'Media permission unavailable — simulator remains usable' : 'Local stream is optional'}</span>
          <button className="primary-button" onClick={() => void startCamera()} disabled={mediaState === 'active'}>{mediaState === 'active' ? 'Camera connected' : 'Enable camera & mic'}</button>
        </div>
      </div>

      <aside className={`decision-card card ${decision.status}`}>
        <p className="eyebrow">Detector routing</p>
        <h2>{decision.detectorTargetParticipantId ? `Target: ${snapshot.participants.find((p) => p.id === decision.detectorTargetParticipantId)?.displayName}` : 'No participant target'}</h2>
        <p>{decision.reason}</p>
        <div className="thresholds"><span>Gate</span><span>≥ {percentage(decisionThresholds.confidence)} confidence</span><span>≥ {percentage(decisionThresholds.margin)} margin</span><span>2 evidence categories</span></div>
        <div className="confidence-chart" aria-label="Confidence over time">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={timeline || '0,100 100,100'} /></svg>
          <small>Live confidence history</small>
        </div>
      </aside>
    </section>

    <section className="dashboard-grid">
      <article className="card scenario-card">
        <div className="section-heading"><div><p className="eyebrow">Replay controls</p><h2>Challenge the system</h2></div></div>
        <div className="scenario-list">
          {demoScenarios.map((scenario) => <button key={scenario.id} className="scenario-button" disabled={Boolean(scenarioRunning)} onClick={() => void runScenario(scenario.id)}>
            <span><strong>{scenario.label}</strong><small>{scenario.description}</small></span><b>{scenarioRunning === scenario.id ? 'Running…' : 'Run'}</b>
          </button>)}
        </div>
        <div className="transcript-entry">
          <label htmlFor="speaker">Inject speaker-attributed transcript</label>
          <div className="input-row"><select id="speaker" value={speakerId} onChange={(item) => setSpeakerId(item.target.value)}>{snapshot.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayName}</option>)}</select><button onClick={() => void addTranscript()}>Add</button></div>
          <textarea value={customText} onChange={(item) => setCustomText(item.target.value)} aria-label="Speaker transcript" />
        </div>
      </article>

      <article className="card rank-card">
        <div className="section-heading"><div><p className="eyebrow">Multi-signal ranking</p><h2>Who is most likely the candidate?</h2></div></div>
        <ol className="rank-list">
          {snapshot.decision.alternatives.map((rank, index) => <li key={rank.participantId} className={index === 0 ? 'leader' : ''}>
            <span className="rank-number">{index + 1}</span><span className="rank-name"><strong>{rank.displayName}</strong><small>{rank.supportedCategories.length ? rank.supportedCategories.join(' · ') : 'no positive evidence'}</small></span><span className="rank-score"><strong>{percentage(rank.posterior)}</strong><small>score {rank.rawScore.toFixed(2)}</small></span>
          </li>)}
        </ol>
        {leader && <p className="rank-note">Current leader: <strong>{leader.displayName}</strong>. The unknown candidate baseline is always included in the probability model.</p>}
      </article>

      <article className="card evidence-card">
        <div className="section-heading"><div><p className="eyebrow">Explainability ledger</p><h2>Why this result?</h2></div></div>
        {decision.evidence.length ? <ul className="evidence-list">{decision.evidence.map((item) => <EvidenceRow key={`${item.id}-${item.impact}`} item={item} />)}</ul> : <p className="empty-state">No qualifying evidence has been observed yet.</p>}
        {nonLeaders.length > 0 && <div className="why-not"><strong>Why not the alternatives?</strong>{nonLeaders.map((participant) => <span key={participant.participantId}>{participant.displayName}: {participant.evidence.filter((item) => item.impact < 0).map((item) => item.label).join(', ') || 'insufficient supporting evidence'}</span>)}</div>}
      </article>

      <article className="card privacy-card">
        <div className="section-heading"><div><p className="eyebrow">Optional local visual signal</p><h2>Consented reference only</h2></div></div>
        <p>Prototype visual comparison runs in this browser against the local camera frame. It is a weak, capped signal—not a production face-recognition claim.</p>
        <input type="file" accept="image/*" onChange={onReferenceSelected} aria-label="Upload candidate reference image" />
        {referenceName && <div className="reference-ready"><span>{referenceName}</span><button onClick={clearReference}>Delete</button></div>}
        <label className="consent"><input type="checkbox" checked={faceConsent} onChange={(item) => setFaceConsent(item.target.checked)} /> I have consent to compare this reference for this interview.</label>
        <button className="primary-button" onClick={() => void compareReference()} disabled={!referenceUrl || !faceConsent || mediaState !== 'active'}>Compare with local tile</button>
        <small>{visualMessage}</small>
      </article>

      <article className="card review-card">
        <div className="section-heading"><div><p className="eyebrow">Learning loop</p><h2>Record a reviewed outcome</h2></div></div>
        <p>Labels are stored without raw media and feed offline calibration only.</p>
        <input value={reviewer} onChange={(item) => setReviewer(item.target.value)} aria-label="Reviewer name" placeholder="Reviewer" />
        <select value={reviewTarget} onChange={(item) => setReviewTarget(item.target.value)} aria-label="Correct participant">{snapshot.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayName}</option>)}</select>
        <button onClick={() => void submitReview()}>Save reviewed outcome</button>
        {reviewMessage && <small>{reviewMessage}</small>}
      </article>

      <article className="card profile-card">
        <p className="eyebrow">External metadata</p><h2>{snapshot.profile.name}</h2>
        <dl><div><dt>Expected email</dt><dd>{snapshot.profile.email}</dd></div><div><dt>Calendar invite</dt><dd>{snapshot.profile.calendarInvite}</dd></div><div><dt>Interviewers</dt><dd>{snapshot.profile.interviewerNames.join(' · ')}</dd></div></dl>
        <small>Metadata is evidence, not identity proof.</small>
      </article>
    </section>
  </main>;
}
