'use client';

import { cn } from '@/lib/cn';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const sizeClasses = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
};

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  if (src) {
    return (
      // Avatar images may come from arbitrary user-provided URLs; next/image
      // would require every domain to be allow-listed. For tiny avatar
      // thumbnails the LCP penalty is negligible, so we use a plain img.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={cn('rounded-full object-cover', sizeClasses[size], className)}
      />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-primary-light text-primary font-semibold',
        sizeClasses[size],
        className
      )}
      role="img"
      aria-label={name}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
