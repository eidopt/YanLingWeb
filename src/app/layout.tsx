import './globals.css';
import { AppShell } from './_components/AppShell';
import { ThemeBody } from './_components/ThemeBody';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AppGen AI',
  description: 'AI 驱动的全平台应用设计工具',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script
          // Theme init script must run synchronously before paint to prevent flash; dangerouslySetInnerHTML is required
          // eslint-disable-next-line react/no-danger -- hardcoded static string, no user input
          dangerouslySetInnerHTML={{
            __html: [
              `try{var t=localStorage.getItem('app-theme');`,
              `if(t==='light')document.body.setAttribute('data-app-theme','light')`,
              `}catch(e){}`,
            ].join(''),
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeBody>
          <AppShell>{children}</AppShell>
        </ThemeBody>
      </body>
    </html>
  );
}
