import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SearchPagination from '../../../components/search/SearchPagination.vue';

describe('<SearchPagination>', () => {
  it('hidden when totalPages <= 1', () => {
    const w0 = mount(SearchPagination, { props: { page: 1, totalPages: 0 } });
    const w1 = mount(SearchPagination, { props: { page: 1, totalPages: 1 } });
    expect(w0.find('[data-testid="search-pagination"]').exists()).toBe(false);
    expect(w1.find('[data-testid="search-pagination"]').exists()).toBe(false);
  });

  it('renders page-indicator with "page X of Y"', () => {
    const w = mount(SearchPagination, { props: { page: 2, totalPages: 5 } });
    expect(w.get('[data-testid="page-indicator"]').text()).toContain('page 2 of 5');
  });

  it('Prev disabled at page 1', () => {
    const w = mount(SearchPagination, { props: { page: 1, totalPages: 3 } });
    expect(w.get('[data-testid="prev-page-btn"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="next-page-btn"]').attributes('disabled')).toBeUndefined();
  });

  it('Next disabled at page = totalPages', () => {
    const w = mount(SearchPagination, { props: { page: 3, totalPages: 3 } });
    expect(w.get('[data-testid="next-page-btn"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="prev-page-btn"]').attributes('disabled')).toBeUndefined();
  });

  it('emits change(page+1) on Next click', async () => {
    const w = mount(SearchPagination, { props: { page: 1, totalPages: 3 } });
    await w.get('[data-testid="next-page-btn"]').trigger('click');
    expect(w.emitted('change')).toEqual([[2]]);
  });

  it('emits change(page-1) on Prev click', async () => {
    const w = mount(SearchPagination, { props: { page: 3, totalPages: 3 } });
    await w.get('[data-testid="prev-page-btn"]').trigger('click');
    expect(w.emitted('change')).toEqual([[2]]);
  });
});
