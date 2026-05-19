'use client';

import { authDialogContent as c } from './AuthDialog.content';
import styles from './AuthDialog.module.css';
import { WechatQrView } from './WechatQrView';
import { cx } from 'base/classname';
import { useAppServices } from 'hooks/useAppServices';
import { hashForLogin, hashPassword } from 'lib/hash-password';
import { useState } from 'react';
import { createPortal } from 'react-dom';

type Tab = 'login' | 'register';
type View = Tab | 'wechat';

interface AuthDialogProps {
  onClose: (successRedirect?: string) => void;
  initialTab?: Tab;
  successRedirect?: string;
}

export function AuthDialog({
  onClose,
  initialTab = 'login',
  successRedirect = '/editor',
}: AuthDialogProps) {
  const [view, setView] = useState<View>(initialTab);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) { onClose(); }
  };

  return createPortal(
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.dialog} role="dialog" aria-modal="true">

        <button
          type="button"
          className={styles.closeBtn}
          onClick={() => onClose()}
          aria-label={c.close}
        >
          ✕
        </button>

        <div className={styles.brand}>
          <div className={styles.brandLogo}>✦</div>
          <span>AppGen AI</span>
        </div>

        {view !== 'wechat' && (
          <div className={styles.tabs}>
            <button
              type="button"
              className={cx(styles.tab, view === 'login' && styles.tabActive)}
              onClick={() => { setView('login'); }}
            >
              {c.tabs.login}
            </button>
            <button
              type="button"
              className={cx(styles.tab, view === 'register' && styles.tabActive)}
              onClick={() => { setView('register'); }}
            >
              {c.tabs.register}
            </button>
          </div>
        )}

        {view === 'login' && (
          <LoginForm
            onClose={onClose}
            successRedirect={successRedirect}
            onSwitch={() => { setView('register'); }}
            onWechat={() => { setView('wechat'); }}
          />
        )}
        {view === 'register' && (
          <RegisterForm
            onClose={onClose}
            successRedirect={successRedirect}
            onSwitch={() => { setView('login'); }}
            onWechat={() => { setView('wechat'); }}
          />
        )}
        {view === 'wechat' && (
          <WechatQrView
            onSuccess={(redirect) => { onClose(redirect); }}
            onBack={() => { setView('login'); }}
          />
        )}

      </div>
    </div>,
    document.body,
  );
}

/* ── Login Form ── */
function LoginForm({
  onClose,
  successRedirect,
  onSwitch,
  onWechat,
}: {
  onClose: (redirect?: string) => void;
  successRedirect: string;
  onSwitch: () => void;
  onWechat: () => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { authService, userService } = useAppServices();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { nonce } = await userService.requestChallenge();
      const pwdHash = await hashPassword(password);
      const loginHash = await hashForLogin(nonce, pwdHash);
      const result = await userService.login(identifier, loginHash, nonce);
      authService.save(result);
      onClose(successRedirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : c.error.unknown);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.formWrap}>
      <div className={styles.formHeader}>
        <h2>{c.login.title}</h2>
        <p>{c.login.sub}</p>
      </div>

      <div className={styles.socialRow}>
        <button type="button" className={styles.socialBtn} onClick={onWechat}>
          <span className={styles.socialIcon}>💬</span>
          {c.social.wechat}
        </button>
        <button type="button" className={styles.socialBtn}>
          <span className={styles.socialIcon}>📱</span>
          {c.social.phone}
        </button>
      </div>

      <div className={styles.divider}><span>{c.divider}</span></div>

      {error && <p className={styles.errorMsg}>{error}</p>}

      <form className={styles.form} onSubmit={(e) => { void handleSubmit(e); }}>
        <label className={styles.field}>
          <span>{c.login.identifierLabel}</span>
          <input
            type="text"
            placeholder={c.login.identifierPlaceholder}
            value={identifier}
            onChange={(e) => { setIdentifier(e.target.value); }}
            required
          />
        </label>
        <label className={styles.field}>
          <span>{c.login.passwordLabel}</span>
          <div className={styles.passwordRow}>
            <input
              type="password"
              placeholder={c.login.passwordPlaceholder}
              value={password}
              onChange={(e) => { setPassword(e.target.value); }}
              required
            />
            <button type="button" className={styles.forgotLink}>
              {c.login.forgotPassword}
            </button>
          </div>
        </label>
        <button type="submit" className={styles.submitBtn} disabled={submitting}>
          {submitting ? c.login.submittingBtn : c.login.submitBtn}
        </button>
      </form>

      <p className={styles.switchRow}>
        {c.login.switchHint}
        <button type="button" className={styles.switchLink} onClick={onSwitch}>
          {c.login.switchLink}
        </button>
      </p>
    </div>
  );
}

/* ── Register Form ── */
function RegisterForm({
  onClose,
  successRedirect,
  onSwitch,
  onWechat,
}: {
  onClose: (redirect?: string) => void;
  successRedirect: string;
  onSwitch: () => void;
  onWechat: () => void;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { authService, userService } = useAppServices();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(c.error.passwordMismatch);
      return;
    }
    if (password.length < 8) {
      setError(c.error.passwordTooShort);
      return;
    }
    setSubmitting(true);
    try {
      const pwdHash = await hashPassword(password);
      const result = await userService.register({
        username,
        password: pwdHash,
        email: email || undefined,
      });
      authService.save(result);
      onClose(successRedirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : c.error.unknown);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.formWrap}>
      <div className={styles.formHeader}>
        <h2>{c.register.title}</h2>
        <p>{c.register.sub}</p>
      </div>

      <div className={styles.socialRow}>
        <button type="button" className={styles.socialBtn} onClick={onWechat}>
          <span className={styles.socialIcon}>💬</span>
          {c.social.wechat}
        </button>
        <button type="button" className={styles.socialBtn}>
          <span className={styles.socialIcon}>📱</span>
          {c.social.phone}
        </button>
      </div>

      <div className={styles.divider}><span>{c.divider}</span></div>

      {error && <p className={styles.errorMsg}>{error}</p>}

      <form className={styles.form} onSubmit={(e) => { void handleSubmit(e); }}>
        <label className={styles.field}>
          <span>{c.register.nameLabel}</span>
          <input
            type="text"
            placeholder={c.register.namePlaceholder}
            value={username}
            onChange={(e) => { setUsername(e.target.value); }}
            required
          />
        </label>
        <label className={styles.field}>
          <span>{c.register.emailLabel}</span>
          <input
            type="email"
            placeholder={c.register.emailPlaceholder}
            value={email}
            onChange={(e) => { setEmail(e.target.value); }}
          />
        </label>
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            <span>{c.register.passwordLabel}</span>
            <input
              type="password"
              placeholder={c.register.passwordPlaceholder}
              value={password}
              onChange={(e) => { setPassword(e.target.value); }}
              required
            />
          </label>
          <label className={styles.field}>
            <span>{c.register.confirmLabel}</span>
            <input
              type="password"
              placeholder={c.register.confirmPlaceholder}
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); }}
              required
            />
          </label>
        </div>
        <button type="submit" className={styles.submitBtn} disabled={submitting}>
          {submitting ? c.register.submittingBtn : c.register.submitBtn}
        </button>
        <p className={styles.terms}>
          {c.register.terms}{' '}
          <button type="button" className={styles.termsLink}>{c.register.termsLink}</button>
          {' '}{c.register.and}{' '}
          <button type="button" className={styles.termsLink}>{c.register.privacyLink}</button>
        </p>
      </form>

      <p className={styles.switchRow}>
        {c.register.switchHint}
        <button type="button" className={styles.switchLink} onClick={onSwitch}>
          {c.register.switchLink}
        </button>
      </p>
    </div>
  );
}
