'use client';

import { homeWorkspaceContent as c } from './HomeWorkspace.content';
import styles from './HomeWorkspace.module.css';
import { homePageThemeVars } from './theme';
import { WorkspaceSkeleton } from './WorkspaceSkeleton';
import { useAppServices } from 'hooks/useAppServices';
import { useRouter } from 'next/navigation';
import type { ComponentType, KeyboardEvent, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuthUser } from 'services/AuthService';
import type { TemplateService } from 'services/TemplateService';
import {
  homeWorkspaceStateActions,
  type HomeWorkspaceTemplateView,
  useHomeWorkspaceSnapshot,
} from 'state/homeWorkspaceState';
import type { ThemeSpec } from 'types/theme.types';
import { Box, Heading, Label, Text, TextArea } from 'ui/base';
import { ThemeToggleButton } from 'ui/global_nav';
import {
  CalendarIcon,
  CartIcon,
  DashboardIcon,
  EditorIcon,
  HomeIcon,
  type IconProps,
  MarketplaceIcon,
  MineIcon,
  MobileIcon,
  TagIcon,
  WebIcon,
} from 'ui/icons';
import { PageRoot, ScrollReveal } from 'ui/pages';
import { ThemeCard } from 'ui/theme_card';
import { showThemePreviewModal } from 'ui/theme_preview_modal';
import { UserSettingsDialog } from 'ui/user_settings';

interface HomeWorkspaceProps {
  user: AuthUser;
  mode?: 'home' | 'templates';
}

type QuickActionIcon = ComponentType<IconProps>;
interface CategorySummary {
  key: string;
  label: string;
  count: number;
}

interface FilterCard {
  key: string;
  label: string;
}

function groupByCategory(themes: ThemeSpec[]) {
  const groups = new Map<string, CategorySummary>();
  themes.forEach((theme) => {
    const key = theme.category.trim();
    if (!key) {
      return;
    }
    const current = groups.get(key);
    groups.set(key, {
      key,
      label: (theme.categoryLabel ?? theme.category).trim() || '通用',
      count: (current?.count ?? 0) + 1,
    });
  });
  return [...groups.values()];
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

function getPlatformIcon(platformCategory: string): QuickActionIcon {
  if (platformCategory === 'web') {
    return WebIcon;
  }
  if (platformCategory === 'mini-program' || platformCategory === 'mobile-app' || platformCategory === 'tablet-app') {
    return MobileIcon;
  }
  return MarketplaceIcon;
}

function buildTemplateUrl(params: { category?: string; platformCategory?: string }) {
  const query = new URLSearchParams();
  if (params.platformCategory) {
    query.set('platformCategory', params.platformCategory);
  }
  if (params.category) {
    query.set('category', params.category);
  }
  const serialized = query.toString();
  return serialized ? `/templates?${serialized}` : '/templates';
}

function getSidebarIcon(id: string): QuickActionIcon {
  if (id === 'home') {
    return HomeIcon;
  }
  if (id === 'templates') {
    return MarketplaceIcon;
  }
  if (id === 'mine') {
    return MineIcon;
  }
  if (id === 'editor') {
    return EditorIcon;
  }
  return MarketplaceIcon;
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

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) {
    return '夜深好';
  }
  if (hour < 12) {
    return '早上好';
  }
  if (hour < 18) {
    return '下午好';
  }
  return '晚上好';
}

async function openMarketplaceTemplate(
  templateService: TemplateService,
  router: ReturnType<typeof useRouter>,
  theme: ThemeSpec,
) {
  const copy = await templateService.duplicate(theme.id);
  router.push(`/editor?templateId=${encodeURIComponent(copy.id)}`);
}

export function HomeWorkspace({ user, mode = 'home' }: HomeWorkspaceProps) {
  const router = useRouter();
  const { searchService, templateService } = useAppServices();
  const { templateView, searchDraft, submittedSearch, submittedCategory, submittedPlatformCategory, searchRevision } =
    useHomeWorkspaceSnapshot(mode);
  const topRef = useRef<HTMLElement | null>(null);
  const templateRef = useRef<HTMLElement | null>(null);
  const [marketTemplates, setMarketTemplates] = useState<ThemeSpec[]>([]);
  const [categoryTemplates, setCategoryTemplates] = useState<ThemeSpec[]>([]);
  const [myTemplates, setMyTemplates] = useState<ThemeSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void templateService
      .fetchAll()
      .then((templates) => {
        if (!cancelled) {
          setCategoryTemplates(templates);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategoryTemplates([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [templateService]);

  useEffect(() => {
    let cancelled = false;
    const params = {
      ...(submittedSearch ? { search: submittedSearch } : {}),
      ...(submittedCategory ? { category: submittedCategory } : {}),
      ...(submittedPlatformCategory ? { platformCategory: submittedPlatformCategory } : {}),
    };
    const hasParams = Boolean(submittedSearch || submittedCategory || submittedPlatformCategory);
    const listParams = hasParams ? params : undefined;
    const mineRequest = mode === 'home' ? templateService.fetchMine(listParams) : Promise.resolve([]);

    void Promise.all([templateService.fetchAll(listParams), mineRequest])
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

    return () => {
      cancelled = true;
    };
  }, [mode, templateService, submittedSearch, submittedCategory, submittedPlatformCategory, searchRevision]);

  const marketCategories = useMemo(
    () => groupByCategory(categoryTemplates).filter((item) => item.count > 0),
    [categoryTemplates],
  );
  const recentMineTemplates = useMemo(() => sortTemplatesByRecent(myTemplates).slice(0, 4), [myTemplates]);
  const templateSectionThemes = templateView === 'mine' && mode === 'home' ? myTemplates : marketTemplates;
  const activeCategoryLabel = useMemo(
    () => marketCategories.find((item) => item.key === submittedCategory)?.label,
    [marketCategories, submittedCategory],
  );
  const templateSectionTitle = templateView === 'mine' ? c.mine.title : (activeCategoryLabel ?? c.marketplace.title);
  const templateSectionEmpty = templateView === 'mine' && mode === 'home' ? c.mine.empty : c.marketplace.empty;
  const greeting = useMemo(() => getGreeting(), []);

  function scrollTo(ref: RefObject<HTMLElement | null>) {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function submitSearch(nextSearch = searchDraft) {
    const trimmedSearch = nextSearch.trim();

    if (trimmedSearch) {
      void searchService
        .submit(trimmedSearch)
        .then((result) => {
          if (searchService.isCreateResult(result)) {
            router.push(`/editor?prompt=${encodeURIComponent(result.query)}&autoGenerate=true`);
            return;
          }
          setLoading(true);
          homeWorkspaceStateActions.submitSearch(trimmedSearch);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
        });
    } else {
      setLoading(true);
      homeWorkspaceStateActions.submitSearch('');
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    submitSearch();
    window.requestAnimationFrame(() => scrollTo(templateRef));
  }

  function showTemplateView(nextView: HomeWorkspaceTemplateView) {
    setLoading(true);
    homeWorkspaceStateActions.showTemplateView(nextView);
    if (nextView === 'mine') {
      router.push('/?view=mine', { scroll: false });
    } else {
      router.push(mode === 'templates' ? '/templates' : '/', { scroll: false });
    }
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
    if (id === 'home') {
      router.push('/');
      return;
    }
    if (id === 'templates') {
      router.push('/templates');
      return;
    }
    if (id === 'mine') {
      showTemplateView('mine');
      return;
    }
    if (id === 'editor') {
      router.push('/editor');
      return;
    }

    showTemplateView('marketplace');
  }

  function browseCategory(category: FilterCard | null) {
    const nextCategory = category?.key ?? '';
    setLoading(true);
    homeWorkspaceStateActions.browseCategory(nextCategory);
    router.push(
      buildTemplateUrl({
        category: nextCategory,
        platformCategory: submittedPlatformCategory,
      }),
      { scroll: false },
    );
    window.requestAnimationFrame(() => scrollTo(templateRef));
  }

  function browsePlatformCategory(platformCategory: FilterCard | null) {
    const nextPlatformCategory = platformCategory?.key ?? '';
    setLoading(true);
    homeWorkspaceStateActions.browsePlatformCategory(nextPlatformCategory);
    router.push(
      buildTemplateUrl({
        category: submittedCategory,
        platformCategory: nextPlatformCategory,
      }),
      { scroll: false },
    );
    window.requestAnimationFrame(() => scrollTo(templateRef));
  }

  const sidebarItems = [...c.sidebar.items, { id: 'editor', label: '编辑器' }];
  const categoryCards = [
    { key: '', label: c.category.all, count: categoryTemplates.length },
    ...marketCategories.slice(0, 7),
  ];
  const platformCards = [{ key: '', label: c.platform.all }, ...c.platform.items];
  const categoryTones = ['indigo', 'amber', 'orange', 'teal', 'slate', 'gray', 'violet', 'green'];
  const platformTones = ['indigo', 'green', 'teal', 'violet', 'slate'];
  const showMineOverview = mode === 'home' && templateView === 'marketplace';

  return (
    <PageRoot className={styles.page} style={homePageThemeVars}>
      <Box as="main" className={styles.shell}>
        <Box as="aside" className={styles.sidebar}>
          <Box as="nav" className={styles.nav} aria-label={c.sidebar.workspace}>
            {sidebarItems.map((item) => {
              const Icon = getSidebarIcon(item.id);
              const active =
                item.id === 'home'
                  ? mode === 'home' && templateView !== 'mine'
                  : item.id === 'templates'
                    ? mode === 'templates'
                    : item.id === 'mine' && mode === 'home' && templateView === 'mine';
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                  onClick={() => handleSidebarAction(item.id)}
                >
                  <Box as="span" className={styles.navIcon}>
                    <Icon />
                  </Box>
                  <Box as="span" className={styles.navLabel}>
                    {item.label}
                  </Box>
                </button>
              );
            })}
          </Box>
          <Box className={styles.sidebarFooter}>
            <ThemeToggleButton variant="sidebar" />
            <button
              type="button"
              className={styles.userButton}
              aria-label={c.sidebar.userSettings}
              title={c.sidebar.userSettings}
              onClick={() => setSettingsOpen(true)}
            >
              <Box as="span" className={styles.userAvatar}>
                {getInitials(user.username)}
              </Box>
            </button>
          </Box>
        </Box>

        <Box as="section" className={styles.main}>
          <Box as="header" ref={topRef} className={styles.searchBand}>
            <Box className={styles.searchCopy}>
              <Heading as="h1" size="display" variant="primary" weight="heavy">
                <Box as="span" className={styles.greetingLine}>
                  {greeting}，{user.username}
                </Box>
                <Box as="span" className={styles.titleLine}>
                  {c.search.title}
                </Box>
              </Heading>
            </Box>
            <Label className={styles.searchBox}>
              <Box as="span" className={styles.searchIcon} aria-hidden="true" />
              <TextArea
                className={styles.searchInput}
                rows={2}
                value={searchDraft}
                onChange={(event) => homeWorkspaceStateActions.setSearchDraft(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={c.search.placeholder}
                variant="quiet"
              />
            </Label>
          </Box>

          {templateView === 'marketplace' ? (
            <Box as="section" className={styles.filterStack} aria-label="模板筛选">
              <Box className={styles.filterGroup}>
                <Heading as="h2" size="label" variant="secondary" weight="heavy">
                  {c.platform.heading}
                </Heading>
                <Box className={styles.categoryStrip} aria-label={c.platform.heading}>
                  {platformCards.map((item, index) => {
                    const Icon = getPlatformIcon(item.key);
                    const active = item.key === submittedPlatformCategory;
                    return (
                      <button
                        key={item.key || 'all-platforms'}
                        type="button"
                        className={`${styles.categoryCard} ${active ? styles.categoryCardActive : ''}`}
                        data-tone={platformTones[index] ?? 'indigo'}
                        aria-current={active ? 'true' : undefined}
                        onClick={() => browsePlatformCategory(item.key ? item : null)}
                      >
                        <Box as="span" className={styles.categoryIcon}>
                          <Icon />
                        </Box>
                        <Box as="span" className={styles.categoryText}>
                          <Box as="span" className={styles.categoryName}>
                            {item.label}
                          </Box>
                        </Box>
                      </button>
                    );
                  })}
                </Box>
              </Box>
              <Box className={styles.filterGroup}>
                <Heading as="h2" size="label" variant="secondary" weight="heavy">
                  {c.category.heading}
                </Heading>
                <Box className={styles.categoryStrip} aria-label={c.category.heading}>
                  {categoryCards.map((item, index) => {
                    const Icon = item.key ? getCategoryIcon(item.label) : MarketplaceIcon;
                    const active = item.key === submittedCategory;
                    return (
                      <button
                        key={item.key || 'all-categories'}
                        type="button"
                        className={`${styles.categoryCard} ${active ? styles.categoryCardActive : ''}`}
                        data-tone={categoryTones[index] ?? 'indigo'}
                        aria-current={active ? 'true' : undefined}
                        onClick={() => browseCategory(item.key ? item : null)}
                      >
                        <Box as="span" className={styles.categoryIcon}>
                          <Icon />
                        </Box>
                        <Box as="span" className={styles.categoryText}>
                          <Box as="span" className={styles.categoryName}>
                            {item.label}
                          </Box>
                        </Box>
                      </button>
                    );
                  })}
                </Box>
              </Box>
            </Box>
          ) : null}

          {loading ? <WorkspaceSkeleton /> : null}
          {error ? (
            <Box className={styles.status}>
              <Text size="md" variant="danger">
                {c.errorPrefix}
                {error}
              </Text>
            </Box>
          ) : null}

          {showMineOverview ? (
            <ScrollReveal variant="fadeUp" duration="base">
              <Box as="section" className={`${styles.section} ${styles.mineOverviewSection}`}>
                <Box className={styles.sectionHeader}>
                  <Heading as="h2" size="xl" variant="primary" weight="heavy">
                    {c.mineOverview.title}
                  </Heading>
                  <button type="button" className={styles.viewAllButton} onClick={() => showTemplateView('mine')}>
                    {c.mineOverview.viewAll}
                  </button>
                </Box>
                {!loading && recentMineTemplates.length === 0 ? (
                  <Text size="base" variant="muted">
                    {c.mineOverview.empty}
                  </Text>
                ) : null}
                <Box className={styles.templateGrid}>
                  {recentMineTemplates.map((theme) => (
                    <ThemeCard
                      key={theme.id}
                      theme={theme}
                      className={styles.workspaceThemeCard}
                      onClick={() => openOwned(theme)}
                    />
                  ))}
                </Box>
              </Box>
            </ScrollReveal>
          ) : null}

          <ScrollReveal variant="fadeUp" duration="base">
            <Box as="section" ref={templateRef} className={styles.section}>
              <Box className={styles.sectionHeader}>
                <Heading as="h2" size="xl" variant="primary" weight="heavy">
                  {templateSectionTitle}
                </Heading>
              </Box>
              {!loading && templateSectionThemes.length === 0 ? (
                <Text size="base" variant="muted">
                  {templateSectionEmpty}
                </Text>
              ) : null}
              <Box className={styles.masonryGrid}>
                {templateSectionThemes.map((theme) => (
                  <Box key={theme.id} className={styles.masonryItem}>
                    <ThemeCard
                      theme={theme}
                      className={styles.workspaceThemeCard}
                      onClick={() => {
                        if (templateView === 'mine' && mode === 'home') {
                          openOwned(theme);
                          return;
                        }
                        previewMarketplaceTemplate(theme);
                      }}
                    />
                  </Box>
                ))}
              </Box>
            </Box>
          </ScrollReveal>
          {settingsOpen ? <UserSettingsDialog user={user} onClose={() => setSettingsOpen(false)} /> : null}
        </Box>
      </Box>
    </PageRoot>
  );
}
