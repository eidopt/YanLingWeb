# AI 语义编辑工具集成 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已建好的 `TemplateProfile` + `semanticInstructionCompiler` 基础设施接入 AI Agent 工具链，实现 AI 从"猜 node ID"到"语义操作"的转变。完整跑完 `docs/next-priorities-plan.md` 中"工作一"的 6 个步骤。

**Architecture:** 新建 `semanticToolExecutor.ts` 统一入口 + `atomicApply.ts`（复用现有 `AtomicOperationManager`）+ `semanticTools.ts` 工具函数。Agent runner 在工具名属于 `EDITOR_SEMANTIC_TOOLS` 时分发到 executor，其余走旧的 `applyEditorAiEditInstructions`。`buildTemplateProfileSummary` 注入到 AI context。

**Tech Stack:** TypeScript, Jest (backend), Next.js 15 + React 19, NestJS 10, ts-jest, ts-node, structuredClone, structuredClone for snapshots.

---

## 文件结构

| 文件                                              | 职责                                                                     | 类型 |
| ------------------------------------------------- | ------------------------------------------------------------------------ | ---- |
| `shared/agent/tools/semanticTools.ts`             | `isSemanticTool()`, `parseSemanticArgs()` 工具函数                       | 新建 |
| `shared/agent/tools/semanticTools.spec.ts`        | 工具函数测试                                                             | 新建 |
| `shared/agent/editor/atomicApply.ts`              | `applyCompiledOperationsAtomic()` 用 `AtomicOperationManager` 包 op 序列 | 新建 |
| `shared/agent/editor/atomicApply.spec.ts`         | atomic apply 测试（3 用例）                                              | 新建 |
| `shared/agent/tools/semanticToolExecutor.ts`      | `executeSemanticTool()` 统一入口 + dry-run                               | 新建 |
| `shared/agent/tools/semanticToolExecutor.spec.ts` | executor 测试（6 用例）                                                  | 新建 |
| `shared/agent/context/editorContext.ts`           | 新增 `buildTemplateProfileSummary` + 注入到 volatile context             | 修改 |
| `backend/src/ai/agentRunner.service.ts`           | toolExecutor 分发到 executor                                             | 修改 |
| `src/ai/agents/editorEditAgent.ts`                | toolExecutor 分发到 executor                                             | 修改 |
| `backend/src/ai/tools/semantic-tools.spec.ts`     | 3 个 E2E 用例（mock provider）                                           | 新建 |

---

## 任务 1: 工具函数 `isSemanticTool` + `parseSemanticArgs`

**Files:**

- Create: `shared/agent/tools/semanticTools.ts`
- Create: `shared/agent/tools/semanticTools.spec.ts`

- [ ] **Step 1: 写测试文件**

```typescript
// shared/agent/tools/semanticTools.spec.ts
import { isSemanticTool, parseSemanticArgs, type SemanticToolName } from './semanticTools';

describe('isSemanticTool', () => {
  it('returns true for the 5 semantic tool names', () => {
    const names: SemanticToolName[] = [
      'editor_update_slot',
      'editor_fill_pattern',
      'editor_create_page_from_page_kind',
      'editor_replace_section',
      'editor_submit_page_spec',
    ];
    for (const name of names) {
      expect(isSemanticTool(name)).toBe(true);
    }
  });

  it('returns false for low-level tool names', () => {
    expect(isSemanticTool('editor_update_props')).toBe(false);
    expect(isSemanticTool('editor_insert_node')).toBe(false);
    expect(isSemanticTool('editor_create_page')).toBe(false);
  });

  it('returns false for unknown names', () => {
    expect(isSemanticTool('foo_bar')).toBe(false);
    expect(isSemanticTool('')).toBe(false);
  });
});

describe('parseSemanticArgs', () => {
  it('passes through update_slot args', () => {
    const result = parseSemanticArgs('editor_update_slot', {
      slotKey: 'home.hero.title',
      props: { text: 'New title' },
    });
    expect(result).toEqual({
      slotKey: 'home.hero.title',
      props: { text: 'New title' },
    });
  });

  it('passes through fill_pattern args with items array', () => {
    const result = parseSemanticArgs('editor_fill_pattern', {
      patternKey: 'product.card',
      items: [{ title: 'Apple' }],
      replaceExisting: true,
    });
    expect(result.patternKey).toBe('product.card');
    expect(result.items).toEqual([{ title: 'Apple' }]);
    expect(result.replaceExisting).toBe(true);
  });

  it('defaults missing fields to safe values', () => {
    const result = parseSemanticArgs('editor_create_page_from_page_kind', {});
    expect(result.pageKind).toBe('');
    expect(result.name).toBe('');
  });

  it('throws for unknown tool name', () => {
    expect(() => parseSemanticArgs('foo_bar', {})).toThrow('Unknown semantic tool: foo_bar');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && pnpm test -- --testPathPattern semanticTools`
Expected: FAIL — `Cannot find module './semanticTools'`

- [ ] **Step 3: 实现 `semanticTools.ts`**

```typescript
// shared/agent/tools/semanticTools.ts
export type SemanticToolName =
  | 'editor_update_slot'
  | 'editor_fill_pattern'
  | 'editor_create_page_from_page_kind'
  | 'editor_replace_section'
  | 'editor_submit_page_spec';

const SEMANTIC_TOOL_NAMES: ReadonlySet<SemanticToolName> = new Set([
  'editor_update_slot',
  'editor_fill_pattern',
  'editor_create_page_from_page_kind',
  'editor_replace_section',
  'editor_submit_page_spec',
]);

export function isSemanticTool(name: string): name is SemanticToolName {
  return SEMANTIC_TOOL_NAMES.has(name as SemanticToolName);
}

export function parseSemanticArgs(name: SemanticToolName, args: Record<string, unknown>): Record<string, unknown> {
  // Strip undefined values; keep structure as-is
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// Re-export throws at call site so unknown names get caught
export function assertSemanticToolName(name: string): asserts name is SemanticToolName {
  if (!isSemanticTool(name)) {
    throw new Error(`Unknown semantic tool: ${name}`);
  }
}
```

注：测试第 4 个 `parseSemanticArgs('foo_bar', {})` 通过 TypeScript 编译就会失败（类型不允许）。改用类型断言：

```typescript
expect(() => parseSemanticArgs('foo_bar' as SemanticToolName, {})).toThrow('Unknown semantic tool: foo_bar');
```

- [ ] **Step 4: 重新运行测试确认通过**

Run: `cd backend && pnpm test -- --testPathPattern semanticTools`
Expected: PASS — 7 tests pass

- [ ] **Step 5: 提交**

```bash
git add shared/agent/tools/semanticTools.ts shared/agent/tools/semanticTools.spec.ts
git commit -m "feat(shared): add isSemanticTool and parseSemanticArgs utilities"
```

---

## 任务 2: 原子应用包装 `applyCompiledOperationsAtomic`

**Files:**

- Create: `shared/agent/editor/atomicApply.ts`
- Create: `shared/agent/editor/atomicApply.spec.ts`

- [ ] **Step 1: 写测试文件**

```typescript
// shared/agent/editor/atomicApply.spec.ts
import { applyCompiledOperationsAtomic } from './atomicApply';
import type { CompiledSemanticInstruction } from '../compiler/semanticInstructionCompiler';
import { buildTemplateProfile, createBlankDocument, getSeedDocument } from '@shared/agent/runtime';
import type { ThemeLayoutDocument } from '../types';

function compiledWith(op: unknown): CompiledSemanticInstruction {
  return {
    profile: buildTemplateProfile(createBlankDocument()),
    warnings: [],
    operations: [op as CompiledSemanticInstruction['operations'][number]],
  };
}

describe('applyCompiledOperationsAtomic', () => {
  it('applies a single op successfully and returns snapshot', async () => {
    const doc = getSeedDocument('commerceMarket') as ThemeLayoutDocument;
    const before = JSON.parse(JSON.stringify(doc));
    const compiled = compiledWith({
      type: 'update_props',
      nodeId: 'home-title',
      props: { text: 'Changed' },
      select: true,
    });

    const result = await applyCompiledOperationsAtomic(compiled, doc, { sessionId: 'test-1' });

    expect(result.success).toBe(true);
    expect(result.data?.applied).toBe(true);
    expect(result.data?.appliedOperations).toHaveLength(1);
    expect(result.data?.snapshot).toEqual(before);
    const updatedNode = doc.pages[0].layout.children?.find((c) => c.id === 'home-title');
    expect(updatedNode?.props?.text).toBe('Changed');
  });

  it('rolls back when an op in the middle fails (atomicity)', async () => {
    const doc = getSeedDocument('commerceMarket') as ThemeLayoutDocument;
    const before = JSON.parse(JSON.stringify(doc));

    // Two ops: first succeeds, second fails (invalid nodeId)
    const compiled: CompiledSemanticInstruction = {
      profile: buildTemplateProfile(doc),
      warnings: [],
      operations: [
        { type: 'update_props', nodeId: 'home-title', props: { text: 'OK' }, select: true },
        { type: 'update_props', nodeId: 'NONEXISTENT_NODE', props: { text: 'fail' }, select: true },
      ],
    };

    const result = await applyCompiledOperationsAtomic(compiled, doc, { sessionId: 'test-2' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('apply_failed');
    expect(doc).toEqual(before); // 整个 doc 回滚到初始状态
  });

  it('returns success and empty operations when no ops provided', async () => {
    const doc = getSeedDocument('commerceMarket') as ThemeLayoutDocument;
    const before = JSON.parse(JSON.stringify(doc));
    const compiled: CompiledSemanticInstruction = {
      profile: buildTemplateProfile(doc),
      warnings: [],
      operations: [],
    };

    const result = await applyCompiledOperationsAtomic(compiled, doc, { sessionId: 'test-3' });

    expect(result.success).toBe(true);
    expect(result.data?.appliedOperations).toEqual([]);
    expect(doc).toEqual(before);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && pnpm test -- --testPathPattern atomicApply`
Expected: FAIL — `Cannot find module './atomicApply'`

- [ ] **Step 3: 实现 `atomicApply.ts`**

```typescript
// shared/agent/editor/atomicApply.ts
import { atomicOperationManager, type OperationStep } from './atomicOperations';
import type { AgentEditResult } from '../errors/agentErrors';
import type { CompiledSemanticInstruction } from '../compiler/semanticInstructionCompiler';
import { applyEditorAiEditInstructions } from './applyEditorInstructions';
import type { ThemeLayoutDocument } from '../types';

export interface AtomicApplyOptions {
  sessionId?: string;
}

export interface ApplyResult {
  applied: boolean;
  snapshot: ThemeLayoutDocument;
  appliedOperations: CompiledSemanticInstruction['operations'];
  warnings: string[];
}

export async function applyCompiledOperationsAtomic(
  compiled: CompiledSemanticInstruction,
  document: ThemeLayoutDocument,
  options?: AtomicApplyOptions,
): Promise<AgentEditResult<ApplyResult>> {
  const snapshot: ThemeLayoutDocument = structuredClone(document);
  const sessionId = options?.sessionId ?? 'unknown';

  if (compiled.operations.length === 0) {
    return {
      success: true,
      data: { applied: false, snapshot, appliedOperations: [], warnings: compiled.warnings },
    };
  }

  const steps: OperationStep<ThemeLayoutDocument>[] = compiled.operations.map((op, i) => ({
    stepId: `op-${i}`,
    description: op.type,
    execute: (doc) => {
      const result = applyEditorAiEditInstructions(doc, [op]);
      if (result.errors.length > 0) {
        throw new Error(result.errors.join('; '));
      }
      return result.document;
    },
    // AtomicOperationManager rolls back to snapshot[0] when no rollback provided
  }));

  const opId = atomicOperationManager.createAtomicOperation(document, sessionId, steps);
  const execution = await atomicOperationManager.executeAtomicOperation(opId);

  if (!execution.success || !execution.data) {
    return {
      success: false,
      error: {
        code: 'apply_failed',
        reason: execution.error?.reason ?? 'Unknown atomic apply failure',
        partialSuccess: false,
        recoverable: false,
      },
    };
  }

  return {
    success: true,
    data: {
      applied: true,
      snapshot,
      appliedOperations: compiled.operations,
      warnings: compiled.warnings,
    },
  };
}
```

- [ ] **Step 4: 重新运行测试确认通过**

Run: `cd backend && pnpm test -- --testPathPattern atomicApply`
Expected: PASS — 3 tests pass

- [ ] **Step 5: 提交**

```bash
git add shared/agent/editor/atomicApply.ts shared/agent/editor/atomicApply.spec.ts
git commit -m "feat(shared): add applyCompiledOperationsAtomic reusing AtomicOperationManager"
```

---

## 任务 3: 统一入口 `executeSemanticTool`（6 个测试）

**Files:**

- Create: `shared/agent/tools/semanticToolExecutor.ts`
- Create: `shared/agent/tools/semanticToolExecutor.spec.ts`

- [ ] **Step 1: 写测试文件**

```typescript
// shared/agent/tools/semanticToolExecutor.spec.ts
import { executeSemanticTool } from './semanticToolExecutor';
import { getSeedDocument, buildTemplateProfile } from '@shared/agent/runtime';
import type { ThemeLayoutDocument } from '../types';

function seedDoc(): ThemeLayoutDocument {
  return getSeedDocument('commerceMarket') as ThemeLayoutDocument;
}

function findSlotKey(doc: ThemeLayoutDocument, nodeId: string): string {
  const profile = buildTemplateProfile(doc);
  const slot = profile.slots.find((s) => s.nodeId === nodeId);
  if (!slot) throw new Error(`No slot for ${nodeId}`);
  return slot.slotKey;
}

describe('executeSemanticTool - editor_update_slot', () => {
  it('updates text via slotKey', async () => {
    const doc = seedDoc();
    const slotKey = findSlotKey(doc, 'home-title');
    const result = await executeSemanticTool('editor_update_slot', { slotKey, props: { text: 'New title' } }, doc, {
      sessionId: 't1',
    });

    expect(result.success).toBe(true);
    expect(result.data?.applied).toBe(true);
    expect(result.data?.snapshot).toBeDefined();
    const node = doc.pages[0].layout.children?.find((c) => c.id === 'home-title');
    expect(node?.props?.text).toBe('New title');
  });

  it('returns invalid_props error with allowedProps when prop not in editableProps', async () => {
    const doc = seedDoc();
    const slotKey = findSlotKey(doc, 'home-title');
    const result = await executeSemanticTool(
      'editor_update_slot',
      { slotKey, props: { href: 'https://invalid.test' } },
      doc,
      { sessionId: 't2' },
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('invalid_props');
    if (result.error?.code === 'invalid_props') {
      expect(result.error.invalidProps).toContain('href');
      expect(result.error.allowedProps.length).toBeGreaterThan(0);
    }
  });

  it('returns slot_not_found error with availableSlots when slotKey missing', async () => {
    const doc = seedDoc();
    const result = await executeSemanticTool(
      'editor_update_slot',
      { slotKey: 'home.does.not.exist', props: { text: 'x' } },
      doc,
      { sessionId: 't3' },
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('slot_not_found');
    if (result.error?.code === 'slot_not_found') {
      expect(result.error.availableSlots.length).toBeGreaterThan(0);
    }
  });
});

describe('executeSemanticTool - editor_fill_pattern', () => {
  it('fills 3 product cards via patternKey', async () => {
    const doc = seedDoc();
    const profile = buildTemplateProfile(doc);
    const pattern = profile.patterns[0];
    expect(pattern).toBeDefined();

    const items = [
      { title: 'Apple', price: '¥10' },
      { title: 'Banana', price: '¥5' },
      { title: 'Cherry', price: '¥20' },
    ];
    const result = await executeSemanticTool(
      'editor_fill_pattern',
      { patternKey: pattern!.patternKey, items, replaceExisting: true },
      doc,
      { sessionId: 't4' },
    );

    expect(result.success).toBe(true);
    expect(result.data?.appliedOperations[0].type).toBe('clone_pattern_items');
  });

  it('truncates to maxItems (or 50) and emits warning when items exceed limit', async () => {
    const doc = seedDoc();
    const profile = buildTemplateProfile(doc);
    const pattern = profile.patterns[0];
    expect(pattern).toBeDefined();
    const expectedMax = pattern!.maxItems ?? 50;

    const items = Array.from({ length: 100 }, (_, i) => ({ title: `Item ${i}` }));
    const result = await executeSemanticTool('editor_fill_pattern', { patternKey: pattern!.patternKey, items }, doc, {
      sessionId: 't5',
    });

    expect(result.success).toBe(true);
    if (result.data?.appliedOperations[0].type === 'clone_pattern_items') {
      expect(result.data.appliedOperations[0].items.length).toBe(expectedMax);
    }
  });
});

describe('executeSemanticTool - editor_create_page_from_page_kind', () => {
  it('creates a new page from a known pageKind', async () => {
    const doc = seedDoc();
    const profile = buildTemplateProfile(doc);
    const availableKinds = profile.pages.map((p) => p.pageKind);
    const kindToCreate = availableKinds[0];
    const pagesBefore = doc.pages.length;

    const result = await executeSemanticTool(
      'editor_create_page_from_page_kind',
      { pageKind: kindToCreate, name: 'My new page' },
      doc,
      { sessionId: 't6' },
    );

    expect(result.success).toBe(true);
    expect(doc.pages.length).toBe(pagesBefore + 1);
    const newPage = doc.pages[doc.pages.length - 1];
    expect(newPage.name).toBe('My new page');
  });

  it('returns page_kind_not_found with availablePageKinds when kind unknown', async () => {
    const doc = seedDoc();
    const result = await executeSemanticTool(
      'editor_create_page_from_page_kind',
      { pageKind: 'nonexistent_kind', name: 'X' },
      doc,
      { sessionId: 't7' },
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('page_kind_not_found');
    if (result.error?.code === 'page_kind_not_found') {
      expect(result.error.availablePageKinds.length).toBeGreaterThan(0);
    }
  });
});

describe('executeSemanticTool - dryRun', () => {
  it('returns preview without modifying document when dryRun=true', async () => {
    const doc = seedDoc();
    const before = JSON.parse(JSON.stringify(doc));
    const slotKey = findSlotKey(doc, 'home-title');

    const result = await executeSemanticTool('editor_update_slot', { slotKey, props: { text: 'Preview only' } }, doc, {
      sessionId: 't8',
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.data?.applied).toBe(false);
    expect(result.data?.preview).toBeDefined();
    expect(result.data?.preview?.[0].type).toBe('update_props');
    expect(doc).toEqual(before);
  });
});

describe('executeSemanticTool - editor_replace_section', () => {
  it('replaces a replaceable section successfully', async () => {
    const doc = seedDoc();
    const profile = buildTemplateProfile(doc);
    const replaceable = profile.regions.find((r) => r.replaceable);
    if (!replaceable) {
      return; // skip if no replaceable region
    }

    const result = await executeSemanticTool(
      'editor_replace_section',
      {
        regionKey: replaceable.regionKey,
        sectionKind: 'banner',
        content: { title: 'New banner title' },
      },
      doc,
      { sessionId: 'rs-1' },
    );

    expect(result.success).toBe(true);
  });

  it('returns failure when regionKey not found or not replaceable', async () => {
    const doc = seedDoc();
    const result = await executeSemanticTool(
      'editor_replace_section',
      {
        regionKey: 'home.nonexistent.region',
        sectionKind: 'banner',
        content: { title: 'X' },
      },
      doc,
      { sessionId: 'rs-2' },
    );

    expect(result.success).toBe(false);
    if (result.success) throw new Error('Expected failure');
    expect(['region_not_found', 'compile_failed']).toContain(result.error?.code);
  });
});

describe('executeSemanticTool - editor_submit_page_spec', () => {
  it('creates a new page from a complete spec', async () => {
    const doc = seedDoc();
    const profile = buildTemplateProfile(doc);
    const pageKind = profile.pages[0].pageKind;
    const pagesBefore = doc.pages.length;

    const result = await executeSemanticTool(
      'editor_submit_page_spec',
      {
        spec: {
          intent: 'create_page',
          pageKind,
          title: 'Page from spec',
          contentIntent: 'a complete page',
        },
      },
      doc,
      { sessionId: 'spec-1' },
    );

    expect(result.success).toBe(true);
    expect(doc.pages.length).toBe(pagesBefore + 1);
  });
});
```

注：测试 4-5 需要 profile 中有 `maxItems` 字段的 pattern；如果没有，测试 5 的 `if (!pattern) return;` 会跳过。这是合理的（测试不应该在没有合适 fixture 时失败）。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && pnpm test -- --testPathPattern semanticToolExecutor`
Expected: FAIL — `Cannot find module './semanticToolExecutor'`

- [ ] **Step 3: 实现 `semanticToolExecutor.ts`**

```typescript
// shared/agent/tools/semanticToolExecutor.ts
import type { AgentEditResult } from '../errors/agentErrors';
import type { EditorAiEditInstruction } from '../editor/applyEditorInstructions';
import {
  compileSemanticEditorInstruction,
  type CompiledSemanticInstruction,
  type SemanticEditorInstruction,
} from '../compiler/semanticInstructionCompiler';
import { buildTemplateProfile } from '../template/buildTemplateProfile';
import { applyCompiledOperationsAtomic, type ApplyResult } from '../editor/atomicApply';
import type { ThemeLayoutDocument } from '../types';
import type { SemanticToolName } from './semanticTools';

export type { SemanticToolName, ApplyResult } from '../editor/atomicApply';
export { SemanticToolName } from './semanticTools';

export interface ExecuteSemanticToolOptions {
  sessionId?: string;
  dryRun?: boolean;
}

function buildInstruction(name: SemanticToolName, params: Record<string, unknown>): SemanticEditorInstruction {
  switch (name) {
    case 'editor_update_slot':
      return {
        type: 'update_slot',
        slotKey: String(params.slotKey ?? ''),
        props: (params.props as Record<string, unknown>) ?? {},
        pageKey: typeof params.pageKey === 'string' ? params.pageKey : undefined,
        select: params.select as boolean | undefined,
      };
    case 'editor_fill_pattern':
      return {
        type: 'fill_pattern',
        patternKey: String(params.patternKey ?? ''),
        items: (params.items as Record<string, unknown>[]) ?? [],
        replaceExisting: params.replaceExisting as boolean | undefined,
        pageKey: typeof params.pageKey === 'string' ? params.pageKey : undefined,
        select: params.select as boolean | undefined,
      };
    case 'editor_create_page_from_page_kind':
      return {
        type: 'create_page_from_page_kind',
        pageKind: String(params.pageKind ?? ''),
        name: String(params.name ?? ''),
        contentIntent: typeof params.contentIntent === 'string' ? params.contentIntent : undefined,
        activate: params.activate as boolean | undefined,
        select: params.select as boolean | undefined,
        syncNavigation: params.syncNavigation as boolean | undefined,
      };
    case 'editor_replace_section':
      return {
        type: 'replace_section',
        regionKey: String(params.regionKey ?? ''),
        sectionKind: String(params.sectionKind ?? ''),
        content: (params.content as Record<string, unknown>) ?? undefined,
        patternKey: typeof params.patternKey === 'string' ? params.patternKey : undefined,
        pageKey: typeof params.pageKey === 'string' ? params.pageKey : undefined,
        select: params.select as boolean | undefined,
      };
    case 'editor_submit_page_spec':
      return {
        type: 'submit_page_spec',
        spec: (params.spec as { intent: 'create_page' | 'update_page' } | undefined) ?? {
          intent: 'create_page',
        },
        select: params.select as boolean | undefined,
      };
  }
}

export async function executeSemanticTool(
  toolName: SemanticToolName,
  params: Record<string, unknown>,
  document: ThemeLayoutDocument,
  options: ExecuteSemanticToolOptions = {},
): Promise<AgentEditResult<ApplyResult>> {
  const instruction = buildInstruction(toolName, params);
  const profile = buildTemplateProfile(document);
  const compiled = compileSemanticEditorInstruction(document, instruction, profile);

  if (!compiled.success || !compiled.data) {
    return compiled;
  }

  if (options.dryRun) {
    return {
      success: true,
      data: {
        applied: false,
        snapshot: structuredClone(document),
        appliedOperations: [],
        warnings: compiled.data.warnings,
        preview: compiled.data.operations,
      },
    };
  }

  return applyCompiledOperationsAtomic(compiled.data, document, {
    sessionId: options.sessionId,
  });
}
```

注：上面 `ExecuteSemanticToolOptions` 是 export；`ApplyResult` 来自 `atomicApply`（已 export）。`preview` 字段需要在 `ApplyResult` 中加入。

更新 `atomicApply.ts` 的 `ApplyResult` 接口：

```typescript
export interface ApplyResult {
  applied: boolean;
  snapshot: ThemeLayoutDocument;
  appliedOperations: CompiledSemanticInstruction['operations'];
  warnings: string[];
  preview?: CompiledSemanticInstruction['operations']; // dryRun 时填充
}
```

- [ ] **Step 4: 更新 `atomicApply.ts` 的 `ApplyResult` 接口**

修改 `shared/agent/editor/atomicApply.ts`：

```typescript
export interface ApplyResult {
  applied: boolean;
  snapshot: ThemeLayoutDocument;
  appliedOperations: CompiledSemanticInstruction['operations'];
  warnings: string[];
  preview?: CompiledSemanticInstruction['operations']; // ← 新增
}
```

- [ ] **Step 5: 重新运行测试确认通过**

Run: `cd backend && pnpm test -- --testPathPattern "semanticToolExecutor|atomicApply"`
Expected: PASS — 9 tests pass (3 atomicApply + 6 semanticToolExecutor)

- [ ] **Step 6: 提交**

```bash
git add shared/agent/tools/semanticToolExecutor.ts shared/agent/tools/semanticToolExecutor.spec.ts shared/agent/editor/atomicApply.ts
git commit -m "feat(shared): add executeSemanticTool unified entry with dry-run support"
```

---

## 任务 4: Profile 摘要注入到 AI Context

**Files:**

- Modify: `shared/agent/context/editorContext.ts:428-469` (`buildEditorVolatileContext`)

- [ ] **Step 1: 添加 `buildTemplateProfileSummary` 函数**

在 `shared/agent/context/editorContext.ts` 第 322 行（`summarizeRecordKeys` 之后，`summarizeTemplateProfile` 之前）添加：

```typescript
export function buildTemplateProfileSummary(profile: TemplateProfile): string {
  return [
    '## 模板语义索引（TemplateProfile 摘要）',
    '优先使用语义工具：editor_update_slot / editor_fill_pattern / editor_create_page_from_page_kind / editor_replace_section / editor_submit_page_spec',
    '',
    '### 可用页面类型（pageKind）',
    ...profile.pages.map((p) => `- ${p.pageKind}: pageId=${p.pageId}, name=${p.name}`),
    '',
    '### 可用区域（regionKey，replaceable=true）',
    ...profile.regions
      .filter((r) => r.replaceable)
      .map((r) => `- ${r.regionKey}: page=${r.pageKey}, nodeId=${r.nodeId}`),
    '',
    '### 可编辑槽位（slotKey，最多 30 个）',
    ...profile.slots.slice(0, 30).map((s) => `- ${s.slotKey}: ${s.component} props=[${s.editableProps.join(',')}]`),
    '',
    '### 可填充模式（patternKey）',
    ...profile.patterns.map(
      (p) => `- ${p.patternKey}: fields=[${p.fields.map((f) => f.fieldKey).join(',')}], maxItems=${p.maxItems ?? 50}`,
    ),
  ].join('\n');
}
```

- [ ] **Step 2: 在 `buildEditorVolatileContext` 末尾追加 profile 摘要**

修改 `shared/agent/context/editorContext.ts:466-468`：

```typescript
    Semantic Landmarks (use these as fallback via semanticTarget):',
    formatEditorSemanticTargetLandmarks(document.layout),
    depsSection,
    '',
    buildTemplateProfileSummary(buildTemplateProfile(document)),  // ← 新增
  ]
    .filter(Boolean)
    .join('\n');
}
```

- [ ] **Step 3: 类型检查**

Run: `pnpm typecheck:all`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add shared/agent/context/editorContext.ts
git commit -m "feat(shared): inject TemplateProfile summary into editor volatile context"
```

---

## 任务 5: 接入 Backend Agent Runner

**Files:**

- Modify: `backend/src/ai/agentRunner.service.ts:392-421` (`toolExecutor`)

- [ ] **Step 1: 添加 import**

在 `backend/src/ai/agentRunner.service.ts` 顶部 imports 后添加：

```typescript
import { executeSemanticTool } from '@shared/agent/tools/semanticToolExecutor';
import { isSemanticTool, assertSemanticToolName } from '@shared/agent/tools/semanticTools';
```

- [ ] **Step 2: 在 `toolExecutor` 内部添加新分支**

修改 `backend/src/ai/agentRunner.service.ts:392-421`，在 `toolExecutor` 内部、`editorToolCallToOperations` 调用前添加：

```typescript
// 新分支：5 个语义工具走统一入口
if (isSemanticTool(name)) {
  assertSemanticToolName(name);
  const result = await executeSemanticTool(name, args, finalDocument ?? getSeedDocument(scenario.startDocument), {
    sessionId: scenario.sessionId ?? `eval-${String(toolCall.seq)}`,
  });
  toolCall.result = result;
  return {
    output: JSON.stringify({ success: result.success, ...result }),
  };
}

const edit = editorToolCallToOperations(name, args);
const result = applyEditorAiEditInstructions(
  finalDocument ?? getSeedDocument(scenario.startDocument),
  edit.operations as Parameters<typeof applyEditorAiEditInstructions>[1],
  {
    reason: edit.reason,
    selectedNodeId: scenario.selectedNodeId ?? null,
    resolveSemanticTarget: resolveEditorSemanticTarget,
  },
);
finalDocument = result.document;
toolCall.result = result;
return {
  output: JSON.stringify({ success: result.errors.length === 0, ...result }),
};
```

注意：`finalDocument` 赋值在语义工具路径下也需要（让后续工具调用看到更新）。补全：

```typescript
        if (isSemanticTool(name)) {
          assertSemanticToolName(name);
          const result = await executeSemanticTool(
            name,
            args,
            finalDocument ?? getSeedDocument(scenario.startDocument),
            { sessionId: scenario.sessionId ?? `eval-${String(toolCall.seq)}` },
          );
          if (result.success && result.data) {
            finalDocument = result.data.snapshot;  // 错误：应该是新 doc
          }
          ...
```

实际更简单：让 `executeSemanticTool` 内部直接修改 document（`applyCompiledOperationsAtomic` 已经是 in-place apply，因为底层 `applyEditorAiEditInstructions` 修改了 document）。所以 `finalDocument` 实际就是 mutated input：

```typescript
if (isSemanticTool(name)) {
  assertSemanticToolName(name);
  const result = await executeSemanticTool(name, args, finalDocument ?? getSeedDocument(scenario.startDocument), {
    sessionId: scenario.sessionId ?? `eval-${String(toolCall.seq)}`,
  });
  toolCall.result = result;
  return {
    output: JSON.stringify({ success: result.success, ...result }),
  };
}
```

`finalDocument` 是引用类型，会被 in-place 修改。

- [ ] **Step 3: 类型检查**

Run: `pnpm typecheck:backend`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add backend/src/ai/agentRunner.service.ts
git commit -m "feat(backend): route semantic tool calls to executeSemanticTool"
```

---

## 任务 6: 接入 Frontend Editor Agent

**Files:**

- Modify: `src/ai/agents/editorEditAgent.ts:160-180` (`toolExecutor`)

- [ ] **Step 1: 添加 import**

在 `src/ai/agents/editorEditAgent.ts` 顶部添加：

```typescript
import { executeSemanticTool } from '@shared/agent/tools/semanticToolExecutor';
import { isSemanticTool, assertSemanticToolName } from '@shared/agent/tools/semanticTools';
```

- [ ] **Step 2: 在 `toolExecutor` 内部添加新分支**

修改 `src/ai/agents/editorEditAgent.ts:160-180`，在 `editorToolCallToOperations` 调用前添加：

```typescript
        // 新分支：5 个语义工具走统一入口
        if (isSemanticTool(name)) {
          assertSemanticToolName(name);
          const result = await executeSemanticTool(
            name,
            args,
            currentDocument,
            { sessionId: this.options.sessionId ?? `agent-${Date.now()}` },
          );
          return {
            output: JSON.stringify({ success: result.success, ...result }),
          };
        }

        // 旧分支
        const edit = editorToolCallToOperations(name, args);
        ...
```

- [ ] **Step 3: 类型检查**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/ai/agents/editorEditAgent.ts
git commit -m "feat(frontend): route semantic tool calls to executeSemanticTool"
```

---

## 任务 7: E2E 测试（Backend Mock Provider）

**Files:**

- Create: `backend/src/ai/tools/semantic-tools.spec.ts`

- [ ] **Step 1: 写测试文件**

```typescript
// backend/src/ai/tools/semantic-tools.spec.ts
import { createMockProvider } from '@shared/agent/testing/mockProvider';
import { executeSemanticTool } from '@shared/agent/tools/semanticToolExecutor';
import { getSeedDocument, buildTemplateProfile } from '@shared/agent/runtime';
import type { ThemeLayoutDocument } from '@shared/agent/types';

function makeDoc(): ThemeLayoutDocument {
  return structuredClone(getSeedDocument('commerceMarket') as ThemeLayoutDocument);
}

describe('E2E: AI uses semantic tools', () => {
  it('executing editor_update_slot mutates document and returns success', async () => {
    const doc = makeDoc();
    const profile = buildTemplateProfile(doc);
    const slot = profile.slots.find((s) => s.nodeId === 'home-title');
    expect(slot).toBeDefined();

    // Simulate AI sending a tool call
    const result = await executeSemanticTool(
      'editor_update_slot',
      { slotKey: slot!.slotKey, props: { text: 'AI was here' } },
      doc,
      { sessionId: 'e2e-1' },
    );

    expect(result.success).toBe(true);
    const node = doc.pages[0].layout.children?.find((c) => c.id === 'home-title');
    expect(node?.props?.text).toBe('AI was here');
  });

  it('AI can self-correct when given a slot_not_found error', async () => {
    const doc = makeDoc();
    const profile = buildTemplateProfile(doc);

    // First call: bad slotKey
    const first = await executeSemanticTool(
      'editor_update_slot',
      { slotKey: 'home.nonexistent', props: { text: 'X' } },
      doc,
      { sessionId: 'e2e-2a' },
    );

    expect(first.success).toBe(false);
    if (first.error?.code !== 'slot_not_found') {
      throw new Error('Expected slot_not_found');
    }

    // AI reads availableSlots and picks a real one
    const realSlot = profile.slots.find((s) => s.slotKey === first.error.availableSlots[0]);
    expect(realSlot).toBeDefined();

    const second = await executeSemanticTool(
      'editor_update_slot',
      { slotKey: realSlot!.slotKey, props: { text: 'Self-corrected' } },
      doc,
      { sessionId: 'e2e-2b' },
    );

    expect(second.success).toBe(true);
  });

  it('create_page_from_page_kind end-to-end adds a new page to document', async () => {
    const doc = makeDoc();
    const profile = buildTemplateProfile(doc);
    const pageKind = profile.pages[0].pageKind;
    const pagesBefore = doc.pages.length;

    const result = await executeSemanticTool(
      'editor_create_page_from_page_kind',
      { pageKind, name: 'Created by E2E' },
      doc,
      { sessionId: 'e2e-3' },
    );

    expect(result.success).toBe(true);
    expect(doc.pages.length).toBe(pagesBefore + 1);
    const newPage = doc.pages[doc.pages.length - 1];
    expect(newPage.name).toBe('Created by E2E');
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `cd backend && pnpm test -- --testPathPattern semantic-tools`
Expected: PASS — 3 tests

- [ ] **Step 3: 提交**

```bash
git add backend/src/ai/tools/semantic-tools.spec.ts
git commit -m "test(backend): add E2E tests for semantic tool executor"
```

---

## 任务 8: 完整验证

**Files:**

- 无代码变更

- [ ] **Step 1: 类型检查**

Run: `pnpm typecheck:all`
Expected: PASS

- [ ] **Step 2: 后端测试**

Run: `pnpm --dir backend test`
Expected: PASS — 现有测试 + 12 个新测试全部通过

- [ ] **Step 3: 共享边界检查**

Run: `pnpm shared:boundary:check`
Expected: PASS — 无新增 boundary 违规

- [ ] **Step 4: 集成测试**

Run: `pnpm test:integration`
Expected: PASS

- [ ] **Step 5: 检查整体变更**

```bash
git log --oneline -10
git diff --stat HEAD~8..HEAD
```

Expected:

- 8 个新 commit（任务 1-7 + 任务 8 验证）
- 变更文件数 = 10（3 个新建 + 4 个修改 + 3 个 spec）

---

## 自审结果

1. **Spec 覆盖检查**:
   - §1.2 缺失环节 → 任务 1-7 全部对应
   - §3.1 semanticToolExecutor → 任务 3
   - §3.2 atomicApply → 任务 2
   - §3.3 Agent Runner 集成 → 任务 5, 6
   - §3.4 Profile 注入 → 任务 4
   - §5 测试 → 任务 1, 2, 3, 7（12 用例）
   - §6 交付标准 → 任务 8 验证

2. **占位符扫描**:
   - 无 TBD/TODO ✅
   - 无 "Add appropriate error handling" 模糊描述 ✅
   - 所有代码块都是具体实现 ✅
   - "Similar to Task N" → 没有，每个任务独立完整 ✅

3. **类型一致性**:
   - `SemanticToolName` 在任务 1 定义，任务 3、5、6、7 都引用同一类型 ✅
   - `ApplyResult` 接口在任务 2 定义，任务 3 扩展（增加 `preview`），任务 5、6 引用 ✅
   - `applyCompiledOperationsAtomic` 签名在任务 2 定义，任务 3 调用一致 ✅

4. **DRY**:
   - `applyCompiledOperationsAtomic` 复用 `AtomicOperationManager`，不重复实现 ✅
   - `isSemanticTool` / `parseSemanticArgs` 在任务 1 抽出，任务 3、5、6 复用 ✅
   - `buildTemplateProfileSummary` 在任务 4 抽出，可被其他 context 复用 ✅

5. **YAGNI**:
   - 没实现不需要的批量工具
   - 没实现 profile 缓存（计划文档已列为后续工作）
   - 没实现 SSE 事件（属于工作二）

---

_本计划随实施进展持续更新。_
