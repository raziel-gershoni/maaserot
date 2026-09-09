import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge has to be taught the custom scales from globals.css, or it
 * mis-files them.
 *
 * `text-figure-lg` and `text-eyebrow` look like `text-<colour>` to the stock
 * config, so they land in the text-colour group and are silently dropped by any
 * colour class that follows — which made the `size` prop on <Money> and the
 * eyebrow on every stat label a no-op:
 *
 *   twMerge('text-figure-lg', 'text-ink')  ->  'text-ink'      (size lost)
 *
 * The custom radii have the opposite problem: unknown to the stock config, they
 * conflict with nothing, so `rounded-control rounded-row` both survive and the
 * later one only wins by CSS source order rather than by merge.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['eyebrow', 'figure', 'figure-sm', 'figure-lg'] }],
      rounded: [{ rounded: ['control', 'row', 'card', 'panel'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
