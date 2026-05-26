import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'output', 'semantic-lowcode-smoke');

execFileSync('npx', [
  'tsc',
  '--ignoreConfig',
  '--module', 'ES2022',
  '--moduleResolution', 'Bundler',
  '--target', 'ES2022',
  '--outDir', outDir,
  '--rootDir', root,
  '--skipLibCheck',
  '--strict',
  '--esModuleInterop',
  '--noEmit', 'false',
  'shared/agent/fixtures/blankDocument.ts',
  'shared/agent/fixtures/seedDocuments.ts',
  'shared/agent/types.ts',
  'shared/agent/errors/agentErrors.ts',
  'shared/agent/template/templateProfile.ts',
  'shared/agent/template/templateSecurity.ts',
  'shared/agent/template/buildTemplateProfile.ts',
  'shared/agent/template/templateProfileOverride.ts',
  'shared/agent/template/validateTemplateProfile.ts',
  'shared/agent/template/templateProfileResolver.ts',
  'shared/agent/template/profileCache.ts',
  'shared/agent/specs/pageSpec.ts',
  'shared/agent/specs/editSpec.ts',
  'shared/agent/compiler/semanticInstructionCompiler.ts',
  'shared/agent/editor/applyEditorInstructions.ts',
  'shared/agent/editor/concurrencyControl.ts',
  'shared/agent/editor/atomicOperations.ts',
  'shared/agent/validation/widgetSafety.ts',
  'shared/agent/validation/themeLayoutValidator.ts',
], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });

function patchEsmImports(dir) {
  for (const entry of readdirSync(dir)) {
    const file = resolve(dir, entry);
    if (statSync(file).isDirectory()) {
      patchEsmImports(file);
      continue;
    }
    if (!file.endsWith('.js')) continue;
    let source = readFileSync(file, 'utf8');
    source = source.replace(/from '([^']+)'/g, (match, specifier) => {
      if (!specifier.startsWith('.')) return match;
      if (specifier.endsWith('.js')) return match;
      return `from '${specifier}.js'`;
    });
    writeFileSync(file, source);
  }
}

patchEsmImports(resolve(outDir, 'shared'));

const { createCommerceMarketDocument } = await import(pathToFileURL(resolve(outDir, 'shared/agent/fixtures/seedDocuments.js')));
const { buildTemplateProfile } = await import(pathToFileURL(resolve(outDir, 'shared/agent/template/buildTemplateProfile.js')));
const { validateTemplateProfile } = await import(pathToFileURL(resolve(outDir, 'shared/agent/template/validateTemplateProfile.js')));
const { applyTemplateProfileOverride } = await import(pathToFileURL(resolve(outDir, 'shared/agent/template/templateProfileOverride.js')));
const { compileSemanticEditorInstruction } = await import(pathToFileURL(resolve(outDir, 'shared/agent/compiler/semanticInstructionCompiler.js')));
const { applyEditorAiEditInstructions } = await import(pathToFileURL(resolve(outDir, 'shared/agent/editor/applyEditorInstructions.js')));
const { profileCache } = await import(pathToFileURL(resolve(outDir, 'shared/agent/template/profileCache.js')));
const { concurrencyControl } = await import(pathToFileURL(resolve(outDir, 'shared/agent/editor/concurrencyControl.js')));
const { atomicOperationManager } = await import(pathToFileURL(resolve(outDir, 'shared/agent/editor/atomicOperations.js')));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const document = createCommerceMarketDocument();
const profile = buildTemplateProfile(document);
const validation = validateTemplateProfile(document, profile);
assert(validation.valid, `profile invalid: ${validation.errors.map((error) => error.message).join('; ')}`);
assert(profile.pages.length >= 3, 'profile should include pages');
assert(profile.slots.length > 0, 'profile should include slots');
assert(profile.patterns.length > 0, 'profile should include patterns');

const titleSlot = profile.slots.find((slot) => slot.nodeId === 'home-title' && slot.editableProps.includes('text'));
assert(titleSlot, 'home title slot not found');

const compiledSlot = compileSemanticEditorInstruction(document, {
  type: 'update_slot',
  slotKey: titleSlot.slotKey,
  props: { text: '新品上市' },
});
assert(compiledSlot.success, `slot compile failed: ${JSON.stringify(compiledSlot.error)}`);
assert(compiledSlot.data.operations[0].type === 'update_props', 'slot should compile to update_props');

const appliedSlot = applyEditorAiEditInstructions(document, [
  { type: 'update_slot', slotKey: titleSlot.slotKey, props: { text: '新品上市' } },
]);
assert(appliedSlot.errors.length === 0, `slot apply failed: ${appliedSlot.errors.join('; ')}`);
assert(JSON.stringify(appliedSlot.document).includes('新品上市'), 'updated text should exist');

const createPage = applyEditorAiEditInstructions(document, [
  { type: 'create_page_from_page_kind', pageKind: 'order', name: '待收货', syncNavigation: true },
]);
assert(createPage.errors.length === 0, `create page failed: ${createPage.errors.join('; ')}`);
assert(createPage.document.pages.some((page) => page.name === '待收货'), 'new page should exist');

const productPattern = profile.patterns.find((pattern) => pattern.sourceRootNodeId === 'home-card-title' || pattern.parentNodeId === 'home-product-panel');
assert(productPattern, 'product pattern not found');
const filled = applyEditorAiEditInstructions(document, [
  {
    type: 'fill_pattern',
    patternKey: productPattern.patternKey,
    replaceExisting: true,
    items: [
      { title: '海南芒果', text: '海南芒果', label: '热卖' },
      { title: '新疆苹果', text: '新疆苹果', label: '新品' },
      { title: '云南蓝莓', text: '云南蓝莓', label: '限时' },
    ],
  },
]);
assert(filled.errors.length === 0, `fill pattern failed: ${filled.errors.join('; ')}`);
const filledHome = filled.document.pages.find((page) => page.id === 'home');
const filledJson = JSON.stringify(filledHome);
assert(filledJson.includes('海南芒果'), 'first cloned pattern item should exist');
assert(filledJson.includes('新疆苹果'), 'second cloned pattern item should exist');
assert(filledJson.includes('home-card-title-item-1'), 'cloned node id should be generated from source');

const overrideProfile = applyTemplateProfileOverride(profile, {
  slots: [{
    slotKey: titleSlot.slotKey,
    pageKey: titleSlot.pageKey,
    nodeId: titleSlot.nodeId,
    component: titleSlot.component,
    editableProps: ['text'],
    label: '人工覆盖后的首页标题',
  }],
  patterns: [{
    patternKey: 'home.manual-products.pattern',
    pageKey: 'home',
    regionKey: productPattern.regionKey,
    sourceRootNodeId: productPattern.sourceRootNodeId,
    parentNodeId: productPattern.parentNodeId,
    fields: productPattern.fields,
    maxItems: 8,
  }],
  constraints: { maxColumns: 2 },
});
assert(overrideProfile.slots.find((slot) => slot.slotKey === titleSlot.slotKey)?.label === '人工覆盖后的首页标题', 'override should patch slot');
assert(overrideProfile.patterns.some((pattern) => pattern.patternKey === 'home.manual-products.pattern'), 'override should add pattern');
assert(overrideProfile.constraints.maxColumns === 2, 'override should merge constraints');
assert(validateTemplateProfile(document, overrideProfile).valid, 'override profile should remain valid');

profileCache.clear();
profileCache.getProfile(document);
profileCache.getProfile(document);
const metrics = profileCache.metrics();
assert(metrics.hits >= 1, 'profile cache should hit second access');

concurrencyControl.clear();
const version = concurrencyControl.initializeVersion(document);
assert(concurrencyControl.checkVersion(document.themeId, version.version).success, 'version should match');
concurrencyControl.incrementVersion(document);
assert(!concurrencyControl.checkVersion(document.themeId, version.version).success, 'old version should conflict');
const lock = concurrencyControl.acquireLock(document.themeId, 'session-a', 'test');
assert(lock.success, 'first lock should succeed');
const lock2 = concurrencyControl.acquireLock(document.themeId, 'session-b', 'test');
assert(!lock2.success, 'second lock should fail');
concurrencyControl.releaseLock(document.themeId, lock.data.lockId);

atomicOperationManager.clear();
const operationId = atomicOperationManager.createAtomicOperation(document, 'session-a', [
  {
    stepId: 'rename-theme',
    description: 'rename theme',
    execute: (ctx) => ({ ...ctx, themeName: '原子操作测试' }),
  },
]);
const atomicResult = await atomicOperationManager.executeAtomicOperation(operationId);
assert(atomicResult.success, `atomic operation failed: ${JSON.stringify(atomicResult.error)}`);
assert(atomicResult.data.themeName === '原子操作测试', 'atomic result should update themeName');

console.log(JSON.stringify({
  ok: true,
  pages: profile.pages.length,
  slots: profile.slots.length,
  patterns: profile.patterns.length,
  cache: metrics,
}, null, 2));
