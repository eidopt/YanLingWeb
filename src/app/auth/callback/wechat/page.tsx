'use client';

import { wechatCallbackPageContent as c } from './page.content';
import { useAppServices } from 'hooks/useAppServices';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { Box, Heading, Text } from 'ui/base';

const WECHAT_AUTH_CHANNEL = 'wechat_oauth';

/**
 * WeChat OAuth callback page.
 * WeChat redirects here after QR scan:
 *   /auth/callback/wechat?code=AUTH_CODE&state=STATE_TOKEN
 *
 * 1. Exchanges code for a JWT via the backend
 * 2. Saves auth to localStorage
 * 3. Broadcasts to the login dialog via BroadcastChannel
 * 4. Redirects to /editor
 */
export default function WechatCallbackPage() {
  return (
    <Suspense fallback={<WechatCallbackLoading />}>
      <WechatCallbackContent />
    </Suspense>
  );
}

function WechatCallbackContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { authService, userService } = useAppServices();

  const code = params.get('code');
  const state = params.get('state');
  const missingParams = !code || !state;

  useEffect(() => {
    if (missingParams || !code || !state) {
      return;
    }

    void (async () => {
      try {
        const result = await userService.submitOAuthCallback({ provider: 'wechat', code, state });
        authService.save(result);

        const channel = new BroadcastChannel(WECHAT_AUTH_CHANNEL);
        channel.postMessage(result);
        channel.close();

        localStorage.setItem('wechat_auth_result', JSON.stringify(result));
        router.replace('/editor');
      } catch (err) {
        // Store error in sessionStorage so the page can read it after re-render
        const msg = err instanceof Error ? err.message : c.error.oauthFailed;
        sessionStorage.setItem('wechat_auth_error', msg);
        router.replace('/auth/callback/wechat?error=1');
      }
    })();
  }, [missingParams, code, state, router, authService, userService]);

  const errorParam = params.get('error');
  const storedError = typeof window !== 'undefined' ? sessionStorage.getItem('wechat_auth_error') : null;

  if (missingParams || errorParam) {
    const msg = storedError ?? c.error.missingParams;
    return (
      <Box style={containerStyle}>
        <Box style={cardStyle}>
          <Text as="span" size="3xl">
            ❌
          </Text>
          <Heading as="h2" size="md" variant="primary" weight="heavy">
            {c.error.title}
          </Heading>
          <Text align="center" size="sm" variant="muted">
            {msg}
          </Text>
          <Link href="/" style={linkStyle}>
            {c.error.retry}
          </Link>
        </Box>
      </Box>
    );
  }

  return <WechatCallbackLoading />;
}

function WechatCallbackLoading() {
  return (
    <Box style={containerStyle}>
      <Box style={cardStyle}>
        <Box style={spinnerStyle} />
        <Text size="sm" variant="muted">
          {c.loading}
        </Text>
      </Box>
    </Box>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--app-bg)',
};
const cardStyle: React.CSSProperties = {
  background: 'var(--app-surface-1)',
  borderRadius: 'var(--app-radius-3xl)',
  padding: 'var(--app-unit-5) var(--app-unit-4)',
  boxShadow: 'var(--app-shadow-md)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--app-space-2)',
  minWidth: 'var(--app-unit-36)',
  textAlign: 'center',
};
const spinnerStyle: React.CSSProperties = {
  width: 'var(--app-unit-5)',
  height: 'var(--app-unit-5)',
  borderRadius: '50%',
  border: 'var(--app-line-focus) solid var(--app-neutral-200)',
  borderTopColor: 'var(--app-color-primary)',
  animation: 'spin 0.8s linear infinite',
};
const linkStyle: React.CSSProperties = {
  marginTop: 'var(--app-unit-1-5)',
  color: 'var(--app-color-primary)',
  fontSize: 'var(--app-unit-1-75)',
  fontWeight: 600,
  textDecoration: 'underline',
};
