import type {
  TemplateProfile,
  TemplateProfileConstraints,
  TemplateProfileNavigation,
  TemplateProfilePage,
  TemplateProfilePattern,
  TemplateProfileRegion,
  TemplateProfileSlot,
} from './templateProfile';

export interface TemplateProfileOverride {
  templateId?: string;
  templateVersion?: string;
  profileVersion?: string;
  devices?: TemplateProfile['devices'];
  pages?: Partial<TemplateProfilePage>[];
  regions?: Partial<TemplateProfileRegion>[];
  slots?: Partial<TemplateProfileSlot>[];
  patterns?: Partial<TemplateProfilePattern>[];
  navigation?: TemplateProfileNavigation | null;
  constraints?: TemplateProfileConstraints;
}

function mergePages(
  base: TemplateProfilePage[],
  override: Partial<TemplateProfilePage>[] | undefined,
): TemplateProfilePage[] {
  if (!override?.length) {return base;}
  const merged = base.map((item) => ({ ...item }));
  for (const patch of override) {
    if (!patch.pageKey) {continue;}
    const index = merged.findIndex((item) => item.pageKey === patch.pageKey);
    if (index >= 0) {merged[index] = { ...merged[index], ...patch };}
    else {merged.push(patch as TemplateProfilePage);}
  }
  return merged;
}

function mergeRegions(
  base: TemplateProfileRegion[],
  override: Partial<TemplateProfileRegion>[] | undefined,
): TemplateProfileRegion[] {
  if (!override?.length) {return base;}
  const merged = base.map((item) => ({ ...item }));
  for (const patch of override) {
    if (!patch.regionKey) {continue;}
    const index = merged.findIndex((item) => item.regionKey === patch.regionKey);
    if (index >= 0) {merged[index] = { ...merged[index], ...patch };}
    else {merged.push(patch as TemplateProfileRegion);}
  }
  return merged;
}

function mergeSlots(
  base: TemplateProfileSlot[],
  override: Partial<TemplateProfileSlot>[] | undefined,
): TemplateProfileSlot[] {
  if (!override?.length) {return base;}
  const merged = base.map((item) => ({ ...item }));
  for (const patch of override) {
    if (!patch.slotKey) {continue;}
    const index = merged.findIndex((item) => item.slotKey === patch.slotKey);
    if (index >= 0) {merged[index] = { ...merged[index], ...patch };}
    else {merged.push(patch as TemplateProfileSlot);}
  }
  return merged;
}

function mergePatterns(
  base: TemplateProfilePattern[],
  override: Partial<TemplateProfilePattern>[] | undefined,
): TemplateProfilePattern[] {
  if (!override?.length) {return base;}
  const merged = base.map((item) => ({ ...item }));
  for (const patch of override) {
    if (!patch.patternKey) {continue;}
    const index = merged.findIndex((item) => item.patternKey === patch.patternKey);
    if (index >= 0) {merged[index] = { ...merged[index], ...patch };}
    else {merged.push(patch as TemplateProfilePattern);}
  }
  return merged;
}

export function applyTemplateProfileOverride(
  baseProfile: TemplateProfile,
  override?: TemplateProfileOverride | null,
): TemplateProfile {
  if (!override) {
    return baseProfile;
  }
  return {
    ...baseProfile,
    templateId: override.templateId ?? baseProfile.templateId,
    templateVersion: override.templateVersion ?? baseProfile.templateVersion,
    profileVersion: override.profileVersion ?? baseProfile.profileVersion,
    devices: override.devices ?? baseProfile.devices,
    pages: mergePages(baseProfile.pages, override.pages),
    regions: mergeRegions(baseProfile.regions, override.regions),
    slots: mergeSlots(baseProfile.slots, override.slots),
    patterns: mergePatterns(baseProfile.patterns, override.patterns),
    navigation: override.navigation === null ? undefined : override.navigation ?? baseProfile.navigation,
    constraints: override.constraints
      ? { ...(baseProfile.constraints ?? {}), ...override.constraints }
      : baseProfile.constraints,
  };
}

export function parseTemplateProfileOverride(value: unknown): TemplateProfileOverride {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('TemplateProfileOverride must be an object');
  }
  return value;
}
