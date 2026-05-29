import { PREVIEW_VIEWPORT, TemplatePreview } from './TemplatePreview';
import type { TemplateEntry } from './types';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { DynamicThemeScreenPreset } from 'ui/renderer';

interface Props {
  entry: TemplateEntry;
  onClick: () => void;
  checked: boolean;
  onCheck: (id: string) => void;
}

const VARIANT_COLORS: Record<string, string> = {
  优雅: '#8b5cf6',
  冷色: '#3b82f6',
  商务: '#1e40af',
  复古: '#d97706',
  暖色: '#f97316',
  暗色: '#1f2937',
  活力: '#ef4444',
  清新: '#10b981',
  科技: '#06b6d4',
  简约: '#6b7280',
};

const PLATFORM_LABELS: Record<string, string> = {
  'mobile-app': 'App',
  'mini-program': '小程序',
  web: 'Web',
};

const THUMB_WIDTH = 228;
const THUMB_HEIGHT = 190;

function resolveCardDevice(entry: TemplateEntry): DynamicThemeScreenPreset {
  if (entry.platform === 'web' || entry.platformCategories?.includes('web')) {
    return 'desktop';
  }
  return 'mobile';
}

function useInViewport<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '480px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return { ref, visible };
}

export function TemplateCard({ entry, onClick, checked, onCheck }: Props): ReactNode {
  const { ref, visible } = useInViewport<HTMLDivElement>();
  const device = resolveCardDevice(entry);
  const viewport = PREVIEW_VIEWPORT[device];
  const scale = THUMB_WIDTH / viewport.width;
  const variantColor = entry.variant ? (VARIANT_COLORS[entry.variant] ?? '#6b7280') : undefined;
  const platformLabel = entry.platform
    ? (PLATFORM_LABELS[entry.platform] ?? entry.platform)
    : entry.platformCategories?.map((platform) => PLATFORM_LABELS[platform] ?? platform).join(' / ');

  return (
    <article
      ref={ref}
      style={{
        minWidth: 0,
        border: '1px solid #dbe3ef',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#fff',
        position: 'relative',
        boxShadow: checked ? '0 0 0 2px rgba(22, 119, 255, 0.28)' : '0 1px 2px rgba(15, 23, 42, 0.06)',
      }}
    >
      <label
        title="勾选后写入 import-skip-list.json，后端导入时会跳过"
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 3,
          display: 'grid',
          placeItems: 'center',
          width: 28,
          height: 28,
          borderRadius: 6,
          background: 'rgba(255, 255, 255, 0.92)',
          border: '1px solid rgba(148, 163, 184, 0.72)',
          cursor: 'pointer',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={checked}
          aria-label={`跳过导入 ${entry.themeName}`}
          onChange={() => onCheck(entry.id)}
          style={{
            width: 16,
            height: 16,
            cursor: 'pointer',
            accentColor: '#1677ff',
          }}
        />
      </label>

      <button
        type="button"
        onClick={onClick}
        style={{
          display: 'block',
          width: '100%',
          border: 0,
          padding: 0,
          background: 'transparent',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            height: THUMB_HEIGHT,
            background: '#eef3f8',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              width: viewport.width,
              minHeight: viewport.height,
              transform: `translateX(-50%) scale(${scale})`,
              transformOrigin: 'top center',
              pointerEvents: 'none',
            }}
          >
            {visible ? (
              <TemplatePreview file={entry.file} device={device} />
            ) : (
              <div style={{ width: viewport.width, height: viewport.height }} />
            )}
          </div>

          <div
            style={{
              position: 'absolute',
              inset: 'auto 0 0',
              height: 42,
              background: 'linear-gradient(180deg, rgba(238, 243, 248, 0), rgba(15, 23, 42, 0.30))',
              pointerEvents: 'none',
            }}
          />

          <div
            style={{
              position: 'absolute',
              right: 8,
              bottom: 8,
              display: 'flex',
              gap: 6,
              alignItems: 'center',
            }}
          >
            {entry.variant && (
              <span
                style={{
                  background: variantColor,
                  color: '#fff',
                  fontSize: 11,
                  lineHeight: '18px',
                  padding: '0 7px',
                  borderRadius: 999,
                  fontWeight: 700,
                }}
              >
                {entry.variant}
              </span>
            )}
            {platformLabel && (
              <span
                style={{
                  background: 'rgba(15, 23, 42, 0.78)',
                  color: '#fff',
                  fontSize: 11,
                  lineHeight: '18px',
                  padding: '0 7px',
                  borderRadius: 999,
                  fontWeight: 700,
                }}
              >
                {platformLabel}
              </span>
            )}
          </div>
        </div>

        <div style={{ padding: '10px 12px 12px' }}>
          <div
            title={entry.themeName}
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#0f172a',
              lineHeight: 1.35,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {entry.themeName}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 12,
              color: '#64748b',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {entry.categoryLabel ?? entry.category}
            {entry.subcategory ? ` / ${entry.subcategory}` : ''}
          </div>
        </div>
      </button>
    </article>
  );
}
