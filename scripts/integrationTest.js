#!/usr/bin/env node

import crypto from 'node:crypto';

const baseUrl = process.env.INTEGRATION_BASE_URL ?? 'http://localhost:4000/api';
const username = process.env.INTEGRATION_USER ?? 'admin';
const rawPassword = process.env.INTEGRATION_PASSWORD ?? 'Donle1988';

const results = [];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name}${detail ? ` - ${detail}` : ''}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { res, data };
}

function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

async function registerUniqueUser() {
  const stamp = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const username = `it_user_${stamp}`;
  const register = await request('/users/register', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password: sha256(`integration-${stamp}`),
    }),
  });
  assert(register.res.ok, `register user B returned ${register.res.status}`);
  assert(typeof register.data.accessToken === 'string', 'user B missing accessToken');
  return register.data;
}

async function loginChallengeResponse(identifier, password) {
  const challenge = await request('/users/auth/challenge');
  assert(challenge.res.ok, `challenge returned ${challenge.res.status}`);
  const nonce = challenge.data.nonce;
  assert(typeof nonce === 'string' && nonce.length > 0, 'missing nonce');

  const computedPassword = sha256(nonce + sha256(password));
  return request('/users/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password: computedPassword, nonce }),
  });
}

async function authenticateIntegrationUser() {
  const login = await loginChallengeResponse(username, rawPassword);
  if (login.res.ok) {
    return { ...login.data, detail: `user=${login.data.user.id}` };
  }

  const stamp = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const fallbackUsername = `it_primary_${stamp}`;
  const register = await request('/users/register', {
    method: 'POST',
    body: JSON.stringify({
      username: fallbackUsername,
      password: sha256(rawPassword),
    }),
  });
  assert(register.res.ok, `login returned ${login.res.status}; fallback register returned ${register.res.status}`);
  return {
    ...register.data,
    detail: `user=${register.data.user.id}, fallback=${fallbackUsername}`,
  };
}

async function checked(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (err) {
    record(name, false, err instanceof Error ? err.message : String(err));
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeDocumentPages(layoutDocument) {
  if (Array.isArray(layoutDocument.pages) && layoutDocument.pages.length > 0) {
    return layoutDocument.pages;
  }

  assert(layoutDocument.layout, 'layoutDocument has neither pages nor layout');
  return [
    {
      id: layoutDocument.defaultPageId ?? layoutDocument.layout.id,
      name: layoutDocument.pageName ?? layoutDocument.defaultPageId ?? layoutDocument.layout.id,
      layout: layoutDocument.layout,
    },
  ];
}

function findNode(node, nodeId) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (node.id === nodeId) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findNode(child, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

function ensureRootChildren(root) {
  if (!Array.isArray(root.children)) {
    root.children = [];
  }
  return root.children;
}

async function main() {
  let token = '';
  let currentUser = null;
  let ownedTemplateId = '';
  let testPageId = '';
  let testNodeId = '';
  let publishedSiteId = '';
  let publishedSubdomain = '';
  let firstRevisionId = '';
  let secondRevisionId = '';

  await checked('authenticate integration user', async () => {
    const auth = await authenticateIntegrationUser();
    assert(typeof auth.accessToken === 'string', 'missing accessToken');
    assert(auth.user?.id, 'missing authenticated user');
    token = auth.accessToken;
    currentUser = auth.user;
    return auth.detail;
  });

  await checked('reject unauthenticated user profile reads', async () => {
    assert(currentUser, 'login did not produce a user');
    const response = await request(`/users/${currentUser.id}`);
    assert(response.res.status === 401, `expected 401, got ${response.res.status}`);
    return '401 without bearer token';
  });

  await checked('read current user profile and token usage', async () => {
    const profile = await request('/users/me', { headers: authHeaders(token) });
    assert(profile.res.ok, `profile returned ${profile.res.status}`);
    assert(profile.data.id === currentUser.id, 'profile id mismatch');

    const usage = await request(`/users/${currentUser.id}/token-usage`, {
      headers: authHeaders(token),
    });
    assert(usage.res.ok, `token usage returned ${usage.res.status}`);
    assert(typeof usage.data.tokensUsed === 'number', 'tokensUsed is not numeric');
    assert(typeof usage.data.requestCount === 'number', 'requestCount is not numeric');
    return `tokensUsed=${usage.data.tokensUsed}, requests=${usage.data.requestCount}`;
  });

  await checked('create owned template copy from marketplace', async () => {
    const list = await request('/templates');
    assert(list.res.ok, `template list returned ${list.res.status}`);
    const source = list.data.data?.[0];
    assert(source?.templateId, 'no marketplace template available');

    const duplicate = await request(`/templates/${encodeURIComponent(source.templateId)}/duplicate`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    assert(duplicate.res.ok, `duplicate returned ${duplicate.res.status}: ${duplicate.data.message ?? ''}`);
    assert(duplicate.data.ownerUserId === currentUser.id, 'duplicate is not owned by current user');
    ownedTemplateId = duplicate.data.templateId;
    return `${source.templateId} -> ${ownedTemplateId}`;
  });

  await checked('publish owned template to hosted runtime site', async () => {
    publishedSubdomain = `it-${Date.now().toString(36)}`;
    const publish = await request('/sites', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        templateId: ownedTemplateId,
        subdomain: publishedSubdomain,
      }),
    });
    assert(publish.res.ok, `publish returned ${publish.res.status}: ${publish.data.message ?? ''}`);
    assert(publish.data.site?.subdomain === publishedSubdomain, 'published subdomain mismatch');
    assert(publish.data.site?.templateId === ownedTemplateId, 'published templateId mismatch');
    assert(typeof publish.data.activeRevision?.runtimeVersion === 'string', 'missing runtimeVersion');
    assert(typeof publish.data.activeRevision?.schemaVersion === 'number', 'missing schemaVersion');
    publishedSiteId = publish.data.site.id;
    firstRevisionId = publish.data.activeRevision.id;
    return `site=${publishedSiteId}, revision=${firstRevisionId}`;
  });

  await checked('resolve public hosted runtime config', async () => {
    const resolved = await request(`/public/sites/${encodeURIComponent(publishedSubdomain)}`);
    assert(resolved.res.ok, `public resolve returned ${resolved.res.status}`);
    assert(resolved.data.site?.id === publishedSiteId, 'resolved site id mismatch');
    assert(resolved.data.revision?.id === firstRevisionId, 'resolved revision id mismatch');
    assert(resolved.data.revision?.runtimeVersion, 'resolved runtimeVersion missing');
    assert(typeof resolved.data.revision?.schemaVersion === 'number', 'resolved schemaVersion missing');
    assert(resolved.data.layoutDocument?.schemaVersion, 'resolved layout schemaVersion missing');
    assert(resolved.data.runtime?.componentTemplates, 'resolved runtime componentTemplates missing');
    return `subdomain=${publishedSubdomain}`;
  });

  await checked('reject duplicate hosted subdomain', async () => {
    const duplicate = await request('/sites', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        templateId: ownedTemplateId,
        subdomain: publishedSubdomain,
      }),
    });
    assert(duplicate.res.status === 409, `expected 409, got ${duplicate.res.status}`);
    return '409 for duplicate subdomain';
  });

  await checked('list and read my hosted sites', async () => {
    const list = await request('/sites/mine', { headers: authHeaders(token) });
    assert(list.res.ok, `site list returned ${list.res.status}`);
    assert(
      list.data.data?.some((site) => site.id === publishedSiteId),
      'published site missing from mine list',
    );

    const detail = await request(`/sites/${publishedSiteId}`, { headers: authHeaders(token) });
    assert(detail.res.ok, `site detail returned ${detail.res.status}`);
    assert(detail.data.activeRevision?.id === firstRevisionId, 'site detail revision mismatch');
    return `sites=${list.data.total}`;
  });

  await checked('reject cross-user hosted site mutations', async () => {
    const userB = await registerUniqueUser();

    const republish = await request(`/sites/${publishedSiteId}/revisions`, {
      method: 'POST',
      headers: authHeaders(userB.accessToken),
    });
    assert(
      republish.res.status === 404 || republish.res.status === 403,
      `expected 403/404 for cross-user republish, got ${republish.res.status}`,
    );

    const rollback = await request(`/sites/${publishedSiteId}/rollback`, {
      method: 'POST',
      headers: authHeaders(userB.accessToken),
      body: JSON.stringify({ revisionId: firstRevisionId }),
    });
    assert(
      rollback.res.status === 404 || rollback.res.status === 403,
      `expected 403/404 for cross-user rollback, got ${rollback.res.status}`,
    );
    return `userB=${userB.user.id}`;
  });

  await checked('create page and element in owned template', async () => {
    const read = await request(`/templates/mine/${encodeURIComponent(ownedTemplateId)}`, {
      headers: authHeaders(token),
    });
    assert(read.res.ok, `read owned template returned ${read.res.status}`);

    const layoutDocument = clone(read.data.layoutDocument);
    const pages = clone(normalizeDocumentPages(layoutDocument));
    const basePage = pages[0];
    assert(basePage?.layout, 'owned template has no page layout');

    const stamp = Date.now().toString(36);
    testPageId = `it-page-${stamp}`;
    testNodeId = `it-node-${stamp}`;
    const testPage = clone(basePage);
    testPage.id = testPageId;
    testPage.name = '集成测试页面';
    testPage.layout.id = `it-root-${stamp}`;
    testPage.layout.props = {
      ...(testPage.layout.props ?? {}),
      title: '集成测试页面',
    };
    testPage.layout.children = [
      {
        id: testNodeId,
        alias: 'core.text',
        layout: { mode: 'flow' },
        props: { text: 'create', variant: 'body' },
        children: [],
      },
    ];

    layoutDocument.pages = [...pages, testPage];
    layoutDocument.defaultPageId = testPageId;
    layoutDocument.layout = testPage.layout;

    const update = await request(`/templates/mine/${encodeURIComponent(ownedTemplateId)}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ layoutDocument }),
    });
    assert(update.res.ok, `create update returned ${update.res.status}: ${update.data.message ?? ''}`);

    const verify = await request(`/templates/mine/${encodeURIComponent(ownedTemplateId)}`, {
      headers: authHeaders(token),
    });
    const page = normalizeDocumentPages(verify.data.layoutDocument).find((item) => item.id === testPageId);
    assert(page, 'created page not found');
    assert(findNode(page.layout, testNodeId), 'created element not found');
    return `page=${testPageId}, element=${testNodeId}`;
  });

  await checked('republish owned template and update public revision', async () => {
    const republish = await request(`/sites/${publishedSiteId}/revisions`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    assert(republish.res.ok, `republish returned ${republish.res.status}`);
    secondRevisionId = republish.data.activeRevision?.id;
    assert(secondRevisionId && secondRevisionId !== firstRevisionId, 'republish did not create a new revision');

    const resolved = await request(`/public/sites/${encodeURIComponent(publishedSubdomain)}`);
    assert(resolved.res.ok, `public resolve after republish returned ${resolved.res.status}`);
    assert(resolved.data.revision?.id === secondRevisionId, 'public resolver did not switch revisions');
    assert(resolved.data.layoutDocument?.defaultPageId === testPageId, 'public layout did not update');
    assert(typeof resolved.data.revision?.schemaVersion === 'number', 'republished schemaVersion missing');
    assert(resolved.data.revision?.runtimeVersion, 'republished runtimeVersion missing');
    return `revision=${secondRevisionId}`;
  });

  await checked('reject invalid template save and preserve public revision', async () => {
    const read = await request(`/templates/mine/${encodeURIComponent(ownedTemplateId)}`, {
      headers: authHeaders(token),
    });
    assert(read.res.ok, `read before invalid update returned ${read.res.status}`);
    const invalidLayoutDocument = clone(read.data.layoutDocument);
    invalidLayoutDocument.pages[0].layout.alias = 'core.unknown';

    const invalidUpdate = await request(`/templates/mine/${encodeURIComponent(ownedTemplateId)}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ layoutDocument: invalidLayoutDocument }),
    });
    assert(invalidUpdate.res.status === 400, `expected invalid save 400, got ${invalidUpdate.res.status}`);

    const resolved = await request(`/public/sites/${encodeURIComponent(publishedSubdomain)}`);
    assert(resolved.res.ok, `public resolve after invalid save returned ${resolved.res.status}`);
    assert(resolved.data.revision?.id === secondRevisionId, 'invalid save changed public revision');
    return `activeRevision=${secondRevisionId}`;
  });

  await checked('rollback hosted site to previous revision', async () => {
    const rollback = await request(`/sites/${publishedSiteId}/rollback`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ revisionId: firstRevisionId }),
    });
    assert(rollback.res.ok, `rollback returned ${rollback.res.status}`);
    assert(rollback.data.site?.activeRevisionId === firstRevisionId, 'rollback active revision mismatch');

    const resolved = await request(`/public/sites/${encodeURIComponent(publishedSubdomain)}`);
    assert(resolved.res.ok, `public resolve after rollback returned ${resolved.res.status}`);
    assert(resolved.data.revision?.id === firstRevisionId, 'public resolver did not roll back');
    assert(resolved.data.layoutDocument?.defaultPageId !== testPageId, 'rolled back layout still shows revision B');
    return `revision=${firstRevisionId}`;
  });

  await checked('update page and element in owned template', async () => {
    const read = await request(`/templates/mine/${encodeURIComponent(ownedTemplateId)}`, {
      headers: authHeaders(token),
    });
    const layoutDocument = clone(read.data.layoutDocument);
    const pages = normalizeDocumentPages(layoutDocument);
    const page = pages.find((item) => item.id === testPageId);
    assert(page, 'test page missing before update');
    const node = findNode(page.layout, testNodeId);
    assert(node, 'test element missing before update');

    page.name = '集成测试页面已更新';
    node.props = { ...(node.props ?? {}), text: 'update' };
    layoutDocument.pages = pages;
    layoutDocument.layout = page.layout;

    const update = await request(`/templates/mine/${encodeURIComponent(ownedTemplateId)}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ layoutDocument }),
    });
    assert(update.res.ok, `update returned ${update.res.status}: ${update.data.message ?? ''}`);

    const verify = await request(`/templates/mine/${encodeURIComponent(ownedTemplateId)}`, {
      headers: authHeaders(token),
    });
    const updatedPage = normalizeDocumentPages(verify.data.layoutDocument).find((item) => item.id === testPageId);
    const updatedNode = findNode(updatedPage.layout, testNodeId);
    assert(updatedPage.name === '集成测试页面已更新', 'page name was not updated');
    assert(updatedNode.props?.text === 'update', 'element props were not updated');
    return 'page name and element props updated';
  });

  await checked('delete element from owned template page', async () => {
    const read = await request(`/templates/mine/${encodeURIComponent(ownedTemplateId)}`, {
      headers: authHeaders(token),
    });
    const layoutDocument = clone(read.data.layoutDocument);
    const pages = normalizeDocumentPages(layoutDocument);
    const page = pages.find((item) => item.id === testPageId);
    assert(page, 'test page missing before element delete');
    page.layout.children = ensureRootChildren(page.layout).filter((child) => child.id !== testNodeId);
    layoutDocument.pages = pages;
    layoutDocument.layout = page.layout;

    const update = await request(`/templates/mine/${encodeURIComponent(ownedTemplateId)}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ layoutDocument }),
    });
    assert(update.res.ok, `delete element update returned ${update.res.status}`);

    const verify = await request(`/templates/mine/${encodeURIComponent(ownedTemplateId)}`, {
      headers: authHeaders(token),
    });
    const updatedPage = normalizeDocumentPages(verify.data.layoutDocument).find((item) => item.id === testPageId);
    assert(!findNode(updatedPage.layout, testNodeId), 'element still exists after delete');
    return `element=${testNodeId}`;
  });

  await checked('delete owned template test page', async () => {
    const read = await request(`/templates/mine/${encodeURIComponent(ownedTemplateId)}`, {
      headers: authHeaders(token),
    });
    const layoutDocument = clone(read.data.layoutDocument);
    const pages = normalizeDocumentPages(layoutDocument);
    const remainingPages = pages.filter((item) => item.id !== testPageId);
    assert(remainingPages.length > 0, 'cannot remove the only page');
    layoutDocument.pages = remainingPages;
    layoutDocument.defaultPageId = remainingPages[0].id;
    layoutDocument.layout = remainingPages[0].layout;

    const update = await request(`/templates/mine/${encodeURIComponent(ownedTemplateId)}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ layoutDocument }),
    });
    assert(update.res.ok, `delete page update returned ${update.res.status}`);

    const verify = await request(`/templates/mine/${encodeURIComponent(ownedTemplateId)}`, {
      headers: authHeaders(token),
    });
    assert(
      !normalizeDocumentPages(verify.data.layoutDocument).some((item) => item.id === testPageId),
      'page still exists after delete',
    );
    return `page=${testPageId}`;
  });

  await checked('persist and clear editor AI conversation', async () => {
    const messages = [
      { role: 'user', content: 'integration conversation user message' },
      { role: 'assistant', content: 'integration conversation assistant message' },
    ];
    const save = await request(`/ai/editor-conversations/${encodeURIComponent(ownedTemplateId)}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ messages }),
    });
    assert(save.res.ok, `conversation save returned ${save.res.status}`);

    const read = await request(`/ai/editor-conversations/${encodeURIComponent(ownedTemplateId)}`, {
      headers: authHeaders(token),
    });
    assert(read.res.ok, `conversation read returned ${read.res.status}`);
    assert(JSON.stringify(read.data.messages) === JSON.stringify(messages), 'conversation mismatch');

    const clear = await request(`/ai/editor-conversations/${encodeURIComponent(ownedTemplateId)}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ messages: [] }),
    });
    assert(clear.res.ok, `conversation clear returned ${clear.res.status}`);
    assert(Array.isArray(clear.data.messages) && clear.data.messages.length === 0, 'conversation was not cleared');
    return 'round trip OK';
  });

  const failed = results.filter((result) => !result.ok);
  console.log('');
  console.log(`Integration tests: ${results.length - failed.length}/${results.length} passed`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
