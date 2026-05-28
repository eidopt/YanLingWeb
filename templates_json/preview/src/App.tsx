import { TemplateCard } from './TemplateCard';
import {
  PREVIEW_VIEWPORT,
  TemplatePreview,
} from './TemplatePreview';
import type { TemplateEntry, TemplateIndex } from './types';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { DynamicThemeScreenPreset } from 'ui/renderer';

const SKIP_LIST_PATH = '/templates_json/import-skip-list.json';

const CATEGORY_LABELS: Record<string, string> = {
  commerce: '电商零售',
  content: '内容社区',
  dashboard: '数据看板',
  edu: '教育学习',
  education: '教育学习',
  finance: '金融财务',
  food: '餐饮美食',
  health: '健康医疗',
  marketing: '营销推广',
  profile: '个人中心',
  service: '生活服务',
  shop: '电商购物',
  social: '社交互动',
  utility: '工具效率',
  uncategorized: '未分类',
};

const DEVICE_LABELS: Record<DynamicThemeScreenPreset, string> = {
  mobile: '手机',
  tablet: '平板',
  desktop: '桌面',
};

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort(
    (a, b) => a.localeCompare(b),
  );
}

function entryMatchesQuery(entry: TemplateEntry, query: string) {
  if (!query.trim()) {
    return true;
  }

  const needle = query.trim().toLowerCase();
  return [
    entry.id,
    entry.themeName,
    entry.category,
    entry.categoryLabel,
    entry.subcategory,
    entry.variant,
    entry.platform,
    ...(entry.platformCategories ?? []),
  ].some((value) => value?.toLowerCase().includes(needle));
}

function getInitialDevice(entry: TemplateEntry): DynamicThemeScreenPreset {
  if (entry.platform === 'web' || entry.platformCategories?.includes('web')) {
    return 'desktop';
  }
  return 'mobile';
}

export function App(): ReactNode {
  const [index, setIndex] = useState<TemplateIndex | null>(null);
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<TemplateEntry | null>(null);
  const [device, setDevice] = useState<DynamicThemeScreenPreset>('mobile');
  const [loading, setLoading] = useState(true);
  const [skipIds, setSkipIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/templates-index.json')
      .then((response) => response.json() as Promise<TemplateIndex>)
      .then((data) => {
        setIndex(data);
        const categories = [...data.categories, ...data.extraCategories];
        setCategory(categories[0]?.name ?? '');
      })
      .catch((reason: unknown) => {
        console.error(reason);
        setMessage('模板索引加载失败');
      })
      .finally(() => setLoading(false));

    fetch(SKIP_LIST_PATH)
      .then((response) => {
        if (response.status === 404) {
          return [] as string[];
        }
        return response.json() as Promise<string[]>;
      })
      .then((ids) => setSkipIds(new Set(ids)))
      .catch(() => setSkipIds(new Set()));
  }, []);

  const categories = useMemo(
    () => [...(index?.categories ?? []), ...(index?.extraCategories ?? [])],
    [index],
  );
  const categoryData = useMemo(
    () => categories.find((item) => item.name === category),
    [categories, category],
  );
  const subcategories = useMemo(() => (
    uniqueSorted((categoryData?.items ?? []).map((item) => item.subcategory))
  ), [categoryData]);

  const visibleItems = useMemo(() => {
    const source = query.trim()
      ? index?.all ?? []
      : categoryData?.items ?? [];
    return source.filter((entry) => (
      (!subcategory || entry.subcategory === subcategory)
      && entryMatchesQuery(entry, query)
    ));
  }, [categoryData, index, query, subcategory]);

  const toggleSkipId = useCallback((id: string) => {
    setSkipIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const saveSkipList = useCallback(async () => {
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch(SKIP_LIST_PATH, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([...skipIds].sort(), null, 2),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setMessage(`已保存 ${skipIds.size} 个模板 ID`);
      window.setTimeout(() => setMessage(''), 2400);
    } catch (reason: unknown) {
      setMessage(`保存失败: ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally {
      setSaving(false);
    }
  }, [skipIds]);

  const openTemplate = useCallback((entry: TemplateEntry) => {
    setDevice(getInitialDevice(entry));
    setSelected(entry);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        加载模板索引...
      </div>
    );
  }

  if (selected) {
    const viewport = PREVIEW_VIEWPORT[device];
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#f6f8fb',
          color: '#0f172a',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '1px solid #dbe3ef',
            background: '#fff',
          }}
        >
          <button
            type="button"
            onClick={() => setSelected(null)}
            style={{
              padding: '7px 14px',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              background: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              color: '#0f172a',
            }}
          >
            返回列表
          </button>
          <strong style={{ fontSize: 14 }}>{selected.themeName}</strong>
          <span style={{ color: '#64748b', fontSize: 12 }}>{selected.id}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {(Object.keys(DEVICE_LABELS) as DynamicThemeScreenPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDevice(preset)}
                style={{
                  padding: '5px 12px',
                  border: device === preset ? '2px solid #1677ff' : '1px solid #cbd5e1',
                  borderRadius: 6,
                  background: device === preset ? '#e6f4ff' : '#fff',
                  color: '#0f172a',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: device === preset ? 700 : 500,
                }}
              >
                {DEVICE_LABELS[preset]}
              </button>
            ))}
          </div>
        </header>

        <main
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              width: viewport.width,
              height: viewport.height,
              border: '1px solid #dbe3ef',
              overflow: 'hidden',
              background: '#fff',
              boxShadow: '0 14px 36px rgba(15, 23, 42, 0.12)',
            }}
          >
            <TemplatePreview file={selected.file} device={device} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: '#f6f8fb',
        color: '#0f172a',
      }}
    >
      <aside
        style={{
          width: 248,
          borderRight: '1px solid #dbe3ef',
          overflow: 'auto',
          background: '#fff',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: 14, borderBottom: '1px solid #dbe3ef' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>模板 Schema 预览</div>
          <div style={{ marginTop: 3, fontSize: 12, color: '#64748b' }}>
            共 {index?.total ?? 0} 个 / 跳过导入 {skipIds.size} 个
          </div>
        </div>

        <nav style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
          {categories.map((item) => {
            const active = item.name === category;
            return (
              <div key={item.name}>
                <button
                  type="button"
                  onClick={() => {
                    setCategory(item.name);
                    setSubcategory('');
                    setQuery('');
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 14px',
                    cursor: 'pointer',
                    fontSize: 13,
                    border: 0,
                    borderRight: active && !subcategory
                      ? '3px solid #1677ff'
                      : '3px solid transparent',
                    background: active && !subcategory ? '#e6f4ff' : 'transparent',
                    color: '#0f172a',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: active ? 700 : 500,
                    textAlign: 'left',
                  }}
                >
                  <span>{item.label ?? CATEGORY_LABELS[item.name] ?? item.name}</span>
                  <span style={{ color: '#64748b', fontSize: 12 }}>{item.count}</span>
                </button>

                {active && subcategories.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSubcategory(name)}
                    style={{
                      width: '100%',
                      padding: '5px 14px 5px 28px',
                      cursor: 'pointer',
                      fontSize: 12,
                      border: 0,
                      borderRight: subcategory === name
                        ? '3px solid #1677ff'
                        : '3px solid transparent',
                      background: subcategory === name ? '#e6f4ff' : 'transparent',
                      color: '#334155',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontWeight: subcategory === name ? 700 : 500,
                      textAlign: 'left',
                    }}
                  >
                    <span>{name}</span>
                    <span style={{ color: '#64748b', fontSize: 11 }}>
                      {item.items.filter((entry) => entry.subcategory === name).length}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div style={{ padding: 12, borderTop: '1px solid #dbe3ef' }}>
          <button
            type="button"
            onClick={saveSkipList}
            disabled={saving}
            style={{
              width: '100%',
              padding: '8px 0',
              border: '1px solid #1677ff',
              borderRadius: 6,
              background: '#1677ff',
              color: '#fff',
              cursor: saving ? 'default' : 'pointer',
              fontSize: 13,
              fontWeight: 700,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '保存中...' : '保存跳过列表'}
          </button>
          {message && (
            <div
              style={{
                marginTop: 6,
                textAlign: 'center',
                fontSize: 12,
                color: message.startsWith('已保存') ? '#15803d' : '#dc2626',
              }}
            >
              {message}
            </div>
          )}
        </div>
      </aside>

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #dbe3ef',
            background: '#fff',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <input
            type="search"
            placeholder="搜索模板名称、ID、分类..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{
              flex: 1,
              maxWidth: 460,
              padding: '9px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              fontSize: 13,
              outline: 'none',
              color: '#0f172a',
              background: '#fff',
            }}
          />
          <span style={{ fontSize: 12, color: '#64748b' }}>
            当前显示 {visibleItems.length} 个模板
          </span>
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 14,
            alignContent: 'start',
          }}
        >
          {visibleItems.map((entry) => (
            <TemplateCard
              key={entry.id}
              entry={entry}
              onClick={() => openTemplate(entry)}
              checked={skipIds.has(entry.id)}
              onCheck={toggleSkipId}
            />
          ))}

          {visibleItems.length === 0 && (
            <div
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: 40,
                color: '#64748b',
              }}
            >
              没有匹配的模板
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
