import { describe, it, expect } from 'vitest';
import { detectLanguage } from '@/lib/detectLanguage';

describe('detectLanguage', () => {
  it('should detect Python from shebang', () => {
    const code = '#!/usr/bin/env python3\nprint("hello")';
    expect(detectLanguage(code)).toBe('python');
  });

  it('should detect Python from syntax patterns', () => {
    const code = `
def greet(name):
    print(f"Hello, {name}")

class MyClass:
    def __init__(self):
        self.value = 42

import os
from pathlib import Path
`;
    expect(detectLanguage(code)).toBe('python');
  });

  it('should detect JavaScript from syntax patterns', () => {
    const code = `
const greet = (name) => {
  console.log(\`Hello, \${name}\`);
};

function add(a, b) {
  return a + b;
}

module.exports = { greet };
`;
    expect(detectLanguage(code)).toBe('javascript');
  });

  it('should detect TypeScript from syntax patterns', () => {
    const code = `
interface User {
  id: string;
  name: string;
}

const greet = (user: User): void => {
  console.log(user.name);
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
`;
    expect(detectLanguage(code)).toBe('typescript');
  });

  it('should detect HTML from tags', () => {
    const code = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test</title>
</head>
<body>
  <div class="container">
    <h1>Hello World</h1>
  </div>
</body>
</html>
`;
    expect(detectLanguage(code)).toBe('html');
  });

  it('should detect CSS from style rules', () => {
    const code = `
.container {
  display: flex;
  justify-content: center;
  align-items: center;
}

body {
  margin: 0;
  padding: 0;
  font-family: sans-serif;
}

@media (max-width: 768px) {
  .container {
    flex-direction: column;
  }
}
`;
    expect(detectLanguage(code)).toBe('css');
  });

  it('should detect JSON from structure', () => {
    const code = `{
  "name": "test-project",
  "version": "1.0.0",
  "dependencies": {
    "vue": "^3.5.0"
  }
}`;
    expect(detectLanguage(code)).toBe('json');
  });

  it('should detect SQL from query syntax', () => {
    const code = `
SELECT u.id, u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2024-01-01'
GROUP BY u.id, u.name
HAVING COUNT(o.id) > 5
ORDER BY order_count DESC;
`;
    expect(detectLanguage(code)).toBe('sql');
  });

  it('should detect Rust from syntax patterns', () => {
    const code = `
use std::collections::HashMap;

fn main() {
    let mut map: HashMap<String, i32> = HashMap::new();
    map.insert("key".to_string(), 42);

    if let Some(value) = map.get("key") {
        println!("Found: {}", value);
    }
}

struct Point {
    x: f64,
    y: f64,
}

impl Point {
    fn new(x: f64, y: f64) -> Self {
        Point { x, y }
    }
}
`;
    expect(detectLanguage(code)).toBe('rust');
  });

  it('should detect Java from syntax patterns', () => {
    const code = `
package com.example;

import java.util.List;

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }

    private List<String> getNames() {
        return List.of("Alice", "Bob");
    }
}
`;
    expect(detectLanguage(code)).toBe('java');
  });

  it('should detect C++ from syntax patterns', () => {
    const code = `
#include <iostream>
#include <vector>

int main() {
    std::vector<int> numbers = {1, 2, 3, 4, 5};

    for (const auto& num : numbers) {
        std::cout << num << std::endl;
    }

    return 0;
}
`;
    expect(detectLanguage(code)).toBe('cpp');
  });

  it('should detect PHP from syntax patterns', () => {
    const code = `
<?php

namespace App\\Controllers;

class UserController {
    public function index() {
        $users = User::all();
        return view('users.index', ['users' => $users]);
    }

    public function show($id) {
        $user = User::find($id);
        echo $user->name;
    }
}
`;
    expect(detectLanguage(code)).toBe('php');
  });

  it('should detect Markdown from syntax patterns', () => {
    const code = `
# Getting Started

## Installation

\`\`\`bash
npm install my-package
\`\`\`

### Features

- Feature one
- Feature two
- Feature three

[Link text](https://example.com)

> This is a blockquote

| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |
`;
    expect(detectLanguage(code)).toBe('markdown');
  });

  it('should detect Node.js shebang as javascript', () => {
    const code = '#!/usr/bin/env node\nconsole.log("hello");';
    expect(detectLanguage(code)).toBe('javascript');
  });

  it('should return null for empty string', () => {
    expect(detectLanguage('')).toBeNull();
  });

  it('should return null for unrecognizable content', () => {
    const code = 'just some plain text that does not look like any programming language';
    expect(detectLanguage(code)).toBeNull();
  });

  it('should detect TypeScript before JavaScript when both patterns match', () => {
    // TypeScript has interface + const, JavaScript also has const
    const code = `
interface Config {
  port: number;
}

const config: Config = { port: 3000 };
console.log(config.port);
`;
    expect(detectLanguage(code)).toBe('typescript');
  });

  it('should detect JSON array', () => {
    const code = `[
  { "id": 1, "name": "Alice" },
  { "id": 2, "name": "Bob" }
]`;
    expect(detectLanguage(code)).toBe('json');
  });

  it('should not detect invalid JSON that starts/ends like JSON (catch branch)', () => {
    // Starts with { and ends with } but is not valid JSON — falls through to pattern matching
    const code = '{ this is not valid json }';
    // Should not return 'json' since JSON.parse throws and catch continues
    const result = detectLanguage(code);
    expect(result).not.toBe('json');
  });

  it('should not detect invalid JSON array that starts/ends like array (catch branch)', () => {
    // Starts with [ and ends with ] but is not valid JSON
    const code = '[ not valid json ]';
    const result = detectLanguage(code);
    expect(result).not.toBe('json');
  });

  it('should use empty string fallback when shebang match group is undefined (??  branch)', () => {
    // Temporarily mock String.prototype.match so the shebang regex returns a match
    // where group 1 is undefined — hits the `?? ''` fallback branch
    const originalMatch = String.prototype.match;
    String.prototype.match = function (regexp: RegExp | string) {
      const str = String(this);
      if (regexp instanceof RegExp && regexp.source.includes('env') && str.startsWith('#!')) {
        // Return a fake match array with undefined at index 1
        return Object.assign(['#!/usr/bin/env '], { index: 0, input: str }) as RegExpMatchArray;
      }
      return originalMatch.call(this, regexp as RegExp);
    } as typeof String.prototype.match;

    try {
      // The shebang match fires but group 1 is undefined → falls through to pattern matching
      const code = '#!/usr/bin/env \nconsole.log("hi")';
      const result = detectLanguage(code);
      // Interpreter is '' which is not in SHEBANG_MAP, so falls through
      expect(result).not.toBe('python'); // just verify it doesn't crash
    } finally {
      String.prototype.match = originalMatch;
    }
  });
});
