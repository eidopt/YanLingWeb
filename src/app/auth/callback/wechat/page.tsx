'use client';

import { useAppServices } from 'hooks/useAppServices';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

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
  const params = useSearchParams();
  const router = useRouter();
  const { authService, userService } = useAppServices();

  const code = params.get('code');
  const state = params.get('state');
  const missingParams = !code || !state;

  useEffect(() => {
    if (missingParams || !code || !state) { return; }

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
        const msg = err instanceof Error ? err.message : '授权失败，请重新扫码';
        sessionStorage.setItem('wechat_auth_error', msg);
        router.replace('/auth/callback/wechat?error=1');
      }
    })();
  }, [missingParams, code, state, router, authService, userService]);

  const errorParam = params.get('error');
  const storedError = typeof window !== 'undefined'
    ? sessionStorage.getItem('wechat_auth_error')
    : null;

  if (missingParams || errorParam) {
    const msg = storedError ?? '缺少授权参数，请重新扫码';
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: '2rem' }}>❌</p>
          <h2 style={{ fontWeight: 800, color: '#0f172a', margin: '0.5rem 0' }}>登录失败</h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{msg}</p>
          <a href="/" style={linkStyle}>返回首页重试</a>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={spinnerStyle} />
        <p style={{ color: '#64748b', marginTop: '1rem', fontSize: '0.9rem' }}>
          正在完成微信登录...
        </p>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%)',
};
const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '1.5rem',
  padding: '2.5rem 2rem',
  boxShadow: '0 20px 60px rgba(7,9,20,0.12)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.5rem',
  minWidth: '280px',
  textAlign: 'center',
};
const spinnerStyle: React.CSSProperties = {
  width: '2.5rem',
  height: '2.5rem',
  borderRadius: '50%',
  border: '3px solid #e8edf3',
  borderTopColor: '#6366f1',
  animation: 'spin 0.8s linear infinite',
};
const linkStyle: React.CSSProperties = {
  marginTop: '0.75rem',
  color: '#6366f1',
  fontSize: '0.88rem',
  fontWeight: 600,
  textDecoration: 'underline',
};
