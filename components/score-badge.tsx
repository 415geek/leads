'use client';

import { Badge } from '@/components/ui/badge';
import { getScoreColor, getScoreLabel } from '@/lib/scoring';

interface ScoreBadgeProps {
  score: number;
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  
  return (
    <Badge className={`${color} text-white`}>
      {score} - {label}
    </Badge>
  );
}
