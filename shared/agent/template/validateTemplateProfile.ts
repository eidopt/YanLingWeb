/* eslint-disable max-len */
import type { ThemeLayoutDocument, ThemeLayoutNode, ValidationIssue, ValidationResult } from '../types';
import { EDITABLE_PROPS_BY_ALIAS, type TemplateProfile } from './templateProfile';
import { containsSensitiveData, maskNodeId, validateSemanticKeyFormat } from './templateSecurity';

function issue(severity: ValidationIssue['severity'], path: string, code: string, message: string): ValidationIssue {
  return { severity, path, code, message };
}

function findNode(root: ThemeLayoutNode, nodeId: string): ThemeLayoutNode | null {
  if (root.id === nodeId) {return root;}
  for (const child of root.children ?? []) {
    const found = findNode(child, nodeId);
    if (found) {return found;}
  }
  return null;
}

function findNodeInDocument(document: ThemeLayoutDocument, nodeId: string): ThemeLayoutNode | null {
  for (const page of document.pages) {
    const found = findNode(page.layout, nodeId);
    if (found) {return found;}
  }
  return null;
}

function componentProps(document: ThemeLayoutDocument, alias: string): Set<string> {
  const descriptor = document.components.find((component) => component.alias === alias);
  return new Set([
    ...(descriptor?.props ?? []).map((prop) => prop.name),
    ...(EDITABLE_PROPS_BY_ALIAS[alias] ?? []),
  ]);
}

function checkUnique(keys: string[], path: string, errors: ValidationIssue[]): void {
  const seen = new Set<string>();
  keys.forEach((key, index) => {
    if (seen.has(key)) {
      errors.push(issue('error', `${path}[${index}]`, 'duplicate_key', `Duplicate semantic key: ${key}`));
    }
    seen.add(key);
  });
}

function checkKey(key: string, path: string, errors: ValidationIssue[]): void {
  if (!validateSemanticKeyFormat(key)) {
    errors.push(issue('error', path, 'invalid_key_format', `Invalid semantic key format: ${key}`));
  }
}

export function validateTemplateProfile(document: ThemeLayoutDocument, profile: TemplateProfile): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  checkUnique(profile.pages.map((page) => page.pageKey), 'pages', errors);
  checkUnique(profile.regions.map((region) => region.regionKey), 'regions', errors);
  checkUnique(profile.slots.map((slot) => slot.slotKey), 'slots', errors);
  checkUnique(profile.patterns.map((pattern) => pattern.patternKey), 'patterns', errors);

  const pageKeys = new Set(profile.pages.map((page) => page.pageKey));
  const regionKeys = new Set(profile.regions.map((region) => region.regionKey));
  const slotKeys = new Set(profile.slots.map((slot) => slot.slotKey));
  const pageIds = new Set(document.pages.map((page) => page.id));

  profile.pages.forEach((page, index) => {
    checkKey(page.pageKey, `pages[${index}].pageKey`, errors);
    if (!pageIds.has(page.pageId)) {
      errors.push(issue('error', `pages[${index}].pageId`, 'missing_page', `Profile page references missing page id: ${page.pageId}`));
    }
    const root = findNodeInDocument(document, page.rootNodeId);
    if (!root) {
      errors.push(issue('error', `pages[${index}].rootNodeId`, 'missing_root_node', `Missing root node: ${maskNodeId(page.rootNodeId)}`));
    }
  });

  profile.regions.forEach((region, index) => {
    checkKey(region.regionKey, `regions[${index}].regionKey`, errors);
    if (!pageKeys.has(region.pageKey)) {
      errors.push(issue('error', `regions[${index}].pageKey`, 'missing_page_key', `Missing pageKey: ${region.pageKey}`));
    }
    if (!findNodeInDocument(document, region.nodeId)) {
      errors.push(issue('error', `regions[${index}].nodeId`, 'missing_region_node', `Missing region node: ${maskNodeId(region.nodeId)}`));
    }
  });

  profile.slots.forEach((slot, index) => {
    checkKey(slot.slotKey, `slots[${index}].slotKey`, errors);
    if (!pageKeys.has(slot.pageKey)) {
      errors.push(issue('error', `slots[${index}].pageKey`, 'missing_page_key', `Missing pageKey: ${slot.pageKey}`));
    }
    if (slot.regionKey && !regionKeys.has(slot.regionKey)) {
      warnings.push(issue('warning', `slots[${index}].regionKey`, 'missing_region_key', `Slot references missing regionKey: ${slot.regionKey}`));
    }
    const node = findNodeInDocument(document, slot.nodeId);
    if (!node) {
      errors.push(issue('error', `slots[${index}].nodeId`, 'missing_slot_node', `Missing slot node: ${maskNodeId(slot.nodeId)}`));
      return;
    }
    if (node.alias !== slot.component) {
      errors.push(issue('error', `slots[${index}].component`, 'component_mismatch', `Slot ${slot.slotKey} expected ${slot.component}, got ${node.alias}`));
    }
    const allowedProps = componentProps(document, slot.component);
    slot.editableProps.forEach((prop) => {
      if (!allowedProps.has(prop)) {
        errors.push(issue('error', `slots[${index}].editableProps`, 'invalid_editable_prop', `Prop ${prop} is not declared for ${slot.component}`));
      }
    });
    if (containsSensitiveData(slot)) {
      errors.push(issue('error', `slots[${index}]`, 'sensitive_data_detected', `Sensitive data detected in slot ${slot.slotKey}`));
    }
  });

  profile.patterns.forEach((pattern, index) => {
    checkKey(pattern.patternKey, `patterns[${index}].patternKey`, errors);
    if (!pageKeys.has(pattern.pageKey)) {
      errors.push(issue('error', `patterns[${index}].pageKey`, 'missing_page_key', `Missing pageKey: ${pattern.pageKey}`));
    }
    if (pattern.regionKey && !regionKeys.has(pattern.regionKey)) {
      warnings.push(issue('warning', `patterns[${index}].regionKey`, 'missing_region_key', `Pattern references missing regionKey: ${pattern.regionKey}`));
    }
    if (!findNodeInDocument(document, pattern.sourceRootNodeId)) {
      errors.push(issue('error', `patterns[${index}].sourceRootNodeId`, 'missing_pattern_source', `Missing pattern source node: ${maskNodeId(pattern.sourceRootNodeId)}`));
    }
    pattern.fields.forEach((field, fieldIndex) => {
      if (!slotKeys.has(field.slotKey)) {
        warnings.push(issue('warning', `patterns[${index}].fields[${fieldIndex}].slotKey`, 'missing_pattern_slot', `Pattern field references missing slotKey: ${field.slotKey}`));
      }
    });
  });

  const valid = errors.length === 0;
  const score = Math.max(0, 100 - errors.length * 10 - warnings.length * 2);
  return { valid, errors, warnings, score };
}
