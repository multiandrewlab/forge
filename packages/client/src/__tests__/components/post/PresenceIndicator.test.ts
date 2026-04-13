import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref, computed } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { User } from '@forge/shared';

// ── Mock usePresence ──────────────────────────────────────────────────

const mockViewers = ref<User[]>([]);

vi.mock('../../../composables/usePresence.js', () => ({
  usePresence: () => ({
    viewers: computed(() => mockViewers.value),
  }),
}));

import PresenceIndicator from '../../../components/post/PresenceIndicator.vue';

// ── Helpers ───────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'alice@example.com',
    displayName: 'Alice Smith',
    avatarUrl: null,
    authProvider: 'local',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function mountComponent(postId = 'post-1') {
  return mount(PresenceIndicator, {
    props: { postId },
  });
}

describe('PresenceIndicator', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockViewers.value = [];
  });

  describe('0 viewers', () => {
    it('should render nothing when there are no viewers', () => {
      const wrapper = mountComponent();
      // The root element should be empty or not rendered
      expect(wrapper.find('[aria-label]').exists()).toBe(false);
    });
  });

  describe('3 viewers', () => {
    it('should render 3 avatar elements', () => {
      mockViewers.value = [
        makeUser({ id: 'u1', displayName: 'Alice Smith' }),
        makeUser({ id: 'u2', displayName: 'Bob Jones' }),
        makeUser({ id: 'u3', displayName: 'Carol Davis' }),
      ];

      const wrapper = mountComponent();

      const avatars = wrapper.findAll('[data-testid="presence-avatar"]');
      expect(avatars).toHaveLength(3);
    });

    it('should not show an overflow badge', () => {
      mockViewers.value = [
        makeUser({ id: 'u1', displayName: 'Alice Smith' }),
        makeUser({ id: 'u2', displayName: 'Bob Jones' }),
        makeUser({ id: 'u3', displayName: 'Carol Davis' }),
      ];

      const wrapper = mountComponent();

      expect(wrapper.find('[data-testid="presence-overflow"]').exists()).toBe(false);
    });

    it('should display correct initials for users without avatarUrl', () => {
      mockViewers.value = [
        makeUser({ id: 'u1', displayName: 'Alice Smith' }),
        makeUser({ id: 'u2', displayName: 'Bob Jones' }),
        makeUser({ id: 'u3', displayName: 'Carol Davis' }),
      ];

      const wrapper = mountComponent();

      const avatars = wrapper.findAll('[data-testid="presence-avatar"]');
      expect(avatars[0].text()).toBe('AS');
      expect(avatars[1].text()).toBe('BJ');
      expect(avatars[2].text()).toBe('CD');
    });
  });

  describe('8 viewers', () => {
    it('should render 5 avatars plus a +3 overflow badge', () => {
      mockViewers.value = Array.from({ length: 8 }, (_, i) =>
        makeUser({ id: `u${i}`, displayName: `User ${String.fromCharCode(65 + i)}` }),
      );

      const wrapper = mountComponent();

      const avatars = wrapper.findAll('[data-testid="presence-avatar"]');
      expect(avatars).toHaveLength(5);

      const overflow = wrapper.find('[data-testid="presence-overflow"]');
      expect(overflow.exists()).toBe(true);
      expect(overflow.text()).toBe('+3');
    });
  });

  describe('viewer with avatarUrl', () => {
    it('should render an <img> element for users with an avatarUrl', () => {
      mockViewers.value = [
        makeUser({
          id: 'u1',
          displayName: 'Alice Smith',
          avatarUrl: 'https://example.com/alice.jpg',
        }),
      ];

      const wrapper = mountComponent();

      const avatar = wrapper.find('[data-testid="presence-avatar"]');
      const img = avatar.find('img');
      expect(img.exists()).toBe(true);
      expect(img.attributes('src')).toBe('https://example.com/alice.jpg');
      expect(img.attributes('alt')).toBe('Alice Smith');
    });
  });

  describe('viewer without avatarUrl', () => {
    it('should render a colored circle with 2-letter initials', () => {
      mockViewers.value = [makeUser({ id: 'u1', displayName: 'Alice Smith', avatarUrl: null })];

      const wrapper = mountComponent();

      const avatar = wrapper.find('[data-testid="presence-avatar"]');
      expect(avatar.text()).toBe('AS');
      // Should not have an img
      expect(avatar.find('img').exists()).toBe(false);
    });

    it('should handle single-word names', () => {
      mockViewers.value = [makeUser({ id: 'u1', displayName: 'Alice', avatarUrl: null })];

      const wrapper = mountComponent();

      const avatar = wrapper.find('[data-testid="presence-avatar"]');
      expect(avatar.text()).toBe('AL');
    });
  });

  describe('accessibility', () => {
    it('should have an appropriate aria-label when viewers are present', () => {
      mockViewers.value = [makeUser()];

      const wrapper = mountComponent();

      const root = wrapper.find('[aria-label]');
      expect(root.exists()).toBe(true);
      expect(root.attributes('aria-label')).toMatch(/viewers/i);
    });
  });

  describe('avatar stacking styles', () => {
    it('should not have negative margin on the first avatar', () => {
      mockViewers.value = [
        makeUser({ id: 'u1', displayName: 'Alice Smith' }),
        makeUser({ id: 'u2', displayName: 'Bob Jones' }),
      ];

      const wrapper = mountComponent();

      const avatars = wrapper.findAll('[data-testid="presence-avatar"]');
      // First avatar should not have -ml-2 class
      expect(avatars[0].classes()).not.toContain('-ml-2');
    });

    it('should have negative margin on subsequent avatars', () => {
      mockViewers.value = [
        makeUser({ id: 'u1', displayName: 'Alice Smith' }),
        makeUser({ id: 'u2', displayName: 'Bob Jones' }),
      ];

      const wrapper = mountComponent();

      const avatars = wrapper.findAll('[data-testid="presence-avatar"]');
      expect(avatars[1].classes()).toContain('-ml-2');
    });
  });

  describe('exactly 5 viewers', () => {
    it('should render all 5 avatars with no overflow badge', () => {
      mockViewers.value = Array.from({ length: 5 }, (_, i) =>
        makeUser({ id: `u${i}`, displayName: `User ${String.fromCharCode(65 + i)}` }),
      );

      const wrapper = mountComponent();

      const avatars = wrapper.findAll('[data-testid="presence-avatar"]');
      expect(avatars).toHaveLength(5);
      expect(wrapper.find('[data-testid="presence-overflow"]').exists()).toBe(false);
    });
  });

  describe('exactly 6 viewers', () => {
    it('should render 5 avatars with a +1 overflow badge', () => {
      mockViewers.value = Array.from({ length: 6 }, (_, i) =>
        makeUser({ id: `u${i}`, displayName: `User ${String.fromCharCode(65 + i)}` }),
      );

      const wrapper = mountComponent();

      const avatars = wrapper.findAll('[data-testid="presence-avatar"]');
      expect(avatars).toHaveLength(5);

      const overflow = wrapper.find('[data-testid="presence-overflow"]');
      expect(overflow.exists()).toBe(true);
      expect(overflow.text()).toBe('+1');
    });
  });
});
