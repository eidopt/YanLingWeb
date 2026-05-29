import type {
  SemanticAssertion,
  SemanticAssertionResult,
  SemanticEvaluationResult,
  SemanticScenarioExpected,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from '../types';

function findNode(node: ThemeLayoutNode, nodeId: string): ThemeLayoutNode | null {
  if (node.id === nodeId) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findNode(child, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

function allNodes(document: ThemeLayoutDocument): ThemeLayoutNode[] {
  const nodes: ThemeLayoutNode[] = [];
  const visit = (node: ThemeLayoutNode) => {
    nodes.push(node);
    node.children?.forEach(visit);
  };
  document.pages.forEach((page) => visit(page.layout));
  return nodes;
}

function documentText(document: ThemeLayoutDocument): string {
  const parts: string[] = [document.themeName, document.description, document.pageName ?? ''];
  document.pages.forEach((page) => {
    parts.push(page.id, page.name, page.description ?? '');
  });
  allNodes(document).forEach((node) => {
    parts.push(node.id, node.alias);
    Object.values(node.props ?? {}).forEach((value) => {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        parts.push(String(value));
      }
      if (Array.isArray(value)) {
        parts.push(value.map(String).join(' '));
      }
    });
  });
  return parts.join('\n');
}

function getNode(document: ThemeLayoutDocument, nodeId: string | undefined): ThemeLayoutNode | null {
  if (!nodeId) {
    return null;
  }
  for (const page of document.pages) {
    const found = findNode(page.layout, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

function pageExists(document: ThemeLayoutDocument, assertion: SemanticAssertion): boolean {
  return document.pages.some(
    (page) =>
      (assertion.pageId !== undefined && page.id === assertion.pageId) ||
      (assertion.pageName !== undefined && page.name.includes(assertion.pageName)),
  );
}

function stringifyComparable(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function navigationTargets(document: ThemeLayoutDocument): string[] {
  const targets: string[] = [];
  allNodes(document).forEach((node) => {
    const interactions = node.interactions;
    [interactions?.onClick, interactions?.onActionClick, interactions?.onStatusClick].forEach((action) => {
      if (action?.type === 'navigate') {
        targets.push(action.targetPageId);
      }
    });
    const onTabClick = interactions?.onTabClick;
    if (onTabClick && !('type' in onTabClick)) {
      Object.values(onTabClick).forEach((action) => targets.push(action.targetPageId));
    } else if (
      onTabClick &&
      'type' in onTabClick &&
      onTabClick.type === 'navigate' &&
      typeof onTabClick.targetPageId === 'string'
    ) {
      targets.push(onTabClick.targetPageId);
    }
  });
  return [...new Set(targets)];
}

function pass(message: string, assertion: SemanticAssertion): SemanticAssertionResult {
  return { assertion, passed: true, message };
}

function fail(message: string, assertion: SemanticAssertion): SemanticAssertionResult {
  return { assertion, passed: false, message };
}

function evaluateAssertion(
  document: ThemeLayoutDocument,
  initialDocument: ThemeLayoutDocument | undefined,
  assertion: SemanticAssertion,
): SemanticAssertionResult {
  const node = getNode(document, assertion.nodeId);
  switch (assertion.type) {
    case 'node_exists':
      return node ? pass('node exists', assertion) : fail(`node missing: ${assertion.nodeId ?? ''}`, assertion);
    case 'node_not_exists':
      return !node ? pass('node absent', assertion) : fail(`node still exists: ${assertion.nodeId ?? ''}`, assertion);
    case 'node_alias_equals':
      return node?.alias === assertion.alias
        ? pass('node alias matches', assertion)
        : fail(`node alias mismatch: ${node?.alias ?? 'missing'}`, assertion);
    case 'node_prop_equals':
      return node?.props?.[assertion.prop ?? ''] === assertion.value
        ? pass('node prop equals expected value', assertion)
        : fail(`node prop mismatch: ${stringifyComparable(node?.props?.[assertion.prop ?? ''])}`, assertion);
    case 'node_prop_contains':
      return stringifyComparable(node?.props?.[assertion.prop ?? '']).includes(stringifyComparable(assertion.value))
        ? pass('node prop contains expected value', assertion)
        : fail('node prop does not contain expected value', assertion);
    case 'node_prop_not_contains':
      return !stringifyComparable(node?.props?.[assertion.prop ?? '']).includes(stringifyComparable(assertion.value))
        ? pass('node prop excludes forbidden value', assertion)
        : fail('node prop contains forbidden value', assertion);
    case 'page_exists':
      return pageExists(document, assertion) ? pass('page exists', assertion) : fail('page missing', assertion);
    case 'page_not_exists':
      return !pageExists(document, assertion) ? pass('page absent', assertion) : fail('page still exists', assertion);
    case 'page_count_equals':
      return document.pages.length === assertion.count
        ? pass('page count matches', assertion)
        : fail(`page count is ${String(document.pages.length)}`, assertion);
    case 'page_count_delta': {
      const initialCount = initialDocument?.pages.length ?? 0;
      const delta = document.pages.length - initialCount;
      return delta === assertion.delta
        ? pass('page count delta matches', assertion)
        : fail(`page count delta is ${String(delta)}`, assertion);
    }
    case 'page_name_contains':
      return document.pages.some((page) =>
        page.name.includes(stringifyComparable(assertion.value ?? assertion.pageName)),
      )
        ? pass('page name contains expected text', assertion)
        : fail('no page name contains expected text', assertion);
    case 'navigation_targets_include': {
      const targets = navigationTargets(document);
      const expectedTargets = assertion.targetPageIds ?? [];
      return expectedTargets.every((target) => targets.includes(target))
        ? pass('navigation includes expected targets', assertion)
        : fail(`navigation targets: ${targets.join(', ')}`, assertion);
    }
    case 'navigation_targets_exact': {
      const targets = navigationTargets(document).sort();
      const expectedTargets = [...(assertion.targetPageIds ?? [])].sort();
      return JSON.stringify(targets) === JSON.stringify(expectedTargets)
        ? pass('navigation targets match exactly', assertion)
        : fail(`navigation targets: ${targets.join(', ')}`, assertion);
    }
    case 'document_contains_text':
      return documentText(document).includes(stringifyComparable(assertion.value))
        ? pass('document contains expected text', assertion)
        : fail('document does not contain expected text', assertion);
    case 'document_not_contains_text':
      return !documentText(document).includes(stringifyComparable(assertion.value))
        ? pass('document excludes forbidden text', assertion)
        : fail('document contains forbidden text', assertion);
    case 'component_count_delta': {
      const initialCount = initialDocument ? allNodes(initialDocument).length : 0;
      const delta = allNodes(document).length - initialCount;
      return delta === assertion.delta
        ? pass('component count delta matches', assertion)
        : fail(`component count delta is ${String(delta)}`, assertion);
    }
    case 'new_page_has_min_nodes': {
      const initialIds = new Set(initialDocument?.pages.map((page) => page.id) ?? []);
      const newPages = document.pages.filter((page) => !initialIds.has(page.id));
      const minNodes = assertion.minNodes ?? 1;
      const ok = newPages.some(
        (page) =>
          allNodes({
            ...document,
            pages: [page],
            defaultPageId: page.id,
            layout: page.layout,
          }).length >= minNodes,
      );
      return ok ? pass('new page has enough nodes', assertion) : fail('new page is too small', assertion);
    }
    case 'all_pages_have_screen_root':
      return document.pages.every((page) => page.layout.alias === 'core.screen')
        ? pass('all page roots are core.screen', assertion)
        : fail('one or more page roots are not core.screen', assertion);
    case 'generated_app_has_min_pages':
      return document.pages.length >= (assertion.minPages ?? 3)
        ? pass('generated app has enough pages', assertion)
        : fail(`only ${String(document.pages.length)} pages generated`, assertion);
    case 'generated_app_has_required_sections': {
      const text = documentText(document);
      const missing = (assertion.sections ?? []).filter((section) => !text.includes(section));
      return missing.length === 0
        ? pass('required sections are present', assertion)
        : fail(`missing sections: ${missing.join(', ')}`, assertion);
    }
    default:
      return fail('Unsupported assertion type', assertion);
  }
}

function evaluateMustNotChangeAssertion(
  document: ThemeLayoutDocument,
  initialDocument: ThemeLayoutDocument | undefined,
  assertion: SemanticAssertion,
): SemanticAssertionResult {
  if (!initialDocument) {
    return fail('mustNotChange requires an initial document', assertion);
  }

  const initialResult = evaluateAssertion(initialDocument, undefined, assertion);
  if (!initialResult.passed) {
    return fail(`initial invariant missing: ${initialResult.message}`, assertion);
  }

  const finalResult = evaluateAssertion(document, initialDocument, assertion);
  return finalResult.passed
    ? pass(`unchanged: ${finalResult.message}`, assertion)
    : fail(`changed: ${finalResult.message}`, assertion);
}

export function evaluateSemanticAssertions(
  document: ThemeLayoutDocument | undefined,
  initialDocument: ThemeLayoutDocument | undefined,
  expected: SemanticScenarioExpected | undefined,
): SemanticEvaluationResult {
  if (!document) {
    return { passed: false, taskScore: 0, failures: [], results: [] };
  }
  const mustHave = expected?.mustHave ?? [];
  const mustNotChange = expected?.mustNotChange ?? [];
  const results = [
    ...mustHave.map((assertion) => evaluateAssertion(document, initialDocument, assertion)),
    ...mustNotChange.map((assertion) => evaluateMustNotChangeAssertion(document, initialDocument, assertion)),
  ];
  const failures = results.filter((result) => !result.passed);
  const taskScore = results.length === 0 ? 1 : (results.length - failures.length) / results.length;
  return {
    passed: taskScore >= 0.8,
    taskScore,
    failures,
    results,
  };
}
