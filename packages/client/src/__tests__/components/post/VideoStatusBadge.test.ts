import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import type { VideoStatus } from '@forge/shared';
import VideoStatusBadge from '../../../components/post/VideoStatusBadge.vue';

describe('VideoStatusBadge', () => {
  it.each<[VideoStatus, string]>([
    ['uploading', 'Uploading'],
    ['processing', 'Processing'],
    ['captions', 'Generating captions'],
    ['suggesting', 'Generating suggestions'],
    ['ready', 'Ready'],
    ['failed', 'Failed'],
    ['pending_cancel', 'Cancelling'],
  ])('renders %s as containing "%s"', (status, expected) => {
    const w = mount(VideoStatusBadge, { props: { status } });
    expect(w.text()).toContain(expected);
    expect(w.find(`[data-testid="video-status-badge-${status}"]`).exists()).toBe(true);
  });

  it('shows progress percent when uploading and progress prop set', () => {
    const w = mount(VideoStatusBadge, { props: { status: 'uploading', progress: 32 } });
    expect(w.text()).toContain('32%');
  });

  it('hides progress percent when uploading but no progress prop', () => {
    const w = mount(VideoStatusBadge, { props: { status: 'uploading' } });
    expect(w.text()).not.toMatch(/\d+%/);
  });

  it('hides progress percent when uploading and progress is null', () => {
    const w = mount(VideoStatusBadge, { props: { status: 'uploading', progress: null } });
    expect(w.text()).not.toMatch(/\d+%/);
  });

  it('does NOT show progress percent when not uploading even if progress set', () => {
    const w = mount(VideoStatusBadge, { props: { status: 'processing', progress: 50 } });
    expect(w.text()).not.toContain('50%');
  });

  it('shows "Replacing" when pendingCfUid is set on a ready post', () => {
    const w = mount(VideoStatusBadge, { props: { status: 'ready', pendingCfUid: 'cfx' } });
    expect(w.text()).toContain('Replacing');
    expect(w.find('[data-testid="video-status-badge-replacing"]').exists()).toBe(true);
  });

  it('does NOT flip to "Replacing" when status is uploading even if pendingCfUid set', () => {
    const w = mount(VideoStatusBadge, { props: { status: 'uploading', pendingCfUid: 'cfx' } });
    expect(w.text()).not.toContain('Replacing');
    expect(w.find('[data-testid="video-status-badge-uploading"]').exists()).toBe(true);
  });

  it('shows failure headline from failure-mode-copy when failed with known lastError', () => {
    const w = mount(VideoStatusBadge, {
      props: { status: 'failed', lastError: 'upload timed out' },
    });
    expect(w.text()).toContain('Upload timed out');
  });

  it('falls back to "Failed: <reason>" for unknown lastError keys', () => {
    const w = mount(VideoStatusBadge, {
      props: { status: 'failed', lastError: 'something exotic' },
    });
    expect(w.text()).toContain('Failed: something exotic');
  });

  it('renders plain "Failed" when failed without lastError', () => {
    const w = mount(VideoStatusBadge, { props: { status: 'failed' } });
    expect(w.text()).toContain('Failed');
  });

  it('renders plain "Failed" when failed with null lastError', () => {
    const w = mount(VideoStatusBadge, { props: { status: 'failed', lastError: null } });
    expect(w.text()).toContain('Failed');
  });

  it('applies red color class on failed', () => {
    const w = mount(VideoStatusBadge, { props: { status: 'failed' } });
    expect(w.classes().join(' ')).toMatch(/red/);
  });

  it('applies green color class on ready (without pendingCfUid)', () => {
    const w = mount(VideoStatusBadge, { props: { status: 'ready' } });
    expect(w.classes().join(' ')).toMatch(/green/);
  });

  it('applies blue color class on processing', () => {
    const w = mount(VideoStatusBadge, { props: { status: 'processing' } });
    expect(w.classes().join(' ')).toMatch(/blue/);
  });

  it('applies blue color class on ready+replacing (not green)', () => {
    const w = mount(VideoStatusBadge, { props: { status: 'ready', pendingCfUid: 'cfx' } });
    const cls = w.classes().join(' ');
    expect(cls).toMatch(/blue/);
    expect(cls).not.toMatch(/green/);
  });

  it('renders AI-derived lastError as plain text (no <script> escape)', () => {
    // Safety: a transcript-derived string sneaking into lastError must NOT
    // execute. Vue {{ }} interpolation guarantees text-only rendering.
    const w = mount(VideoStatusBadge, {
      props: { status: 'failed', lastError: '<script>alert(1)</script>' },
    });
    // The element must not contain any <script> element
    expect(w.element.querySelectorAll('script').length).toBe(0);
    // But the literal text should appear as part of the fallback message
    expect(w.text()).toContain('<script>alert(1)</script>');
  });
});
