export interface PromptVariable {
  id: string;
  postId: string;
  name: string;
  placeholder: string | null;
  defaultValue: string | null;
  sortOrder: number;
}

const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;

/**
 * Extract variable names from a prompt template string.
 * Matches `{{variable_name}}` with optional internal whitespace.
 * Returns deduplicated names preserving first-occurrence order.
 */
export function extractVariables(content: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const match of content.matchAll(VARIABLE_PATTERN)) {
    // Capture group 1 always exists when VARIABLE_PATTERN matches
    const name = (match[1] as string).trim();
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }

  return result;
}

/**
 * Replace `{{variable}}` placeholders in a template with values from the
 * provided record. Unmatched variables are left as `{{trimmedName}}`.
 * Handles whitespace variants like `{{ name }}` and `{{  name  }}`.
 */
export function assemblePrompt(template: string, variables: Record<string, string>): string {
  return template.replace(VARIABLE_PATTERN, (full: string, rawName: string) => {
    const name = rawName.trim();
    const value: string | undefined = variables[name];
    return value !== undefined ? value : `{{${name}}}`;
  });
}

/**
 * Returns the names of variables that are REQUIRED for prompt assembly.
 *
 * A variable is required iff:
 *   - it appears in the content (`{{name}}` syntax), AND
 *   - its `PromptVariable.defaultValue` is null/undefined or empty-after-trim,
 *     OR it's missing from the `variables` array entirely.
 *
 * Note: a variable in `variables[]` but not in `content` is NOT required —
 * it's not extracted at all. A variable in `content` but not in `variables[]`
 * IS required (treated as undefaulted). This asymmetry is intentional: the
 * data model allows a "loose" variable in content with no metadata row,
 * which we treat as the strictest case (required).
 *
 * Pure function. No side effects.
 */
export function extractRequiredVariables(content: string, variables: PromptVariable[]): string[] {
  const inContent = extractVariables(content);
  const meta = new Map(variables.map((v) => [v.name, v]));
  const required = new Set<string>();
  for (const name of inContent) {
    // Skip empty / whitespace-only placeholder names (e.g. `{{   }}` or
    // `{{}}`) — they're malformed templates, not a "required '' variable",
    // and surfacing an empty key in `missing` confuses clients/UI.
    if (name.trim() === '') continue;
    const v = meta.get(name);
    if (!v) {
      required.add(name);
      continue;
    }
    const dv = v.defaultValue;
    if (dv === null || dv === undefined || dv.trim() === '') {
      required.add(name);
    }
  }
  return Array.from(required);
}
