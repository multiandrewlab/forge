import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PostHistoryPage from '../../pages/PostHistoryPage.vue';

describe('PostHistoryPage', () => {
  it('renders the "Revision history coming soon" message', () => {
    const wrapper = mount(PostHistoryPage);
    expect(wrapper.text()).toContain('Revision history coming soon.');
  });
});
