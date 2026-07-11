import { useEffect, useMemo, useState } from 'react';
import { demoScenarios, resetEvents } from '../../shared/fixtures';
import type { MeetingEvent, SessionSnapshot } from '../../shared/types';

const API = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);

export type ApiState = 'connecting' | 'ready' | 'error';

export function useSherlockSession() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>();
  const [apiState, setApiState] = useState<ApiState>('connecting');
  const [error, setError] = useState<string>();
  const [scenarioRunning, setScenarioRunning] = useState<string>();
  const [history, setHistory] = useState<Array<{ at: string; confidence: number }>>([]);

  const postEvent = async (meetingEvent: MeetingEvent) => {
    if (!snapshot) return;
    const response = await fetch(`${API}/api/sessions/${snapshot.id}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meetingEvent)
    });
    if (!response.ok) throw new Error('Could not add meeting event.');
    const next = await response.json() as SessionSnapshot;
    setSnapshot(next);
  };

  const reset = async () => {
    setApiState('connecting');
    setError(undefined);
    setHistory([]);
    try {
      const response = await fetch(`${API}/api/sessions`, { method: 'POST' });
      if (!response.ok) throw new Error('Could not create the demo session.');
      let next = await response.json() as SessionSnapshot;
      for (const meetingEvent of resetEvents()) {
        const seeded = await fetch(`${API}/api/sessions/${next.id}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(meetingEvent)
        });
        next = await seeded.json() as SessionSnapshot;
      }
      setSnapshot(next);
      setApiState('ready');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unknown error during reset.');
      setApiState('error');
    }
  };

  useEffect(() => {
    void reset();
  }, []);

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

  const timeline = useMemo(() => {
    return history.map((point, index) => `${(index / Math.max(1, history.length - 1)) * 100},${100 - point.confidence * 88}`).join(' ');
  }, [history]);

  const runScenario = async (id: string) => {
    const scenario = demoScenarios.find((item) => item.id === id);
    if (!scenario) return;
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

  const submitReview = async (reviewer: string, reviewTarget: string) => {
    if (!snapshot) return;
    const response = await fetch(`${API}/api/sessions/${snapshot.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        selectedParticipantId: snapshot.decision.selectedParticipantId, 
        correctParticipantId: reviewTarget, 
        reviewer, 
        featureSummary: { confidence: snapshot.decision.confidence, status: snapshot.decision.status } 
      })
    });
    if (!response.ok) throw new Error('Could not save review label.');
  };

  return {
    snapshot,
    apiState,
    error,
    setError,
    scenarioRunning,
    history,
    timeline,
    postEvent,
    reset,
    runScenario,
    submitReview
  };
}
