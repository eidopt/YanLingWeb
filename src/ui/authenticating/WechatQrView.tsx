"use client";

import styles from "./AuthDialog.module.css";
import { wechatQrViewContent as c } from "./WechatQrView.content";
import type { AuthResponseDto } from "@shared/types/user.types";
import { useAppServices } from "hooks/useAppServices";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Heading,
  Inline,
  Input,
  Stack,
  Text,
} from 'ui/base';

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
  const [refreshRevision, setRefreshRevision] = useState(0);
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
        setRefreshRevision((current) => current + 1);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial and scheduled QR refresh intentionally updates view state
    void fetchQr();
    return () => {
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }
    };
  }, [fetchQr, refreshRevision]);

  // Build QR image URL using a free public service
  const qrImageUrl = qrUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=12&data=${encodeURIComponent(qrUrl)}`
    : null;

  return (
    <Stack className={styles.formWrap}>
      <Box className={styles.qrBack}>
        <Button type="button" size="xs" variant="link" onClick={onBack}>
          ← {c.back}
        </Button>
      </Box>

      <Stack className={styles.formHeader} gap="xs">
        <Heading size="md" variant="primary" weight="heavy">{c.title}</Heading>
        <Text size="sm" variant="muted">{c.subtitle}</Text>
      </Stack>

      <Box className={styles.qrBox}>
        {loading && (
          <Box className={styles.qrPlaceholder}>
            <Box className={styles.qrSpinner} />
          </Box>
        )}

        {!loading && error && (
          <Stack className={styles.qrError}>
            <Text align="center" size="sm" variant="danger">{error}</Text>
            <Button
              type="button"
              onClick={() => void fetchQr()}
              size="sm"
              variant="outline"
            >
              {c.refresh}
            </Button>
          </Stack>
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
              <Stack className={styles.qrScannedOverlay} gap="sm">
                <Text as="span" size="3xl" variant="success">✓</Text>
                <Text size="sm" variant="success" weight="bold">{c.scanned}</Text>
              </Stack>
            )}
          </>
        )}
      </Box>

      {!loading && !error && (
        <Stack className={styles.qrHints} gap="sm">
          <Text align="center" size="sm" variant="muted">{c.hint}</Text>
          <Button
            type="button"
            onClick={() => void fetchQr()}
            size="xs"
            variant="link"
          >
            {c.expiredRefresh}
          </Button>
        </Stack>
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
    </Stack>
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
    <Stack className={styles.devHelper} gap="sm">
      <Text size="xs" variant="warning" weight="bold">{c.dev.title}</Text>
      <Inline gap="u0-8" wrap={false}>
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
          placeholder={c.dev.placeholder}
          size="sm"
        />
        <Button
          type="button"
          onClick={() => {
            void handleSimulate();
          }}
          size="sm"
        >
          {c.dev.submit}
        </Button>
      </Inline>
    </Stack>
  );
}
