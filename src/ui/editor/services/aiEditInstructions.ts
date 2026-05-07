import type {
  LayoutNodeFrame,
  LayoutNodeLayout,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from "../../layout/types";
import {
  buildNodeFromDraft,
  cloneDocument,
  CONTAINER_ALIASES,
  createDraft,
  createLibrarySampleChildren,
  descriptorForAlias,
  type DropIndicatorAxis,
  findNode,
  findParentId,
  FOOTER_ALIASES,
  insertNodeRelativeToTargetInDocument,
  moveNodeWithinParentInDocument,
  nextRootFlowRow,
  normalizeChildOrder,
  normalizeGridChildren,
  normalizeRootRows,
  removeNode,
  updateNodeInDocument,
  upsertNode,
} from "./layoutBuilderService";

export type EditorAiEditInstruction =
  | {
      type: "insert_node";
      alias: string;
      nodeId?: string;
      parentId?: string;
      targetId?: string;
      position?: "before" | "after";
      axis?: DropIndicatorAxis;
      props?: Record<string, unknown>;
      layout?: Partial<LayoutNodeLayout>;
      frame?: Partial<LayoutNodeFrame>;
      select?: boolean;
    }
  | {
      type: "update_props";
      nodeId: string;
      props: Record<string, unknown>;
      select?: boolean;
    }
  | {
      type: "set_layout";
      nodeId: string;
      layout: Partial<LayoutNodeLayout>;
      select?: boolean;
    }
  | {
      type: "set_frame";
      nodeId: string;
      frame: Partial<LayoutNodeFrame>;
      select?: boolean;
    }
  | {
      type: "move_node";
      nodeId: string;
      parentId?: string;
      targetId?: string;
      position?: "before" | "after" | "inside_end";
      axis?: DropIndicatorAxis;
      select?: boolean;
    }
  | {
      type: "delete_node";
      nodeId: string;
    };

export interface ApplyEditorAiEditInstructionsResult {
  applied: string[];
  document: ThemeLayoutDocument;
  errors: string[];
  selectedNodeId?: string | null;
}

interface ApplyOneResult {
  document: ThemeLayoutDocument;
  error?: string;
  message?: string;
  selectedNodeId?: string | null;
}

const SIZE_LAYOUT_KEYS = [
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
] as const;

const GRID_LAYOUT_KEYS = ["gridColumn", "gridRow"] as const;
const ALIGN_VALUES = new Set(["auto", "start", "center", "end", "stretch"]);

function stringifyPropValue(value: unknown) {
  if (value == null) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return "";
}

function isSizeValue(value: unknown): value is number | string {
  return typeof value === "number" || typeof value === "string";
}

function sanitizeLayoutPatch(
  layout: Partial<LayoutNodeLayout> | undefined,
): Partial<LayoutNodeLayout> {
  const next: Partial<LayoutNodeLayout> = {};
  if (!layout) {
    return next;
  }

  if (
    layout.mode === "flow" ||
    layout.mode === "grid" ||
    layout.mode === "absolute"
  ) {
    next.mode = layout.mode;
  }
  if (typeof layout.flowRow === "number") {
    next.flowRow = layout.flowRow;
  }
  if (typeof layout.order === "number") {
    next.order = layout.order;
  }

  SIZE_LAYOUT_KEYS.forEach((key) => {
    const value = layout[key];
    if (isSizeValue(value)) {
      next[key] = value;
    }
  });

  GRID_LAYOUT_KEYS.forEach((key) => {
    const value = layout[key];
    if (typeof value === "string") {
      next[key] = value;
    }
  });

  if (
    typeof layout.alignSelf === "string" &&
    ALIGN_VALUES.has(layout.alignSelf)
  ) {
    next.alignSelf = layout.alignSelf;
  }
  if (
    typeof layout.justifySelf === "string" &&
    ALIGN_VALUES.has(layout.justifySelf)
  ) {
    next.justifySelf = layout.justifySelf;
  }

  return next;
}

function sanitizeFramePatch(
  frame: Partial<LayoutNodeFrame> | undefined,
): Partial<LayoutNodeFrame> {
  const next: Partial<LayoutNodeFrame> = {};
  if (!frame) {
    return next;
  }

  next.position = "absolute";
  if (typeof frame.x === "number") {
    next.x = frame.x;
  }
  if (typeof frame.y === "number") {
    next.y = frame.y;
  }
  if (isSizeValue(frame.left)) {
    next.left = frame.left;
  }
  if (isSizeValue(frame.top)) {
    next.top = frame.top;
  }
  if (isSizeValue(frame.right)) {
    next.right = frame.right;
  }
  if (isSizeValue(frame.bottom)) {
    next.bottom = frame.bottom;
  }
  if (isSizeValue(frame.width)) {
    next.width = frame.width;
  }
  if (isSizeValue(frame.height)) {
    next.height = frame.height;
  }
  if (isSizeValue(frame.minWidth)) {
    next.minWidth = frame.minWidth;
  }
  if (isSizeValue(frame.minHeight)) {
    next.minHeight = frame.minHeight;
  }
  if (isSizeValue(frame.maxWidth)) {
    next.maxWidth = frame.maxWidth;
  }
  if (isSizeValue(frame.maxHeight)) {
    next.maxHeight = frame.maxHeight;
  }
  if (typeof frame.zIndex === "number") {
    next.zIndex = frame.zIndex;
  }
  if (frame.unit === "px" || frame.unit === "%") {
    next.unit = frame.unit;
  }
  return next;
}

function coercePropValue(
  descriptor: ThemeComponentDescriptor,
  name: string,
  value: unknown,
): { error?: string; value?: unknown } {
  const prop = descriptor.props.find((item) => item.name === name);
  if (!prop) {
    return { error: `属性 "${name}" 不属于组件 ${descriptor.alias}` };
  }

  if (prop.type === "boolean") {
    return { value: Boolean(value) };
  }

  if (prop.type === "number") {
    const numericValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
      return { error: `属性 "${name}" 需要数字` };
    }
    return { value: numericValue };
  }

  if (prop.type === "string[]") {
    if (Array.isArray(value)) {
      return {
        value: value.map((item) => String(item).trim()).filter(Boolean),
      };
    }

    if (typeof value === "string") {
      return {
        value: value
          .split(/[,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
      };
    }

    return { error: `属性 "${name}" 需要字符串数组` };
  }

  const stringValue = stringifyPropValue(value);
  if (prop.enum?.length && !prop.enum.includes(stringValue)) {
    return {
      error: `属性 "${name}" 必须是以下值之一：${prop.enum.join(", ")}`,
    };
  }

  return { value: stringValue };
}

function coerceProps(
  descriptor: ThemeComponentDescriptor,
  props: Record<string, unknown> | undefined,
) {
  const nextProps: Record<string, unknown> = {};
  const errors: string[] = [];
  Object.entries(props ?? {}).forEach(([name, value]) => {
    const result = coercePropValue(descriptor, name, value);
    if (result.error) {
      errors.push(result.error);
      return;
    }
    nextProps[name] = result.value;
  });
  return { errors, props: nextProps };
}

function normalizeParentAfterChange(
  document: ThemeLayoutDocument,
  parentId: string,
) {
  const parent = findNode(document.layout, parentId);
  if (!parent) {
    return;
  }

  if (parent.id === document.layout.id) {
    normalizeRootRows(document.layout);
    return;
  }

  if (parent.alias === "core.grid") {
    normalizeGridChildren(parent);
    return;
  }

  normalizeChildOrder(parent);
}

function canInsertIntoParent(document: ThemeLayoutDocument, parentId: string) {
  const parent = findNode(document.layout, parentId);
  return Boolean(parent && CONTAINER_ALIASES.has(parent.alias));
}

function buildInsertedNode(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: "insert_node" }>,
) {
  const descriptor = descriptorForAlias(document, instruction.alias);
  if (!descriptor) {
    return { error: `未找到组件 alias：${instruction.alias}` };
  }

  if (instruction.nodeId && findNode(document.layout, instruction.nodeId)) {
    return { error: `节点 id 已存在：${instruction.nodeId}` };
  }

  const parentId = instruction.parentId ?? document.layout.id;
  if (!canInsertIntoParent(document, parentId)) {
    return { error: `节点 ${parentId} 不能接收子节点` };
  }

  const slot =
    parentId === document.layout.id && FOOTER_ALIASES.has(descriptor.alias)
      ? "footer"
      : "body";
  const draft = createDraft(
    document.themeId,
    descriptor,
    parentId,
    slot,
    undefined,
    parentId === document.layout.id && slot === "body"
      ? nextRootFlowRow(document.layout)
      : 0,
  );
  draft.nodeId = instruction.nodeId;

  const sampleChildren =
    descriptor.alias === "core.panel" || descriptor.alias === "core.stack"
      ? createLibrarySampleChildren(document, descriptor.alias)
      : undefined;
  const nextNode = buildNodeFromDraft(descriptor, draft, sampleChildren);
  const coerced = coerceProps(descriptor, instruction.props);
  if (coerced.errors.length) {
    return { error: coerced.errors.join("；") };
  }

  nextNode.props = { ...(nextNode.props ?? {}), ...coerced.props };
  nextNode.layout = {
    ...nextNode.layout,
    ...sanitizeLayoutPatch(instruction.layout),
  };
  const framePatch = sanitizeFramePatch(instruction.frame);
  if (Object.keys(framePatch).length > 0) {
    nextNode.layout.mode = "absolute";
    nextNode.frame = {
      position: "absolute",
      ...nextNode.frame,
      ...framePatch,
    };
  }

  return { node: nextNode, parentId };
}

function applyInsertNode(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: "insert_node" }>,
): ApplyOneResult {
  const built = buildInsertedNode(document, instruction);
  if ("error" in built) {
    return { document, error: built.error };
  }

  const { node, parentId } = built;
  const nextDocument =
    instruction.targetId && instruction.position
      ? insertNodeRelativeToTargetInDocument(
          document,
          parentId,
          node,
          instruction.targetId,
          instruction.position,
          instruction.axis ?? "vertical",
        )
      : upsertNode(document, parentId, node);

  if (!nextDocument) {
    return { document, error: `无法插入节点 ${instruction.alias}` };
  }

  return {
    document: nextDocument,
    message: `插入 ${instruction.alias}`,
    selectedNodeId: instruction.select === false ? undefined : node.id,
  };
}

function applyUpdateProps(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: "update_props" }>,
): ApplyOneResult {
  const node = findNode(document.layout, instruction.nodeId);
  if (!node) {
    return { document, error: `未找到节点：${instruction.nodeId}` };
  }

  const descriptor = descriptorForAlias(document, node.alias);
  if (!descriptor) {
    return { document, error: `未找到组件描述：${node.alias}` };
  }

  const coerced = coerceProps(descriptor, instruction.props);
  if (coerced.errors.length) {
    return { document, error: coerced.errors.join("；") };
  }

  const nextDocument = updateNodeInDocument(
    document,
    instruction.nodeId,
    (draft) => {
      draft.props = { ...(draft.props ?? {}), ...coerced.props };
    },
  );
  if (!nextDocument) {
    return { document, error: `无法更新节点：${instruction.nodeId}` };
  }

  return {
    document: nextDocument,
    message: `更新 ${instruction.nodeId} 的属性`,
    selectedNodeId:
      instruction.select === false ? undefined : instruction.nodeId,
  };
}

function applySetLayout(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: "set_layout" }>,
): ApplyOneResult {
  const node = findNode(document.layout, instruction.nodeId);
  if (!node) {
    return { document, error: `未找到节点：${instruction.nodeId}` };
  }

  const patch = sanitizeLayoutPatch(instruction.layout);
  const nextDocument = updateNodeInDocument(
    document,
    instruction.nodeId,
    (draft) => {
      draft.layout = { ...draft.layout, ...patch };
    },
  );
  if (!nextDocument) {
    return { document, error: `无法更新布局：${instruction.nodeId}` };
  }

  return {
    document: nextDocument,
    message: `更新 ${instruction.nodeId} 的布局`,
    selectedNodeId:
      instruction.select === false ? undefined : instruction.nodeId,
  };
}

function applySetFrame(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: "set_frame" }>,
): ApplyOneResult {
  const node = findNode(document.layout, instruction.nodeId);
  if (!node) {
    return { document, error: `未找到节点：${instruction.nodeId}` };
  }

  const patch = sanitizeFramePatch(instruction.frame);
  const nextDocument = updateNodeInDocument(
    document,
    instruction.nodeId,
    (draft) => {
      draft.layout = { ...draft.layout, mode: "absolute" };
      draft.frame = {
        position: "absolute",
        ...draft.frame,
        ...patch,
      };
    },
  );
  if (!nextDocument) {
    return { document, error: `无法更新定位：${instruction.nodeId}` };
  }

  return {
    document: nextDocument,
    message: `更新 ${instruction.nodeId} 的绝对定位`,
    selectedNodeId:
      instruction.select === false ? undefined : instruction.nodeId,
  };
}

function moveNodeToParentEnd(
  document: ThemeLayoutDocument,
  nodeId: string,
  parentId: string,
) {
  const nextDocument = cloneDocument(document);
  const currentParentId = findParentId(nextDocument.layout, nodeId);
  const movingNode = findNode(nextDocument.layout, nodeId);
  const targetParent = findNode(nextDocument.layout, parentId);
  if (!currentParentId || !movingNode || !targetParent) {
    return null;
  }
  if (!CONTAINER_ALIASES.has(targetParent.alias)) {
    return null;
  }

  const previousParentId = currentParentId;
  const movingClone: ThemeLayoutNode = structuredClone(movingNode);
  removeNode(nextDocument.layout, nodeId);
  targetParent.children ??= [];
  targetParent.children.push(movingClone);

  if (targetParent.id === nextDocument.layout.id) {
    movingClone.layout.flowRow = nextRootFlowRow(nextDocument.layout);
  }

  normalizeParentAfterChange(nextDocument, previousParentId);
  normalizeParentAfterChange(nextDocument, parentId);
  return nextDocument;
}

function applyMoveNode(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: "move_node" }>,
): ApplyOneResult {
  if (instruction.nodeId === document.layout.id) {
    return { document, error: "不能移动根节点" };
  }

  const nextDocument =
    instruction.targetId && instruction.position !== "inside_end"
      ? moveNodeWithinParentInDocument(
          document,
          instruction.nodeId,
          instruction.targetId,
          instruction.position ?? "after",
        )
      : instruction.parentId
        ? moveNodeToParentEnd(
            document,
            instruction.nodeId,
            instruction.parentId,
          )
        : null;

  if (!nextDocument) {
    return { document, error: `无法移动节点：${instruction.nodeId}` };
  }

  return {
    document: nextDocument,
    message: `移动 ${instruction.nodeId}`,
    selectedNodeId:
      instruction.select === false ? undefined : instruction.nodeId,
  };
}

function applyDeleteNode(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: "delete_node" }>,
): ApplyOneResult {
  if (instruction.nodeId === document.layout.id) {
    return { document, error: "不能删除根节点" };
  }

  const nextDocument = cloneDocument(document);
  const parentId = findParentId(nextDocument.layout, instruction.nodeId);
  if (!parentId || !removeNode(nextDocument.layout, instruction.nodeId)) {
    return { document, error: `未找到节点：${instruction.nodeId}` };
  }
  normalizeParentAfterChange(nextDocument, parentId);

  return {
    document: nextDocument,
    message: `删除 ${instruction.nodeId}`,
    selectedNodeId: null,
  };
}

function applyOneInstruction(
  document: ThemeLayoutDocument,
  instruction: EditorAiEditInstruction,
): ApplyOneResult {
  switch (instruction.type) {
    case "insert_node":
      return applyInsertNode(document, instruction);
    case "update_props":
      return applyUpdateProps(document, instruction);
    case "set_layout":
      return applySetLayout(document, instruction);
    case "set_frame":
      return applySetFrame(document, instruction);
    case "move_node":
      return applyMoveNode(document, instruction);
    case "delete_node":
      return applyDeleteNode(document, instruction);
    default:
      return { document, error: "未知编辑指令" };
  }
}

export function applyEditorAiEditInstructions(
  document: ThemeLayoutDocument,
  instructions: readonly EditorAiEditInstruction[],
): ApplyEditorAiEditInstructionsResult {
  let currentDocument = cloneDocument(document);
  const applied: string[] = [];
  const errors: string[] = [];
  let selectedNodeId: string | null | undefined;

  instructions.forEach((instruction, index) => {
    const result = applyOneInstruction(currentDocument, instruction);
    currentDocument = result.document;
    if (result.error) {
      errors.push(`第 ${index + 1} 条：${result.error}`);
      return;
    }

    if (result.message) {
      applied.push(result.message);
    }
    if (result.selectedNodeId !== undefined) {
      selectedNodeId = result.selectedNodeId;
    }
  });

  return {
    applied,
    document: currentDocument,
    errors,
    selectedNodeId,
  };
}
