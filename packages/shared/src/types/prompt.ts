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
