import type { AgentEditError, AgentEditResult } from '../errors/agentErrors';
import type {
  TemplateProfile,
  TemplateProfilePage,
  TemplateProfilePattern,
  TemplateProfileRegion,
  TemplateProfileSlot,
} from './templateProfile';

function ok<T>(data: T): AgentEditResult<T> {
  return { success: true, data };
}

function fail<T>(error: AgentEditError): AgentEditResult<T> {
  return { success: false, error };
}

export function resolvePageByKind(profile: TemplateProfile, pageKind: string): AgentEditResult<TemplateProfilePage> {
  const exact = profile.pages.find((page) => page.pageKind === pageKind);
  if (exact) { return ok(exact); }
  const fuzzy = profile.pages.find((page) => page.pageKind.includes(pageKind) || pageKind.includes(page.pageKind));
  if (fuzzy) { return ok(fuzzy); }
  return fail({
    code: 'page_kind_not_found',
    pageKind,
    availablePageKinds: Array.from(new Set(profile.pages.map((page) => page.pageKind))),
    recoverable: true,
  });
}

export function resolvePageByKey(profile: TemplateProfile, pageKey: string): AgentEditResult<TemplateProfilePage> {
  const page = profile.pages.find((item) => item.pageKey === pageKey);
  if (page) { return ok(page); }
  return fail({
    code: 'page_kind_not_found',
    pageKind: pageKey,
    availablePageKinds: profile.pages.map((item) => item.pageKey),
    recoverable: true,
  });
}

export function resolveRegion(profile: TemplateProfile, regionKey: string): AgentEditResult<TemplateProfileRegion> {
  const region = profile.regions.find((item) => item.regionKey === regionKey);
  if (region) { return ok(region); }
  return fail({
    code: 'region_not_found',
    regionKey,
    availableRegions: profile.regions.map((item) => item.regionKey),
    recoverable: true,
  });
}

export function resolveSlot(profile: TemplateProfile, slotKey: string): AgentEditResult<TemplateProfileSlot> {
  const slot = profile.slots.find((item) => item.slotKey === slotKey);
  if (slot) { return ok(slot); }
  return fail({
    code: 'slot_not_found',
    slotKey,
    availableSlots: profile.slots.map((item) => item.slotKey),
    recoverable: true,
  });
}

export function resolvePattern(profile: TemplateProfile, patternKey: string): AgentEditResult<TemplateProfilePattern> {
  const pattern = profile.patterns.find((item) => item.patternKey === patternKey);
  if (pattern) { return ok(pattern); }
  return fail({
    code: 'pattern_not_found',
    patternKey,
    availablePatterns: profile.patterns.map((item) => item.patternKey),
    recoverable: true,
  });
}

export function resolveEditableProps(profile: TemplateProfile, slotKey: string): AgentEditResult<string[]> {
  const slotResult = resolveSlot(profile, slotKey);
  if (!slotResult.success) {
    return { success: false, error: slotResult.error };
  }
  return ok(slotResult.data?.editableProps ?? []);
}

export function listProfileCapabilities(profile: TemplateProfile) {
  return {
    pageKinds: Array.from(new Set(profile.pages.map((page) => page.pageKind))),
    pageKeys: profile.pages.map((page) => page.pageKey),
    regionKeys: profile.regions.map((region) => region.regionKey),
    slotKeys: profile.slots.map((slot) => slot.slotKey),
    patternKeys: profile.patterns.map((pattern) => pattern.patternKey),
    devices: profile.devices,
  };
}
