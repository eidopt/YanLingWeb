"use client";

import styles from "./AuthDialog.module.css";
import { wechatQrViewContent as c } from "./WechatQrView.content";
import type { AuthResponseDto } from "@shared/types/user.types";
import { useAppServices } from "hooks/useAppServices";
import { useCallback, useEffect, useRef, useState } from "react";

const WECHAT_AUTH_CHANNEL = "wechat_oauth";
const QR_TTL_MS = 4.5 * 60 * 1000; // refresh before 5-min WeChat expiry

interface WechatQrViewProps {
  onSuccess: (redirect: string) => void;
  onBack: () => void;
}

export function WechatQrView({ onSuccess, onBack }: WechatQrViewProps) {
  const { authService, userService } = useAppServices();
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchQr = useCallback(async () => {
    setLoading(true);
    setError(null);
    setScanned(false);
    try {
      const data = await userService.getWechatQrCode();
      setQrUrl(data.qrUrl);
      setState(data.state);

      // auto-refresh before QR expires
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }
      refreshTimer.current = setTimeout(() => {
        void fetchQr();
      }, QR_TTL_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : c.error.qrLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [userService]);

  // Listen for auth completion from the OAuth callback page
  useEffect(() => {
    const channel = new BroadcastChannel(WECHAT_AUTH_CHANNEL);
    channel.onmessage = (evt: MessageEvent<AuthResponseDto>) => {
      authService.save(evt.data);
      onSuccess("/editor");
    };
    return () => {
      channel.close();
    };
  }, [authService, onSuccess]);

  // Handle same-tab callback (when no popup was opened)
  useEffect(() => {
    const handler = (evt: StorageEvent) => {
      if (evt.key !== "wechat_auth_result" || !evt.newValue) {
        return;
      }
      try {
        const authData = JSON.parse(evt.newValue) as AuthResponseDto;
        authService.save(authData);
        localStorage.removeItem("wechat_auth_result");
        onSuccess("/editor");
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("storage", handler);
    };
  }, [authService, onSuccess]);

  useEffect(() => {
    void fetchQr();
    return () => {
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }
    };
  }, [fetchQr]);

  // Build QR image URL using a free public service
  const qrImageUrl = qrUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=12&data=${encodeURIComponent(qrUrl)}`
    : null;

  return (
    <div className={styles.formWrap}>
      <div className={styles.qrBack}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          ← {c.back}
        </button>
      </div>

      <div className={styles.formHeader}>
        <h2>{c.title}</h2>
        <p>{c.subtitle}</p>
      </div>

      <div className={styles.qrBox}>
        {loading && (
          <div className={styles.qrPlaceholder}>
            <div className={styles.qrSpinner} />
          </div>
        )}

        {!loading && error && (
          <div className={styles.qrError}>
            <p>{error}</p>
            <button
              type="button"
              className={styles.qrRefreshBtn}
              onClick={() => void fetchQr()}
            >
              {c.refresh}
            </button>
          </div>
        )}

        {!loading && !error && qrImageUrl && (
          <>
            <img
              src={qrImageUrl}
              alt={c.qrAlt}
              width={200}
              height={200}
              className={scanned ? styles.qrScanned : styles.qrImage}
            />
            {scanned && (
              <div className={styles.qrScannedOverlay}>
                <span>✓</span>
                <p>{c.scanned}</p>
              </div>
            )}
          </>
        )}
      </div>

      {!loading && !error && (
        <div className={styles.qrHints}>
          <p>{c.hint}</p>
          <button
            type="button"
            className={styles.forgotLink}
            onClick={() => void fetchQr()}
          >
            {c.expiredRefresh}
          </button>
        </div>
      )}

      {/* Fallback: open in browser */}
      {qrUrl && (
        <a
          href={qrUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.qrOpenLink}
        >
          {c.openInBrowser}
        </a>
      )}

      {/* Dev helper: simulate callback during development */}
      {process.env.NODE_ENV === "development" && state && (
        <DevCallbackHelper state={state} onSuccess={onSuccess} />
      )}
    </div>
  );
}

/* ── Dev helper — only rendered in development ── */
function DevCallbackHelper({
  state,
  onSuccess,
}: {
  state: string;
  onSuccess: (redirect: string) => void;
}) {
  const { authService, userService } = useAppServices();
  const [code, setCode] = useState("");

  const handleSimulate = async () => {
    if (!code.trim()) {
      return;
    }
    try {
      const result = await userService.submitOAuthCallback({
        provider: "wechat",
        code: code.trim(),
        state,
      });
      authService.save(result);
      onSuccess("/editor");
    } catch (err) {
      alert(err instanceof Error ? err.message : c.error.oauthFailed);
    }
  };

  return (
    <div className={styles.devHelper}>
      <p>{c.dev.title}</p>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
          placeholder={c.dev.placeholder}
          style={{
            flex: 1,
            padding: "0.3rem 0.5rem",
            fontSize: "0.78rem",
            borderRadius: "0.4rem",
            border: "1px solid #e2e8f0",
          }}
        />
        <button
          type="button"
          onClick={() => {
            void handleSimulate();
          }}
          style={{
            padding: "0.3rem 0.6rem",
            fontSize: "0.78rem",
            borderRadius: "0.4rem",
            background: "#6366f1",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          {c.dev.submit}
        </button>
      </div>
    </div>
  );
}
