#!/usr/bin/env node

import { writeReports } from './report-writer.js';
import { createMockTemplateDocument } from './runtime-fixtures.js';
import fs from 'node:fs';
import path from 'node:path';

const scenarioPath = path.resolve('scripts/agent-eval/scenarios.json');
const outputDir = path.resolve(process.env.AGENT_EVAL_OUTPUT_DIR ?? 'output/agent-eval');

function parseArgs(argv) {
  const args = {
    mode: process.env.AGENT_EVAL_PROVIDER_MODE ?? 'mock',
    cacheWarmupCount: Number(process.env.AGENT_EVAL_CACHE_WARMUP_COUNT ?? 3),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') {
      args.mode = argv[++index];
    } else if (arg === '--limit') {
      args.limit = Number(argv[++index]);
    } else if (arg === '--offset') {
      args.offset = Number(argv[++index]);
    } else if (arg === '--scenario') {
      args.scenario = argv[++index];
    } else if (arg === '--group') {
      args.group = argv[++index];
    } else if (arg === '--target-cache-hit-rate') {
      args.targetCacheHitRate = Number(argv[++index]);
    } else if (arg === '--conversation-batch-size') {
      args.conversationBatchSize = Number(argv[++index]);
    } else if (arg === '--clarification-reply-mode') {
      args.clarificationReplyMode = argv[++index];
    } else if (arg === '--cache-warmup-count') {
      args.cacheWarmupCount = Number(argv[++index]);
    }
  }
  return args;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function textNode(id, text, variant = 'body', order = 1) {
  return { id, alias: 'core.text', layout: { mode: 'flow', order, width: '100%' }, props: { text, variant } };
}

function buttonNode(id, label, order = 1) {
  return { id, alias: 'core.button', layout: { mode: 'flow', order }, props: { label, variant: 'primary' } };
}

function panelNode(id, children, order = 1) {
  return {
    id,
    alias: 'core.panel',
    layout: { mode: 'flow', order, width: '100%' },
    props: { tone: 'default', gap: '12' },
    children,
  };
}

const components = [
  ['core.screen', 'layout', ['title', 'statusTime', 'headerActionLabel']],
  ['core.panel', 'layout', ['tone', 'gap', 'title']],
  ['core.stack', 'layout', ['gap', 'alignItems']],
  ['core.row', 'layout', ['gap', 'wrap', 'justify', 'align', 'tone']],
  ['core.grid', 'layout', ['gap', 'columns']],
  ['core.text', 'component', ['text', 'variant', 'as']],
  ['core.button', 'component', ['label', 'variant', 'disabled']],
  ['core.search', 'component', ['placeholder', 'value']],
  ['core.tabs', 'component', ['tabs', 'activeTab']],
  ['core.tag', 'component', ['label', 'tone']],
  ['core.notice', 'component', ['text', 'tone']],
  ['core.image', 'component', ['alt', 'title']],
  ['core.html', 'component', ['tag', 'style']],
  ['core.widget', 'component', ['library', 'code', 'data']],
  ['core.divider', 'component', []],
  ['core.spacer', 'component', ['size']],
  ['core.input', 'component', ['placeholder', 'label']],
].map(([alias, kind, props]) => ({
  alias,
  kind,
  name: alias,
  description: alias,
  props: props.map((name) => ({ name, type: name === 'tabs' ? 'string[]' : name === 'disabled' ? 'boolean' : 'string' })),
}));

function footerTabs(id, activeTab) {
  return {
    id,
    alias: 'core.tabs',
    slot: 'footer',
    layout: { mode: 'flow', order: 999, width: '100%' },
    props: { tabs: ['首页', '订单', '我的'], activeTab },
    interactions: {
      onTabClick: {
        首页: { type: 'navigate', targetPageId: 'home' },
        订单: { type: 'navigate', targetPageId: 'orders' },
        我的: { type: 'navigate', targetPageId: 'profile' },
      },
    },
  };
}

function screen(id, title, children) {
  return {
    id,
    alias: 'core.screen',
    layout: { mode: 'flow', width: '100%' },
    props: { title },
    children,
  };
}

function seedDocument() {
  const home = screen('home-screen', '今日精选', [
    { id: 'home-search', alias: 'core.search', layout: { mode: 'flow', order: 1, width: '100%' }, props: { placeholder: '搜索水果零食、家清百货' } },
    textNode('home-title', '今日爆款', 'heading', 2),
    { id: 'home-notice', alias: 'core.notice', layout: { mode: 'flow', order: 3, width: '100%' }, props: { text: '满 59 元免配送费', tone: 'info' } },
    panelNode('home-product-panel', [
      textNode('home-card-title', '云南蓝莓 125g', 'title', 1),
      textNode('home-card-subtitle', '冷链现摘，酸甜平衡', 'body', 2),
      { id: 'home-filter-tag', alias: 'core.tag', layout: { mode: 'flow', order: 3 }, props: { label: '限时', tone: 'deal' } },
      buttonNode('home-primary-button', '马上抢', 4),
      buttonNode('home-duplicate-button', '马上抢', 5),
    ], 4),
    panelNode('home-service-card', [textNode('home-service-title', '会员专享', 'title', 1), buttonNode('home-service-button', '查看权益', 2)], 5),
    footerTabs('home-footer-tabs', '首页'),
  ]);
  const orders = screen('orders-screen', '订单', [
    panelNode('orders-status-card', [textNode('orders-status-title', '配送中', 'title', 1), buttonNode('orders-detail-button', '查看详情', 2)]),
    footerTabs('orders-footer-tabs', '订单'),
  ]);
  const profile = screen('profile-screen', '我的', [
    panelNode('profile-member-card', [textNode('profile-name', '普通会员', 'title', 1), buttonNode('profile-settings-button', '设置', 2)]),
    footerTabs('profile-footer-tabs', '我的'),
  ]);
  return {
    version: 1,
    themeId: 'commerce-market',
    themeName: '社区电商',
    pageName: '首页',
    description: 'Agent eval seed',
    components,
    defaultPageId: 'home',
    pages: [
      { id: 'home', name: '首页', layout: home },
      { id: 'orders', name: '订单', layout: orders },
      { id: 'profile', name: '我的', layout: profile },
    ],
    layout: home,
  };
}

function findNode(node, nodeId) {
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

function findNodeInDocument(document, nodeId) {
  for (const page of document.pages) {
    const node = findNode(page.layout, nodeId);
    if (node) {
      return { page, node };
    }
  }
  return null;
}

function removeNode(node, nodeId) {
  if (!node.children) {
    return false;
  }
  const index = node.children.findIndex((child) => child.id === nodeId);
  if (index >= 0) {
    node.children.splice(index, 1);
    return true;
  }
  return node.children.some((child) => removeNode(child, nodeId));
}

function activePage(document, pageId) {
  return document.pages.find((page) => page.id === (pageId || document.defaultPageId)) || document.pages[0];
}

function syncRoot(document) {
  const page = document.pages.find((item) => item.id === document.defaultPageId) || document.pages[0];
  document.defaultPageId = page.id;
  document.pageName = page.name;
  document.layout = page.layout;
}

function syncNavigation(document) {
  const labels = document.pages.map((page) => page.name);
  const onTabClick = Object.fromEntries(document.pages.map((page) => [page.name, { type: 'navigate', targetPageId: page.id }]));
  document.pages.forEach((page) => {
    const footer = findNode(page.layout, `${page.id}-footer-tabs`) || findNode(page.layout, 'home-footer-tabs');
    if (footer) {
      footer.props = { ...(footer.props || {}), tabs: labels, activeTab: page.name };
      footer.interactions = { ...(footer.interactions || {}), onTabClick };
    }
  });
}

function defaultNode(operation) {
  const props = operation.props || {};
  return {
    id: operation.nodeId || `${operation.alias}-${Date.now().toString(36)}`,
    alias: operation.alias,
    layout: { mode: 'flow', order: 1, width: '100%', ...(operation.layout || {}) },
    props,
    children: ['core.screen', 'core.panel', 'core.stack', 'core.row', 'core.grid'].includes(operation.alias) ? [] : undefined,
  };
}

function applyOperations(document, operations) {
  const errors = [];
  const applied = [];
  for (const operation of operations) {
    if (operation.type === 'create_page') {
      const layout = screen(operation.rootNodeId || `${operation.pageId}-screen`, operation.name || operation.pageId, []);
      document.pages.push({ id: operation.pageId, name: operation.name || operation.pageId, layout });
      document.defaultPageId = operation.pageId;
      applied.push(`create_page:${operation.pageId}`);
      syncRoot(document);
      continue;
    }
    if (operation.type === 'delete_page') {
      const index = document.pages.findIndex((page) => page.id === operation.pageId || page.name === operation.name);
      if (index >= 0 && document.pages.length > 1) {
        document.pages.splice(index, 1);
        if (!document.pages.some((page) => page.id === document.defaultPageId)) {
          document.defaultPageId = document.pages[0].id;
        }
        applied.push(`delete_page:${operation.pageId || operation.name}`);
        syncRoot(document);
      } else {
        errors.push(`cannot delete page ${operation.pageId || operation.name}`);
      }
      continue;
    }
    if (operation.type === 'sync_page_navigation' || operation.type === 'sync_footer_tabs') {
      syncNavigation(document);
      applied.push('sync_navigation');
      continue;
    }
    const page = activePage(document, operation.pageId);
    if (operation.type === 'insert_node') {
      const parent = findNode(page.layout, operation.parentId || page.layout.id);
      if (!parent) {
        errors.push(`parent not found ${operation.parentId}`);
        continue;
      }
      parent.children = parent.children || [];
      parent.children.push(defaultNode(operation));
      applied.push(`insert_node:${operation.nodeId}`);
      syncRoot(document);
      continue;
    }
    const target = findNode(page.layout, operation.nodeId);
    if (!target) {
      errors.push(`node not found ${operation.nodeId}`);
      continue;
    }
    if (operation.type === 'update_props') {
      target.props = { ...(target.props || {}), ...(operation.props || {}) };
      applied.push(`update_props:${operation.nodeId}`);
    } else if (operation.type === 'delete_node') {
      removeNode(page.layout, operation.nodeId);
      applied.push(`delete_node:${operation.nodeId}`);
    } else if (operation.type === 'update_interactions') {
      target.interactions = { ...(target.interactions || {}), ...(operation.interactions || {}) };
      applied.push(`update_interactions:${operation.nodeId}`);
    } else if (operation.type === 'move_node') {
      applied.push(`move_node:${operation.nodeId}`);
    } else if (operation.type === 'set_layout') {
      target.layout = { ...target.layout, ...(operation.layout || {}) };
      applied.push(`set_layout:${operation.nodeId}`);
    } else if (operation.type === 'set_frame') {
      target.layout = { ...target.layout, mode: 'absolute' };
      target.frame = { position: 'absolute', ...(operation.frame || {}) };
      applied.push(`set_frame:${operation.nodeId}`);
    }
    syncRoot(document);
  }
  return { document, applied, errors };
}

function allNodes(document) {
  const nodes = [];
  const visit = (node) => {
    nodes.push(node);
    for (const child of node.children || []) {
      visit(child);
    }
  };
  document.pages.forEach((page) => visit(page.layout));
  return nodes;
}

function validate(document) {
  const errors = [];
  const ids = new Set();
  const aliases = new Set(components.map((component) => component.alias));
  for (const page of document.pages || []) {
    if (page.layout?.alias !== 'core.screen') {
      errors.push(`page ${page.id} root is not core.screen`);
    }
    for (const node of allNodes({ ...document, pages: [page] })) {
      if (ids.has(node.id)) {
        errors.push(`duplicate node id ${node.id}`);
      }
      ids.add(node.id);
      if (!aliases.has(node.alias)) {
        errors.push(`unknown alias ${node.alias}`);
      }
      if (!node.layout || !['flow', 'grid', 'absolute'].includes(node.layout.mode)) {
        errors.push(`invalid layout for ${node.id}`);
      }
    }
  }
  if (!document.pages.some((page) => page.id === document.defaultPageId)) {
    errors.push('defaultPageId does not point to an existing page');
  }
  return { valid: errors.length === 0, errors: errors.map((message) => ({ message })), warnings: [], score: errors.length === 0 ? 1 : 0 };
}

function docText(document) {
  return JSON.stringify(document);
}

function navigationTargets(document) {
  const targets = [];
  for (const node of allNodes(document)) {
    const interactions = node.interactions || {};
    for (const key of ['onClick', 'onActionClick', 'onStatusClick']) {
      if (interactions[key]?.targetPageId) {
        targets.push(interactions[key].targetPageId);
      }
    }
    const tabs = interactions.onTabClick;
    if (tabs?.targetPageId) {
      targets.push(tabs.targetPageId);
    } else if (tabs && typeof tabs === 'object') {
      Object.values(tabs).forEach((action) => targets.push(action.targetPageId));
    }
  }
  return [...new Set(targets)].sort();
}

function evalAssertion(document, initialDocument, assertion) {
  const found = assertion.nodeId ? findNodeInDocument(document, assertion.nodeId)?.node : null;
  switch (assertion.type) {
    case 'node_exists':
      return Boolean(found);
    case 'node_not_exists':
      return !found;
    case 'node_prop_equals':
      return found?.props?.[assertion.prop] === assertion.value;
    case 'page_exists':
      return document.pages.some((page) => page.id === assertion.pageId || page.name.includes(assertion.pageName || ''));
    case 'page_not_exists':
      return !document.pages.some((page) => page.id === assertion.pageId || page.name === assertion.pageName);
    case 'new_page_has_min_nodes':
      return document.pages.some((page) => !initialDocument.pages.some((initial) => initial.id === page.id) && allNodes({ ...document, pages: [page] }).length >= (assertion.minNodes || 1));
    case 'navigation_targets_include':
      return (assertion.targetPageIds || []).every((id) => navigationTargets(document).includes(id));
    case 'navigation_targets_exact':
      return JSON.stringify(navigationTargets(document)) === JSON.stringify([...(assertion.targetPageIds || [])].sort());
    case 'document_contains_text':
      return docText(document).includes(assertion.value);
    case 'all_pages_have_screen_root':
      return document.pages.every((page) => page.layout.alias === 'core.screen');
    case 'generated_app_has_min_pages':
      return document.pages.length >= (assertion.minPages || 3);
    case 'generated_app_has_required_sections':
      return (assertion.sections || []).every((section) => docText(document).includes(section));
    default:
      return true;
  }
}

function evaluateSemantic(document, initialDocument, scenario) {
  const assertions = scenario.expected.mustHave || [];
  const results = assertions.map((assertion) => {
    const passed = evalAssertion(document, initialDocument, assertion);
    return { assertion, passed, message: passed ? 'passed' : `failed ${assertion.type}` };
  });
  const failures = results.filter((result) => !result.passed);
  const taskScore = assertions.length ? (assertions.length - failures.length) / assertions.length : 1;
  return { passed: taskScore >= 0.8, taskScore, failures, results };
}

function renderSmoke(document) {
  const visibleTextCount = allNodes(document).filter((node) => Object.values(node.props || {}).some((value) => typeof value === 'string' && value.trim())).length;
  const passed = visibleTextCount > 0;
  return { passed, score: passed ? 1 : 0, errors: passed ? [] : ['No visible text'], visibleTextCount };
}

function runMockScenario(scenario) {
  const startedAt = Date.now();
  const events = [
    { seq: 1, timestamp: new Date().toISOString(), type: 'tool_start', data: scenario.mode === 'template_generation' ? 'generate_template' : 'apply_editor_edits' },
  ];
  let initialDocument;
  let finalDocument;
  let toolArguments;
  let toolName;

  if (scenario.mode === 'template_generation') {
    toolName = 'generate_template';
    finalDocument = createMockTemplateDocument(scenario);
    toolArguments = { layoutDocument: finalDocument };
  } else {
    toolName = 'apply_editor_edits';
    initialDocument = seedDocument();
    const result = applyOperations(clone(initialDocument), scenario.mock?.operations || []);
    finalDocument = result.document;
    toolArguments = { operations: scenario.mock?.operations || [], reason: `mock:${scenario.id}` };
  }

  events.push(
    { seq: 2, timestamp: new Date().toISOString(), type: 'tool_done', data: toolName },
    { seq: 3, timestamp: new Date().toISOString(), type: 'done' },
  );
  const validation = validate(finalDocument);
  const semantic = evaluateSemantic(finalDocument, initialDocument, scenario);
  const unrelatedDiff = { passed: true, score: 0, maxScore: scenario.expected.maxUnrelatedChangeScore ?? 0.1, changes: [], unrelatedChanges: [] };
  const render = renderSmoke(finalDocument);
  const passed = validation.valid && semantic.passed && unrelatedDiff.passed && render.passed;
  return {
    scenarioId: scenario.id,
    mode: scenario.mode,
    prompt: scenario.prompt,
    status: passed ? 'passed' : 'failed',
    events,
    toolCalls: [{ seq: 1, timestamp: events[0].timestamp, name: toolName, arguments: toolArguments, result: { success: passed } }],
    initialDocument,
    finalDocument,
    validation,
    semantic,
    unrelatedDiff,
    render,
    durationMs: Date.now() - startedAt,
  };
}

async function runLiveScenario(scenario, options = {}) {
  const baseUrl = process.env.AGENT_EVAL_BASE_URL ?? 'http://localhost:4000/api';
  const timeoutMs = Number(process.env.AGENT_EVAL_SCENARIO_TIMEOUT_MS ?? 120000);
  const startedAt = Date.now();
  const requestBody = {
    ...scenario,
    ...(options.conversation ? { conversation: options.conversation } : {}),
    ...(options.clarificationChoice ? { clarificationChoice: options.clarificationChoice } : {}),
    ...(options.conversationBatchId ? { conversationBatchId: options.conversationBatchId } : {}),
  };
  try {
    const response = await fetch(`${baseUrl}/ai/agent-eval/live`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`backend eval returned ${response.status}: ${text}`);
    }
    return await response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      scenarioId: scenario.id,
      mode: scenario.mode,
      prompt: scenario.prompt,
      status: 'errored',
      events: [{ seq: 1, timestamp: new Date().toISOString(), type: 'error', data: message }],
      toolCalls: [],
      validation: {
        valid: false,
        errors: [{ path: 'live', code: 'live_eval_request_failed', message, severity: 'error' }],
        warnings: [],
        score: 0,
      },
      semantic: { passed: false, taskScore: 0, failures: [], results: [] },
      unrelatedDiff: { passed: true, score: 0, maxScore: scenario.expected?.maxUnrelatedChangeScore ?? 0.1, changes: [], unrelatedChanges: [] },
      render: { passed: false, score: 0, errors: [message], visibleTextCount: 0 },
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}

function expectedTargetIds(scenario) {
  const ids = new Set();
  for (const assertion of scenario.expected?.mustHave ?? []) {
    [
      assertion.nodeId,
      assertion.pageId,
      ...(assertion.targetPageIds ?? []),
    ].filter(Boolean).forEach((id) => ids.add(id));
  }
  for (const operation of scenario.mock?.operations ?? []) {
    [
      operation.nodeId,
      operation.parentId,
      operation.pageId,
      operation.targetNodeId,
      operation.targetPageId,
      operation.rootNodeId,
    ].filter(Boolean).forEach((id) => ids.add(id));
  }
  return ids;
}

function compactJson(value) {
  return JSON.stringify(value ?? {});
}

function describeOperationForClarification(operation) {
  if (!operation || typeof operation !== 'object') {
    return '';
  }
  switch (operation.type) {
    case 'insert_node':
      return [
        `在 ${operation.pageId || '默认页面'} 的 ${operation.parentId || '页面根节点'} 里新增组件`,
        `alias=${operation.alias}`,
        operation.nodeId ? `nodeId=${operation.nodeId}` : '',
        operation.props ? `props=${compactJson(operation.props)}` : '',
      ].filter(Boolean).join('，');
    case 'update_props':
      return [
        `只修改 ${operation.pageId || '默认页面'} 里的 ${operation.nodeId}`,
        `props=${compactJson(operation.props)}`,
      ].filter(Boolean).join('，');
    case 'delete_node':
      return `删除 ${operation.pageId || '默认页面'} 里的 ${operation.nodeId}，其他内容保持不变`;
    case 'create_page':
      return [
        `新增页面 pageId=${operation.pageId}`,
        operation.name ? `name=${operation.name}` : '',
        operation.rootNodeId ? `rootNodeId=${operation.rootNodeId}` : '',
      ].filter(Boolean).join('，');
    case 'delete_page':
      return `删除页面 ${operation.pageId || operation.name}，并保持剩余页面导航可用`;
    case 'update_interactions':
      return [
        `只修改 ${operation.nodeId} 的交互`,
        `interactions=${compactJson(operation.interactions)}`,
      ].filter(Boolean).join('，');
    case 'move_node':
      return [
        `移动 ${operation.nodeId}`,
        operation.targetParentId ? `到 ${operation.targetParentId}` : '',
      ].filter(Boolean).join('，');
    case 'set_layout':
      return [
        `只调整 ${operation.nodeId} 的 layout`,
        `layout=${compactJson(operation.layout)}`,
      ].filter(Boolean).join('，');
    case 'set_frame':
      return [
        `只调整 ${operation.nodeId} 的绝对定位 frame`,
        `frame=${compactJson(operation.frame)}`,
      ].filter(Boolean).join('，');
    case 'sync_page_navigation':
    case 'sync_footer_tabs':
      return '同步底部导航和页面跳转关系，保持所有页面都能互相切换';
    default:
      return `按这个精确操作执行：${compactJson(operation)}`;
  }
}

function buildCustomClarificationChoice(scenario) {
  const operations = scenario.mock?.operations ?? [];
  if (!operations.length) {
    return null;
  }
  const reply = operations
    .map(describeOperationForClarification)
    .filter(Boolean)
    .join('；');
  if (!reply) {
    return null;
  }
  return {
    id: `custom-${scenario.id}`,
    label: '其他：精确补充',
    description: 'Eval-generated free-form clarification reply',
    value: `User provided custom clarification: ${reply}`,
  };
}

function formatClarificationUserReply(choice) {
  const freeText = String(choice.value || '').replace(/^User provided custom clarification:\s*/i, '').trim();
  if (choice.id?.startsWith('custom-') && freeText) {
    return `补充说明：${freeText}`;
  }
  return `我选择：${choice.label}。${choice.value}`;
}

function chooseClarificationOption(scenario, clarification, replyMode = 'custom') {
  if (replyMode !== 'option' && clarification?.allowCustom !== false) {
    const customChoice = buildCustomClarificationChoice(scenario);
    if (customChoice) {
      return customChoice;
    }
  }

  const options = clarification?.options ?? [];
  if (!options.length) {
    return null;
  }
  const ids = expectedTargetIds(scenario);
  const exact = options.find((option) => (
    ids.has(option.id)
    || ids.has(option.target?.nodeId)
    || ids.has(option.target?.pageId)
  ));
  if (exact) {
    return exact;
  }
  const operation = scenario.mock?.operations?.[0];
  if (operation?.type === 'insert_node' && operation.parentId) {
    const parent = options.find((option) => option.target?.nodeId === operation.parentId || option.id === operation.parentId);
    if (parent) {
      return parent;
    }
  }
  return options[0];
}

function summarizeAssistantForConversation(result) {
  if (result.status === 'passed') {
    return `完成：${result.scenarioId ?? 'scenario'} 已按请求执行。`;
  }
  if (result.error) {
    return `未完成：${result.error}`;
  }
  const semanticFailure = result.semantic?.failures?.[0]?.message;
  const validationFailure = result.validation?.errors?.[0]?.message;
  return `未完全完成：${semanticFailure || validationFailure || result.status}`;
}

function trimConversation(conversation) {
  const maxChars = Number(process.env.AGENT_EVAL_CONVERSATION_MAX_CHARS ?? 500000);
  const maxMessageChars = Number(process.env.AGENT_EVAL_CONVERSATION_MESSAGE_MAX_CHARS ?? 40000);
  const trimmed = conversation.map((message) => {
    const content = String(message.content ?? '').trim();
    return {
      ...message,
      content: content.length > maxMessageChars
        ? `[Earlier content omitted]\n${content.slice(-maxMessageChars)}`
        : content,
    };
  });
  const retained = [];
  let totalChars = 0;
  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const next = trimmed[index];
    const nextTotal = totalChars + next.content.length;
    if (nextTotal > maxChars) {
      break;
    }
    retained.unshift(next);
    totalChars = nextTotal;
  }
  return retained;
}

async function runLiveScenarioInConversation(scenario, conversation, providerMessages, batchId) {
  const first = await runLiveScenario(scenario, {
    conversation,
    conversationBatchId: batchId,
  });
  if (!first.clarification) {
    conversation.push(
      { role: 'user', content: scenario.prompt },
      { role: 'assistant', content: summarizeAssistantForConversation(first) },
    );
    return {
      result: first,
      conversation: trimConversation(conversation),
      providerMessages: first.providerMessages ?? providerMessages,
      clarified: false,
    };
  }

  const replyMode = process.env.AGENT_EVAL_CLARIFICATION_REPLY_MODE ?? 'custom';
  const clarificationChoice = chooseClarificationOption(scenario, first.clarification, replyMode);
  if (!clarificationChoice) {
    conversation.push(
      { role: 'user', content: scenario.prompt },
      { role: 'assistant', content: first.clarification.question },
    );
    return {
      result: first,
      conversation: trimConversation(conversation),
      providerMessages,
      clarified: true,
    };
  }

  conversation.push(
    { role: 'user', content: scenario.prompt },
    { role: 'assistant', content: first.clarification.question },
    { role: 'user', content: formatClarificationUserReply(clarificationChoice) },
  );

  const second = await runLiveScenario(scenario, {
    conversation,
    clarificationChoice,
    conversationBatchId: batchId,
  });
  const result = {
    ...second,
    events: [...(first.events ?? []), ...(second.events ?? [])],
    clarification: first.clarification,
    clarificationChoice,
    durationMs: (first.durationMs ?? 0) + (second.durationMs ?? 0),
    tokenUsage: {
      inputTokens: (first.tokenUsage?.inputTokens ?? 0) + (second.tokenUsage?.inputTokens ?? 0),
      outputTokens: (first.tokenUsage?.outputTokens ?? 0) + (second.tokenUsage?.outputTokens ?? 0),
      cacheHitTokens: (first.tokenUsage?.cacheHitTokens ?? 0) + (second.tokenUsage?.cacheHitTokens ?? 0),
      cacheMissTokens: (first.tokenUsage?.cacheMissTokens ?? 0) + (second.tokenUsage?.cacheMissTokens ?? 0),
    },
  };
  conversation.push({ role: 'assistant', content: summarizeAssistantForConversation(result) });
  return {
    result,
    conversation: trimConversation(conversation),
    providerMessages: second.providerMessages ?? providerMessages,
    clarified: true,
  };
}

function summarize(mode, results, options = {}) {
  const passed = results.filter((result) => result.status === 'passed').length;
  const errored = results.filter((result) => result.status === 'errored').length;
  const failed = results.length - passed;
  const cacheHitTokens = results.reduce((total, result) => total + (result.tokenUsage?.cacheHitTokens || 0), 0);
  const cacheMissTokens = results.reduce((total, result) => total + (result.tokenUsage?.cacheMissTokens || 0), 0);
  const cacheTotalTokens = cacheHitTokens + cacheMissTokens;
  const cacheHitRate = cacheTotalTokens > 0 ? cacheHitTokens / cacheTotalTokens : 0;
  const cacheWarmupCount = Number.isFinite(options.cacheWarmupCount)
    ? Math.max(0, Math.floor(options.cacheWarmupCount))
    : 0;
  const postWarmupResults = results.slice(Math.min(cacheWarmupCount, results.length));
  const postWarmupCacheHitTokens = postWarmupResults
    .reduce((total, result) => total + (result.tokenUsage?.cacheHitTokens || 0), 0);
  const postWarmupCacheMissTokens = postWarmupResults
    .reduce((total, result) => total + (result.tokenUsage?.cacheMissTokens || 0), 0);
  const postWarmupCacheTotalTokens = postWarmupCacheHitTokens + postWarmupCacheMissTokens;
  const postWarmupCacheHitRate = postWarmupCacheTotalTokens > 0
    ? postWarmupCacheHitTokens / postWarmupCacheTotalTokens
    : 0;
  const prefixHashes = [
    ...new Set(results.map((result) => result.cacheDiagnostics?.prefixHash).filter(Boolean)),
  ];
  const toolHashes = [
    ...new Set(results.map((result) => result.cacheDiagnostics?.toolHash).filter(Boolean)),
  ];
  const targetCacheHitRate = Number.isFinite(options.targetCacheHitRate)
    ? options.targetCacheHitRate
    : undefined;
  const toolCallCount = results.filter((result) => result.toolCalls.length > 0).length;
  const clarificationCount = results.filter((result) => result.clarification).length;
  const clarificationCustomCount = results.filter((result) => (
    result.clarificationChoice?.id?.startsWith('custom-')
  )).length;
  const renderPassed = results.filter((result) => result.render.passed).length;
  const partialSuccess = results.filter((result) => (
    result.status !== 'passed'
    && result.validation.valid
    && result.semantic.taskScore > 0
  )).length;
  const failures = results.filter((result) => result.status !== 'passed').map((result) => ({
    scenarioId: result.scenarioId,
    prompt: result.prompt,
    reason: result.error || result.status,
    validatorErrors: result.validation.errors.map((item) => item.message),
    semanticFailures: result.semantic.failures.map((item) => item.message),
    unrelatedChanges: result.unrelatedDiff.unrelatedChanges.map((item) => item.path),
  }));
  return {
    mode,
    total: results.length,
    passed,
    failed,
    errored,
    passRate: results.length ? passed / results.length : 0,
    errorRate: results.length ? errored / results.length : 0,
    toolCallRate: results.length ? toolCallCount / results.length : 0,
    clarificationCount,
    clarificationRate: results.length ? clarificationCount / results.length : 0,
    clarificationCustomCount,
    clarificationCustomRate: results.length ? clarificationCustomCount / results.length : 0,
    structurePassRate: results.filter((result) => result.validation.valid).length / results.length,
    semanticPassRate: results.filter((result) => result.semantic.passed).length / results.length,
    renderPassRate: results.length ? renderPassed / results.length : 0,
    unrelatedDiffFailureRate: results.filter((result) => !result.unrelatedDiff.passed).length / results.length,
    partialSuccess,
    averageDurationMs: results.reduce((total, result) => total + result.durationMs, 0) / Math.max(1, results.length),
    cacheHitTokens,
    cacheMissTokens,
    cacheHitRate,
    cacheMissTokensPerRequest: cacheMissTokens / Math.max(1, results.length),
    cacheWarmupCount,
    postWarmupCacheHitTokens,
    postWarmupCacheMissTokens,
    postWarmupCacheHitRate,
    postWarmupCacheMissTokensPerRequest: postWarmupCacheMissTokens / Math.max(1, postWarmupResults.length),
    prefixHashCount: prefixHashes.length,
    toolHashCount: toolHashes.length,
    prefixHashes,
    toolHashes,
    targetCacheHitRate,
    cacheHitRateMet: targetCacheHitRate === undefined ? undefined : cacheHitRate >= targetCacheHitRate,
    failures,
    results,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.clarificationReplyMode) {
    process.env.AGENT_EVAL_CLARIFICATION_REPLY_MODE = args.clarificationReplyMode;
  }
  let scenarios = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
  if (args.scenario) {
    scenarios = scenarios.filter((scenario) => scenario.id === args.scenario);
  }
  if (args.group) {
    scenarios = scenarios.filter((scenario) => scenario.group === args.group);
  }
  if (args.offset) {
    scenarios = scenarios.slice(args.offset);
  }
  if (args.limit) {
    scenarios = scenarios.slice(0, args.limit);
  }
  if (scenarios.length === 0) {
    throw new Error('No scenarios selected');
  }

  const results = [];
  const conversationBatchSize = Number.isFinite(args.conversationBatchSize)
    ? args.conversationBatchSize
    : Number(process.env.AGENT_EVAL_CONVERSATION_BATCH_SIZE ?? (args.mode === 'live' ? 10 : 1));
  let conversation = [];
  let providerMessages = [];
  let batchIndex = 0;
  for (const [index, scenario] of scenarios.entries()) {
    if (args.mode === 'live' && index > 0 && conversationBatchSize > 0 && index % conversationBatchSize === 0) {
      conversation = [];
      providerMessages = [];
      batchIndex += 1;
    }
    const batchId = args.mode === 'live'
      ? `batch-${String(batchIndex + 1).padStart(3, '0')}`
      : undefined;
    let clarified = false;
    let result;
    if (args.mode === 'live') {
      const liveRun = await runLiveScenarioInConversation(
        scenario,
        conversation,
        providerMessages,
        batchId,
      );
      result = liveRun.result;
      conversation = liveRun.conversation;
      providerMessages = liveRun.providerMessages;
      clarified = liveRun.clarified;
    } else {
      result = runMockScenario(scenario);
    }
    results.push(result);
    const status = result.status === 'passed' ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${scenario.id}${clarified ? ' (clarified)' : ''}${batchId ? ` ${batchId}` : ''}`);
  }

  const targetCacheHitRate = Number.isFinite(args.targetCacheHitRate)
    ? args.targetCacheHitRate
    : Number(process.env.AGENT_EVAL_TARGET_CACHE_HIT_RATE);
  const summary = summarize(args.mode, results, {
    targetCacheHitRate: Number.isFinite(targetCacheHitRate) ? targetCacheHitRate : undefined,
    cacheWarmupCount: args.cacheWarmupCount,
  });
  const reportPaths = writeReports(outputDir, summary);
  console.log('');
  console.log(`Agent eval: ${summary.passed}/${summary.total} passed (${(summary.passRate * 100).toFixed(1)}%)`);
  if (summary.cacheHitTokens + summary.cacheMissTokens > 0) {
    console.log(
      `Cache hit rate: ${(summary.cacheHitRate * 100).toFixed(1)}% `
      + `(hit=${summary.cacheHitTokens}, miss=${summary.cacheMissTokens})`,
    );
    console.log(
      `Post-warmup cache hit rate: ${(summary.postWarmupCacheHitRate * 100).toFixed(1)}% `
      + `(skip=${summary.cacheWarmupCount}, hit=${summary.postWarmupCacheHitTokens}, `
      + `miss=${summary.postWarmupCacheMissTokens})`,
    );
    console.log(
      `Cache miss/request: ${summary.cacheMissTokensPerRequest.toFixed(1)} `
      + `(post-warmup ${summary.postWarmupCacheMissTokensPerRequest.toFixed(1)})`,
    );
    console.log(`Prefix hashes: ${summary.prefixHashCount}; tool hashes: ${summary.toolHashCount}`);
  }
  if (summary.targetCacheHitRate !== undefined) {
    console.log(
      `Cache target: ${(summary.targetCacheHitRate * 100).toFixed(1)}% `
      + `(${summary.cacheHitRateMet ? 'met' : 'missed'})`,
    );
  }
  console.log(`JSON: ${reportPaths.latestJsonPath}`);
  console.log(`Markdown: ${reportPaths.latestMdPath}`);

  const threshold = Number(process.env.AGENT_EVAL_PASS_RATE ?? (args.mode === 'mock' ? 1 : 0.85));
  if (summary.passRate < threshold) {
    process.exitCode = 1;
  }
  if (summary.cacheHitRateMet === false) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
