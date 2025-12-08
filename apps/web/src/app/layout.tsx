import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { Providers } from '@/components/Providers';
import '@/styles/globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'TextMesh - Connect Through Words',
    template: '%s | TextMesh',
  },
  description: 'A text-first social platform where ideas matter more than images.',
  keywords: ['social media', 'text', 'thoughts', 'connect', 'share'],
  authors: [{ name: 'TextMesh' }],
  creator: 'TextMesh',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://textmesh.com',
    siteName: 'TextMesh',
    title: 'TextMesh - Connect Through Words',
    description: 'A text-first social platform where ideas matter more than images.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TextMesh - Connect Through Words',
    description: 'A text-first social platform where ideas matter more than images.',
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
        <Providers>
          {children}
          <Toaster
            position="bottom-center"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'var(--toast-bg)',
                color: 'var(--toast-color)',
                borderRadius: '12px',
                padding: '12px 16px',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
