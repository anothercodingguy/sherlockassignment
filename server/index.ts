import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { candidateProfile } from '../shared/fixtures';
import { IdentitySession } from '../shared/scoring';
import type { LlmClaim, MeetingEvent, SessionSnapshot } from '../shared/types';

const port = Number(process.env.PORT ?? 3001);
const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json({ limit: '100kb' }));

const eventSchema = z.object({ id: z.string(), timestamp: z.string(), type: z.string() }).passthrough();
const claimsSchema = z.object({
  claims: z.array(z.object({
    kind: z.enum(['self_identification', 'candidate_reference', 'interviewer_role', 'contradiction']),
    name: z.string().optional(),
    confidence: z.number().min(0).max(1),
    rationale: z.string().max(240)
  })).max(4)
});
const enrichRequestSchema = z.object({ text: z.string().min(1).max(1200), candidateName: z.string().min(1).max(120) });
const reviewSchema = z.object({
  selectedParticipantId: z.string().optional(),
  correctParticipantId: z.string(),
  reviewer: z.string().min(1).max(80),
  featureSummary: z.record(z.string(), z.unknown()).optional()
});

const sessions = new Map<string, IdentitySession>();
const sockets = new Map<string, Set<WebSocket>>();

const newSession = () => {
  const id = crypto.randomUUID();
  const session = new IdentitySession(id, candidateProfile);
  sessions.set(id, session);
  return session;
};

const sendSnapshot = (socket: WebSocket, snapshot: SessionSnapshot) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'snapshot', snapshot }));
};

const broadcast = (sessionId: string, snapshot: SessionSnapshot) => {
  for (const socket of sockets.get(sessionId) ?? []) sendSnapshot(socket, snapshot);
};

app.get('/health', (_request, response) => response.json({ ok: true, llmEnabled: Boolean(process.env.OPENAI_API_KEY) }));

app.post('/api/sessions', (_request, response) => {
  const session = newSession();
  response.status(201).json(session.snapshot());
});

app.get('/api/sessions/:sessionId', (request, response) => {
  const session = sessions.get(request.params.sessionId);
  if (!session) return response.status(404).json({ error: 'Session not found' });
  return response.json(session.snapshot());
});

app.get('/api/sessions/:sessionId/decision', (request, response) => {
  const session = sessions.get(request.params.sessionId);
  if (!session) return response.status(404).json({ error: 'Session not found' });
  return response.json(session.snapshot().decision);
});

app.post('/api/sessions/:sessionId/events', (request, response) => {
  const session = sessions.get(request.params.sessionId);
  if (!session) return response.status(404).json({ error: 'Session not found' });
  const parsed = eventSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Invalid meeting event', issues: parsed.error.flatten() });

  const snapshot = session.ingest(parsed.data as MeetingEvent);
  broadcast(session.id, snapshot);
  return response.status(202).json(snapshot);
});

app.post('/api/sessions/:sessionId/review', async (request, response) => {
  const session = sessions.get(request.params.sessionId);
  if (!session) return response.status(404).json({ error: 'Session not found' });
  const parsed = reviewSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Invalid review label', issues: parsed.error.flatten() });
  const review = { sessionId: session.id, submittedAt: new Date().toISOString(), ...parsed.data };
  const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
  await mkdir(dataDir, { recursive: true });
  await appendFile(join(dataDir, 'review-labels.jsonl'), `${JSON.stringify(review)}\n`, 'utf8');
  return response.status(201).json({ accepted: true });
});

app.post('/api/enrich/utterance', async (request, response) => {
  const parsed = enrichRequestSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Invalid transcript payload', issues: parsed.error.flatten() });
  if (!process.env.OPENAI_API_KEY) return response.status(503).json({ error: 'LLM enrichment is disabled. Add OPENAI_API_KEY to enable it.' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = process.env.OPENAI_MODEL;
    if (!model) return response.status(503).json({ error: 'Set OPENAI_MODEL to enable LLM enrichment.' });
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Extract only explicit identity claims from one interview transcript line. Never rank participants. Return JSON {claims:[{kind,name?,confidence,rationale}]}. kinds: self_identification, candidate_reference, interviewer_role, contradiction. At most 4 claims. Do not infer missing facts.' },
          { role: 'user', content: `Scheduled candidate: ${parsed.data.candidateName}\nTranscript: ${parsed.data.text}` }
        ]
      })
    });
    if (!upstream.ok) return response.status(502).json({ error: 'LLM provider request failed' });
    const payload = await upstream.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return response.status(502).json({ error: 'LLM provider returned no content' });
    const claims = claimsSchema.safeParse(JSON.parse(content));
    if (!claims.success) return response.status(502).json({ error: 'LLM output did not match the bounded claim schema' });
    const safeClaims: LlmClaim[] = claims.data.claims;
    return response.json({ claims: safeClaims });
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error && error.name === 'AbortError' ? 'LLM enrichment timed out' : 'LLM enrichment failed' });
  } finally {
    clearTimeout(timeout);
  }
});
const distPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
app.use(express.static(distPath));

app.use((request, response, next) => {
  if (request.method !== 'GET') {
    return next();
  }
  if (request.path.startsWith('/api') || request.path === '/health' || request.path === '/ws') {
    return next();
  }
  response.sendFile(join(distPath, 'index.html'));
});

const server = app.listen(port, () => console.log(`Sherlock API listening on http://localhost:${port}`));
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (socket, request) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId || !sessions.has(sessionId)) return socket.close(1008, 'Unknown session');
  const sessionSockets = sockets.get(sessionId) ?? new Set<WebSocket>();
  sessionSockets.add(socket);
  sockets.set(sessionId, sessionSockets);
  sendSnapshot(socket, sessions.get(sessionId)!.snapshot());
  socket.on('close', () => sessionSockets.delete(socket));
});
