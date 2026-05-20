'use client';

import { UserSettingsDialogView } from './UserSettingsDialogView';
import { useUserSettingsDialogController } from './useUserSettingsDialogController';
import { createPortal } from 'react-dom';
import type { AuthUser } from 'services/AuthService';

interface UserSettingsDialogProps {
  user: AuthUser;
  onClose: () => void;
}

export function UserSettingsDialog(props: UserSettingsDialogProps) {
  const viewModel = useUserSettingsDialogController(props);

  return createPortal(
    <UserSettingsDialogView {...viewModel} />,
    document.body,
  );
}
