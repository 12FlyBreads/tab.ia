import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Tab IA', description: 'Gere uma tablatura básica a partir de áudio.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
