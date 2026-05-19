'use client';

import { homeWorkspaceContent as c } from './HomeWorkspace.content';
import styles from './HomeWorkspace.module.css';
import { homePageThemeVars } from './theme';
import { useAppServices } from 'hooks/useAppServices';
import { useRouter } from 'next/navigation';
import type { ComponentType, KeyboardEvent, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuthUser } from 'services/AuthService';
import type { TemplateService } from 'services/TemplateService';
import type { ThemeSpec } from 'types/theme.types';
import {
  CalendarIcon,
  CartIcon,
  DashboardIcon,
  type IconProps,
  MarketplaceIcon,
  MineIcon,
  MobileIcon,
  TagIcon,
  WebIcon,
} from 'ui/icons';
import { PageRoot } from 'ui/pages';
import { ThemeCard } from 'ui/theme_card';
import { showThemePreviewModal } from 'ui/theme_preview_modal';
import { UserSettingsDialog } from 'ui/user_settings';

interface HomeWorkspaceProps {
  user: AuthUser;
}

type QuickActionIcon = ComponentType<IconProps>;
type TemplateView = 'marketplace' | 'mine';

function getTemplateViewFromUrl(): TemplateView {
  if (typeof window === 'undefined') {
    return 'marketplace';
  }

  return new URLSearchParams(window.location.search).get('view') === 'mine'
    ? 'mine'
    : 'marketplace';
}

function groupByCategory(themes: ThemeSpec[]) {
  const groups = new Map<string, ThemeSpec[]>();
  themes.forEach((theme) => {
    const key = theme.category.trim() || 'general';
    groups.set(key, [...(groups.get(key) ?? []), theme]);
  });
  return [...groups.entries()];
}

function getCategoryIcon(category: string): QuickActionIcon {
  const normalized = category.toLowerCase();
  if (category.includes('电商') || category.includes('购物') || normalized.includes('shop')) {
    return CartIcon;
  }
  if (category.includes('服务') || category.includes('预约') || normalized.includes('service')) {
    return CalendarIcon;
  }
  if (category.includes('后台') || category.includes('管理') || normalized.includes('dashboard')) {
    return DashboardIcon;
  }
  if (category.includes('移动') || normalized.includes('app')) {
    return MobileIcon;
  }
  if (category.includes('网页') || normalized.includes('web') || normalized.includes('h5')) {
    return WebIcon;
  }
  return TagIcon;
}

function getSidebarIcon(id: string): QuickActionIcon {
  return id === 'mine' ? MineIcon : MarketplaceIcon;
}

function getInitials(username: string) {
  return username.slice(0, 1).toUpperCase();
}

function getTemplateTime(theme: ThemeSpec) {
  const value = theme.updatedAt ?? theme.createdAt ?? '';
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function sortTemplatesByRecent(themes: ThemeSpec[]) {
  return [...themes].sort((a, b) => getTemplateTime(b) - getTemplateTime(a));
}

async function openMarketplaceTemplate(
  templateService: TemplateService,
  router: ReturnType<typeof useRouter>,
  theme: ThemeSpec,
) {
  const copy = await templateService.duplicate(theme.id);
  router.push(`/editor?templateId=${encodeURIComponent(copy.id)}`);
}

export function HomeWorkspace({ user }: HomeWorkspaceProps) {
  const router = useRouter();
  const { templateService } = useAppServices();
  const topRef = useRef<HTMLElement | null>(null);
  const templateRef = useRef<HTMLElement | null>(null);
  const [marketTemplates, setMarketTemplates] = useState<ThemeSpec[]>([]);
  const [myTemplates, setMyTemplates] = useState<ThemeSpec[]>([]);
  const [templateView, setTemplateView] = useState<TemplateView>(() => getTemplateViewFromUrl());
  const [searchDraft, setSearchDraft] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [searchRevision, setSearchRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const params = submittedSearch ? { search: submittedSearch } : undefined;
    void Promise.all([
      templateService.fetchAll(params),
      templateService.fetchMine(params),
    ])
      .then(([market, mine]) => {
        if (cancelled) {
          return;
        }
        setMarketTemplates(market);
        setMyTemplates(mine);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [templateService, submittedSearch, searchRevision]);

  useEffect(() => {
    const syncTemplateView = () => {
      setTemplateView(getTemplateViewFromUrl());
    };

    syncTemplateView();
    window.addEventListener('popstate', syncTemplateView);
    return () => {
      window.removeEventListener('popstate', syncTemplateView);
    };
  }, []);

  const marketCategories = useMemo(
    () => groupByCategory(marketTemplates)
      .map(([category, themes]) => ({ category, count: themes.length }))
      .filter((item) => item.count > 0),
    [marketTemplates],
  );
  const recentMineTemplates = useMemo(
    () => sortTemplatesByRecent(myTemplates).slice(0, 4),
    [myTemplates],
  );
  const templateSectionThemes = templateView === 'mine' ? myTemplates : marketTemplates;
  const templateGroups = useMemo(
    () => groupByCategory(templateSectionThemes),
    [templateSectionThemes],
  );
  const templateSectionTitle = templateView === 'mine'
    ? c.mine.title
    : c.marketplace.title;
  const templateSectionEmpty = templateView === 'mine'
    ? c.mine.empty
    : c.marketplace.empty;

  function scrollTo(ref: RefObject<HTMLElement | null>) {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function submitSearch(nextSearch = searchDraft) {
    setLoading(true);
    setSubmittedSearch(nextSearch.trim());
    setSearchRevision((current) => current + 1);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    submitSearch();
    window.requestAnimationFrame(() => scrollTo(templateRef));
  }

  function showTemplateView(nextView: TemplateView) {
    setSearchDraft('');
    submitSearch('');
    setTemplateView(nextView);
    router.push(nextView === 'mine' ? '/?view=mine' : '/', { scroll: false });
    window.requestAnimationFrame(() => scrollTo(templateRef));
  }

  function openOwned(theme: ThemeSpec) {
    router.push(`/editor?templateId=${encodeURIComponent(theme.id)}`);
  }

  function previewMarketplaceTemplate(theme: ThemeSpec) {
    showThemePreviewModal(theme, () => {
      void openMarketplaceTemplate(templateService, router, theme);
    });
  }

  function handleSidebarAction(id: string) {
    if (id === 'mine') {
      showTemplateView('mine');
      return;
    }

    showTemplateView('marketplace');
  }

  const quickActions = [
    {
      id: 'marketplace',
      label: c.actions.market,
      icon: MarketplaceIcon,
      tone: 'indigo',
    },
    {
      id: 'mine',
      label: c.actions.mine,
      icon: MineIcon,
      tone: 'violet',
    },
    ...marketCategories.slice(0, 6).map((item, index) => ({
      id: `category-${item.category}`,
      label: item.category,
      icon: getCategoryIcon(item.category),
      tone: ['amber', 'orange', 'teal', 'slate', 'gray', 'indigo'][index] ?? 'indigo',
    })),
  ];

  function handleQuickAction(id: string, label: string) {
    if (id === 'marketplace') {
      showTemplateView('marketplace');
      return;
    }
    if (id === 'mine') {
      showTemplateView('mine');
      return;
    }
    if (id.startsWith('category-')) {
      setTemplateView('marketplace');
      setSearchDraft(label);
      submitSearch(label);
      router.push('/', { scroll: false });
      window.requestAnimationFrame(() => scrollTo(templateRef));
    }
  }

  return (
    <PageRoot className={styles.page} style={homePageThemeVars}>
      <main className={styles.shell}>
        <aside className={styles.sidebar}>
          <nav className={styles.nav} aria-label={c.sidebar.workspace}>
            {c.sidebar.items.map((item) => {
              const Icon = getSidebarIcon(item.id);
              const active = item.id === 'mine'
                ? templateView === 'mine'
                : templateView === 'marketplace';
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                  onClick={() => handleSidebarAction(item.id)}
                >
                  <span className={styles.navIcon}>
                    <Icon />
                  </span>
                  <span className={styles.navLabel}>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className={styles.sidebarFooter}>
            <button
              type="button"
              className={styles.userButton}
              aria-label={c.sidebar.userSettings}
              title={c.sidebar.userSettings}
              onClick={() => setSettingsOpen(true)}
            >
              <span className={styles.userAvatar}>{getInitials(user.username)}</span>
            </button>
          </div>
        </aside>

        <section className={styles.main}>
          <header ref={topRef} className={styles.searchBand}>
            <div className={styles.searchCopy}>
              <h1 className={styles.title}>{c.search.title}</h1>
            </div>
            <label className={styles.searchBox}>
              <span className={styles.searchIcon} aria-hidden="true" />
              <textarea
                className={styles.searchInput}
                rows={2}
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={c.search.placeholder}
              />
            </label>
            <div className={styles.quickStartRow}>
              {quickActions.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.quickStart}
                    data-tone={item.tone}
                    onClick={() => handleQuickAction(item.id, item.label)}
                  >
                    <span className={styles.quickIcon}>
                      <Icon />
                    </span>
                    <span className={styles.quickLabel}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </header>

          {loading ? <p className={styles.status}>{c.loading}</p> : null}
          {error ? (
            <p className={styles.status}>{c.errorPrefix}{error}</p>
          ) : null}

          {templateView === 'marketplace' ? (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>{c.mineOverview.title}</h2>
                <button
                  type="button"
                  className={styles.viewAllButton}
                  onClick={() => showTemplateView('mine')}
                >
                  {c.mineOverview.viewAll}
                </button>
              </div>
              {!loading && recentMineTemplates.length === 0 ? (
                <p className={styles.empty}>{c.mineOverview.empty}</p>
              ) : null}
              <div className={styles.templateGrid}>
                {recentMineTemplates.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    className={styles.workspaceThemeCard}
                    onClick={() => openOwned(theme)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section ref={templateRef} className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{templateSectionTitle}</h2>
            </div>
            {!loading && templateSectionThemes.length === 0 ? (
              <p className={styles.empty}>{templateSectionEmpty}</p>
            ) : null}
            {templateGroups.map(([category, themes]) => (
              <div key={category} className={styles.categoryGroup}>
                <h3 className={styles.categoryTitle}>{category}</h3>
                <div className={styles.templateGrid}>
                  {themes.map((theme) => (
                    <ThemeCard
                      key={theme.id}
                      theme={theme}
                      className={styles.workspaceThemeCard}
                      onClick={() => {
                        if (templateView === 'mine') {
                          openOwned(theme);
                          return;
                        }
                        previewMarketplaceTemplate(theme);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
          {settingsOpen ? (
            <UserSettingsDialog
              user={user}
              onClose={() => setSettingsOpen(false)}
            />
          ) : null}
        </section>
      </main>
    </PageRoot>
  );
}
