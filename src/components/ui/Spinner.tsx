import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-5 w-5 border-2',
  lg: 'h-8 w-8 border-[3px]',
} as const;

export function Spinner({
  size = 'md',
  className,
  label,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  /** Give the spinner an accessible name when it is the only thing on screen. */
  label?: string;
}) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'inline-block shrink-0 animate-spin rounded-full',
        'border-current border-e-transparent opacity-70',
        SIZES[size],
        className
      )}
    />
  );
}
