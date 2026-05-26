import type { LayoutPropDescriptor } from '../layout/types';
import {
  componentDisplayNameMap,
  optionDisplayNameMap,
  propDisplayNameMap,
} from './displayText.content';

export function getComponentDisplayName(alias: string, fallback?: string) {
  return componentDisplayNameMap[alias] ?? fallback ?? alias;
}

export function getPropDisplayName(prop: LayoutPropDescriptor) {
  return prop.label ?? prop.description ?? propDisplayNameMap[prop.name] ?? prop.name;
}

export function getOptionDisplayName(option: string) {
  return optionDisplayNameMap[option] ?? option;
}
