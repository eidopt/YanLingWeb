import './globals.css';
import { AppShell } from './_components/AppShell';
import { ThemeBody } from './_components/ThemeBody';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AppGen AI',
  description: 'AI 驱动的全平台应用设计工具',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          // eslint-disable-next-line react/no-danger
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
