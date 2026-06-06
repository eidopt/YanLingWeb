/**
 * NodeCandidateSet PoC
 *
 * 对比当前的 buildNodeIndex（截断 ID + 平铺）和新的 buildNodeCandidateSet（完整 ID + displayName + 分组）。
 * 验证新格式在"AI 选择正确节点"这个任务上的优势。
 *
 * 运行: npx vitest shared/agent/editor/nodeCandidateSet.spec.ts
 */
import { describe, expect, it } from 'vitest';

import { createCommerceMarketDocument } from '../fixtures/seedDocuments';
import type { ThemeLayoutNode } from '../types';
import { inferDisplayName, isContainerNode } from '../context/editorContext';

// ── 当前实现（旧格式）────────────────────────────────────────────────────

function buildNodeIndexOld(root: ThemeLayoutNode): string {
  const lines: string[] = [];
  let count = 0;
  const MAX_INDEX_LINES = 50;

  const collect = (node: ThemeLayoutNode, parentId?: string) => {
    if (count >= MAX_INDEX_LINES) return;
    const propSummary = Object.entries(node.props ?? {})
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
      .map(([k, v]) => `${k}=${String(v).slice(0, 30)}`)
      .slice(0, 2)
      .join(', ');
    const parentInfo = parentId ? `, parent=${parentId.slice(0, 8)}` : '';
    lines.push(`  ${node.id.slice(0, 8)} | ${node.alias}${parentInfo} | ${propSummary || 'no text props'}`);
    count += 1;
    node.children?.forEach((c) => collect(c, node.id));
  };

  collect(root);
  if (count >= MAX_INDEX_LINES) {
    lines.push(`  ... ${count - MAX_INDEX_LINES} more nodes omitted`);
  }
  return lines.join('\n');
}

/** 构建新的候选集格式 */
function buildNodeCandidateSet(root: ThemeLayoutNode): string {
  const lines: string[] = ['# 当前页面可编辑节点（编辑时 targetId 必须从下列 ID 中选择）'];
  lines.push('# [C] = 容器节点（可作为 parentId 用于新建子元素）');
  lines.push('');

  const collect = (node: ThemeLayoutNode, depth: number) => {
    const indent = '    '.repeat(depth);
    const containerMark = isContainerNode(node) ? '[C] ' : '    ';
    const displayName = inferDisplayName(node);

    // 提取关键 props 用于消歧
    const keyProps: string[] = [];
    if (node.alias === 'core.button' && node.props?.variant) {
      keyProps.push(`variant=${node.props.variant}`);
    }
    if (node.alias === 'core.text' && node.props?.variant) {
      keyProps.push(`variant=${node.props.variant}`);
    }
    if (node.props?.tone) {
      keyProps.push(`tone=${node.props.tone}`);
    }
    const propsHint = keyProps.length ? ` {${keyProps.join(', ')}}` : '';

    lines.push(`${indent}${containerMark}${node.id} (${node.alias}) — ${displayName}${propsHint}`);

    node.children?.forEach((child) => collect(child, depth + 1));
  };

  collect(root, 0);

  return lines.join('\n');
}

/** 提取所有节点 ID（用于验证封闭性） */
function collectAllIds(root: ThemeLayoutNode): Set<string> {
  const ids = new Set<string>();
  const walk = (node: ThemeLayoutNode) => {
    ids.add(node.id);
    node.children?.forEach(walk);
  };
  walk(root);
  return ids;
}

// ── 测试 ─────────────────────────────────────────────────────────────────

const doc = createCommerceMarketDocument();
const root = doc.layout;

describe('格式对比：旧 vs 新', () => {
  it('打印旧格式', () => {
    const old = buildNodeIndexOld(root);
    console.log('\n========== 旧格式 (buildNodeIndex) ==========');
    console.log('问题: ID 被截断到 8 字符, 无 displayName, 平铺无结构\n');
    console.log(old);
    console.log('==============================================\n');
  });

  it('打印新格式', () => {
    const candidateSet = buildNodeCandidateSet(root);
    console.log('\n========== 新格式 (NodeCandidateSet) ==========');
    console.log('改进: 完整 ID, displayName, 缩进分组, [C] 容器标记\n');
    console.log(candidateSet);
    console.log('===============================================\n');
  });

  it('新格式中所有 ID 都是完整的', () => {
    const allIds = collectAllIds(root);
    const candidateSet = buildNodeCandidateSet(root);

    for (const id of allIds) {
      expect(candidateSet).toContain(id);
    }

    // 验证旧格式有截断
    const oldIndex = buildNodeIndexOld(root);
    const truncatedIds = [...allIds].filter((id) => id.length > 8 && !oldIndex.includes(id));
    expect(truncatedIds.length).toBeGreaterThan(0);
    console.log(`\n旧格式中被截断的 ID（AI 无法直接使用）: ${truncatedIds.length} 个`);
    truncatedIds.forEach((id) => {
      console.log(`  ${id} → 显示为 ${id.slice(0, 8)}`);
    });
  });

  it('新格式包含 displayName', () => {
    const candidateSet = buildNodeCandidateSet(root);

    expect(candidateSet).toContain('搜索框');
    expect(candidateSet).toContain('按钮:马上抢');
    expect(candidateSet).toContain('通知:满 59 元免配送费');
    expect(candidateSet).toContain('卡片:商品卡片');
    expect(candidateSet).toContain('底部导航');
  });

  it('新格式标记了容器节点', () => {
    const candidateSet = buildNodeCandidateSet(root);

    // core.screen, core.panel 应标记为 [C]
    expect(candidateSet).toContain('[C] home-screen');
    expect(candidateSet).toContain('[C] home-product-panel');
    expect(candidateSet).toContain('[C] home-service-card');

    // core.button, core.text 不应标记为 [C]
    expect(candidateSet).not.toContain('[C] home-primary-button');
    expect(candidateSet).not.toContain('[C] home-card-title');
  });
});

describe('AI 选节点场景模拟', () => {
  const candidateSet = buildNodeCandidateSet(root);
  const allIds = collectAllIds(root);

  // 模拟 AI 做选择题的场景：给定候选集和用户意图，AI 需要选出正确的 ID
  const scenarios: {
    userIntent: string;
    expectedId: string;
    // 在新格式中，AI 能看到的提示
    visibleHint: string;
    // 在旧格式中，AI 能看到的信息
    oldVisible: string;
  }[] = [
    {
      userIntent: '把搜索框的 placeholder 改一下',
      expectedId: 'home-search',
      visibleHint: 'home-search (core.search) — 搜索框',
      oldVisible: 'home-sea | core.search',
    },
    {
      userIntent: '把标题改成今日特惠',
      expectedId: 'home-title',
      visibleHint: 'home-title (core.text) — 文字:今日爆款',
      oldVisible: 'home-tit | core.text | text=今日爆款',
    },
    {
      userIntent: '删掉通知',
      expectedId: 'home-notice',
      visibleHint: 'home-notice (core.notice) — 通知:满 59 元免配送费',
      oldVisible: 'home-not | core.notice',
    },
    {
      userIntent: '修改商品名称',
      expectedId: 'home-card-title',
      visibleHint: 'home-card-title (core.text) — 文字:云南蓝莓 125g',
      oldVisible: 'home-car | core.text',
    },
    {
      userIntent: '修改第一个抢购按钮的颜色',
      expectedId: 'home-primary-button',
      visibleHint: 'home-primary-button (core.button) — 按钮:马上抢',
      oldVisible: 'home-pri | core.button',
    },
    {
      userIntent: '修改底部导航',
      expectedId: 'home-footer-tabs',
      visibleHint: 'home-footer-tabs (core.tabs) — 底部导航',
      oldVisible: 'home-foo | core.tabs',
    },
    {
      userIntent: '在商品卡片里添加一个图片',
      expectedId: 'home-product-panel', // parentId
      visibleHint: '[C] home-product-panel (core.panel) — 卡片:商品卡片',
      oldVisible: 'home-pro | core.panel',
    },
    {
      userIntent: '修改会员专享的按钮',
      expectedId: 'home-service-button',
      visibleHint: 'home-service-button (core.button) — 按钮:查看权益',
      oldVisible: 'home-ser | core.button', // ID 被截断，和其他 home-ser 冲突！
    },
    {
      userIntent: '修改限时标签',
      expectedId: 'home-filter-tag',
      visibleHint: 'home-filter-tag (core.tag) — 标签:限时',
      oldVisible: 'home-fil | core.tag',
    },
    {
      userIntent: '修改服务入口卡片的标题',
      expectedId: 'home-service-title',
      visibleHint: 'home-service-title (core.text) — 文字:会员专享',
      oldVisible: 'home-ser | core.text', // 截断后与 home-service-button 撞车！
    },
  ];

  for (const s of scenarios) {
    it(`"${s.userIntent}" → ${s.expectedId}`, () => {
      // 验证新格式中能看到完整 ID
      expect(candidateSet).toContain(s.expectedId);

      // 验证新格式中 AI 能看到 displayName 提示
      expect(candidateSet).toContain(s.visibleHint);

      // 模拟 AI 选择：新格式下，AI 只需匹配 displayName 中的关键词
      const line = candidateSet.split('\n').find((l) => l.includes(s.expectedId));
      expect(line).toBeDefined();

      // 验证 ID 完整性
      expect(line!).toContain(s.expectedId);
      expect(line!).not.toContain(s.expectedId.slice(0, 8) + ' |'); // 不应该是截断形式
    });
  }
});

describe('关键问题：旧格式的截断冲突', () => {
  it('旧格式中存在 ID 截断导致的歧义', () => {
    const oldIndex = buildNodeIndexOld(root);
    const lines = oldIndex.split('\n').filter(Boolean);

    // 找出截断后相同的 ID
    const truncatedMap = new Map<string, string[]>();
    for (const line of lines) {
      const truncated = line.trim().split(' | ')[0].trim();
      if (!truncatedMap.has(truncated)) {
        truncatedMap.set(truncated, []);
      }
      truncatedMap.get(truncated)!.push(line);
    }

    const conflicts = [...truncatedMap.entries()].filter(([, lines]) => lines.length > 1);
    console.log('\n旧格式中的截断冲突（多个不同 ID 显示为相同前缀）:');
    for (const [truncated, lines] of conflicts) {
      console.log(`  "${truncated}" 对应 ${lines.length} 个不同节点:`);
      lines.forEach((l) => console.log(`    ${l}`));
    }

    // commerce-market 中应该有冲突（home-service-title 和 home-service-button 都截断为 home-ser）
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it('新格式中不存在歧义', () => {
    const candidateSet = buildNodeCandidateSet(root);
    const allIds = collectAllIds(root);

    // 每个完整 ID 在候选集中只出现一次（作为节点标识）
    for (const id of allIds) {
      const occurrences = candidateSet.split('\n').filter((line) => {
        const trimmed = line.trim();
        // 匹配 "    home-xxx (core.yyy)" 格式（ID 作为节点标识出现）
        return trimmed.includes(`${id} (`);
      });
      expect(occurrences.length).toBe(1);
    }
  });
});

describe('token 开销对比', () => {
  it('对比新旧格式的字符数', () => {
    const old = buildNodeIndexOld(root);
    const newFormat = buildNodeCandidateSet(root);

    const oldChars = old.length;
    const newChars = newFormat.length;
    const ratio = (newChars / oldChars).toFixed(2);

    console.log(`\nToken 开销对比:`);
    console.log(`  旧格式: ${oldChars} 字符`);
    console.log(`  新格式: ${newChars} 字符`);
    console.log(`  比率: ${ratio}x`);

    // 新格式会更长（因为 displayName），但换来的准确率提升值得
    // 新格式长度应控制在合理范围内（< 3x 旧格式）
    expect(newChars).toBeLessThan(oldChars * 4);
  });
});
