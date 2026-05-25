'use client';

import { authDialogContent as c } from './AuthDialog.content';
import styles from './AuthDialog.module.css';
import { WechatQrView } from './WechatQrView';
import { useAppServices } from 'hooks/useAppServices';
import { hashPassword } from 'lib/hash-password';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from 'services/UserService';
import {
  Box,
  Button,
  Divider,
  Heading,
  Inline,
  Input,
  Label,
  Stack,
  Text,
} from 'ui/system';

type Tab = 'login' | 'register';
type View = Tab | 'wechat';

function resolveAuthError(err: unknown): string {
  if (err instanceof ApiError && err.errorCode) {
    return c.error.byCode[err.errorCode] ?? err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return c.error.unknown;
}

interface AuthDialogProps {
  onClose: (successRedirect?: string) => void;
  initialTab?: Tab;
  successRedirect?: string;
}

export function AuthDialog({
  onClose,
  initialTab = 'login',
  successRedirect = '/',
}: AuthDialogProps) {
  const [view, setView] = useState<View>(initialTab);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) { onClose(); }
  };

  return createPortal(
    <Box className={styles.backdrop} onClick={handleBackdropClick}>
      <Box className={styles.dialog} role="dialog" aria-modal="true">

        <Box className={styles.closeBtn}>
          <Button
            type="button"
            onClick={() => onClose()}
            aria-label={c.close}
            size="icon-sm"
            variant="icon"
          >
            ✕
          </Button>
        </Box>

        <Inline className={styles.brand}>
          <Box className={styles.brandLogo}>✦</Box>
          <Text as="span" weight="heavy">AppGen AI</Text>
        </Inline>

        {view !== 'wechat' && (
          <Inline className={styles.tabs} wrap={false}>
            <Button
              type="button"
              onClick={() => { setView('login'); }}
              fullWidth
              size="sm"
              variant={view === 'login' ? 'tab-active' : 'tab'}
            >
              {c.tabs.login}
            </Button>
            <Button
              type="button"
              onClick={() => { setView('register'); }}
              fullWidth
              size="sm"
              variant={view === 'register' ? 'tab-active' : 'tab'}
            >
              {c.tabs.register}
            </Button>
          </Inline>
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

      </Box>
    </Box>,
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
      const result = await userService.login(identifier, pwdHash, nonce);
      authService.save(result);
      onClose(successRedirect);
    } catch (err) {
      setError(resolveAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack className={styles.formWrap}>
      <Stack className={styles.formHeader} gap="xs">
        <Heading size="md" variant="primary" weight="heavy">{c.login.title}</Heading>
        <Text size="sm" variant="muted">{c.login.sub}</Text>
      </Stack>

      <Box className={styles.socialRow}>
        <Button
          type="button"
          onClick={onWechat}
          fullWidth
          leadingIcon={<Text as="span" size="lg">💬</Text>}
          size="sm"
          variant="secondary"
        >
          {c.social.wechat}
        </Button>
        <Button
          type="button"
          fullWidth
          leadingIcon={<Text as="span" size="lg">📱</Text>}
          size="sm"
          variant="secondary"
        >
          {c.social.phone}
        </Button>
      </Box>

      <Divider label={c.divider} spacing="sm" variant="soft" />

      {error && (
        <Box className={styles.errorMsg}>
          <Text align="center" size="sm" variant="danger" weight="medium">{error}</Text>
        </Box>
      )}

      <Stack as="form" className={styles.form} onSubmit={(e) => { void handleSubmit(e); }}>
        <Label className={styles.field}>
          <Text as="span" size="sm" variant="secondary" weight="medium">
            {c.login.identifierLabel}
          </Text>
          <Input
            type="text"
            placeholder={c.login.identifierPlaceholder}
            value={identifier}
            onChange={(e) => { setIdentifier(e.target.value); }}
            required
            variant="filled"
          />
        </Label>
        <Label className={styles.field}>
          <Text as="span" size="sm" variant="secondary" weight="medium">
            {c.login.passwordLabel}
          </Text>
          <Stack className={styles.passwordRow} gap="xs">
            <Input
              type="password"
              placeholder={c.login.passwordPlaceholder}
              value={password}
              onChange={(e) => { setPassword(e.target.value); }}
              required
              variant="filled"
            />
            <Inline justify="flex-end">
              <Button type="button" size="xs" variant="link">
                {c.login.forgotPassword}
              </Button>
            </Inline>
          </Stack>
        </Label>
        <Button type="submit" disabled={submitting} fullWidth size="lg">
          {submitting ? c.login.submittingBtn : c.login.submitBtn}
        </Button>
      </Stack>

      <Inline className={styles.switchRow} justify="center">
        <Text as="span" size="sm" variant="muted">{c.login.switchHint}</Text>
        <Button type="button" size="xs" variant="link" onClick={onSwitch}>
          {c.login.switchLink}
        </Button>
      </Inline>
    </Stack>
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
      setError(resolveAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack className={styles.formWrap}>
      <Stack className={styles.formHeader} gap="xs">
        <Heading size="md" variant="primary" weight="heavy">{c.register.title}</Heading>
        <Text size="sm" variant="muted">{c.register.sub}</Text>
      </Stack>

      <Box className={styles.socialRow}>
        <Button
          type="button"
          onClick={onWechat}
          fullWidth
          leadingIcon={<Text as="span" size="lg">💬</Text>}
          size="sm"
          variant="secondary"
        >
          {c.social.wechat}
        </Button>
        <Button
          type="button"
          fullWidth
          leadingIcon={<Text as="span" size="lg">📱</Text>}
          size="sm"
          variant="secondary"
        >
          {c.social.phone}
        </Button>
      </Box>

      <Divider label={c.divider} spacing="sm" variant="soft" />

      {error && (
        <Box className={styles.errorMsg}>
          <Text align="center" size="sm" variant="danger" weight="medium">{error}</Text>
        </Box>
      )}

      <Stack as="form" className={styles.form} onSubmit={(e) => { void handleSubmit(e); }}>
        <Label className={styles.field}>
          <Text as="span" size="sm" variant="secondary" weight="medium">
            {c.register.nameLabel}
          </Text>
          <Input
            type="text"
            placeholder={c.register.namePlaceholder}
            value={username}
            onChange={(e) => { setUsername(e.target.value); }}
            required
            variant="filled"
          />
        </Label>
        <Label className={styles.field}>
          <Text as="span" size="sm" variant="secondary" weight="medium">
            {c.register.emailLabel}
          </Text>
          <Input
            type="email"
            placeholder={c.register.emailPlaceholder}
            value={email}
            onChange={(e) => { setEmail(e.target.value); }}
            variant="filled"
          />
        </Label>
        <Box className={styles.fieldRow}>
          <Label className={styles.field}>
            <Text as="span" size="sm" variant="secondary" weight="medium">
              {c.register.passwordLabel}
            </Text>
            <Input
              type="password"
              placeholder={c.register.passwordPlaceholder}
              value={password}
              onChange={(e) => { setPassword(e.target.value); }}
              required
              variant="filled"
            />
          </Label>
          <Label className={styles.field}>
            <Text as="span" size="sm" variant="secondary" weight="medium">
              {c.register.confirmLabel}
            </Text>
            <Input
              type="password"
              placeholder={c.register.confirmPlaceholder}
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); }}
              required
              variant="filled"
            />
          </Label>
        </Box>
        <Button type="submit" disabled={submitting} fullWidth size="lg">
          {submitting ? c.register.submittingBtn : c.register.submitBtn}
        </Button>
        <Text align="center" size="xs" variant="faint">
          {c.register.terms}{' '}
          <Button type="button" size="xs" variant="link">{c.register.termsLink}</Button>
          {' '}{c.register.and}{' '}
          <Button type="button" size="xs" variant="link">{c.register.privacyLink}</Button>
        </Text>
      </Stack>

      <Inline className={styles.switchRow} justify="center">
        <Text as="span" size="sm" variant="muted">{c.register.switchHint}</Text>
        <Button type="button" size="xs" variant="link" onClick={onSwitch}>
          {c.register.switchLink}
        </Button>
      </Inline>
    </Stack>
  );
}
