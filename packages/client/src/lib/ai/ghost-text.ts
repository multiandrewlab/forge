import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

export const setGhostText = StateEffect.define<string | null>();

export class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  override eq(other: GhostWidget): boolean {
    return other.text === this.text;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-ghost-text';
    span.style.opacity = '0.4';
    span.style.color = 'var(--text-muted, #999)';
    span.textContent = this.text;
    return span;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

type GhostState = { text: string | null };

export const ghostTextField = StateField.define<GhostState>({
  create: () => ({ text: null }),
  update(value, tr) {
    let next = value;
    for (const effect of tr.effects) {
      if (effect.is(setGhostText)) {
        next = { text: effect.value };
      }
    }
    // Clear ghost text if the document changed while a ghost was visible.
    if (tr.docChanged && next.text !== null) {
      next = { text: null };
    }
    return next;
  },
});

const ghostDecorations = EditorView.decorations.compute([ghostTextField], (state) => {
  const { text } = state.field(ghostTextField);
  if (!text) return Decoration.none;
  const pos = state.selection.main.head;
  const builder = Decoration.widget({ widget: new GhostWidget(text), side: 1 });
  return Decoration.set([builder.range(pos)]);
});

export const ghostTextExtension: Extension = [ghostTextField, ghostDecorations];

export function currentGhostText(state: EditorState): string | null {
  return state.field(ghostTextField).text;
}

export function acceptGhostText(view: EditorView): boolean {
  const text = currentGhostText(view.state);
  if (!text) return false;
  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
    // Note: docChanged will clear the ghost via the field's update; no explicit effect needed.
  });
  return true;
}
