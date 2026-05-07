'use client';

import styles from './GlobalNav.module.css';
import { cx } from 'base/classname';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { showDialog } from 'ui/authenticating';

export interface NavItem {
  label: string;
  to: string;
  end?: boolean;
}

interface GlobalNavProps {
  nav: NavItem[];
  variant?: 'default' | 'overlay';
}

export function GlobalNav({ nav, variant = 'default' }: GlobalNavProps) {
  const router = useRouter();
  const pathname = usePathname();

  const openAuth = (tab: 'login' | 'register') => {
    showDialog((redirect) => {
      if (redirect) {router.push(redirect);}
    }, { initialTab: tab });
  };

  return (
    <header className={variant === 'overlay' ? styles.topbarOverlay : styles.topbar}>
      <Link href="/" className={styles.brand}>
        <span className={styles.brandMark}>✦</span>
        <div className={styles.brandText}>
          <strong>AppGen AI</strong>
          <span>AI 驱动的全平台应用设计工具</span>
        </div>
      </Link>

      <nav className={styles.nav}>
        {nav.map(item => {
          const isActive = item.end
            ? pathname === item.to
            : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              href={item.to}
              className={cx(styles.navLink, isActive && styles.navActive)}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.authRow}>
        <button
          type="button"
          className={styles.authLogin}
          onClick={() => openAuth('login')}
        >
          登录
        </button>
        <button
          type="button"
          className={styles.authRegister}
          onClick={() => openAuth('register')}
        >
          免费注册
        </button>
      </div>
    </header>
  );
}
