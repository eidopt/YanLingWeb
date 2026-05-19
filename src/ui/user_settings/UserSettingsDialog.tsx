'use client';

import { userSettingsDialogContent as c } from './UserSettingsDialog.content';
import styles from './UserSettingsDialog.module.css';
import { useAppServices } from 'hooks/useAppServices';
import { hashPassword } from 'lib/hash-password';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AuthUser } from 'services/AuthService';

interface UserSettingsDialogProps {
  user: AuthUser;
  onClose: () => void;
}

const numberFormat = new Intl.NumberFormat(c.locale);
const closeAnimationMs = 180;

export function UserSettingsDialog({ user, onClose }: UserSettingsDialogProps) {
  const { authService, userService } = useAppServices();
  const [profile, setProfile] = useState<AuthUser>(user);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    setProfile(user);
  }, [user]);

  useEffect(() => {
    void (async () => {
      try {
        const latestUser = await userService.getUser(user.id);
        setProfile(latestUser);
        authService.updateUser(latestUser);
      } catch {
        // Keep showing the cached profile if refresh fails.
      }
    })();
  }, [authService, user.id, userService]);

  const totalTokens = profile.tokensUsed + profile.tokensBalance;
  const usagePercent = totalTokens > 0
    ? Math.min(100, Math.round((profile.tokensUsed / totalTokens) * 100))
    : 0;

  const requestClose = () => {
    if (closing) {
      return;
    }

    setClosing(true);
    window.setTimeout(onClose, closeAnimationMs);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) { requestClose(); }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (newPassword.length < 8) {
      setError(c.error.passwordTooShort);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(c.error.passwordMismatch);
      return;
    }

    setSubmitting(true);
    try {
      const [currentPasswordHash, newPasswordHash] = await Promise.all([
        hashPassword(currentPassword),
        hashPassword(newPassword),
      ]);
      const updatedUser = await userService.updateUser(user.id, {
        currentPassword: currentPasswordHash,
        password: newPasswordHash,
      });
      authService.updateUser(updatedUser);
      setProfile(updatedUser);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage(c.password.success);
    } catch (err) {
      setError(err instanceof Error ? err.message : c.error.updateFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    authService.clear();
    requestClose();
  };

  return createPortal(
    <div
      className={styles.backdrop}
      data-closing={closing ? 'true' : undefined}
      onClick={handleBackdropClick}
    >
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-settings-title"
      >
        <header className={styles.header}>
          <div className={styles.avatar} aria-hidden="true">
            {profile.username.slice(0, 1).toUpperCase()}
          </div>
          <div className={styles.identity}>
            <h2 id="user-settings-title">{c.title}</h2>
            <p>{profile.username}</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={requestClose} aria-label={c.close}>
            x
          </button>
        </header>

        <div className={styles.content}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3>{c.tokenUsage.title}</h3>
              <span>{usagePercent}%</span>
            </div>
            <div className={styles.progressTrack} aria-hidden="true">
              <div className={styles.progressFill} style={{ width: `${usagePercent}%` }} />
            </div>
            <dl className={styles.statsGrid}>
              <div>
                <dt>{c.tokenUsage.used}</dt>
                <dd>{numberFormat.format(profile.tokensUsed)}</dd>
              </div>
              <div>
                <dt>{c.tokenUsage.balance}</dt>
                <dd>{numberFormat.format(profile.tokensBalance)}</dd>
              </div>
              <div>
                <dt>{c.tokenUsage.accountBalance}</dt>
                <dd>{formatCurrency(profile.balanceCents)}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3>{c.password.title}</h3>
            </div>
            <form className={styles.form} onSubmit={(e) => { void handlePasswordChange(e); }}>
              <label className={styles.field}>
                <span>{c.password.current}</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); }}
                  autoComplete="current-password"
                  required
                />
              </label>
              <label className={styles.field}>
                <span>{c.password.next}</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); }}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>{c.password.confirm}</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); }}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>

              {error && <p className={styles.errorMsg}>{error}</p>}
              {message && <p className={styles.successMsg}>{message}</p>}

              <button type="submit" className={styles.submitBtn} disabled={submitting}>
                {submitting ? c.password.submitting : c.password.submit}
              </button>
            </form>
          </section>
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
            {c.logout}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function formatCurrency(cents: number): string {
  return `${c.currencySymbol}${(cents / 100).toFixed(2)}`;
}
