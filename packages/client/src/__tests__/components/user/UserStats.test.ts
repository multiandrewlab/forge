import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UserStats from '../../../components/user/UserStats.vue';
import type { UserProfileStats } from '@forge/shared';

const baseStats: UserProfileStats = {
  postCount: 42,
  totalVotes: 128,
  topTags: [
    { tagName: 'typescript', voteSum: 56 },
    { tagName: 'rust', voteSum: 34 },
  ],
};

describe('UserStats', () => {
  it('renders post count in the Posts card', () => {
    const wrapper = mount(UserStats, { props: { stats: baseStats } });

    const postsCard = wrapper.find('[data-testid="stat-posts"]');
    expect(postsCard.exists()).toBe(true);
    expect(postsCard.text()).toContain('Posts');
    expect(postsCard.text()).toContain('42');
  });

  it('renders total votes in the Votes Received card', () => {
    const wrapper = mount(UserStats, { props: { stats: baseStats } });

    const votesCard = wrapper.find('[data-testid="stat-votes"]');
    expect(votesCard.exists()).toBe(true);
    expect(votesCard.text()).toContain('Votes Received');
    expect(votesCard.text()).toContain('128');
  });

  it('renders top tags with vote counts', () => {
    const wrapper = mount(UserStats, { props: { stats: baseStats } });

    const tagsCard = wrapper.find('[data-testid="stat-tags"]');
    expect(tagsCard.exists()).toBe(true);
    expect(tagsCard.text()).toContain('Top Tags');
    expect(tagsCard.text()).toContain('typescript');
    expect(tagsCard.text()).toContain('56');
    expect(tagsCard.text()).toContain('rust');
    expect(tagsCard.text()).toContain('34');
  });

  it('shows empty state when topTags is empty', () => {
    const emptyStats: UserProfileStats = { postCount: 0, totalVotes: 0, topTags: [] };
    const wrapper = mount(UserStats, { props: { stats: emptyStats } });

    const tagsCard = wrapper.find('[data-testid="stat-tags"]');
    expect(tagsCard.text()).toContain('No tags yet');
  });

  it('uses responsive grid layout', () => {
    const wrapper = mount(UserStats, { props: { stats: baseStats } });

    const grid = wrapper.find('[data-testid="stats-grid"]');
    expect(grid.exists()).toBe(true);
    expect(grid.classes()).toContain('grid');
    expect(grid.classes()).toContain('grid-cols-1');
    expect(grid.classes()).toContain('sm:grid-cols-3');
  });
});
