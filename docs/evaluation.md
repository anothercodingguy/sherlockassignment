# Evaluation

## Scenario matrix

| Scenario | Expected result | Primary evidence | Safety behavior |
| --- | --- | --- | --- |
| Candidate joins as `MacBook Pro` | Identify `p-rahul` | explicit self-ID + participation | no dependence on display name |
| Wrong name `Alex` | Identify `p-rahul` | correction + self-ID + participation | bad display name is not decisive |
| Candidate becomes `R. Mehta` | Keep `p-rahul` | participant ID + alias + transcript | name change does not create a new identity |
| Two silent/weakly speaking guests | Needs review | comparable behavior only | no fraud-detector target |
| Email-only candidate | Needs review | a single metadata signal | two-category gate prevents auto-selection |
| Unconsented visual signal | Ignored | none | no biometric contribution without consent |
| Scheduled interviewer | Down-ranked | role exclusion | interviewer cannot win from speaking behavior |

## Automated coverage

`npm test` exercises normalization, signal caps, posterior gating, wrong names, display-name changes, ambiguity, missing data, consent gating, role exclusions, and leave events. `npm run test:e2e` verifies the browser dashboard’s selected and abstained states.

## Metrics

The evaluation runner should report these values for a labeled scenario set:

- **Identification accuracy**: correct selected identities / sessions where a decision was emitted.
- **Coverage**: sessions with an emitted detector target / all sessions.
- **False-selection rate**: incorrect emitted targets / all emitted targets.
- **Abstention correctness**: ambiguous sessions with no detector target / known-ambiguous sessions.
- **Time to identification**: elapsed event time until the confidence gate is first passed.

The included fixtures are deterministic acceptance cases, not representative production data. Do not state a production accuracy result without a diverse, consented, speaker-labeled meeting dataset and a held-out calibration set.

## Limitations

- Scripted peers are a demo substitute for SDK/platform adapters.
- Browser VAD is coarse and browser speech recognition is not required; production systems need reliable per-participant ASR.
- The local visual comparison is intentionally weak and must be replaced by an evaluated, consented biometric system if used at all.
- Heuristic weights are interpretable but not calibrated from real interviews.
- An LLM may enrich an explicit transcript claim but is bounded, optional, and cannot make the identity decision.
