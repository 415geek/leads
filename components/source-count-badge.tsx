'use client';

interface SourceCountBadgeProps {
  sourceCount?: number | null;
  sourceIds?: string[] | null;
}

export function SourceCountBadge({ sourceCount, sourceIds }: SourceCountBadgeProps) {
  const count = sourceCount ?? sourceIds?.length ?? 1;
  if (count <= 1) return null;

  const label = `${count} 个来源`;
  const tooltip = sourceIds?.join(', ') ?? label;

  return (
    <span
      className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20"
      title={tooltip}
    >
      {label}
    </span>
  );
}
