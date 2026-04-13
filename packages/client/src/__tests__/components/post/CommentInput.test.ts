import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import CommentInput from '@/components/post/CommentInput.vue';

describe('CommentInput', () => {
  it('renders textarea and submit button', () => {
    const wrapper = mount(CommentInput);
    expect(wrapper.find('textarea').exists()).toBe(true);
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true);
  });

  it('disables submit when body is empty', () => {
    const wrapper = mount(CommentInput);
    const btn = wrapper.find('button[type="submit"]');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('enables submit when body has content', async () => {
    const wrapper = mount(CommentInput);
    await wrapper.find('textarea').setValue('Hello');
    const btn = wrapper.find('button[type="submit"]');
    expect(btn.attributes('disabled')).toBeUndefined();
  });

  it('emits submit event with body text', async () => {
    const wrapper = mount(CommentInput);
    await wrapper.find('textarea').setValue('My comment');
    await wrapper.find('form').trigger('submit');
    const emitted = wrapper.emitted('submit') as unknown[][];
    expect(emitted).toBeTruthy();
    expect(emitted[0]).toEqual(['My comment']);
  });

  it('clears textarea after submit', async () => {
    const wrapper = mount(CommentInput);
    const textarea = wrapper.find('textarea');
    await textarea.setValue('My comment');
    await wrapper.find('form').trigger('submit');
    expect((textarea.element as HTMLTextAreaElement).value).toBe('');
  });

  it('emits cancel when cancel button clicked', async () => {
    const wrapper = mount(CommentInput, { props: { showCancel: true } });
    await wrapper.find('[data-testid="cancel-btn"]').trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('shows placeholder text', () => {
    const wrapper = mount(CommentInput, { props: { placeholder: 'Add a comment...' } });
    expect(wrapper.find('textarea').attributes('placeholder')).toBe('Add a comment...');
  });

  it('pre-fills textarea with initialValue prop', () => {
    const wrapper = mount(CommentInput, { props: { initialValue: 'Existing text' } });
    const textarea = wrapper.find('textarea').element as HTMLTextAreaElement;
    expect(textarea.value).toBe('Existing text');
  });

  it('does not show cancel button by default', () => {
    const wrapper = mount(CommentInput);
    expect(wrapper.find('[data-testid="cancel-btn"]').exists()).toBe(false);
  });

  it('does not emit submit when body is whitespace only', async () => {
    const wrapper = mount(CommentInput);
    await wrapper.find('textarea').setValue('   ');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeFalsy();
  });
});
