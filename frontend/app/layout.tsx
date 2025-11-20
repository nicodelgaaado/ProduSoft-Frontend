import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import { AuthProvider } from '@/context/AuthContext';
import { Header } from '@/components/Header';
import '@carbon/styles/css/styles.min.css';
import './globals.css';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'ProduSoft',
  description: 'Operator and supervisor workflow console with staged order tracking.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={plexSans.className} data-carbon-theme="g10" suppressHydrationWarning>
        <AuthProvider>
          <Header />
          <main className="app-main">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
