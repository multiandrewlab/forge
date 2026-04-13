import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope } from 'vue';

describe('useKeyboard', () => {
  let useKeyboard: typeof import('@/composables/useKeyboard').useKeyboard;
  let resetForTesting: typeof import('@/composables/useKeyboard')._resetForTesting;

  beforeEach(async () => {
    vi.stubGlobal('navigator', { platform: 'Linux x86_64' });
    // Fresh import each time to reset module-level state
    vi.resetModules();
    const mod = await import('@/composables/useKeyboard');
    useKeyboard = mod.useKeyboard;
    resetForTesting = mod._resetForTesting;
  });

  afterEach(() => {
    // Clean up module-scoped state (registry + window listener)
    resetForTesting();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('platform detection', () => {
    it('should use metaKey on macOS when mod+k is registered', async () => {
      vi.stubGlobal('navigator', { platform: 'MacIntel' });
      vi.resetModules();
      const mod = await import('@/composables/useKeyboard');
      const { register } = mod.useKeyboard();

      const handler = vi.fn();
      register('mod+k', handler);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
      expect(handler).toHaveBeenCalledTimes(1);

      mod._resetForTesting();
    });

    it('should NOT fire mod+k with ctrlKey on macOS', async () => {
      vi.stubGlobal('navigator', { platform: 'MacIntel' });
      vi.resetModules();
      const mod = await import('@/composables/useKeyboard');
      const { register } = mod.useKeyboard();

      const handler = vi.fn();
      register('mod+k', handler);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
      expect(handler).not.toHaveBeenCalled();

      mod._resetForTesting();
    });

    it('should use ctrlKey on non-Mac when mod+k is registered', () => {
      const { register } = useKeyboard();
      const handler = vi.fn();
      register('mod+k', handler);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should NOT fire mod+k with metaKey on non-Mac', () => {
      const { register } = useKeyboard();
      const handler = vi.fn();
      register('mod+k', handler);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
      expect(handler).not.toHaveBeenCalled();
    });

    it('should default to ctrlKey when navigator is undefined', async () => {
      vi.stubGlobal('navigator', undefined);
      vi.resetModules();
      const mod = await import('@/composables/useKeyboard');
      const { register } = mod.useKeyboard();

      const handler = vi.fn();
      register('mod+k', handler);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
      expect(handler).toHaveBeenCalledTimes(1);

      mod._resetForTesting();
    });
  });

  describe('single-key shortcuts', () => {
    it('should fire handler for escape key', () => {
      const { register } = useKeyboard();
      const handler = vi.fn();
      register('escape', handler);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should fire handler for arrowup key', () => {
      const { register } = useKeyboard();
      const handler = vi.fn();
      register('arrowup', handler);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should fire handler for arrowdown key', () => {
      const { register } = useKeyboard();
      const handler = vi.fn();
      register('arrowdown', handler);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should fire handler for enter key', () => {
      const { register } = useKeyboard();
      const handler = vi.fn();
      register('enter', handler);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('preventDefault', () => {
    it('should call preventDefault when a match fires', () => {
      const { register } = useKeyboard();
      register('escape', vi.fn());

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        cancelable: true,
      });
      const spy = vi.spyOn(event, 'preventDefault');

      window.dispatchEvent(event);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should NOT call preventDefault when no match fires', () => {
      const { register } = useKeyboard();
      register('escape', vi.fn());

      const event = new KeyboardEvent('keydown', {
        key: 'a',
        cancelable: true,
      });
      const spy = vi.spyOn(event, 'preventDefault');

      window.dispatchEvent(event);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('unregister', () => {
    it('should not fire handler after unregister is called', () => {
      const { register } = useKeyboard();
      const handler = vi.fn();
      const unregister = register('escape', handler);

      unregister();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(handler).not.toHaveBeenCalled();
    });

    it('should be safe to call unregister multiple times', () => {
      const { register } = useKeyboard();
      const handler = vi.fn();
      const unregister = register('escape', handler);

      unregister();
      unregister(); // Should not throw

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('multiple handlers', () => {
    it('should fire all handlers for the same shortcut on a single event', () => {
      const { register } = useKeyboard();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      register('escape', handler1);
      register('escape', handler2);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should only remove the specific handler on unregister, not all', () => {
      const { register } = useKeyboard();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unregister1 = register('escape', handler1);
      register('escape', handler2);

      unregister1();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('unrelated keys', () => {
    it('should not fire registered handlers for unrelated keys', () => {
      const { register } = useKeyboard();
      const handler = vi.fn();
      register('escape', handler);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('shortcut normalization', () => {
    it('should treat different casings of the same shortcut as identical', () => {
      const { register } = useKeyboard();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      register('Mod+K', handler1);
      register('mod+k', handler2);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('window listener lifecycle', () => {
    it('should remove window listener when all handlers are unregistered', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const { register } = useKeyboard();
      const unregister1 = register('escape', vi.fn());
      const unregister2 = register('enter', vi.fn());

      expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      unregister1();
      // Still one handler, listener should NOT be removed yet
      expect(removeSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function));

      unregister2();
      // Now all handlers removed — listener should be detached
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('should re-attach listener when registering after all were removed', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');

      const { register } = useKeyboard();
      const unregister = register('escape', vi.fn());
      expect(addSpy).toHaveBeenCalledTimes(1);

      unregister();

      // Register again — should attach a new listener
      register('enter', vi.fn());
      expect(addSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('mod+k does not match bare key without modifier', () => {
    it('should NOT fire mod+k handler when k is pressed without any modifier', () => {
      const { register } = useKeyboard();
      const handler = vi.fn();
      register('mod+k', handler);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('auto-cleanup with Vue scope', () => {
    it('should auto-unregister handler when Vue effect scope is disposed', () => {
      const scope = effectScope();
      const handler = vi.fn();

      scope.run(() => {
        const { register } = useKeyboard();
        register('escape', handler);
      });

      // Handler fires while scope is active
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(handler).toHaveBeenCalledTimes(1);

      handler.mockClear();
      scope.stop();

      // Handler should NOT fire after scope disposal
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(handler).not.toHaveBeenCalled();
    });

    it('should work without a Vue scope (no auto-cleanup, no error)', () => {
      // useKeyboard is called outside of any scope (beforeEach resets modules)
      const { register } = useKeyboard();
      const handler = vi.fn();
      const unregister = register('escape', handler);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(handler).toHaveBeenCalledTimes(1);

      // Manual cleanup still works
      unregister();
    });
  });
});
