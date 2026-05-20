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
  return [{
    id: layoutDocument.defaultPageId ?? layoutDocument.layout.id,
    name: layoutDocument.pageName ?? layoutDocument.defaultPageId ?? layoutDocument.layout.id,
    layout: layoutDocument.layout,
  }];
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

  await checked('login with admin challenge-response', async () => {
    const challenge = await request('/users/auth/challenge');
    assert(challenge.res.ok, `challenge returned ${challenge.res.status}`);
    const nonce = challenge.data.nonce;
    assert(typeof nonce === 'string' && nonce.length > 0, 'missing nonce');

    const password = sha256(nonce + sha256(rawPassword));
    const login = await request('/users/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: username, password, nonce }),
    });
    assert(login.res.ok, `login returned ${login.res.status}: ${login.data.message ?? ''}`);
    assert(typeof login.data.accessToken === 'string', 'missing accessToken');
    assert(login.data.user?.username === username, 'unexpected login user');
    token = login.data.accessToken;
    currentUser = login.data.user;
    return `user=${currentUser.id}`;
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
    testPage.layout.children = [{
      id: testNodeId,
      alias: layoutDocument.components?.find((item) => item.kind === 'component')?.alias
        ?? layoutDocument.components?.[0]?.alias
        ?? testPage.layout.alias,
      layout: { mode: 'flow' },
      props: { title: '集成测试元素', text: 'create' },
      children: [],
    }];

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
    const updatedPage = normalizeDocumentPages(verify.data.layoutDocument)
      .find((item) => item.id === testPageId);
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
    const updatedPage = normalizeDocumentPages(verify.data.layoutDocument)
      .find((item) => item.id === testPageId);
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
