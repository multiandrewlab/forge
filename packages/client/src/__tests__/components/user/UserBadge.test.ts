import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UserBadge from '../../../components/user/UserBadge.vue';
import type { UserProfileBadge } from '@forge/shared';

describe('UserBadge', () => {
  // --- top_contributor badge ---

  it('renders top_contributor badge with star icon and label', () => {
    const badge: UserProfileBadge = { type: 'top_contributor', label: 'Top Contributor', rank: 1 };
    const wrapper = mount(UserBadge, { props: { badge } });

    expect(wrapper.text()).toContain('Top Contributor');
    // Star icon should use fill="currentColor"
    const svg = wrapper.find('svg');
    expect(svg.exists()).toBe(true);
    expect(svg.attributes('fill')).toBe('currentColor');
  });

  it('applies gold color for rank 1', () => {
    const badge: UserProfileBadge = { type: 'top_contributor', label: '#1 Contributor', rank: 1 };
    const wrapper = mount(UserBadge, { props: { badge } });

    const pill = wrapper.find('[data-testid="badge-pill"]');
    expect(pill.classes()).toContain('bg-yellow-400/10');
    expect(pill.classes()).toContain('text-yellow-300');

    const svg = wrapper.find('svg');
    expect(svg.classes()).toContain('text-yellow-400');
  });

  it('applies silver color for rank 2', () => {
    const badge: UserProfileBadge = { type: 'top_contributor', label: '#2 Contributor', rank: 2 };
    const wrapper = mount(UserBadge, { props: { badge } });

    const svg = wrapper.find('svg');
    expect(svg.classes()).toContain('text-gray-300');
  });

  it('applies bronze color for rank 3', () => {
    const badge: UserProfileBadge = { type: 'top_contributor', label: '#3 Contributor', rank: 3 };
    const wrapper = mount(UserBadge, { props: { badge } });

    const svg = wrapper.find('svg');
    expect(svg.classes()).toContain('text-amber-600');
  });

  it('defaults to gold color when rank is omitted', () => {
    const badge: UserProfileBadge = { type: 'top_contributor', label: 'Contributor' };
    const wrapper = mount(UserBadge, { props: { badge } });

    const svg = wrapper.find('svg');
    expect(svg.classes()).toContain('text-yellow-400');
  });

  it('shows tooltip for top_contributor badge', () => {
    const badge: UserProfileBadge = { type: 'top_contributor', label: 'Top Contributor', rank: 1 };
    const wrapper = mount(UserBadge, { props: { badge } });

    const pill = wrapper.find('[data-testid="badge-pill"]');
    expect(pill.attributes('title')).toBe('Top 3 contributor by total votes received');
  });

  // --- tag_expert badge ---

  it('renders tag_expert badge with tag icon and label', () => {
    const badge: UserProfileBadge = { type: 'tag_expert', label: 'TypeScript Expert' };
    const wrapper = mount(UserBadge, { props: { badge } });

    expect(wrapper.text()).toContain('TypeScript Expert');

    const pill = wrapper.find('[data-testid="badge-pill"]');
    expect(pill.classes()).toContain('bg-primary/10');
    expect(pill.classes()).toContain('text-primary');

    // Tag icon should use stroke="currentColor"
    const svg = wrapper.find('svg');
    expect(svg.exists()).toBe(true);
    expect(svg.attributes('stroke')).toBe('currentColor');
  });

  it('shows tooltip for tag_expert badge', () => {
    const badge: UserProfileBadge = { type: 'tag_expert', label: 'TypeScript Expert' };
    const wrapper = mount(UserBadge, { props: { badge } });

    const pill = wrapper.find('[data-testid="badge-pill"]');
    expect(pill.attributes('title')).toBe('This user is the top contributor for this tag');
  });
});
