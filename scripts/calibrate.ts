import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Review = { correctParticipantId: string; selectedParticipantId?: string; featureSummary?: Record<string, unknown> };

const input = join(process.cwd(), 'data', 'review-labels.jsonl');
const output = join(process.cwd(), 'data', 'calibration-summary.json');

try {
  const lines = (await readFile(input, 'utf8')).trim().split('\n').filter(Boolean);
  const reviews = lines.map((line) => JSON.parse(line) as Review);
  const correct = reviews.filter((review) => review.selectedParticipantId === review.correctParticipantId).length;
  await writeFile(output, JSON.stringify({
    version: 1,
    reviewedSessions: reviews.length,
    agreement: reviews.length ? correct / reviews.length : 0,
    note: 'This prototype records review labels for offline calibration. Do not update live scoring weights without a held-out evaluation.'
  }, null, 2));
  console.log(`Wrote ${output} from ${reviews.length} review labels.`);
} catch {
  console.error('No review labels found. Submit a dashboard review before running calibration.');
  process.exitCode = 1;
}
