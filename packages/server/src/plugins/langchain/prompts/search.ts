import { ChatPromptTemplate } from '@langchain/core/prompts';

const SYSTEM_PROMPT = `You are a search query interpreter for a developer knowledge-sharing platform.
Given a natural language search query, extract structured filters.

Output JSON with these fields:
- tags: string[] (relevant technology/topic tags)
- language: string | null (programming language if specified)
- contentType: string | null (one of: "snippet", "prompt", "document", "link", or null)
- textQuery: string (the core search text after extracting filters)

Examples:
- "python scripts for parsing CSV files" -> {{"tags":["python","csv"],"language":"python","contentType":"snippet","textQuery":"parsing CSV files"}}
- "how to use React hooks" -> {{"tags":["react","hooks"],"language":null,"contentType":null,"textQuery":"React hooks usage"}}
- "prompt for code review" -> {{"tags":["code-review"],"language":null,"contentType":"prompt","textQuery":"code review prompt"}}

Output ONLY valid JSON, no explanation.`;

export const searchPrompt = ChatPromptTemplate.fromMessages([
  ['system', SYSTEM_PROMPT],
  ['human', '{query}'],
]);
