import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  setGhostText,
  ghostTextExtension,
  acceptGhostText,
  currentGhostText,
} from '../../../lib/ai/ghost-text.js';

function makeView(doc = 'const x = ') {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: ghostTextExtension }),
    parent: document.createElement('div'),
  });
  view.dispatch({ selection: { anchor: doc.length } });
  return view;
}

describe('ghost text extension', () => {
  it('starts with no ghost text', () => {
    const view = makeView();
    expect(currentGhostText(view.state)).toBeNull();
    view.destroy();
  });

  it('setGhostText effect updates state', () => {
    const view = makeView();
    view.dispatch({ effects: setGhostText.of('42;') });
    expect(currentGhostText(view.state)).toBe('42;');
    view.destroy();
  });

  it('setGhostText.of(null) clears', () => {
    const view = makeView();
    view.dispatch({ effects: setGhostText.of('42;') });
    view.dispatch({ effects: setGhostText.of(null) });
    expect(currentGhostText(view.state)).toBeNull();
    view.destroy();
  });

  it('acceptGhostText inserts text at cursor and clears', () => {
    const view = makeView('const x = ');
    view.dispatch({ effects: setGhostText.of('42;') });
    const accepted = acceptGhostText(view);
    expect(accepted).toBe(true);
    expect(view.state.doc.toString()).toBe('const x = 42;');
    expect(currentGhostText(view.state)).toBeNull();
    view.destroy();
  });

  it('acceptGhostText returns false when no ghost text', () => {
    const view = makeView();
    expect(acceptGhostText(view)).toBe(false);
    view.destroy();
  });

  it('setGhostText triggers a decoration at cursor position', () => {
    const view = makeView('const x = ');
    view.dispatch({ effects: setGhostText.of('42;') });
    // The decoration widget is an inline widget at the cursor position.
    // Verify by looking at the view's DOM for our widget marker class.
    expect(view.dom.querySelector('.cm-ghost-text')).not.toBeNull();
    view.destroy();
  });
});
