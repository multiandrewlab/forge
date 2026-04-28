import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ExecutionOutput from '../../../components/post/ExecutionOutput.vue';

interface OutputLine {
  stream: 'stdout' | 'stderr';
  text: string;
  timestamp: number;
}

function makeLine(overrides: Partial<OutputLine> = {}): OutputLine {
  return {
    stream: 'stdout',
    text: 'hello world',
    timestamp: Date.now(),
    ...overrides,
  };
}

const defaultProps = {
  output: [] as OutputLine[],
  status: 'idle' as const,
  executionTime: null as number | null,
  exitCode: null as number | null,
  truncated: false,
};

describe('ExecutionOutput', () => {
  beforeEach(() => {
    // No shared state to reset for this component
  });

  describe('visibility', () => {
    it('renders nothing when output is empty and status is idle', () => {
      const wrapper = mount(ExecutionOutput, {
        props: { ...defaultProps },
      });

      expect(wrapper.find('[data-testid="execution-output"]').exists()).toBe(false);
    });

    it('renders output panel when output has lines', () => {
      const wrapper = mount(ExecutionOutput, {
        props: {
          ...defaultProps,
          output: [makeLine()],
        },
      });

      expect(wrapper.find('[data-testid="execution-output"]').exists()).toBe(true);
    });

    it.each(['loading', 'running', 'done', 'error'] as const)(
      'renders output panel when status is %s even with empty output',
      (status) => {
        const wrapper = mount(ExecutionOutput, {
          props: {
            ...defaultProps,
            status,
          },
        });

        expect(wrapper.find('[data-testid="execution-output"]').exists()).toBe(true);
      },
    );
  });

  describe('output lines', () => {
    it('renders stdout lines without special styling', () => {
      const wrapper = mount(ExecutionOutput, {
        props: {
          ...defaultProps,
          output: [makeLine({ stream: 'stdout', text: 'stdout line' })],
        },
      });

      const line = wrapper.find('[data-testid="output-line-0"]');
      expect(line.exists()).toBe(true);
      expect(line.text()).toBe('stdout line');
      expect(line.classes()).not.toContain('text-red-400');
    });

    it('renders stderr lines with red styling', () => {
      const wrapper = mount(ExecutionOutput, {
        props: {
          ...defaultProps,
          output: [makeLine({ stream: 'stderr', text: 'error line' })],
        },
      });

      const line = wrapper.find('[data-testid="output-line-0"]');
      expect(line.exists()).toBe(true);
      expect(line.text()).toBe('error line');
      expect(line.classes()).toContain('text-red-400');
    });

    it('renders multiple lines with correct indices', () => {
      const wrapper = mount(ExecutionOutput, {
        props: {
          ...defaultProps,
          output: [
            makeLine({ stream: 'stdout', text: 'line 0' }),
            makeLine({ stream: 'stderr', text: 'line 1' }),
            makeLine({ stream: 'stdout', text: 'line 2' }),
          ],
        },
      });

      expect(wrapper.find('[data-testid="output-line-0"]').text()).toBe('line 0');
      expect(wrapper.find('[data-testid="output-line-1"]').text()).toBe('line 1');
      expect(wrapper.find('[data-testid="output-line-1"]').classes()).toContain('text-red-400');
      expect(wrapper.find('[data-testid="output-line-2"]').text()).toBe('line 2');
    });
  });

  describe('XSS prevention', () => {
    it('does not parse script tags as HTML — uses text interpolation', () => {
      const xssPayload = '<script>alert("xss")</script>';
      const wrapper = mount(ExecutionOutput, {
        props: {
          ...defaultProps,
          output: [makeLine({ text: xssPayload })],
        },
      });

      // The raw text must appear literally in the rendered text
      expect(wrapper.text()).toContain('<script>alert("xss")</script>');

      // The innerHTML must NOT contain an actual <script> element
      const line = wrapper.find('[data-testid="output-line-0"]');
      expect(line.element.innerHTML).not.toContain('<script>');
    });

    it('does not parse img onerror tags as HTML', () => {
      const xssPayload = '<img src=x onerror=alert("xss")>';
      const wrapper = mount(ExecutionOutput, {
        props: {
          ...defaultProps,
          output: [makeLine({ text: xssPayload })],
        },
      });

      expect(wrapper.text()).toContain(xssPayload);
      const line = wrapper.find('[data-testid="output-line-0"]');
      expect(line.element.innerHTML).not.toContain('<img');
    });
  });

  describe('exit code', () => {
    it('shows exit code 0 with green styling', () => {
      const wrapper = mount(ExecutionOutput, {
        props: {
          ...defaultProps,
          status: 'done' as const,
          exitCode: 0,
        },
      });

      const statusBar = wrapper.find('[data-testid="status-bar"]');
      expect(statusBar.exists()).toBe(true);
      expect(statusBar.text()).toContain('Exit: 0');
      // Green styling for success
      expect(statusBar.html()).toContain('text-green');
    });

    it('shows nonzero exit code with red styling', () => {
      const wrapper = mount(ExecutionOutput, {
        props: {
          ...defaultProps,
          status: 'done' as const,
          exitCode: 1,
        },
      });

      const statusBar = wrapper.find('[data-testid="status-bar"]');
      expect(statusBar.text()).toContain('Exit: 1');
      expect(statusBar.html()).toContain('text-red');
    });
  });

  describe('execution time', () => {
    it('shows execution time in ms', () => {
      const wrapper = mount(ExecutionOutput, {
        props: {
          ...defaultProps,
          status: 'done' as const,
          executionTime: 1234,
        },
      });

      const statusBar = wrapper.find('[data-testid="status-bar"]');
      expect(statusBar.text()).toContain('1234ms');
    });

    it('does not show execution time when null', () => {
      const wrapper = mount(ExecutionOutput, {
        props: {
          ...defaultProps,
          status: 'done' as const,
          executionTime: null,
        },
      });

      const statusBar = wrapper.find('[data-testid="status-bar"]');
      expect(statusBar.text()).not.toContain('ms');
    });
  });

  describe('truncation indicator', () => {
    it('shows truncation indicator when truncated is true', () => {
      const wrapper = mount(ExecutionOutput, {
        props: {
          ...defaultProps,
          status: 'done' as const,
          output: [makeLine()],
          truncated: true,
        },
      });

      expect(wrapper.text()).toContain('truncated');
      // Yellow styling for truncation warning
      expect(wrapper.html()).toContain('text-yellow');
    });

    it('does not show truncation indicator when truncated is false', () => {
      const wrapper = mount(ExecutionOutput, {
        props: {
          ...defaultProps,
          status: 'done' as const,
          output: [makeLine()],
          truncated: false,
        },
      });

      expect(wrapper.text()).not.toContain('truncated');
    });
  });

  describe('clear button', () => {
    it('emits clear event when clear button is clicked', async () => {
      const wrapper = mount(ExecutionOutput, {
        props: {
          ...defaultProps,
          status: 'done' as const,
          output: [makeLine()],
        },
      });

      const clearButton = wrapper.find('[data-testid="clear-button"]');
      expect(clearButton.exists()).toBe(true);
      await clearButton.trigger('click');
      expect(wrapper.emitted('clear')).toHaveLength(1);
    });
  });

  describe('isVisible computed', () => {
    it('is reactive — toggling status from idle to loading shows the panel', async () => {
      const wrapper = mount(ExecutionOutput, {
        props: { ...defaultProps },
      });

      // Initially hidden
      expect(wrapper.find('[data-testid="execution-output"]').exists()).toBe(false);

      // Change status to loading
      await wrapper.setProps({ status: 'loading' });

      // Now visible
      expect(wrapper.find('[data-testid="execution-output"]').exists()).toBe(true);
    });

    it('is reactive — adding output lines when idle shows the panel', async () => {
      const wrapper = mount(ExecutionOutput, {
        props: { ...defaultProps },
      });

      expect(wrapper.find('[data-testid="execution-output"]').exists()).toBe(false);

      await wrapper.setProps({ output: [makeLine()] });

      expect(wrapper.find('[data-testid="execution-output"]').exists()).toBe(true);
    });
  });
});
