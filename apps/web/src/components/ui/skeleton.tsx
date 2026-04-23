import { cn } from '@/lib/cn';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Low-level shimmer placeholder. Used by page-level loading states across the
 * app (pipeline board, deal detail, etc.).
 */
export function Skeleton({ className, ...props }: SkeletonProps): JSX.Element {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
