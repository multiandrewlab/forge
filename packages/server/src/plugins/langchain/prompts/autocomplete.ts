import { ChatPromptTemplate } from '@langchain/core/prompts';

const SYSTEM_PROMPT = `You are a code completion assistant. Given the code context before and after the cursor, generate a natural continuation. Output ONLY the completion text, no explanation.

Examples:
- Before: "function add(a: number, b: number)" -> Completion: " {{\\n  return a + b;\\n}}"
- Before: "const users = await db.query(" -> Completion: "'SELECT * FROM users WHERE active = true')"

Rules:
- Match the existing code style and indentation
- Keep completions concise (1-5 lines)
- For {language} code, follow idiomatic patterns`;

export const autocompletePrompt = ChatPromptTemplate.fromMessages([
  ['system', SYSTEM_PROMPT],
  [
    'human',
    'Language: {language}\n\nCode before cursor:\n```\n{before}\n```\n\nCode after cursor:\n```\n{after}\n```\n\nComplete:',
  ],
]);
