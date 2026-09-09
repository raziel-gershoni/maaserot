import { Rubik, Assistant } from 'next/font/google';

/**
 * Rubik carries headings and money — geometric Hebrew with softened terminals,
 * so large figures read warm rather than clinical.
 */
export const rubik = Rubik({
  subsets: ['latin', 'hebrew'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-rubik',
  display: 'swap',
});

/**
 * Assistant carries body and UI — the Hebrew humanist workhorse, drawn for
 * small sizes where Rubik's geometry gets tiring.
 */
export const assistant = Assistant({
  subsets: ['latin', 'hebrew'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-assistant',
  display: 'swap',
});

export const fontVariables = `${rubik.variable} ${assistant.variable}`;
