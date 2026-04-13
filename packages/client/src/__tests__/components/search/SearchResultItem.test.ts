import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SearchResultItem from '../../../components/search/SearchResultItem.vue';
import type { SearchSnippet, UserSummary, AiAction } from '@forge/shared';

const snippetData: SearchSnippet = {
  id: 's1',
  title: 'My Snippet Title',
  contentType: 'snippet',
  language: 'typescript',
  excerpt: 'This is the excerpt text for the snippet result',
  authorId: 'u1',
  authorDisplayName: 'Jane Doe',
  authorAvatarUrl: null,
  rank: 1,
  matchedBy: 'tsvector',
};

const snippetNoLang: SearchSnippet = {
  id: 's2',
  title: 'No Language Snippet',
  contentType: 'document',
  language: null,
  excerpt: 'Document excerpt here',
  authorId: 'u2',
  authorDisplayName: 'Bob',
  authorAvatarUrl: null,
  rank: 2,
  matchedBy: 'trigram',
};

const personData: UserSummary = {
  id: 'u1',
  displayName: 'Jane Doe',
  avatarUrl: null,
  postCount: 5,
};

const personSingular: UserSummary = {
  id: 'u2',
  displayName: 'alice',
  avatarUrl: null,
  postCount: 1,
};

const personZero: UserSummary = {
  id: 'u3',
  displayName: 'Bob Smith Jones',
  avatarUrl: null,
  postCount: 0,
};

const aiActionData: AiAction = {
  label: 'Generate summary',
  action: 'summarize',
  params: { target: 'post' },
};

describe('SearchResultItem', () => {
  describe('snippet variant', () => {
    it('renders title, excerpt, author display name', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'snippet', data: snippetData, active: false },
      });
      expect(wrapper.text()).toContain('My Snippet Title');
      expect(wrapper.text()).toContain('This is the excerpt text for the snippet result');
      expect(wrapper.text()).toContain('Jane Doe');
    });

    it('renders language badge when language is present', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'snippet', data: snippetData, active: false },
      });
      expect(wrapper.text()).toContain('typescript');
    });

    it('does not render language badge when language is null', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'snippet', data: snippetNoLang, active: false },
      });
      // Should not have a language badge element
      expect(wrapper.find('[data-testid="language-badge"]').exists()).toBe(false);
    });

    it('renders content-type label', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'snippet', data: snippetData, active: false },
      });
      expect(wrapper.text()).toContain('snippet');
    });

    it('renders content-type label for document type', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'snippet', data: snippetNoLang, active: false },
      });
      expect(wrapper.text()).toContain('document');
    });
  });

  describe('person variant', () => {
    it('renders display name and post count (plural)', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'person', data: personData, active: false },
      });
      expect(wrapper.text()).toContain('Jane Doe');
      expect(wrapper.text()).toContain('5 posts');
    });

    it('renders singular "1 post"', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'person', data: personSingular, active: false },
      });
      expect(wrapper.text()).toContain('alice');
      expect(wrapper.text()).toContain('1 post');
      expect(wrapper.text()).not.toContain('1 posts');
    });

    it('renders "0 posts" for zero count', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'person', data: personZero, active: false },
      });
      expect(wrapper.text()).toContain('0 posts');
    });

    it('renders initials fallback from multi-word name', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'person', data: personData, active: false },
      });
      // "Jane Doe" → "JD"
      expect(wrapper.find('[data-testid="avatar-initials"]').text()).toBe('JD');
    });

    it('renders initials fallback from single-word name', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'person', data: personSingular, active: false },
      });
      // "alice" → "A"
      expect(wrapper.find('[data-testid="avatar-initials"]').text()).toBe('A');
    });

    it('renders initials capped at 2 characters from 3-word name', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'person', data: personZero, active: false },
      });
      // "Bob Smith Jones" → "BS" (first 2 initials)
      expect(wrapper.find('[data-testid="avatar-initials"]').text()).toBe('BS');
    });
  });

  describe('aiAction variant', () => {
    it('renders the icon and label', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'aiAction', data: aiActionData, active: false },
      });
      expect(wrapper.text()).toContain('Generate summary');
      // Sparkle icon (unicode or text marker)
      expect(wrapper.text()).toMatch(/✨/);
    });
  });

  describe('click emits select', () => {
    it('emits select on click for snippet', async () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'snippet', data: snippetData, active: false },
      });
      await wrapper.trigger('click');
      expect(wrapper.emitted('select')).toHaveLength(1);
      expect(wrapper.emitted('select')?.[0]).toEqual([]);
    });

    it('emits select on click for person', async () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'person', data: personData, active: false },
      });
      await wrapper.trigger('click');
      expect(wrapper.emitted('select')).toHaveLength(1);
    });

    it('emits select on click for aiAction', async () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'aiAction', data: aiActionData, active: false },
      });
      await wrapper.trigger('click');
      expect(wrapper.emitted('select')).toHaveLength(1);
    });
  });

  describe('active prop', () => {
    it('applies active class when active is true', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'snippet', data: snippetData, active: true },
      });
      expect(wrapper.classes()).toContain('bg-primary/10');
    });

    it('does not apply active class when active is false', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'snippet', data: snippetData, active: false },
      });
      expect(wrapper.classes()).not.toContain('bg-primary/10');
    });
  });

  describe('a11y', () => {
    it('has role="option"', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'snippet', data: snippetData, active: false },
      });
      expect(wrapper.attributes('role')).toBe('option');
    });

    it('aria-selected reflects active=true', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'snippet', data: snippetData, active: true },
      });
      expect(wrapper.attributes('aria-selected')).toBe('true');
    });

    it('aria-selected reflects active=false', () => {
      const wrapper = mount(SearchResultItem, {
        props: { variant: 'snippet', data: snippetData, active: false },
      });
      expect(wrapper.attributes('aria-selected')).toBe('false');
    });
  });
});
