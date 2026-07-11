import { describe, expect, it } from 'vitest';
import { baseParticipants, candidateProfile, resetEvents, scenarioEvents } from '../shared/fixtures';
import { IdentitySession, calculateDecision, normalize } from '../shared/scoring';
import type { MeetingEvent } from '../shared/types';

const seededSession = () => {
  const session = new IdentitySession('test-session', candidateProfile);
  resetEvents().forEach((meetingEvent) => session.ingest(meetingEvent));
  return session;
};

const replay = (items: readonly MeetingEvent[]) => {
  const session = seededSession();
  items.forEach((meetingEvent) => session.ingest(meetingEvent));
  return session.snapshot().decision;
};

describe('identity scoring engine', () => {
  it('normalizes names and email-safe strings consistently', () => {
    expect(normalize(' Dr. Rahul  Mehta ')).toBe('rahul mehta');
    expect(normalize('RAHUL.MEHTA@example.com')).toBe('rahul mehta example com');
  });

  it('identifies a candidate using a device name plus self-identification and behavior', () => {
    const decision = replay(scenarioEvents.macbook);
    expect(decision.status).toBe('identified');
    expect(decision.selectedParticipantId).toBe('p-rahul');
    expect(decision.detectorTargetParticipantId).toBe('p-rahul');
    expect(decision.confidence).toBeGreaterThanOrEqual(0.75);
    expect(new Set(decision.alternatives[0].supportedCategories).size).toBeGreaterThanOrEqual(2);
  });

  it('recovers from an incorrect display name through transcript evidence', () => {
    const decision = replay(scenarioEvents['wrong-name']);
    expect(decision.status).toBe('identified');
    expect(decision.selectedParticipantId).toBe('p-rahul');
    expect(decision.evidence.some((item) => item.label === 'Explicit self-identification')).toBe(true);
  });

  it('keeps identity attached to participant ID when the display name changes', () => {
    const decision = replay(scenarioEvents.rename);
    expect(decision.status).toBe('identified');
    expect(decision.selectedParticipantId).toBe('p-rahul');
  });

  it('abstains when two guests are behaviorally indistinguishable', () => {
    const decision = replay(scenarioEvents.ambiguous);
    expect(decision.status).toBe('needs_review');
    expect(decision.detectorTargetParticipantId).toBeNull();
    expect(decision.margin).toBeLessThan(0.2);
  });

  it('does not let an isolated exact email bypass independent-evidence gating', () => {
    const session = new IdentitySession('email-only', candidateProfile);
    session.ingest({
      id: 'joined', timestamp: new Date().toISOString(), type: 'participant.joined', participant: {
        id: 'candidate', displayName: 'Unknown', email: candidateProfile.email, joinedAt: new Date().toISOString(),
        media: { webcamOn: false, audioOn: false, screenSharing: false }
      }
    });
    const decision = session.snapshot().decision;
    expect(decision.status).toBe('needs_review');
    expect(decision.detectorTargetParticipantId).toBeNull();
  });

  it('ignores a face match that lacks consent', () => {
    const session = seededSession();
    session.ingest({ id: 'face', timestamp: new Date().toISOString(), type: 'face.match', participantId: 'p-rahul', similarity: 0.99, consented: false });
    const participant = session.snapshot().decision.alternatives.find((item) => item.participantId === 'p-rahul')!;
    expect(participant.evidence.find((item) => item.label === 'Reference ignored')?.impact).toBe(0);
    expect(participant.evidence.some((item) => item.label === 'Consented local visual match')).toBe(false);
  });

  it('down-ranks scheduled interviewers even when their name resembles the candidate profile', () => {
    const session = seededSession();
    const priya = session.snapshot().decision.alternatives.find((item) => item.participantId === 'p-priya')!;
    expect(priya.rawScore).toBeLessThan(-3);
    expect(priya.evidence.some((item) => item.label === 'Scheduled interviewer')).toBe(true);
  });

  it('handles a participant leaving without losing the remaining candidate state', () => {
    const session = seededSession();
    scenarioEvents.macbook.forEach((meetingEvent) => session.ingest(meetingEvent));
    session.ingest({ id: 'leave', timestamp: new Date().toISOString(), type: 'participant.left', participantId: baseParticipants[3].id });
    expect(session.snapshot().decision.selectedParticipantId).toBe('p-rahul');
  });

  it('retains candidate during hysteresis and expires correctly after timeout', () => {
    const session = new IdentitySession('hysteresis-test', candidateProfile);
    const baseTime = Date.parse(candidateProfile.scheduledAt);
    
    // Join candidate with exact email to trigger metadata support
    session.ingest({
      id: 'join',
      timestamp: new Date(baseTime).toISOString(),
      type: 'participant.joined',
      participant: {
        id: 'candidate-id',
        displayName: 'Rahul Mehta',
        email: candidateProfile.email,
        joinedAt: new Date(baseTime).toISOString(),
        media: { webcamOn: false, audioOn: false, screenSharing: false }
      }
    });

    // Add speaking activity and transcript to firmly identify
    session.ingest({
      id: 'speak',
      timestamp: new Date(baseTime + 1000).toISOString(),
      type: 'participant.speaking',
      participantId: 'candidate-id',
      seconds: 25
    });
    session.ingest({
      id: 'transcript',
      timestamp: new Date(baseTime + 1000).toISOString(),
      type: 'transcript.final',
      participantId: 'candidate-id',
      text: "Hello Priya and Daniel, I am Rahul Mehta"
    });

    // Verify identified
    const firstDecision = session.snapshot().decision;
    expect(firstDecision.status).toBe('identified');
    expect(firstDecision.selectedParticipantId).toBe('candidate-id');
    const identifiedTime = firstDecision.updatedAt;

    // Drop the scores (e.g. change name to "Observer 2" to lose metadata matching, remove webcam)
    session.ingest({
      id: 'rename',
      timestamp: new Date(baseTime + 5000).toISOString(),
      type: 'participant.name_changed',
      participantId: 'candidate-id',
      displayName: 'Observer 2'
    });

    // Check hysteresis is active (now is T + 5s, which is within 10s of identifiedTime)
    const decisionT5 = session.snapshot().decision;
    expect(decisionT5.status).toBe('identified'); // Still identified due to hysteresis!
    expect(decisionT5.reason).toContain('hysteresis');
    expect(decisionT5.updatedAt).toBe(identifiedTime); // original updatedAt timestamp preserved!

    // Verify it expires when we query it at T + 12s (which is 11s after identifiedTime)
    const expiredDecision = calculateDecision(
      session.snapshot().participants,
      session.profile,
      decisionT5,
      new Date(baseTime + 12000).toISOString()
    );
    expect(expiredDecision.status).toBe('needs_review'); // Expired!
    expect(expiredDecision.selectedParticipantId).toBeUndefined();
  });
});
