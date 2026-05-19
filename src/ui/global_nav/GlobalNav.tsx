'use client';

import { globalNavContent as c } from './GlobalNav.content';
import styles from './GlobalNav.module.css';
import { cx } from 'base/classname';
import { useAppServices } from 'hooks/useAppServices';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AuthUser } from 'services/AuthService';
import { AUTH_CHANGED_EVENT } from 'services/AuthService';
import { showDialog } from 'ui/authenticating';
import { UserSettingsDialog } from 'ui/user_settings';

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
  const { authService } = useAppServices();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const syncUser = () => {
      setUser(authService.getUser());
    };
    syncUser();

    window.addEventListener(AUTH_CHANGED_EVENT, syncUser);
    window.addEventListener('storage', syncUser);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncUser);
      window.removeEventListener('storage', syncUser);
    };
  }, [authService]);

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
          <strong>{c.brand.name}</strong>
          <span>{c.brand.tagline}</span>
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
        {user ? (
          <button
            type="button"
            className={styles.userButton}
            onClick={() => { setSettingsOpen(true); }}
            aria-label={c.auth.openUserSettings}
            title={user.username}
          >
            <span className={styles.userAvatar}>
              {user.username.slice(0, 1).toUpperCase()}
            </span>
            <span className={styles.userName}>{user.username}</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              className={styles.authLogin}
              onClick={() => openAuth('login')}
            >
              {c.auth.login}
            </button>
            <button
              type="button"
              className={styles.authRegister}
              onClick={() => openAuth('register')}
            >
              {c.auth.register}
            </button>
          </>
        )}
      </div>
      {user && settingsOpen && (
        <UserSettingsDialog
          user={user}
          onClose={() => { setSettingsOpen(false); }}
        />
      )}
    </header>
  );
}
