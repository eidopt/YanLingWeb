import { compilePage } from './compilePage';
import { createStableComponentName, slugifyFileName } from './componentNamer';
import {
  generateAsyncDataBoundaryComponent,
  generateHtmlBlockComponent,
  generateInteractiveAlertComponent,
  generateInteractiveCarouselComponent,
  generateInteractiveDialogComponent,
  generateInteractiveDrawerComponent,
  generateInteractiveFormComponent,
  generateInteractivePaginationComponent,
  generateInteractiveRateComponent,
  generateInteractiveSwitchComponent,
  generateInteractiveTabsComponent,
  generateStaticWidgetComponent,
  generateUnsupportedNodeComponent,
} from './templates/components';
import { generateDataSourcesModule, generateUseExportedDataHook } from './templates/data';
import {
  generateIndexHtml,
  generateMainTsx,
  generatePackageJson,
  generateStyles,
  generateTsConfig,
  generateViteConfig,
} from './templates/project';
import { resolveThemeLayoutCssVars } from '@shared/theme-layout/styleManifest';
import type { ThemeLayoutDocument, ThemeLayoutDocumentSource } from 'ui/layout/types';

export interface ReactSourceProjectFile {
  relativePath: string;
  content: string;
}

export interface CompileDocumentToReactProjectOptions {
  projectName: string;
  runtimeCssVars?: Record<string, string>;
  runtimeCssAnimations?: Record<string, string>;
}

function normalizePages(document: ThemeLayoutDocumentSource): ThemeLayoutDocument['pages'] {
  if (document.pages?.length) {
    return document.pages;
  }
  if (!document.layout) {
    throw new Error('Cannot compile a document without pages or layout.');
  }
  return [
    {
      id: document.defaultPageId ?? document.layout.id,
      name: document.pageName ?? document.defaultPageId ?? document.layout.id,
      layout: document.layout,
    },
  ];
}

export function compileDocumentToReactProject(
  document: ThemeLayoutDocumentSource,
  options: CompileDocumentToReactProjectOptions,
): ReactSourceProjectFile[] {
  const pages = normalizePages(document);
  if (!pages.length) {
    throw new Error('Cannot compile a document without pages.');
  }
  const dataSources = document.dataSources ?? [];
  const dataSourceIds = new Set(dataSources.map((source) => source.id));

  const usedNames = new Set<string>();
  const usedFiles = new Set<string>();
  const compiledPages = pages.map((page) => {
    const componentName = createStableComponentName(page.name, page.id, usedNames);
    let fileBase = slugifyFileName(page.name || page.id, page.id || 'page');
    let fileName = `${fileBase}.tsx`;
    let suffix = 2;
    while (usedFiles.has(fileName)) {
      fileBase = slugifyFileName(`${page.name || page.id}-${suffix}`, `page-${suffix}`);
      fileName = `${fileBase}.tsx`;
      suffix += 1;
    }
    usedFiles.add(fileName);
    return compilePage(page, componentName, fileName, { dataSourceIds });
  });

  const defaultPage = pages.find((page) => page.id === document.defaultPageId) ?? pages[0];
  const cssVars = resolveThemeLayoutCssVars(document, options.runtimeCssVars);
  const cssAnimations = {
    ...(options.runtimeCssAnimations ?? {}),
    ...(document.cssAnimations ?? {}),
  };
  const appImports = compiledPages
    .map((page) =>
      [`import { ${page.componentName} } from './pages/`, `${page.fileName.replace(/\.tsx$/, '')}';`].join(''),
    )
    .join('\n');
  const routeEntries = compiledPages
    .map((page, index) => {
      const originalPage = pages[index];
      return `  ${JSON.stringify(originalPage.id)}: ${page.componentName},`;
    })
    .join('\n');

  const files: ReactSourceProjectFile[] = [
    {
      relativePath: 'package.json',
      content: generatePackageJson(slugifyFileName(options.projectName, 'yanling-export')),
    },
    { relativePath: 'postcss.config.cjs', content: 'module.exports = {};\n' },
    { relativePath: 'index.html', content: generateIndexHtml(options.projectName) },
    { relativePath: 'tsconfig.json', content: generateTsConfig() },
    { relativePath: 'vite.config.ts', content: generateViteConfig() },
    { relativePath: 'src/main.tsx', content: generateMainTsx() },
    {
      relativePath: 'src/types.ts',
      content: ['export interface PageProps {', '  onNavigate: (pageId: string) => void;', '}', ''].join('\n'),
    },
    {
      relativePath: 'src/App.tsx',
      content: `import { useState } from 'react';

${appImports}

const pages = {
${routeEntries}
};

type PageId = keyof typeof pages;

export function App() {
  const [activePageId, setActivePageId] = useState<PageId>(${JSON.stringify(defaultPage.id)} as PageId);
  const ActivePage = pages[activePageId] ?? pages[${JSON.stringify(defaultPage.id)} as PageId];

  return (
    <main className="appShell">
      <ActivePage onNavigate={(pageId) => {
        if (pageId in pages) {
          setActivePageId(pageId as PageId);
        }
      }} />
    </main>
  );
}
`,
    },
    {
      relativePath: 'src/styles.css',
      content: generateStyles(cssVars, cssAnimations),
    },
    ...compiledPages.map((page) => ({
      relativePath: `src/pages/${page.fileName}`,
      content: page.content,
    })),
  ];

  if (dataSources.length) {
    files.push(
      {
        relativePath: 'src/data/dataSources.ts',
        content: generateDataSourcesModule(dataSources),
      },
      {
        relativePath: 'src/data/useExportedData.ts',
        content: generateUseExportedDataHook(),
      },
    );
  }
  if (compiledPages.some((page) => page.needsAsyncDataBoundary)) {
    files.push({
      relativePath: 'src/components/AsyncDataBoundary.tsx',
      content: generateAsyncDataBoundaryComponent(),
    });
  }
  if (compiledPages.some((page) => page.needsHtmlBlock)) {
    files.push({
      relativePath: 'src/components/HtmlBlock.tsx',
      content: generateHtmlBlockComponent(),
    });
  }
  if (compiledPages.some((page) => page.needsInteractiveAlert)) {
    files.push({
      relativePath: 'src/components/InteractiveAlert.tsx',
      content: generateInteractiveAlertComponent(),
    });
  }
  if (compiledPages.some((page) => page.needsInteractiveCarousel)) {
    files.push({
      relativePath: 'src/components/InteractiveCarousel.tsx',
      content: generateInteractiveCarouselComponent(),
    });
  }
  if (compiledPages.some((page) => page.needsInteractiveDialog)) {
    files.push({
      relativePath: 'src/components/InteractiveDialog.tsx',
      content: generateInteractiveDialogComponent(),
    });
  }
  if (compiledPages.some((page) => page.needsInteractiveDrawer)) {
    files.push({
      relativePath: 'src/components/InteractiveDrawer.tsx',
      content: generateInteractiveDrawerComponent(),
    });
  }
  if (compiledPages.some((page) => page.needsInteractiveForm)) {
    files.push({
      relativePath: 'src/components/InteractiveForm.tsx',
      content: generateInteractiveFormComponent(),
    });
  }
  if (compiledPages.some((page) => page.needsInteractivePagination)) {
    files.push({
      relativePath: 'src/components/InteractivePagination.tsx',
      content: generateInteractivePaginationComponent(),
    });
  }
  if (compiledPages.some((page) => page.needsInteractiveRate)) {
    files.push({
      relativePath: 'src/components/InteractiveRate.tsx',
      content: generateInteractiveRateComponent(),
    });
  }
  if (compiledPages.some((page) => page.needsInteractiveSwitch)) {
    files.push({
      relativePath: 'src/components/InteractiveSwitch.tsx',
      content: generateInteractiveSwitchComponent(),
    });
  }
  if (compiledPages.some((page) => page.needsInteractiveTabs)) {
    files.push({
      relativePath: 'src/components/InteractiveTabs.tsx',
      content: generateInteractiveTabsComponent(),
    });
  }
  if (compiledPages.some((page) => page.needsUnsupportedNode)) {
    files.push({
      relativePath: 'src/components/UnsupportedNode.tsx',
      content: generateUnsupportedNodeComponent(),
    });
  }
  if (compiledPages.some((page) => page.needsStaticWidget)) {
    files.push({
      relativePath: 'src/components/StaticWidget.tsx',
      content: generateStaticWidgetComponent(),
    });
  }

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}
