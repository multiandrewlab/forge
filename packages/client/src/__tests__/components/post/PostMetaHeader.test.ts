import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, RouterLinkStub } from '@vue/test-utils';
import PostMetaHeader from '../../../components/post/PostMetaHeader.vue';
import type { PostWithAuthor } from '@forge/shared';

const mockPost: PostWithAuthor = {
  id: '1',
  authorId: 'u1',
  title: 'Test Post',
  contentType: 'snippet',
  language: 'ts',
  visibility: 'public',
  isDraft: false,
  forkedFromId: null,
  linkUrl: null,
  linkPreview: null,
  voteCount: 5,
  viewCount: 10,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: 'u1', displayName: 'Test User', avatarUrl: null },
  tags: ['frontend', 'vue'],
  forkCount: 0,
  forkedFromTitle: null,
};

const defaultGlobal = { stubs: { RouterLink: RouterLinkStub } };

describe('PostMetaHeader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders post title', () => {
    const wrapper = mount(PostMetaHeader, {
      props: { post: mockPost },
      global: defaultGlobal,
    });
    expect(wrapper.text()).toContain('Test Post');
  });

  it('renders author name', () => {
    const wrapper = mount(PostMetaHeader, {
      props: { post: mockPost },
      global: defaultGlobal,
    });
    expect(wrapper.text()).toContain('Test User');
  });

  it('renders tag chips', () => {
    const wrapper = mount(PostMetaHeader, {
      props: { post: mockPost },
      global: defaultGlobal,
    });
    expect(wrapper.text()).toContain('#frontend');
    expect(wrapper.text()).toContain('#vue');
  });

  it('does not render tags section when tags is empty', () => {
    const noTagsPost = { ...mockPost, tags: [] };
    const wrapper = mount(PostMetaHeader, {
      props: { post: noTagsPost },
      global: defaultGlobal,
    });
    expect(wrapper.text()).not.toContain('#');
  });

  it('renders draft badge when isDraft is true', () => {
    const draftPost = { ...mockPost, isDraft: true };
    const wrapper = mount(PostMetaHeader, {
      props: { post: draftPost },
      global: defaultGlobal,
    });
    expect(wrapper.text()).toContain('Draft');
  });

  describe('author profile link', () => {
    function findAuthorLink(wrapper: ReturnType<typeof mount>) {
      const links = wrapper.findAllComponents(RouterLinkStub);
      const found = links.find(
        (l) =>
          (l.props('to') as { name: string; params: { id: string } }).name === 'user-profile',
      );
      if (!found) throw new Error('Author RouterLink not found');
      return found;
    }

    it('wraps author avatar and name in a RouterLink to user profile', () => {
      const wrapper = mount(PostMetaHeader, {
        props: { post: mockPost },
        global: defaultGlobal,
      });

      const authorLink = findAuthorLink(wrapper);
      expect(authorLink.props('to')).toEqual({
        name: 'user-profile',
        params: { id: 'u1' },
      });
    });

    it('renders author display name inside the profile link', () => {
      const wrapper = mount(PostMetaHeader, {
        props: { post: mockPost },
        global: defaultGlobal,
      });

      const authorLink = findAuthorLink(wrapper);
      expect(authorLink.text()).toContain('Test User');
    });
  });

  describe('fork attribution', () => {
    it('shows fork attribution with source title when forkedFromId and forkedFromTitle are set', () => {
      const forkedPost = {
        ...mockPost,
        forkedFromId: 'source-123',
        forkedFromTitle: 'Original Post Title',
      };
      const wrapper = mount(PostMetaHeader, {
        props: { post: forkedPost },
        global: defaultGlobal,
      });

      expect(wrapper.text()).toContain('Forked from');
      expect(wrapper.text()).toContain('Original Post Title');
      expect(wrapper.find('[data-testid="fork-attribution"]').exists()).toBe(true);
    });

    it('shows "a deleted post" when forkedFromId is set but forkedFromTitle is null', () => {
      const forkedPost = { ...mockPost, forkedFromId: 'source-123', forkedFromTitle: null };
      const wrapper = mount(PostMetaHeader, {
        props: { post: forkedPost },
        global: defaultGlobal,
      });

      expect(wrapper.text()).toContain('Forked from');
      expect(wrapper.text()).toContain('a deleted post');
    });

    it('does not show fork attribution when forkedFromId is null', () => {
      const wrapper = mount(PostMetaHeader, {
        props: { post: mockPost },
        global: defaultGlobal,
      });

      expect(wrapper.find('[data-testid="fork-attribution"]').exists()).toBe(false);
    });

    it('links to source post when forkedFromTitle is set', () => {
      const forkedPost = {
        ...mockPost,
        forkedFromId: 'source-123',
        forkedFromTitle: 'Original Post Title',
      };
      const wrapper = mount(PostMetaHeader, {
        props: { post: forkedPost },
        global: defaultGlobal,
      });

      const links = wrapper.findAllComponents(RouterLinkStub);
      const forkLink = links.find(
        (l) =>
          (l.props('to') as { name: string; params: { id: string } }).name === 'post-view',
      );
      if (!forkLink) throw new Error('Fork RouterLink not found');
      expect(forkLink.props('to')).toEqual({
        name: 'post-view',
        params: { id: 'source-123' },
      });
    });

    it('does not render a fork link when forkedFromTitle is null', () => {
      const forkedPost = { ...mockPost, forkedFromId: 'source-123', forkedFromTitle: null };
      const wrapper = mount(PostMetaHeader, {
        props: { post: forkedPost },
        global: defaultGlobal,
      });

      const links = wrapper.findAllComponents(RouterLinkStub);
      const forkLink = links.find(
        (l) =>
          (l.props('to') as { name: string; params: { id: string } }).name === 'post-view',
      );
      expect(forkLink).toBeUndefined();
    });
  });

  describe('timeAgo branches', () => {
    it('shows "just now" for updates less than 60 seconds ago', () => {
      const now = new Date('2026-01-15T12:00:00Z');
      vi.setSystemTime(now);
      const post = { ...mockPost, updatedAt: new Date('2026-01-15T11:59:30Z') };
      const wrapper = mount(PostMetaHeader, {
        props: { post },
        global: defaultGlobal,
      });
      expect(wrapper.text()).toContain('just now');
    });

    it('shows minutes ago for updates 1-59 minutes ago', () => {
      const now = new Date('2026-01-15T12:00:00Z');
      vi.setSystemTime(now);
      const post = { ...mockPost, updatedAt: new Date('2026-01-15T11:45:00Z') };
      const wrapper = mount(PostMetaHeader, {
        props: { post },
        global: defaultGlobal,
      });
      expect(wrapper.text()).toContain('15m ago');
    });

    it('shows hours ago for updates 1-23 hours ago', () => {
      const now = new Date('2026-01-15T12:00:00Z');
      vi.setSystemTime(now);
      const post = { ...mockPost, updatedAt: new Date('2026-01-15T09:00:00Z') };
      const wrapper = mount(PostMetaHeader, {
        props: { post },
        global: defaultGlobal,
      });
      expect(wrapper.text()).toContain('3h ago');
    });

    it('shows days ago for updates 24+ hours ago', () => {
      const now = new Date('2026-01-15T12:00:00Z');
      vi.setSystemTime(now);
      const post = { ...mockPost, updatedAt: new Date('2026-01-13T12:00:00Z') };
      const wrapper = mount(PostMetaHeader, {
        props: { post },
        global: defaultGlobal,
      });
      expect(wrapper.text()).toContain('2d ago');
    });
  });
});
