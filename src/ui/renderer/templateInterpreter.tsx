import { renderCoreAlias } from './coreAliases';
import type { ComponentTemplateMap, TemplateNode, TemplatePropValue } from './templateTypes';
import type { ThemeRuntime } from './types';
import { Fragment, type ReactNode } from 'react';

function resolveValue(value: TemplatePropValue, outerProps: Record<string, unknown>): unknown {
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && '$bind' in value) {
    return outerProps[(value as { $bind: string }).$bind];
  }
  return value;
}

function resolveProps(
  templateProps: Record<string, TemplatePropValue> | undefined,
  outerProps: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = { __applyNodeLayoutStyle: false };
  if (!templateProps) {
    return resolved;
  }
  for (const [key, value] of Object.entries(templateProps)) {
    resolved[key] = resolveValue(value, outerProps);
  }
  return resolved;
}

function renderTemplateNode(node: TemplateNode, outerProps: Record<string, unknown>, runtime: ThemeRuntime): ReactNode {
  const resolvedProps = resolveProps(node.props, outerProps);
  const childNodes: ReactNode[] = (node.children ?? []).map((child, i) => (
    // children are template-defined and lack stable ids; alias + position is the best available key
    // eslint-disable-next-line react/no-array-index-key -- template nodes have no stable id
    <Fragment key={i}>{renderTemplateNode(child, outerProps, runtime)}</Fragment>
  ));
  return renderCoreAlias(runtime, node.alias, resolvedProps, childNodes);
}

export function renderComponentTemplate(
  alias: string,
  outerProps: Record<string, unknown>,
  componentTemplates: ComponentTemplateMap,
  runtime: ThemeRuntime,
): ReactNode {
  if (!Object.hasOwn(componentTemplates, alias)) {
    return null;
  }
  const template = componentTemplates[alias];
  return renderTemplateNode(template.root, outerProps, runtime);
}
