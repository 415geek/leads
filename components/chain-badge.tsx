'use client';

interface ChainBadgeProps {
  isChain: boolean | null | undefined;
  chainName?: string | null;
}

export function ChainBadge({ isChain, chainName }: ChainBadgeProps) {
  if (!isChain) return null;
  return (
    <span
      className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20"
      title={chainName ? `连锁品牌：${chainName}` : '已识别为连锁品牌'}
    >
      {chainName ?? '连锁'}
    </span>
  );
}
