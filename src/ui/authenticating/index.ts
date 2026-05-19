import { AuthDialog } from './AuthDialog';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { AppServicesProvider } from 'services/AppServicesContext';

export type { } from './AuthDialog';

/**
 * Imperatively mount the auth dialog from anywhere.
 *
 * @param onClose  Called when the dialog is dismissed.
 *                 Receives `successRedirect` when the user has authenticated;
 *                 receives `undefined` when the dialog was manually closed.
 * @param options  Optional auth behavior.
 *
 * @example
 * import { showDialog } from 'ui/authenticating'
 *
 * showDialog((successRedirect) => {
 *   if (successRedirect) navigate(successRedirect)
 * })
 */
export function showDialog(
  onClose: (successRedirect?: string) => void,
  options?: { initialTab?: 'login' | 'register'; successRedirect?: string },
): void {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const handleClose = (successRedirect?: string) => {
    root.unmount();
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
    onClose(successRedirect);
  };

  root.render(
    createElement(
      AppServicesProvider,
      null,
      createElement(AuthDialog, {
        onClose: handleClose,
        initialTab: options?.initialTab,
        successRedirect: options?.successRedirect,
      }),
    ),
  );
}
