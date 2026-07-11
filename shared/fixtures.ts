import type { CandidateProfile, MeetingEvent, Participant } from './types';

export const candidateProfile: CandidateProfile = {
  name: 'Rahul Mehta',
  email: 'rahul.mehta@example.com',
  scheduledAt: '2026-07-11T10:00:00.000Z',
  calendarInvite: 'Sherlock / Rahul Mehta — Security Engineer interview',
  interviewerNames: ['Priya Shah', 'Daniel Kim'],
  aliases: ['Rahul', 'R. Mehta']
};

const at = (second: number) => new Date(Date.parse(candidateProfile.scheduledAt) + second * 1000).toISOString();

export const baseParticipants: Participant[] = [
  {
    id: 'p-priya',
    displayName: 'Priya Shah',
    email: 'priya@sherlock.sh',
    joinedAt: at(-90),
    media: { webcamOn: true, audioOn: true, screenSharing: false },
    speakingSeconds: 12,
    speechTurns: 1,
    transcript: []
  },
  {
    id: 'p-daniel',
    displayName: 'Daniel Kim',
    email: 'daniel@sherlock.sh',
    joinedAt: at(-60),
    media: { webcamOn: true, audioOn: true, screenSharing: false },
    speakingSeconds: 8,
    speechTurns: 1,
    transcript: []
  },
  {
    id: 'p-rahul',
    displayName: 'MacBook Pro',
    joinedAt: at(-15),
    media: { webcamOn: true, audioOn: true, screenSharing: false },
    speakingSeconds: 0,
    speechTurns: 0,
    transcript: []
  },
  {
    id: 'p-observer',
    displayName: 'Observer 1',
    joinedAt: at(5),
    media: { webcamOn: false, audioOn: false, screenSharing: false },
    speakingSeconds: 0,
    speechTurns: 0,
    transcript: []
  }
];

export type DemoScenario = {
  id: 'macbook' | 'wrong-name' | 'rename' | 'ambiguous';
  label: string;
  description: string;
  events: readonly MeetingEvent[];
};

export const scenarioEvents = {
  macbook: [
    {
      id: 'macbook-intro', timestamp: at(18), type: 'transcript.final' as const, participantId: 'p-rahul',
      text: "Hi Priya and Daniel, I'm Rahul Mehta. Thanks for having me.", source: 'rule' as const
    },
    { id: 'macbook-speaking', timestamp: at(18), type: 'participant.speaking' as const, participantId: 'p-rahul', seconds: 18 }
  ],
  'wrong-name': [
    { id: 'wrong-display', timestamp: at(12), type: 'participant.name_changed' as const, participantId: 'p-rahul', displayName: 'Alex' },
    {
      id: 'wrong-name-intro', timestamp: at(20), type: 'transcript.final' as const, participantId: 'p-rahul',
      text: 'Sorry, the invite has the wrong name. This is Rahul Mehta, here for the Sherlock interview.', source: 'rule' as const
    },
    { id: 'wrong-name-speaking', timestamp: at(20), type: 'participant.speaking' as const, participantId: 'p-rahul', seconds: 22 }
  ],
  rename: [
    {
      id: 'rename-intro', timestamp: at(16), type: 'transcript.final' as const, participantId: 'p-rahul',
      text: "Hello, I'm Rahul Mehta.", source: 'rule' as const
    },
    { id: 'rename-speaking', timestamp: at(16), type: 'participant.speaking' as const, participantId: 'p-rahul', seconds: 15 },
    { id: 'candidate-renames', timestamp: at(75), type: 'participant.name_changed' as const, participantId: 'p-rahul', displayName: 'R. Mehta' }
  ],
  ambiguous: [
    {
      id: 'ambiguous-one', timestamp: at(14), type: 'transcript.final' as const, participantId: 'p-rahul',
      text: 'Hi everyone, glad to be here.', source: 'rule' as const
    },
    { id: 'ambiguous-one-speaking', timestamp: at(14), type: 'participant.speaking' as const, participantId: 'p-rahul', seconds: 8 },
    {
      id: 'ambiguous-two', timestamp: at(15), type: 'participant.joined' as const,
      participant: {
        id: 'p-guest', displayName: 'Guest', joinedAt: at(2),
        media: { webcamOn: true, audioOn: true, screenSharing: false }, email: undefined
      }
    },
    {
      id: 'ambiguous-two-text', timestamp: at(20), type: 'transcript.final' as const, participantId: 'p-guest',
      text: 'Hi everyone, glad to be here.', source: 'rule' as const
    },
    { id: 'ambiguous-two-speaking', timestamp: at(20), type: 'participant.speaking' as const, participantId: 'p-guest', seconds: 8 }
  ]
} as const;

export const demoScenarios: DemoScenario[] = [
  { id: 'macbook', label: 'Unknown device name', description: '“MacBook Pro” self-identifies as Rahul.', events: scenarioEvents.macbook },
  { id: 'wrong-name', label: 'Incorrect display name', description: 'A wrong participant name is corrected by the candidate.', events: scenarioEvents['wrong-name'] },
  { id: 'rename', label: 'Display name changes', description: 'Identity remains attached to a stable participant ID.', events: scenarioEvents.rename },
  { id: 'ambiguous', label: 'Ambiguous guests', description: 'Two equally plausible participants trigger abstention.', events: scenarioEvents.ambiguous }
];

export const resetEvents = (): MeetingEvent[] => [
  { id: 'profile', timestamp: at(-120), type: 'metadata.loaded', profile: candidateProfile },
  ...baseParticipants.map((participant) => ({
    id: `join-${participant.id}`,
    timestamp: participant.joinedAt,
    type: 'participant.joined' as const,
    participant: {
      id: participant.id,
      displayName: participant.displayName,
      email: participant.email,
      joinedAt: participant.joinedAt,
      media: participant.media
    }
  }))
];
