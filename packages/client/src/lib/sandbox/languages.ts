export const SANDBOX_LANGUAGES = Object.freeze(['python', 'javascript', 'typescript'] as const);

export type SandboxLanguage = (typeof SANDBOX_LANGUAGES)[number];

export function isSandboxLanguage(lang: string | null): lang is SandboxLanguage {
  if (lang === null) return false;
  return (SANDBOX_LANGUAGES as readonly string[]).includes(lang);
}

const LANGUAGE_TO_EXTENSION: Record<SandboxLanguage, string> = {
  python: '.py',
  javascript: '.js',
  typescript: '.ts',
};

const EXTENSION_TO_LANGUAGE: Record<string, SandboxLanguage> = {
  '.py': 'python',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
};

export function languageToExtension(lang: SandboxLanguage): string {
  return LANGUAGE_TO_EXTENSION[lang];
}

export function extensionToLanguage(ext: string): SandboxLanguage | null {
  return EXTENSION_TO_LANGUAGE[ext] ?? null;
}
