import { PendingClarificationStore } from './pendingClarification.store';

describe('PendingClarificationStore', () => {
  it('exempts only a matching follow-up and ignores a forged choice', () => {
    const store = new PendingClarificationStore();
    store.remember('user-1', 'conv-1', [{ id: 'keep-hero' }, { id: 'replace-hero' }], false);

    expect(store.consume('user-1', 'conv-1', { id: 'forged', value: 'forged' })).toBe(false);
    expect(store.consume('user-1', 'conv-1', { id: 'keep-hero', value: 'keep the hero' })).toBe(
      true,
    );
    expect(store.consume('user-1', 'conv-1', { id: 'replace-hero', value: 'replace' })).toBe(false);
  });
});
