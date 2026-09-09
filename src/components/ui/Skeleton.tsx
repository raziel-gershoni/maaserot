import { cn } from '@/lib/utils';

/**
 * A loading placeholder must not be mistakable for an empty state — the old
 * screens flashed "no charities yet" on every visit before the fetch resolved.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('skeleton rounded-row', className)}
    />
  );
}

export function SkeletonRows({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
