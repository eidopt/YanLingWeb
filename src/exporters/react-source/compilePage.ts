import { compileNode } from './compileNode';
import type { ThemeLayoutPage } from 'ui/layout/types';

export interface CompiledPage {
  fileName: string;
  componentName: string;
  content: string;
  needsHtmlBlock: boolean;
  needsUnsupportedNode: boolean;
  needsWidgetPlaceholder: boolean;
}

export function compilePage(
  page: ThemeLayoutPage,
  componentName: string,
  fileName: string,
): CompiledPage {
  const node = compileNode(page.layout);
  const imports = [
    "import type { PageProps } from '../types';",
    node.needsHtmlBlock ? "import { HtmlBlock } from '../components/HtmlBlock';" : null,
    node.needsUnsupportedNode ? "import { UnsupportedNode } from '../components/UnsupportedNode';" : null,
    node.needsWidgetPlaceholder ? "import { WidgetPlaceholder } from '../components/WidgetPlaceholder';" : null,
  ].filter(Boolean).join('\n');

  return {
    fileName,
    componentName,
    needsHtmlBlock: node.needsHtmlBlock,
    needsUnsupportedNode: node.needsUnsupportedNode,
    needsWidgetPlaceholder: node.needsWidgetPlaceholder,
    content: `${imports}

export function ${componentName}({ onNavigate }: PageProps) {
  return (
${node.code}
  );
}
`,
  };
}
