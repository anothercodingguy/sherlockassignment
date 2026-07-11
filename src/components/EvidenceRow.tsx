import type { Evidence } from '../../shared/types';

interface EvidenceRowProps {
  item: Evidence;
}

export function EvidenceRow({ item }: EvidenceRowProps) {
  return (
    <li className={`evidence-row ${item.impact < 0 ? 'negative' : item.impact === 0 ? 'neutral' : 'positive'}`}>
      <span className="impact">{item.impact > 0 ? '+' : ''}{item.impact.toFixed(2)}</span>
      <span>
        <strong>{item.label}</strong>
        <small>{item.detail}</small>
      </span>
    </li>
  );
}
