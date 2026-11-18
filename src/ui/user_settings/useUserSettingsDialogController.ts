'use client';

import { userSettingsDialogContent as c } from './UserSettingsDialog.content';
import type { UserTokenUsageSummaryDto } from '@shared/types/user.types';
import { useAppServices } from 'hooks/useAppServices';
import { hashPassword } from 'lib/hashPassword';
import { useEffect, useMemo, useState } from 'react';
import type { AuthUser } from 'services/AuthService';

interface UseUserSettingsDialogControllerOptions {
  user: AuthUser;
  onClose: () => void;
}

export interface UserSettingsStatViewModel {
  label: string;
  value: string;
}

export interface UserSettingsDialogViewModel {
  avatarLetter: string;
  username: string;
  closing: boolean;
  usagePercent: number;
  usagePercentLabel: string;
  tokenStats: UserSettingsStatViewModel[];
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  error: string | null;
  message: string | null;
  submitting: boolean;
  requestClose: () => void;
  logout: () => void;
  submitPasswordChange: () => Promise<void>;
  setCurrentPassword: (value: string) => void;
  setNewPassword: (value: string) => void;
  setConfirmPassword: (value: string) => void;
}

const numberFormat = new Intl.NumberFormat(c.locale);
const closeAnimationMs = 180;

export function useUserSettingsDialogController({
  user,
  onClose,
}: UseUserSettingsDialogControllerOptions): UserSettingsDialogViewModel {
  const { authService, userService } = useAppServices();
  const [profile, setProfile] = useState<AuthUser>(user);
  const [tokenUsage, setTokenUsage] = useState<UserTokenUsageSummaryDto | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const requestState = { cancelled: false };

    void (async () => {
      try {
        const [latestUser, latestUsage] = await Promise.all([
          userService.getUser(user.id),
          userService.getTokenUsage(user.id),
        ]);
        if (requestState.cancelled) {
          return;
        }
        setProfile(latestUser);
        setTokenUsage(latestUsage);
        authService.updateUser(latestUser);
      } catch {
        // Keep showing the cached profile if refresh fails.
      }
    })();

    return () => {
      requestState.cancelled = true;
    };
  }, [authService, user.id, userService]);

  const requestClose = () => {
    if (closing) {
      return;
    }

    setClosing(true);
    window.setTimeout(onClose, closeAnimationMs);
  };

  const submitPasswordChange = async () => {
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

  const logout = () => {
    authService.clear();
    requestClose();
  };

  const displayProfile = profile.id === user.id ? profile : user;
  const activeTokenUsage = tokenUsage?.ownerUserId === user.id ? tokenUsage : null;

  const usageViewModel = useMemo(() => {
    const usage = activeTokenUsage ?? {
      tokensUsed: displayProfile.tokensUsed,
      tokensBalance: displayProfile.tokensBalance,
      balanceCents: displayProfile.balanceCents,
      inputTokens: 0,
      outputTokens: 0,
      requestCount: 0,
    };

    const totalTokens = usage.tokensUsed + usage.tokensBalance;
    const usagePercent = totalTokens > 0 ? Math.min(100, Math.round((usage.tokensUsed / totalTokens) * 100)) : 0;
    const isNormalUser = displayProfile.userType !== 'pro';
    const freeChatUsed = Number.isFinite(displayProfile.freeChatUsedCount) ? displayProfile.freeChatUsedCount : 0;
    const freeTemplateUsed = Number.isFinite(displayProfile.freeTemplateGenUsedCount)
      ? displayProfile.freeTemplateGenUsedCount
      : 0;

    return {
      usagePercent,
      tokenStats: [
        {
          label: c.tokenUsage.userType,
          value: isNormalUser ? c.tokenUsage.userTypeNormal : c.tokenUsage.userTypePro,
        },
        {
          label: c.tokenUsage.freeChatRemaining,
          value: isNormalUser ? `${Math.max(0, 3 - freeChatUsed)} / 3 次` : c.tokenUsage.unlimited,
        },
        {
          label: c.tokenUsage.freeTemplateRemaining,
          value: isNormalUser ? `${Math.max(0, 1 - freeTemplateUsed)} / 1 次` : c.tokenUsage.unlimited,
        },
        {
          label: c.tokenUsage.used,
          value: numberFormat.format(usage.tokensUsed),
        },
        {
          label: c.tokenUsage.balance,
          value: numberFormat.format(usage.tokensBalance),
        },
        {
          label: c.tokenUsage.input,
          value: numberFormat.format(usage.inputTokens),
        },
        {
          label: c.tokenUsage.output,
          value: numberFormat.format(usage.outputTokens),
        },
        {
          label: c.tokenUsage.requests,
          value: numberFormat.format(usage.requestCount),
        },
        {
          label: c.tokenUsage.accountBalance,
          value: formatCurrency(usage.balanceCents),
        },
      ],
    };
  }, [activeTokenUsage, displayProfile]);

  return {
    avatarLetter: displayProfile.username.slice(0, 1).toUpperCase(),
    username: displayProfile.username,
    closing,
    usagePercent: usageViewModel.usagePercent,
    usagePercentLabel: `${usageViewModel.usagePercent}%`,
    tokenStats: usageViewModel.tokenStats,
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
  };
}

function formatCurrency(cents: number): string {
  return `${c.currencySymbol}${(cents / 100).toFixed(2)}`;
}
