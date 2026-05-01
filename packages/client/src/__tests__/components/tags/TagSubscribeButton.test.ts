import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import TagSubscribeButton from '../../../components/tags/TagSubscribeButton.vue';
import { useTagsStore } from '../../../stores/tags';
import { useAuthStore } from '../../../stores/auth';
import type { User } from '@forge/shared';

const TAG = {
  id: 'b0000000-0000-0000-0000-000000000001',
  name: 'typescript',
  postCount: 4,
};

function authenticate(): void {
  const auth = useAuthStore();
  auth.setAuth('test-token', {
    id: 'u1',
    displayName: 'Test User',
    avatarUrl: null,
  } as User);
}

describe('<TagSubscribeButton>', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('hidden when not authenticated', () => {
    const wrapper = mount(TagSubscribeButton, { props: { tag: TAG } });
    expect(wrapper.find('[data-testid^="subscribe-btn-"]').exists()).toBe(false);
  });

  it('renders Subscribe label with aria-pressed=false when not subscribed', () => {
    authenticate();
    const tags = useTagsStore();
    tags.setSubscribedTags([]);
    const wrapper = mount(TagSubscribeButton, { props: { tag: TAG } });
    const btn = wrapper.get(`[data-testid="subscribe-btn-${TAG.name}"]`);
    expect(btn.text()).toContain('Subscribe');
    expect(btn.attributes('aria-pressed')).toBe('false');
  });

  it('renders Unsubscribe label with aria-pressed=true when subscribed', () => {
    authenticate();
    const tags = useTagsStore();
    tags.setSubscribedTags([TAG]);
    const wrapper = mount(TagSubscribeButton, { props: { tag: TAG } });
    const btn = wrapper.get(`[data-testid="subscribe-btn-${TAG.name}"]`);
    expect(btn.text()).toContain('Unsubscribe');
    expect(btn.attributes('aria-pressed')).toBe('true');
  });

  it('emits subscribe event on click when not subscribed', async () => {
    authenticate();
    const wrapper = mount(TagSubscribeButton, { props: { tag: TAG } });
    await wrapper.get(`[data-testid="subscribe-btn-${TAG.name}"]`).trigger('click');
    expect(wrapper.emitted('subscribe')).toBeTruthy();
  });

  it('emits unsubscribe event on click when subscribed', async () => {
    authenticate();
    const tags = useTagsStore();
    tags.setSubscribedTags([TAG]);
    const wrapper = mount(TagSubscribeButton, { props: { tag: TAG } });
    await wrapper.get(`[data-testid="subscribe-btn-${TAG.name}"]`).trigger('click');
    expect(wrapper.emitted('unsubscribe')).toBeTruthy();
  });

  it('shows aria-busy=true and is disabled while loading=true', () => {
    authenticate();
    const wrapper = mount(TagSubscribeButton, {
      props: { tag: TAG, loading: true },
    });
    const btn = wrapper.get(`[data-testid="subscribe-btn-${TAG.name}"]`);
    expect(btn.attributes('aria-busy')).toBe('true');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('renders error sibling when error prop is set', () => {
    authenticate();
    const wrapper = mount(TagSubscribeButton, {
      props: { tag: TAG, error: 'Network down' },
    });
    expect(wrapper.find(`[data-testid="subscribe-error-${TAG.name}"]`).exists()).toBe(true);
  });
});
