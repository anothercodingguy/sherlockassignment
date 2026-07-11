import type {
  CandidateProfile,
  DecisionStatus,
  Evidence,
  EvidenceCategory,
  IdentityDecision,
  MeetingEvent,
  Participant,
  RankedParticipant,
  SessionSnapshot
} from './types';

const CATEGORY_CAPS: Record<EvidenceCategory, number> = {
  metadata: 3.4,
  transcript: 2.5,
  behavior: 0.7,
  role: 4.0,
  biometric: 2.0
};

const IDENTIFY_CONFIDENCE = 0.75;
const IDENTIFY_MARGIN = 0.2;
const HYSTERESIS_MS = 10_000;

export const normalize = (value: string) => value
  .toLowerCase()
  .replace(/\b(mr|mrs|ms|dr)\.?\b/g, '')
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const sameEmail = (left?: string, right?: string) => Boolean(left && right && normalize(left) === normalize(right));

const nameSimilarity = (displayName: string, profile: CandidateProfile) => {
  const normalized = normalize(displayName);
  const targets = [profile.name, ...(profile.aliases ?? [])].map(normalize);
  if (targets.includes(normalized)) return 1;

  const displayTokens = normalized.split(' ').filter(Boolean);
  const candidateTokens = normalize(profile.name).split(' ');
  const overlap = displayTokens.filter((token) => candidateTokens.includes(token)).length;
  if (overlap === candidateTokens.length && overlap > 0) return 0.9;
  if (overlap > 0 && displayTokens.length <= 2) return overlap / candidateTokens.length;
  const initialAndLast = displayTokens.length === 2 && displayTokens[0][0] === candidateTokens[0][0] && displayTokens[1] === candidateTokens[1];
  return initialAndLast ? 0.86 : 0;
};

const makeEvidence = (
  participantId: string,
  category: EvidenceCategory,
  impact: number,
  label: string,
  detail: string,
  source: Evidence['source'] = 'deterministic'
): Evidence => ({ id: `${participantId}-${category}-${label}`, participantId, category, impact, label, detail, source });

const matchesSelfIdentification = (text: string, profile: CandidateProfile) => {
  const normalized = normalize(text);
  const full = normalize(profile.name);
  const first = normalize(profile.name).split(' ')[0];
  const selfReference = /\b(i am|im|i m|this is|my name is)\b/;
  if (selfReference.test(normalized) && normalized.includes(full)) return 'full';
  if (first && selfReference.test(normalized) && new RegExp(`\\b${first}\\b`).test(normalized)) return 'first';
  return undefined;
};

const candidateEvidence = (participant: Participant, profile: CandidateProfile): Evidence[] => {
  const evidence: Evidence[] = [];
  const participantName = normalize(participant.displayName);
  const interviewerNames = profile.interviewerNames.map(normalize);

  if (sameEmail(participant.email, profile.email)) {
    evidence.push(makeEvidence(participant.id, 'metadata', 3.2, 'Verified invite email', `${participant.email} matches the scheduled candidate email.`));
  } else if (participant.email) {
    evidence.push(makeEvidence(participant.id, 'metadata', -0.35, 'Different email', `${participant.email} does not match the candidate email.`));
  }

  const similarity = nameSimilarity(participant.displayName, profile);
  if (similarity >= 0.95) {
    evidence.push(makeEvidence(participant.id, 'metadata', 1.2, 'Display-name match', `“${participant.displayName}” matches the candidate profile.`));
  } else if (similarity >= 0.8) {
    evidence.push(makeEvidence(participant.id, 'metadata', 0.85, 'Candidate alias match', `“${participant.displayName}” matches a known candidate alias.`));
  }

  if (interviewerNames.includes(participantName)) {
    evidence.push(makeEvidence(participant.id, 'role', -4, 'Scheduled interviewer', `${participant.displayName} is listed as an interviewer.`));
  }
  if (/observer|notetaker|recruiter/.test(participantName)) {
    evidence.push(makeEvidence(participant.id, 'role', -1.8, 'Observer-style name', 'The display name suggests an observer rather than the interview candidate.'));
  }

  for (const line of participant.transcript) {
    const selfIdentification = matchesSelfIdentification(line.text, profile);
    if (selfIdentification === 'full') {
      evidence.push(makeEvidence(participant.id, 'transcript', 2.35, 'Explicit self-identification', `Said: “${line.text}”`, line.source === 'llm' ? 'llm' : 'deterministic'));
    } else if (selfIdentification === 'first') {
      evidence.push(makeEvidence(participant.id, 'transcript', 1.35, 'First-name self-identification', `Said: “${line.text}”`, line.source === 'llm' ? 'llm' : 'deterministic'));
    }
    if (/wrong name|wrong invite|here for (the )?(sherlock )?interview/.test(normalize(line.text)) && normalize(line.text).includes(normalize(profile.name).split(' ')[0])) {
      evidence.push(makeEvidence(participant.id, 'transcript', 0.45, 'Interview-context correction', 'Clarified an identity mismatch in interview context.', line.source === 'llm' ? 'llm' : 'deterministic'));
    }
    if (/\b(i am|im|i m|this is)\b/.test(normalize(line.text)) && interviewerNames.some((name) => normalize(line.text).includes(name))) {
      evidence.push(makeEvidence(participant.id, 'role', -2.5, 'Interviewer self-identification', `Said: “${line.text}”`, line.source === 'llm' ? 'llm' : 'deterministic'));
    }
    if (/\b(interviewing you|your interviewer|hiring manager)\b/.test(normalize(line.text))) {
      evidence.push(makeEvidence(participant.id, 'role', -2.3, 'Interviewer role statement', `Said: “${line.text}”`, line.source === 'llm' ? 'llm' : 'deterministic'));
    }
  }

  let behavior = 0;
  if (participant.media.webcamOn) behavior += 0.16;
  if (participant.media.audioOn) behavior += 0.08;
  behavior += Math.min(0.34, participant.speakingSeconds / 50);
  behavior += Math.min(0.12, participant.speechTurns * 0.04);
  if (behavior > 0) {
    evidence.push(makeEvidence(participant.id, 'behavior', behavior, 'Live participation', `${participant.speechTurns} speaking turn${participant.speechTurns === 1 ? '' : 's'} and ${Math.round(participant.speakingSeconds)}s of speech with media state considered.`));
  }
  if (participant.media.screenSharing) {
    evidence.push(makeEvidence(participant.id, 'behavior', -0.12, 'Screen sharing', 'A weak role signal; this is never decisive.'));
  }

  const face = participant.faceMatch;
  if (face?.consented && face.similarity >= 0.7) {
    const impact = Math.min(2, 0.6 + (face.similarity - 0.7) * 7);
    evidence.push(makeEvidence(participant.id, 'biometric', impact, 'Consented local visual match', `${Math.round(face.similarity * 100)}% prototype visual-similarity signal.`, 'browser'));
  } else if (face && !face.consented) {
    evidence.push(makeEvidence(participant.id, 'biometric', 0, 'Reference ignored', 'A face signal was supplied without consent and was not used.', 'browser'));
  }

  return evidence;
};

const cappedScore = (evidence: Evidence[]) => Object.entries(CATEGORY_CAPS).reduce((total, [category, cap]) => {
  const categoryScore = evidence
    .filter((item) => item.category === category)
    .reduce((sum, item) => sum + item.impact, 0);
  return total + Math.max(-cap, Math.min(cap, categoryScore));
}, 0);

const supportedCategories = (evidence: Evidence[]) => {
  const categories = new Set<EvidenceCategory>();
  for (const category of Object.keys(CATEGORY_CAPS) as EvidenceCategory[]) {
    const contribution = evidence.filter((item) => item.category === category).reduce((sum, item) => sum + item.impact, 0);
    if (contribution >= 0.3) categories.add(category);
  }
  return [...categories];
};

const posteriorRanks = (participants: Participant[], profile: CandidateProfile): RankedParticipant[] => {
  const candidates = participants.filter((participant) => !participant.leftAt);
  const staged = candidates.map((participant) => {
    const evidence = candidateEvidence(participant, profile);
    return { participant, evidence, rawScore: cappedScore(evidence) };
  });
  const denominator = 1 + staged.reduce((sum, entry) => sum + Math.exp(entry.rawScore), 0); // 1 = unknown candidate
  return staged
    .map(({ participant, evidence, rawScore }) => ({
      participantId: participant.id,
      displayName: participant.displayName,
      rawScore,
      posterior: Math.exp(rawScore) / denominator,
      evidence,
      supportedCategories: supportedCategories(evidence)
    }))
    .sort((left, right) => right.posterior - left.posterior);
};

export const calculateDecision = (
  participants: Participant[],
  profile: CandidateProfile,
  previous?: IdentityDecision,
  now = new Date().toISOString()
): IdentityDecision => {
  const alternatives = posteriorRanks(participants, profile);
  const top = alternatives[0];
  const runnerUpPosterior = Math.max(0, alternatives[1]?.posterior ?? 0); // unknown has posterior considered below
  const unknownPosterior = 1 / (1 + alternatives.reduce((sum, entry) => sum + Math.exp(entry.rawScore), 0));
  const margin = top ? top.posterior - Math.max(runnerUpPosterior, unknownPosterior) : 0;
  const hasIndependentSupport = (top?.supportedCategories.length ?? 0) >= 2;
  const enoughEvidence = Boolean(top && top.posterior >= IDENTIFY_CONFIDENCE && margin >= IDENTIFY_MARGIN && hasIndependentSupport);

  let status: DecisionStatus = 'unassigned';
  let selectedParticipantId: string | undefined;
  let detectorTargetParticipantId: string | null = null;
  let reason = 'No participant has sufficient evidence yet.';
  let decisionUpdatedAt = now;

  if (enoughEvidence && top) {
    status = 'identified';
    selectedParticipantId = top.participantId;
    detectorTargetParticipantId = top.participantId;
    reason = `Selected with ${Math.round(top.posterior * 100)}% confidence from ${top.supportedCategories.length} independent evidence categories.`;
  } else if (previous?.status === 'identified' && previous.selectedParticipantId === top?.participantId && Date.parse(now) - Date.parse(previous.updatedAt) < HYSTERESIS_MS && top && top.posterior >= 0.65 && margin >= 0.12) {
    status = 'identified';
    selectedParticipantId = top.participantId;
    detectorTargetParticipantId = top.participantId;
    reason = 'Retained briefly while evidence settles (hysteresis).';
    decisionUpdatedAt = previous.updatedAt;
  } else if (top && top.rawScore >= 0.3) {
    status = 'needs_review';
    reason = !hasIndependentSupport
      ? 'A leader exists, but it lacks two independent evidence categories.'
      : 'Evidence is not strong enough or sufficiently separated from alternatives.';
  }

  return {
    status,
    selectedParticipantId,
    detectorTargetParticipantId,
    confidence: top?.posterior ?? 0,
    margin,
    evidence: top?.evidence ?? [],
    alternatives,
    updatedAt: decisionUpdatedAt,
    reason
  };
};

const cloneParticipant = (participant: Omit<Participant, 'speakingSeconds' | 'speechTurns' | 'transcript' | 'faceMatch'>): Participant => ({
  ...participant,
  media: { ...participant.media },
  speakingSeconds: 0,
  speechTurns: 0,
  transcript: []
});

export class IdentitySession {
  readonly id: string;
  profile: CandidateProfile;
  private participants = new Map<string, Participant>();
  private events: MeetingEvent[] = [];
  private decision: IdentityDecision;

  constructor(id: string, profile: CandidateProfile) {
    this.id = id;
    this.profile = profile;
    this.decision = calculateDecision([], profile);
  }

  ingest(event: MeetingEvent): SessionSnapshot {
    this.events.push(event);
    switch (event.type) {
      case 'metadata.loaded':
        this.profile = event.profile;
        break;
      case 'participant.joined':
        this.participants.set(event.participant.id, cloneParticipant(event.participant));
        break;
      case 'participant.left': {
        const participant = this.participants.get(event.participantId);
        if (participant) participant.leftAt = event.timestamp;
        break;
      }
      case 'participant.name_changed': {
        const participant = this.participants.get(event.participantId);
        if (participant) participant.displayName = event.displayName;
        break;
      }
      case 'participant.media_updated': {
        const participant = this.participants.get(event.participantId);
        if (participant) participant.media = { ...participant.media, ...event.media };
        break;
      }
      case 'participant.speaking': {
        const participant = this.participants.get(event.participantId);
        if (participant) {
          participant.speakingSeconds += event.seconds;
          participant.speechTurns += 1;
        }
        break;
      }
      case 'transcript.final': {
        const participant = this.participants.get(event.participantId);
        if (participant) participant.transcript.push({ id: event.id, text: event.text, timestamp: event.timestamp, source: event.source ?? 'rule' });
        break;
      }
      case 'face.match': {
        const participant = this.participants.get(event.participantId);
        if (participant) participant.faceMatch = { similarity: event.similarity, consented: event.consented, updatedAt: event.timestamp };
        break;
      }
      case 'review.corrected':
        break;
    }
    this.decision = calculateDecision([...this.participants.values()], this.profile, this.decision, new Date().toISOString());
    return this.snapshot();
  }

  snapshot(): SessionSnapshot {
    return {
      id: this.id,
      profile: this.profile,
      participants: [...this.participants.values()].map((participant) => ({ ...participant, media: { ...participant.media }, transcript: [...participant.transcript] })),
      events: [...this.events],
      decision: this.decision
    };
  }
}

export const decisionThresholds = { confidence: IDENTIFY_CONFIDENCE, margin: IDENTIFY_MARGIN };
