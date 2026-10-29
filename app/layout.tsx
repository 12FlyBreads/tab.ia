import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'tab.ia', description: 'Converta áudio em tablatura com o tab.ia.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
