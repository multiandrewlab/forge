import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SearchResultGroup from '../../../components/search/SearchResultGroup.vue';
import SearchResultItem from '../../../components/search/SearchResultItem.vue';
import type { SearchSnippet, UserSummary, AiAction } from '@forge/shared';

const snippets: SearchSnippet[] = [
  {
    id: 's1',
    title: 'First Snippet',
    contentType: 'snippet',
    language: 'typescript',
    excerpt: 'First excerpt',
    authorId: 'u1',
    authorDisplayName: 'Alice',
    authorAvatarUrl: null,
    rank: 1,
    matchedBy: 'tsvector',
  },
  {
    id: 's2',
    title: 'Second Snippet',
    contentType: 'document',
    language: null,
    excerpt: 'Second excerpt',
    authorId: 'u2',
    authorDisplayName: 'Bob',
    authorAvatarUrl: null,
    rank: 2,
    matchedBy: 'trigram',
  },
];

const people: UserSummary[] = [
  { id: 'u1', displayName: 'Alice', avatarUrl: null, postCount: 3 },
  { id: 'u2', displayName: 'Bob', avatarUrl: null, postCount: 7 },
];

const aiActions: AiAction[] = [{ label: 'Summarize', action: 'summarize', params: {} }];

describe('SearchResultGroup', () => {
  it('renders nothing when items is empty', () => {
    const wrapper = mount(SearchResultGroup, {
      props: {
        title: 'Snippets',
        items: [],
        variant: 'snippet',
        activeGlobalIndex: -1,
        startIndex: 0,
      },
    });
    expect(wrapper.html()).toBe('<!--v-if-->');
  });

  it('renders heading with title', () => {
    const wrapper = mount(SearchResultGroup, {
      props: {
        title: 'Snippets',
        items: snippets,
        variant: 'snippet',
        activeGlobalIndex: -1,
        startIndex: 0,
      },
    });
    const heading = wrapper.find('h3');
    expect(heading.exists()).toBe(true);
    expect(heading.text()).toBe('Snippets');
  });

  it('renders items in order', () => {
    const wrapper = mount(SearchResultGroup, {
      props: {
        title: 'Snippets',
        items: snippets,
        variant: 'snippet',
        activeGlobalIndex: -1,
        startIndex: 0,
      },
    });
    const items = wrapper.findAllComponents(SearchResultItem);
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain('First Snippet');
    expect(items[1].text()).toContain('Second Snippet');
  });

  it('computes active correctly: first item active', () => {
    const wrapper = mount(SearchResultGroup, {
      props: {
        title: 'Snippets',
        items: snippets,
        variant: 'snippet',
        activeGlobalIndex: 3,
        startIndex: 3,
      },
    });
    const items = wrapper.findAllComponents(SearchResultItem);
    expect(items[0].props('active')).toBe(true);
    expect(items[1].props('active')).toBe(false);
  });

  it('computes active correctly: second item active', () => {
    const wrapper = mount(SearchResultGroup, {
      props: {
        title: 'Snippets',
        items: snippets,
        variant: 'snippet',
        activeGlobalIndex: 4,
        startIndex: 3,
      },
    });
    const items = wrapper.findAllComponents(SearchResultItem);
    expect(items[0].props('active')).toBe(false);
    expect(items[1].props('active')).toBe(true);
  });

  it('computes active correctly: no item active', () => {
    const wrapper = mount(SearchResultGroup, {
      props: {
        title: 'Snippets',
        items: snippets,
        variant: 'snippet',
        activeGlobalIndex: 99,
        startIndex: 0,
      },
    });
    const items = wrapper.findAllComponents(SearchResultItem);
    expect(items[0].props('active')).toBe(false);
    expect(items[1].props('active')).toBe(false);
  });

  it('bubbles select event with global index when first item clicked', async () => {
    const wrapper = mount(SearchResultGroup, {
      props: {
        title: 'People',
        items: people,
        variant: 'person',
        activeGlobalIndex: -1,
        startIndex: 5,
      },
    });
    const items = wrapper.findAllComponents(SearchResultItem);
    items[0].vm.$emit('select');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.emitted('select')?.[0]).toEqual([5]);
  });

  it('bubbles select event with global index when second item clicked', async () => {
    const wrapper = mount(SearchResultGroup, {
      props: {
        title: 'People',
        items: people,
        variant: 'person',
        activeGlobalIndex: -1,
        startIndex: 5,
      },
    });
    const items = wrapper.findAllComponents(SearchResultItem);
    items[1].vm.$emit('select');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.emitted('select')?.[0]).toEqual([6]);
  });

  it('works with aiAction variant', () => {
    const wrapper = mount(SearchResultGroup, {
      props: {
        title: 'AI Actions',
        items: aiActions,
        variant: 'aiAction',
        activeGlobalIndex: 0,
        startIndex: 0,
      },
    });
    const items = wrapper.findAllComponents(SearchResultItem);
    expect(items).toHaveLength(1);
    expect(items[0].props('active')).toBe(true);
    expect(items[0].props('variant')).toBe('aiAction');
  });
});
