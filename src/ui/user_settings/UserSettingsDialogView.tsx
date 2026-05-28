'use client';

import { userSettingsDialogContent as c } from './UserSettingsDialog.content';
import styles from './UserSettingsDialog.module.css';
import type { UserSettingsDialogViewModel } from './useUserSettingsDialogController';
import {
  Box,
  Button,
  Heading,
  Input,
  Label,
  Text,
} from 'ui/base';

export function UserSettingsDialogView({
  avatarLetter,
  username,
  closing,
  usagePercent,
  usagePercentLabel,
  tokenStats,
  currentPassword,
  newPassword,
  confirmPassword,
  error,
  message,
  submitting,
  requestClose,
  logout,
  submitPasswordChange,
  setCurrentPassword,
  setNewPassword,
  setConfirmPassword,
}: UserSettingsDialogViewModel) {
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      requestClose();
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitPasswordChange();
  };

  return (
    <Box
      className={styles.backdrop}
      data-closing={closing ? 'true' : undefined}
      onClick={handleBackdropClick}
    >
      <Box
        as="section"
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-settings-title"
      >
        <Box as="header" className={styles.header}>
          <Box className={styles.avatar} aria-hidden="true">
            {avatarLetter}
          </Box>
          <Box className={styles.identity}>
            <Heading
              id="user-settings-title"
              size="sm"
              variant="primary"
              weight="bold"
            >
              {c.title}
            </Heading>
            <Text size="sm" truncate variant="muted">{username}</Text>
          </Box>
          <Button
            type="button"
            onClick={requestClose}
            aria-label={c.close}
            size="icon-sm"
            variant="icon"
          >
            x
          </Button>
        </Box>

        <Box className={styles.content}>
          <Box as="section" className={styles.section}>
            <Box className={styles.sectionHeader}>
              <Heading as="h3" size="xs" variant="primary" weight="bold">
                {c.tokenUsage.title}
              </Heading>
              <Text as="span" size="sm" variant="accent" weight="bold">
                {usagePercentLabel}
              </Text>
            </Box>
            <Box className={styles.progressTrack} aria-hidden="true">
              <Box className={styles.progressFill} style={{ width: `${usagePercent}%` }} />
            </Box>
            <Box as="dl" className={styles.statsGrid}>
              {tokenStats.map((stat) => (
                <Box key={stat.label}>
                  <Box as="dt">{stat.label}</Box>
                  <Box as="dd">{stat.value}</Box>
                </Box>
              ))}
            </Box>
          </Box>

          <Box as="section" className={styles.section}>
            <Box className={styles.sectionHeader}>
              <Heading as="h3" size="xs" variant="primary" weight="bold">
                {c.password.title}
              </Heading>
            </Box>
            <Box as="form" className={styles.form} onSubmit={handlePasswordSubmit}>
              <Label className={styles.field}>
                <Text as="span" size="xs" variant="secondary" weight="bold">
                  {c.password.current}
                </Text>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); }}
                  autoComplete="current-password"
                  required
                  size="sm"
                  variant="filled"
                />
              </Label>
              <Label className={styles.field}>
                <Text as="span" size="xs" variant="secondary" weight="bold">
                  {c.password.next}
                </Text>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); }}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  size="sm"
                  variant="filled"
                />
              </Label>
              <Label className={styles.field}>
                <Text as="span" size="xs" variant="secondary" weight="bold">
                  {c.password.confirm}
                </Text>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); }}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  size="sm"
                  variant="filled"
                />
              </Label>

              {error && (
                <Box className={styles.feedbackMsg} data-tone="error">
                  <Text size="xs" variant="danger" weight="bold">{error}</Text>
                </Box>
              )}
              {message && (
                <Box className={styles.feedbackMsg} data-tone="success">
                  <Text size="xs" variant="success" weight="bold">{message}</Text>
                </Box>
              )}

              <Button
                type="submit"
                fullWidth
                disabled={submitting}
                size="sm"
                variant="primary"
              >
                {submitting ? c.password.submitting : c.password.submit}
              </Button>
            </Box>
          </Box>
        </Box>

        <Box as="footer" className={styles.footer}>
          <Button
            type="button"
            onClick={logout}
            size="sm"
            variant="danger-soft"
          >
            {c.logout}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
