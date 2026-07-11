export type EvidenceCategory = 'metadata' | 'transcript' | 'behavior' | 'role' | 'biometric';

export type MediaState = {
  webcamOn: boolean;
  audioOn: boolean;
  screenSharing: boolean;
};

export type Participant = {
  id: string;
  displayName: string;
  email?: string;
  joinedAt: string;
  leftAt?: string;
  media: MediaState;
  speakingSeconds: number;
  speechTurns: number;
  transcript: TranscriptLine[];
  faceMatch?: { similarity: number; consented: boolean; updatedAt: string };
};

export type CandidateProfile = {
  name: string;
  email: string;
  scheduledAt: string;
  calendarInvite: string;
  interviewerNames: string[];
  aliases?: string[];
};

export type TranscriptLine = {
  id: string;
  text: string;
  timestamp: string;
  source: 'rule' | 'llm' | 'browser';
};

export type MeetingEvent =
  | {
      id: string;
      timestamp: string;
      type: 'participant.joined';
      participant: Omit<Participant, 'speakingSeconds' | 'speechTurns' | 'transcript' | 'faceMatch'>;
    }
  | { id: string; timestamp: string; type: 'participant.left'; participantId: string }
  | { id: string; timestamp: string; type: 'participant.name_changed'; participantId: string; displayName: string }
  | { id: string; timestamp: string; type: 'participant.media_updated'; participantId: string; media: Partial<MediaState> }
  | { id: string; timestamp: string; type: 'participant.speaking'; participantId: string; seconds: number }
  | { id: string; timestamp: string; type: 'transcript.final'; participantId: string; text: string; source?: TranscriptLine['source'] }
  | { id: string; timestamp: string; type: 'face.match'; participantId: string; similarity: number; consented: boolean }
  | { id: string; timestamp: string; type: 'metadata.loaded'; profile: CandidateProfile }
  | { id: string; timestamp: string; type: 'review.corrected'; participantId?: string; correctParticipantId: string; reviewer: string };

export type Evidence = {
  id: string;
  participantId: string;
  category: EvidenceCategory;
  impact: number;
  label: string;
  detail: string;
  source: 'deterministic' | 'llm' | 'browser';
};

export type RankedParticipant = {
  participantId: string;
  displayName: string;
  rawScore: number;
  posterior: number;
  evidence: Evidence[];
  supportedCategories: EvidenceCategory[];
};

export type DecisionStatus = 'identified' | 'unassigned' | 'needs_review';

export type IdentityDecision = {
  status: DecisionStatus;
  selectedParticipantId?: string;
  detectorTargetParticipantId: string | null;
  confidence: number;
  margin: number;
  evidence: Evidence[];
  alternatives: RankedParticipant[];
  updatedAt: string;
  reason: string;
};

export type SessionSnapshot = {
  id: string;
  profile: CandidateProfile;
  participants: Participant[];
  events: MeetingEvent[];
  decision: IdentityDecision;
};

export type LlmClaim = {
  kind: 'self_identification' | 'candidate_reference' | 'interviewer_role' | 'contradiction';
  name?: string;
  confidence: number;
  rationale: string;
};
