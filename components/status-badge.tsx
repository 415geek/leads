'use client';

import { Badge } from '@/components/ui/badge';
import { LeadStatus } from '@/types/lead';

const statusConfig: Record<LeadStatus, { label: string; className: string }> = {
  new: { label: '新线索', className: 'bg-blue-500 text-white' },
  contacted: { label: '已联系', className: 'bg-purple-500 text-white' },
  in_progress: { label: '跟进中', className: 'bg-yellow-500 text-white' },
  converted: { label: '已成交', className: 'bg-green-500 text-white' },
  not_interested: { label: '无意向', className: 'bg-gray-400 text-white' },
};

interface StatusBadgeProps {
  status: LeadStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <Badge className={config.className}>
      {config.label}
    </Badge>
  );
}
