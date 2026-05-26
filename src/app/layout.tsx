import './globals.css';
import { AppShell } from './_components/AppShell';
import { ThemeBody } from './_components/ThemeBody';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AppGen AI',
  description: 'AI 驱动的全平台应用设计工具',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+SC:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
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
