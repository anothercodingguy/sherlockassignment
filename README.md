# Sherlock Candidate Identity Prototype

This is a local, real-time candidate-identification demo for interview meetings. It deliberately combines weak signals rather than trusting a display name: invite metadata, speaker-attributed transcript, media behavior, role exclusions, and an optional consented local visual signal.

The demo uses a real browser camera/microphone tile for one participant and scripted peers so it can be demonstrated reliably on one laptop. It is a platform-neutral prototype, not a Zoom, Teams, or Meet integration.

## Run it

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The app works without credentials. Camera and microphone permission is optional; the meeting scenarios and deterministic transcript controls remain fully functional if it is denied.

```bash
npm test
npm run test:e2e
```

For browser E2E tests, install Playwright's browser once with `npx playwright install chromium`.

## Demo flow

1. Start with **Unknown device name**. The participant called `MacBook Pro` introduces themselves as Rahul; Sherlock selects their stable participant ID and shows the supporting evidence.
2. Reset, then run **Incorrect display name**. A participant named Alex corrects the invite; transcript and behavior outweigh the bad display name.
3. Reset, then run **Display name changes**. The target remains associated with its participant ID as the name changes to `R. Mehta`.
4. Reset, then run **Ambiguous guests**. Sherlock deliberately emits no detector target and asks for review.

The dashboard also accepts manually injected speaker-attributed transcript events and can use the local webcam/microphone to add real media and voice-activity signals.

## Decision model

Each active participant receives capped evidence contributions from five categories:

| Category | Examples |
| --- | --- |
| Metadata | exact candidate email, name/alias match, calendar metadata |
| Transcript | explicit self-introduction, correction of bad invite data |
| Behavior | camera/microphone state, speech turns, speaking duration |
| Role exclusion | scheduled interviewer, interviewer statements, observer-style names |
| Biometric | optional consented local visual-similarity signal |

Scores are converted to a softmax posterior over every participant plus an **unknown candidate** baseline. A participant is routed to fraud detectors only at **≥75% confidence**, **≥20 percentage-point separation** from all alternatives (including unknown), and with **two independent evidence categories**. Every other state returns `detectorTargetParticipantId: null`.

This is intentionally not a production identity model. Its confidence is a transparent prototype score, not calibrated real-world probability.

## APIs and adapter contract

The Node service exposes a small meeting-adapter boundary:

- `POST /api/sessions` — creates a meeting identity session
- `POST /api/sessions/:id/events` — ingests a normalized `MeetingEvent`
- `GET /api/sessions/:id` and `/decision` — returns session state or identity decision
- `GET /ws?sessionId=:id` — broadcasts live snapshots
- `POST /api/enrich/utterance` — optional bounded transcript-claim extraction
- `POST /api/sessions/:id/review` — saves a privacy-safe review label

`MeetingEvent` supports participant joins/leaves, display-name changes, media updates, speaking activity, final transcripts, face-match evidence, external metadata, and review corrections. A production Meet, Teams, or Zoom adapter only needs to emit this contract.

## Optional LLM enrichment

Copy `.env.example` to `.env` and set `OPENAI_API_KEY` and `OPENAI_MODEL` (plus an optional OpenAI-compatible `OPENAI_BASE_URL`). The server sends one bounded transcript snippet to extract a strict claim schema. The LLM cannot rank participants or emit a decision; its output is validated and capped before it can become transcript evidence. Without credentials, deterministic transcript rules are used.

## Privacy and learning loop

- No raw meeting audio or video is stored by this prototype.
- A reference image stays as a browser object URL and can be deleted immediately. The local visual comparison is a deliberately weak prototype appearance signal, not production face recognition.
- A visual signal is ignored unless the consent checkbox is checked.
- Review labels are stored in ignored local `data/review-labels.jsonl` without raw media. Run `npm run calibrate` to create a descriptive calibration summary. Live scoring weights never self-update.

See [architecture](docs/architecture.md), [evaluation](docs/evaluation.md), and the [demo-video script](docs/demo-script.md) for submission materials.
