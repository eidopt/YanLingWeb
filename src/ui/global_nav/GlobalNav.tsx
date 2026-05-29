'use client';

import { globalNavContent as c } from './GlobalNav.content';
import styles from './GlobalNav.module.css';
import { cx } from 'base/classname';
import { useTheme } from 'hooks/useTheme';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuthUser } from 'state/authState';
import { showDialog } from 'ui/authenticating';
import { Box, Button, Inline, Stack, Text } from 'ui/base';
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

interface ThemeToggleButtonProps {
  variant?: 'nav' | 'sidebar';
}

export function ThemeToggleButton({ variant = 'nav' }: ThemeToggleButtonProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className={styles.themeToggle}
      data-variant={variant}
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      title={theme === 'dark' ? '浅色模式' : '深色模式'}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}

export function GlobalNav({ nav, variant = 'default' }: GlobalNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthUser() ?? null;
  const [settingsOpen, setSettingsOpen] = useState(false);

  const openAuth = (tab: 'login' | 'register') => {
    showDialog(
      (redirect) => {
        if (redirect) {
          router.push(redirect);
        }
      },
      { initialTab: tab },
    );
  };

  return (
    <Inline
      as="header"
      className={variant === 'overlay' ? styles.topbarOverlay : styles.topbar}
      gap="lg"
      justify="space-between"
    >
      <Link href="/" className={styles.brand}>
        <Box as="span" className={styles.brandMark}>
          ✦
        </Box>
        <Stack className={styles.brandText} gap="0">
          <Text as="strong" size="md" variant="primary" weight="medium">
            {c.brand.name}
          </Text>
          <Text as="span" size="xs" variant="muted">
            {c.brand.tagline}
          </Text>
        </Stack>
      </Link>

      <Inline as="nav" className={styles.nav} gap="u0-25">
        {nav.map((item) => {
          const isActive = item.end ? pathname === item.to : pathname.startsWith(item.to);
          return (
            <Link key={item.to} href={item.to} className={cx(styles.navLink, isActive && styles.navActive)}>
              {item.label}
            </Link>
          );
        })}
      </Inline>

      <Inline className={styles.authRow} gap="sm">
        <ThemeToggleButton />
        {user ? (
          <Button
            type="button"
            onClick={() => {
              setSettingsOpen(true);
            }}
            aria-label={c.auth.openUserSettings}
            size="sm"
            title={user.username}
            variant="user"
          >
            <Box as="span" className={styles.userAvatar}>
              {user.username.slice(0, 1).toUpperCase()}
            </Box>
            <Box as="span" className={styles.userName}>
              <Text as="span" size="sm" truncate variant="primary" weight="bold">
                {user.username}
              </Text>
            </Box>
          </Button>
        ) : (
          <>
            <Button type="button" onClick={() => openAuth('login')} size="xs" variant="inverse-ghost">
              {c.auth.login}
            </Button>
            <Button type="button" onClick={() => openAuth('register')} size="xs" variant="inverse-primary">
              {c.auth.register}
            </Button>
          </>
        )}
      </Inline>
      {user && settingsOpen && (
        <UserSettingsDialog
          user={user}
          onClose={() => {
            setSettingsOpen(false);
          }}
        />
      )}
    </Inline>
  );
}
