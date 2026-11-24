export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | JsonSchema[];
  description?: string;
  additionalProperties?: boolean | JsonSchema;
  enum?: unknown[];
  [key: string]: unknown;
}

const FLATTEN_MAX_DEPTH = 2;
const FLATTEN_MAX_LEAVES = 10;

export interface FlattenDecision {
  shouldFlatten: boolean;
  leafCount: number;
  maxDepth: number;
}

export function analyzeSchema(schema: JsonSchema): FlattenDecision {
  let leafCount = 0;
  let maxDepth = 0;
  const visit = (node: JsonSchema, depth: number): void => {
    maxDepth = Math.max(maxDepth, depth);
    if (hasInlineProperties(node)) {
      for (const child of Object.values(node.properties ?? {})) {
        visit(child, depth + 1);
      }
      return;
    }
    if (node.items && !Array.isArray(node.items)) {
      visit(node.items, depth + 1);
      return;
    }
    leafCount += 1;
  };
  visit(schema, 0);
  return {
    shouldFlatten: leafCount > FLATTEN_MAX_LEAVES || maxDepth > FLATTEN_MAX_DEPTH,
    leafCount,
    maxDepth,
  };
}

/** Expand nested object properties into dotted keys. Shallow schemas are returned unchanged. */
export function flattenSchema(schema: JsonSchema): JsonSchema {
  if (!analyzeSchema(schema).shouldFlatten) {
    return schema;
  }
  return flattenObject(schema);
}

/** Rebuild objects and array elements from dotted keys produced by flattenSchema. */
export function nestArguments(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => nestArguments(item));
  }
  if (!isRecord(value)) {
    return value;
  }
  const nestedChildren = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, nestArguments(child)]),
  );
  if (!Object.keys(nestedChildren).some((key) => key.includes('.'))) {
    return nestedChildren;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(nestedChildren)) {
    setByPath(out, key.split('.'), child);
  }
  return out;
}

export function nestToolArguments(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    return JSON.stringify(nestArguments(parsed));
  } catch {
    return raw;
  }
}

function flattenObject(schema: JsonSchema): JsonSchema {
  if (!hasInlineProperties(schema)) {
    return flattenContainers(schema);
  }
  const properties: Record<string, JsonSchema> = {};
  const required = new Set<string>();
  collect('', schema.properties ?? {}, schema.required ?? [], true, properties, required);
  const rest = { ...schema };
  delete rest.properties;
  delete rest.required;
  return {
    ...rest,
    type: schema.type ?? 'object',
    properties,
    ...(required.size > 0 ? { required: [...required] } : {}),
  };
}

function flattenContainers(schema: JsonSchema): JsonSchema {
  if (!schema.items || Array.isArray(schema.items)) {
    return schema;
  }
  return { ...schema, items: flattenObject(schema.items) };
}

function collect(
  prefix: string,
  properties: Record<string, JsonSchema>,
  requiredNames: readonly string[],
  parentRequired: boolean,
  out: Record<string, JsonSchema>,
  outRequired: Set<string>,
): void {
  for (const [name, child] of Object.entries(properties)) {
    const path = prefix ? `${prefix}.${name}` : name;
    const selfRequired = parentRequired && requiredNames.includes(name);
    if (hasInlineProperties(child)) {
      collect(path, child.properties ?? {}, child.required ?? [], selfRequired, out, outRequired);
      continue;
    }
    out[path] = flattenContainers(child);
    if (selfRequired) {
      outRequired.add(path);
    }
  }
}

function hasInlineProperties(schema: JsonSchema): boolean {
  return Boolean(
    schema.properties &&
    Object.keys(schema.properties).length > 0 &&
    schema.additionalProperties !== true,
  );
}

function setByPath(target: Record<string, unknown>, parts: string[], value: unknown): void {
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index] ?? '';
    const existing = cursor[part];
    if (!isRecord(existing)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1] ?? '';
  cursor[leaf] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
