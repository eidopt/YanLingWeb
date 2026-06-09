import { buildDefaultProps, buildPropsFromValues, defaultFlowWidth } from './draftBuilders';
import { createNodeId, descriptorForAlias, toFieldString } from './nodeOperations';
import type { ThemeComponentDescriptor, ThemeLayoutDocument, ThemeLayoutNode } from 'ui/layout/types';
import { normalizeThemeLayoutDocument } from 'ui/layout/types';

function getPreviewThemeAliases(themeId: string) {
  return themeId === 'service-center'
    ? { text: 'svc-text', action: 'svc-button', chip: 'svc-tag' }
    : { text: 'com-text', action: 'com-button', chip: 'com-tag' };
}

export function createLibrarySampleNode(
  themeId: string,
  descriptor: ThemeComponentDescriptor,
  overrides?: Record<string, string | boolean>,
  children?: ThemeLayoutNode[],
  order?: number,
): ThemeLayoutNode {
  const defaultProps = buildDefaultProps(themeId, descriptor);

  return {
    id: createNodeId(descriptor.alias),
    alias: descriptor.alias,
    layout: {
      mode: 'flow',
      width: defaultFlowWidth(descriptor) || undefined,
      order,
    },
    props: buildPropsFromValues(descriptor, { ...defaultProps, ...overrides }),
    children,
  };
}

export function createLibrarySampleChildren(document: ThemeLayoutDocument, containerAlias: string): ThemeLayoutNode[] {
  const previewThemeAliases = getPreviewThemeAliases(document.themeId);
  const textDescriptor = descriptorForAlias(document, previewThemeAliases.text);
  const actionDescriptor = descriptorForAlias(document, previewThemeAliases.action);
  const chipDescriptor = descriptorForAlias(document, previewThemeAliases.chip);

  if (!textDescriptor || !actionDescriptor) {
    return [];
  }

  return [
    createLibrarySampleNode(
      document.themeId,
      textDescriptor,
      { variant: containerAlias === 'core.panel' ? 'title' : 'body' },
      undefined,
      1,
    ),
    createLibrarySampleNode(document.themeId, actionDescriptor, { variant: 'primary' }, undefined, 2),
    containerAlias === 'core.stack' && chipDescriptor
      ? createLibrarySampleNode(document.themeId, chipDescriptor, undefined, undefined, 3)
      : null,
  ].filter((node): node is ThemeLayoutNode => Boolean(node));
}

export function createLibraryPreviewNode(
  themeId: string,
  descriptor: ThemeComponentDescriptor,
  key: string,
  overrides?: Record<string, string | boolean>,
  children?: ThemeLayoutNode[],
): ThemeLayoutNode {
  const defaultProps = buildDefaultProps(themeId, descriptor);

  return {
    id: `library-preview-${key}`,
    alias: descriptor.alias,
    layout: {
      mode: 'flow',
      width: defaultFlowWidth(descriptor) || undefined,
    },
    props: buildPropsFromValues(descriptor, { ...defaultProps, ...overrides }),
    children,
  };
}

export function createLibraryPreviewDocument(
  document: ThemeLayoutDocument,
  descriptor: ThemeComponentDescriptor,
): ThemeLayoutDocument {
  const previewPageId = document.defaultPageId;
  const previewPageName = document.pageName ?? '组件预览';

  if (descriptor.alias === 'core.panel' || descriptor.alias === 'core.stack') {
    const previewChildren = createLibrarySampleChildren(document, descriptor.alias).map((child, index) => {
      const childDescriptor = descriptorForAlias(document, child.alias);
      if (!childDescriptor) {
        return child;
      }

      return createLibraryPreviewNode(
        document.themeId,
        childDescriptor,
        `${descriptor.alias}-${index}`,
        Object.fromEntries(
          childDescriptor.props.map((prop) => [
            prop.name,
            typeof child.props?.[prop.name] === 'boolean'
              ? Boolean(child.props[prop.name])
              : toFieldString(child.props?.[prop.name]),
          ]),
        ),
      );
    });

    const previewLayout = createLibraryPreviewNode(
      document.themeId,
      descriptor,
      descriptor.alias,
      undefined,
      previewChildren,
    );

    return normalizeThemeLayoutDocument({
      ...document,
      defaultPageId: previewPageId,
      pageName: previewPageName,
      pages: [
        {
          id: previewPageId,
          name: previewPageName,
          layout: previewLayout,
        },
      ],
      layout: previewLayout,
    });
  }

  const previewLayout = createLibraryPreviewNode(document.themeId, descriptor, descriptor.alias);

  return normalizeThemeLayoutDocument({
    ...document,
    defaultPageId: previewPageId,
    pageName: previewPageName,
    pages: [
      {
        id: previewPageId,
        name: previewPageName,
        layout: previewLayout,
      },
    ],
    layout: previewLayout,
  });
}
