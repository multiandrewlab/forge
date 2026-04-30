import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LinkPreviewCard from '../../../components/post/LinkPreviewCard.vue';
import type { LinkPreview } from '@forge/shared';

const baseLinkPreview: LinkPreview = {
  title: 'Example Article Title',
  description: 'A short description of the article content.',
  image: 'https://example.com/thumb.jpg',
  readingTime: 5,
};

const baseProps = {
  linkUrl: 'https://example.com/article',
  linkPreview: baseLinkPreview,
  isAuthor: false,
};

describe('LinkPreviewCard', () => {
  // --- Root testid (#64) ---

  it('renders the data-testid="link-preview-card" on the root element when linkPreview is set', () => {
    const wrapper = mount(LinkPreviewCard, { props: baseProps });
    expect(wrapper.find('[data-testid="link-preview-card"]').exists()).toBe(true);
  });

  it('renders the data-testid="link-preview-card" on the root element in the fallback branch', () => {
    const wrapper = mount(LinkPreviewCard, { props: { ...baseProps, linkPreview: null } });
    expect(wrapper.find('[data-testid="link-preview-card"]').exists()).toBe(true);
  });

  // --- With linkPreview data ---

  it('renders title from linkPreview', () => {
    const wrapper = mount(LinkPreviewCard, { props: baseProps });
    expect(wrapper.text()).toContain('Example Article Title');
  });

  it('renders description from linkPreview', () => {
    const wrapper = mount(LinkPreviewCard, { props: baseProps });
    expect(wrapper.text()).toContain('A short description of the article content.');
  });

  it('renders image with lazy loading attribute', () => {
    const wrapper = mount(LinkPreviewCard, { props: baseProps });
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/thumb.jpg');
    expect(img.attributes('loading')).toBe('lazy');
  });

  it('renders reading time', () => {
    const wrapper = mount(LinkPreviewCard, { props: baseProps });
    expect(wrapper.text()).toContain('5 min read');
  });

  it('renders domain extracted from URL', () => {
    const wrapper = mount(LinkPreviewCard, { props: baseProps });
    expect(wrapper.text()).toContain('example.com');
  });

  it('link has correct href, target, and rel attributes', () => {
    const wrapper = mount(LinkPreviewCard, { props: baseProps });
    const link = wrapper.find('a');
    expect(link.attributes('href')).toBe('https://example.com/article');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noopener noreferrer');
  });

  // --- Refresh button ---

  it('does not show refresh button when isAuthor is false', () => {
    const wrapper = mount(LinkPreviewCard, { props: baseProps });
    expect(wrapper.find('[data-testid="refresh-preview"]').exists()).toBe(false);
  });

  it('shows refresh button when isAuthor is true', () => {
    const wrapper = mount(LinkPreviewCard, { props: { ...baseProps, isAuthor: true } });
    expect(wrapper.find('[data-testid="refresh-preview"]').exists()).toBe(true);
  });

  it('emits refresh event when refresh button is clicked', async () => {
    const wrapper = mount(LinkPreviewCard, { props: { ...baseProps, isAuthor: true } });
    await wrapper.find('[data-testid="refresh-preview"]').trigger('click');
    expect(wrapper.emitted('refresh')).toHaveLength(1);
  });

  // --- Fallback: linkPreview is null ---

  it('renders URL as link when linkPreview is null', () => {
    const wrapper = mount(LinkPreviewCard, {
      props: { ...baseProps, linkPreview: null },
    });
    const link = wrapper.find('a');
    expect(link.attributes('href')).toBe('https://example.com/article');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noopener noreferrer');
    expect(wrapper.text()).toContain('https://example.com/article');
  });

  // --- Image error handling ---

  it('shows placeholder when image fails to load', async () => {
    const wrapper = mount(LinkPreviewCard, { props: baseProps });
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(wrapper.find('[data-testid="image-placeholder"]').exists()).toBe(false);

    await img.trigger('error');

    expect(wrapper.find('[data-testid="image-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('shows placeholder when image is null', () => {
    const noImagePreview: LinkPreview = { ...baseLinkPreview, image: null };
    const wrapper = mount(LinkPreviewCard, {
      props: { ...baseProps, linkPreview: noImagePreview },
    });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('[data-testid="image-placeholder"]').exists()).toBe(true);
  });

  // --- Edge cases ---

  it('does not render reading time when readingTime is null', () => {
    const noTimePreview: LinkPreview = { ...baseLinkPreview, readingTime: null };
    const wrapper = mount(LinkPreviewCard, {
      props: { ...baseProps, linkPreview: noTimePreview },
    });
    expect(wrapper.text()).not.toContain('min read');
  });

  it('extracts domain from URL with path', () => {
    const wrapper = mount(LinkPreviewCard, {
      props: { ...baseProps, linkUrl: 'https://blog.example.org/post/123?q=test' },
    });
    expect(wrapper.text()).toContain('blog.example.org');
  });

  it('falls back to raw linkUrl when URL is malformed', () => {
    const wrapper = mount(LinkPreviewCard, {
      props: { ...baseProps, linkUrl: 'not-a-valid-url' },
    });
    expect(wrapper.text()).toContain('not-a-valid-url');
  });
});
