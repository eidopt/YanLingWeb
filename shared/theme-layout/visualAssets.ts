export type VisualAssetRole =
  | 'hero'
  | 'card-cover'
  | 'avatar'
  | 'banner'
  | 'illustration'
  | 'gallery'
  | 'icon'
  | 'background';

export type VisualAssetStatus = 'pending' | 'generated' | 'fallback' | 'failed';

export type VisualAssetProvider = 'ai-image' | 'curated' | 'placeholder' | 'manual';

export interface VisualAssetPlaceholder {
  title?: string;
  iconColor?: string;
}

export interface VisualAsset {
  id: string;
  nodeId?: string;
  pageId?: string;
  role?: VisualAssetRole | (string & {});
  prompt?: string;
  alt?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  status?: VisualAssetStatus;
  provider?: VisualAssetProvider;
  url?: string;
  storageKey?: string;
  fallbackReason?: string;
  placeholder?: VisualAssetPlaceholder;
}

export interface VisualAssetManifest {
  templateId: string;
  version: '1.0.0';
  visualAssets: VisualAsset[];
}

interface VisualAssetLayoutNode {
  id: string;
  alias: string;
  props?: Record<string, unknown>;
  children?: VisualAssetLayoutNode[];
}

interface VisualAssetLayoutDocument {
  pages?: { layout?: VisualAssetLayoutNode }[];
  layout?: VisualAssetLayoutNode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function asVisualAssetStatus(value: unknown): VisualAssetStatus | undefined {
  return value === 'pending' || value === 'generated' || value === 'fallback' || value === 'failed' ? value : undefined;
}

function asVisualAssetProvider(value: unknown): VisualAssetProvider | undefined {
  return value === 'ai-image' || value === 'curated' || value === 'placeholder' || value === 'manual'
    ? value
    : undefined;
}

export function isTemplateAssetPath(value: string): boolean {
  if (!value.startsWith('/template-assets/')) {
    return false;
  }

  return !value.includes('..') && !value.includes('\\') && !value.includes('//');
}

export function isAllowedTemplateImageSrc(value: string): boolean {
  if (isTemplateAssetPath(value)) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeVisualAssets(value: unknown): VisualAsset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((asset): VisualAsset[] => {
    if (!isRecord(asset)) {
      return [];
    }

    const id = asNonEmptyString(asset.id);
    if (!id) {
      return [];
    }

    const placeholder: VisualAssetPlaceholder = {};
    if (isRecord(asset.placeholder)) {
      const title = asNonEmptyString(asset.placeholder.title);
      const iconColor = asNonEmptyString(asset.placeholder.iconColor);
      if (title) {
        placeholder.title = title;
      }
      if (iconColor) {
        placeholder.iconColor = iconColor;
      }
    }

    const normalized: VisualAsset = { id };
    const nodeId = asNonEmptyString(asset.nodeId);
    const pageId = asNonEmptyString(asset.pageId);
    const role = asNonEmptyString(asset.role);
    const prompt = asNonEmptyString(asset.prompt);
    const alt = asNonEmptyString(asset.alt);
    const aspectRatio = asNonEmptyString(asset.aspectRatio);
    const width = asPositiveNumber(asset.width);
    const height = asPositiveNumber(asset.height);
    const status = asVisualAssetStatus(asset.status);
    const provider = asVisualAssetProvider(asset.provider);
    const url = asNonEmptyString(asset.url);
    const storageKey = asNonEmptyString(asset.storageKey);
    const fallbackReason = asNonEmptyString(asset.fallbackReason);

    if (nodeId) {
      normalized.nodeId = nodeId;
    }
    if (pageId) {
      normalized.pageId = pageId;
    }
    if (role) {
      normalized.role = role;
    }
    if (prompt) {
      normalized.prompt = prompt;
    }
    if (alt) {
      normalized.alt = alt;
    }
    if (aspectRatio) {
      normalized.aspectRatio = aspectRatio;
    }
    if (width) {
      normalized.width = width;
    }
    if (height) {
      normalized.height = height;
    }
    if (status) {
      normalized.status = status;
    }
    if (provider) {
      normalized.provider = provider;
    }
    if (url) {
      normalized.url = url;
    }
    if (storageKey) {
      normalized.storageKey = storageKey;
    }
    if (fallbackReason) {
      normalized.fallbackReason = fallbackReason;
    }
    if (Object.keys(placeholder).length > 0) {
      normalized.placeholder = placeholder;
    }

    return [normalized];
  });
}

export function buildVisualAssetManifest(templateId: string, value: unknown): VisualAssetManifest | null {
  const visualAssets = normalizeVisualAssets(value);
  if (!visualAssets.length) {
    return null;
  }

  return {
    templateId,
    version: '1.0.0',
    visualAssets,
  };
}

export function mergeVisualAssetsIntoManifest(
  templateId: string,
  manifest: Record<string, unknown> | null | undefined,
  value: unknown,
): Record<string, unknown> | undefined {
  const visualAssets = normalizeVisualAssets(value);
  if (!visualAssets.length) {
    return manifest ?? undefined;
  }

  return {
    ...(manifest ?? {}),
    templateId,
    visualAssets,
  };
}

function cloneDocument<T>(document: T): T {
  return JSON.parse(JSON.stringify(document)) as T;
}

function visitNode(node: VisualAssetLayoutNode, visitor: (node: VisualAssetLayoutNode) => void) {
  visitor(node);
  node.children?.forEach((child) => visitNode(child, visitor));
}

export function applyVisualAssetsToLayoutDocument<T extends Record<string, unknown>>(document: T, value: unknown): T {
  const visualAssets = normalizeVisualAssets(value);
  if (!visualAssets.length) {
    return document;
  }

  const cloned = cloneDocument(document) as T & VisualAssetLayoutDocument;
  const byAssetId = new Map(visualAssets.map((asset) => [asset.id, asset]));
  const byNodeId = new Map(
    visualAssets
      .filter(
        (asset): asset is VisualAsset & { nodeId: string } =>
          typeof asset.nodeId === 'string' && asset.nodeId.length > 0,
      )
      .map((asset) => [asset.nodeId, asset]),
  );

  const patchImageNode = (node: VisualAssetLayoutNode) => {
    if (node.alias !== 'core.image') {
      return;
    }

    node.props = node.props ?? {};
    const assetId = asNonEmptyString(node.props.assetId);
    const asset = (assetId ? byAssetId.get(assetId) : undefined) ?? byNodeId.get(node.id);
    if (!asset) {
      return;
    }

    node.props.assetId = asset.id;
    if (asset.alt && !asNonEmptyString(node.props.alt)) {
      node.props.alt = asset.alt;
    }
    if (asset.placeholder?.title && !asNonEmptyString(node.props.title)) {
      node.props.title = asset.placeholder.title;
    }
    if (asset.placeholder?.iconColor && !asNonEmptyString(node.props.iconColor)) {
      node.props.iconColor = asset.placeholder.iconColor;
    }
    if (asset.url && isAllowedTemplateImageSrc(asset.url)) {
      node.props.src = asset.url;
    }
  };

  cloned.pages?.forEach((page) => {
    if (page.layout) {
      visitNode(page.layout, patchImageNode);
    }
  });

  if (cloned.layout) {
    visitNode(cloned.layout, patchImageNode);
  }

  return cloned;
}
