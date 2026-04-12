/**
 * Heuristic language detection from code content patterns.
 *
 * Detection strategy (in priority order):
 * 1. Shebang lines (#!) -- highest confidence
 * 2. Pattern matching with per-language thresholds
 *    - TypeScript checked before JavaScript (TS is a superset)
 *    - JSON checked via parse attempt (structural match)
 *
 * Returns null when no language can be confidently identified.
 */

interface LanguageRule {
  patterns: RegExp[];
  minMatches: number;
}

const SHEBANG_MAP: Record<string, string> = {
  python: 'python',
  python3: 'python',
  node: 'javascript',
  bash: 'bash',
  sh: 'bash',
  ruby: 'ruby',
  perl: 'perl',
};

const LANGUAGE_RULES: [string, LanguageRule][] = [
  // PHP checked early -- <?php is very distinctive
  [
    'php',
    {
      patterns: [
        /<\?php/,
        /\$\w+\s*=/,
        /->/,
        /function\s+\w+\s*\(/,
        /echo\s+/,
        /namespace\s+\w/,
        /use\s+\w+\\/,
        /public\s+function/,
        /\$this->/,
      ],
      minMatches: 2,
    },
  ],

  // HTML checked before CSS -- HTML may contain style blocks
  [
    'html',
    {
      patterns: [
        /<!DOCTYPE\s+html/i,
        /<html[\s>]/,
        /<head[\s>]/,
        /<body[\s>]/,
        /<div[\s>]/,
        /<\/\w+>/,
        /<meta\s/,
        /<link\s/,
        /<script[\s>]/,
      ],
      minMatches: 2,
    },
  ],

  // CSS
  [
    'css',
    {
      patterns: [
        /[.#]\w[\w-]*\s*\{/,
        /:\s*(flex|grid|block|inline|none|relative|absolute)/,
        /@media\s/,
        /@keyframes\s/,
        /font-family\s*:/,
        /margin\s*:/,
        /padding\s*:/,
        /display\s*:/,
        /background(-color)?\s*:/,
        /color\s*:/,
      ],
      minMatches: 2,
    },
  ],

  // SQL
  [
    'sql',
    {
      patterns: [
        /\bSELECT\b/i,
        /\bFROM\b/i,
        /\bWHERE\b/i,
        /\bINSERT\s+INTO\b/i,
        /\bCREATE\s+TABLE\b/i,
        /\bJOIN\b/i,
        /\bGROUP\s+BY\b/i,
        /\bORDER\s+BY\b/i,
        /\bHAVING\b/i,
        /\bALTER\s+TABLE\b/i,
      ],
      minMatches: 3,
    },
  ],

  // Rust -- check before C++ because both use :: but Rust has distinctive syntax
  [
    'rust',
    {
      patterns: [
        /\bfn\s+\w+/,
        /\blet\s+mut\b/,
        /\bimpl\s+\w+/,
        /\buse\s+std::/,
        /\bmatch\s+\w+/,
        /\bpub\s+(fn|struct|enum|mod)/,
        /::new\(/,
        /println!\(/,
        /\bstruct\s+\w+/,
        /-> Self/,
        /\bOption<\w/,
        /\bResult<\w/,
      ],
      minMatches: 2,
    },
  ],

  // C++ -- #include is very distinctive
  [
    'cpp',
    {
      patterns: [
        /#include\s*<\w+>/,
        /std::\w+/,
        /\bcout\b/,
        /\bcin\b/,
        /\bnamespace\s+\w+/,
        /\btemplate\s*</,
        /\bvector<\w/,
        /\bclass\s+\w+\s*[:{]/,
        /\bconst\s+auto&/,
        /\bstd::endl\b/,
      ],
      minMatches: 2,
    },
  ],

  // Java -- check before TypeScript because both have `public class`
  [
    'java',
    {
      patterns: [
        /\bpublic\s+class\s+\w+/,
        /\bpublic\s+static\s+void\s+main/,
        /System\.out\.println/,
        /\bpackage\s+[\w.]+;/,
        /\bimport\s+java\./,
        /\bprivate\s+(final\s+)?\w+\s+\w+/,
        /\bString\[\]\s+args/,
        /@Override/,
        /\bextends\s+\w+/,
        /\bimplements\s+\w+/,
      ],
      minMatches: 2,
    },
  ],

  // TypeScript -- must come before JavaScript
  [
    'typescript',
    {
      patterns: [
        /\binterface\s+\w+\s*\{/,
        /\btype\s+\w+\s*(<[^>]+>)?\s*=/,
        /:\s*(string|number|boolean|void|any|never|unknown)\b/,
        /\bas\s+(string|number|boolean|unknown|never|const)\b/,
        /<\w+(\s*,\s*\w+)*>\s*[({]/,
        /\benum\s+\w+/,
        /\bReadonly<\w/,
        /\bPartial<\w/,
        /\bRecord<\w/,
        /\bPromise<\w/,
      ],
      minMatches: 2,
    },
  ],

  // JavaScript
  [
    'javascript',
    {
      patterns: [
        /\bconst\s+\w+\s*=/,
        /\blet\s+\w+\s*=/,
        /\bfunction\s+\w+\s*\(/,
        /=>\s*\{/,
        /console\.\w+\(/,
        /module\.exports/,
        /require\(\s*['"`]/,
        /\bimport\s+.*\s+from\s+['"`]/,
        /\bexport\s+(default|const|function|class)\b/,
        /document\.\w+/,
        /\.addEventListener\(/,
      ],
      minMatches: 2,
    },
  ],

  // Python
  [
    'python',
    {
      patterns: [
        /\bdef\s+\w+\s*\(/,
        /\bclass\s+\w+.*:/,
        /\bimport\s+\w+/,
        /\bfrom\s+\w+\s+import\b/,
        /\bprint\s*\(/,
        /\bself\.\w+/,
        /\bif\s+__name__\s*==\s*['"]__main__['"]/,
        /:\s*$/m,
        /\belif\b/,
        /\bdef\s+__\w+__/,
      ],
      minMatches: 2,
    },
  ],

  // Markdown -- checked last since many languages contain markdown-like fragments
  [
    'markdown',
    {
      patterns: [
        /^#{1,6}\s+\S/m,
        /```\w*\n/,
        /\[.+\]\(.+\)/,
        /^\s*[-*+]\s+\S/m,
        /^\s*\d+\.\s+\S/m,
        /^>\s+\S/m,
        /^\|.*\|$/m,
        /\*\*.+\*\*/,
        /\*[^*]+\*/,
      ],
      minMatches: 3,
    },
  ],
];

/**
 * Detect the programming language of the given code snippet.
 *
 * @param code - The source code string to analyze
 * @returns The detected language identifier, or null if unrecognizable
 */
export function detectLanguage(code: string): string | null {
  if (!code.trim()) {
    return null;
  }

  // 1. Check shebang (highest confidence)
  const shebangMatch = code.match(/^#!\s*\/\S+\/(?:env\s+)?(\w+)/);
  if (shebangMatch) {
    const interpreter = shebangMatch[1] ?? '';
    const mapped = SHEBANG_MAP[interpreter];
    if (mapped) {
      return mapped;
    }
  }

  // 2. Check JSON via parse attempt (structural match)
  const trimmed = code.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON, continue pattern matching
    }
  }

  // 3. Pattern matching -- first language to meet its threshold wins
  for (const [language, rule] of LANGUAGE_RULES) {
    let matches = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(code)) {
        matches++;
        if (matches >= rule.minMatches) {
          return language;
        }
      }
    }
  }

  return null;
}
