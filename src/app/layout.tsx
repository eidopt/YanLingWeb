import './globals.css';
import { AppShell } from './_components/AppShell';
import type { Metadata } from 'next';

// eslint-disable-next-line react-refresh/only-export-components -- Next.js layout pattern requires exporting metadata alongside component
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
      <body suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
