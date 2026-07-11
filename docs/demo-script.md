# 7-minute demo video script

## 0:00–0:45 — Problem and principle

Explain that display names are untrusted and a single meeting can contain multiple interviewers, observers, device names, and renamed participants. State the safety principle: uncertain identity means no fraud-detector target.

## 0:45–1:40 — Architecture

Show the Mermaid diagram. Call out the normalized platform adapter, candidate profile, evidence engine, unknown-candidate baseline, WebSocket dashboard, and offline-only learning loop.

## 1:40–3:15 — Unknown device name

Open the browser app and run **Unknown device name**. Point out the stable participant ID, participant ranking, confidence/margin gates, and evidence ledger showing the self-identification and behavior contributions. Explain that the engine never trusted `MacBook Pro` as a name match.

## 3:15–4:30 — Bad name and renamed participant

Reset and run **Incorrect display name**. Show that Alex is still selected only after the explicit correction. Reset again and run **Display name changes**. Explain that updates attach to the participant ID, so `R. Mehta` does not reset the identity.

## 4:30–5:25 — Graceful uncertainty

Reset and run **Ambiguous guests**. Show `Needs review`, the close ranking, and `No participant target`. Emphasize that downstream detectors remain disengaged instead of receiving a guessed participant.

## 5:25–6:10 — Privacy and enrichment

Show the optional camera/mic button and consented local reference section. Explain that the visual signal is local, weak, capped, and deletable. Show the optional `.env` configuration and explain that LLM output is constrained to a claim schema rather than a decision.

## 6:10–7:00 — Trade-offs and next steps

Discuss the simulator trade-off, deterministic explainability, and missing production calibration. Next steps: real platform adapters, separate-stream ASR, consented model evaluation, labeled-data calibration, role-aware scheduling integrations, and operational monitoring for abstention and false-selection rates.
