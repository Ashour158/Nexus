import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Standard utility for conditional + merged Tailwind class strings. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
