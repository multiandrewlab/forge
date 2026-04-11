# **Project Brief: Internal Developer Knowledge-Sharing Platform**

## **0\. Tech Stack**

- **Frontend:** Vue 3, TypeScript, Tailwind CSS, PrimeVue
- **Backend:** Fastify, TypeScript, PostgreSQL
- **Local Development:** Docker, Docker Compose

## **1\. Executive Summary**

This project aims to build a centralized, highly engaging internal platform for developers to share knowledge, code snippets, prompts, and files. The core philosophy is to reject clunky, traditional wikis in favor of a modern, developer-centric experience. By combining the discoverability of platforms like Hacker News with the utility of GitHub Gists and AI-assisted writing tools, this platform will become the default destination for engineering teams to collaborate, find solutions, test and play with prompts and code, and document best practices.

## **2\. Core Objectives**

- **Reduce Knowledge Silos:** Centralize scattered links, scripts, and prompts into a single, searchable repository.
- **Encourage Contribution:** Lower the barrier to documentation by providing AI-assisted authoring and native markdown support.
- **Foster Collaboration:** Enable safe experimentation and iteration through version control, forking, and inline feedback.
- **Enable Play and Experimentation:** Provide a safe sandbox for developers to test and play with prompts and code, without fear of breaking anything.

## **3\. Feature Breakdown**

### **A. Intelligent Authoring & Content Sharing**

The platform must handle diverse developer content natively, with tools designed to speed up the writing process.

- **AI-Assisted Markdown Autocomplete:** _Core Feature._ Similar to IDEs like Cursor or Copilot, the editor will provide predictive, next-line suggestions as users type in Markdown, reducing the time it takes to draft documentation or explain code.
- **AI-Assisted Markdown/Code/Prompt Generation:** _Core Feature._ Users can provide a high-level description of what they want to create, and the AI will generate the content that they can then edit and refine.
- **Playground:** A safe sandbox for developers to test and play with prompts and code, without fear of breaking anything. Prompts can have variables that have an easy UI to fill out before running or copying to the clipboard. Code can be run in a sandboxed environment.
- **First-Class Code Snippets:** Auto-detect programming languages, provide robust syntax highlighting, and include a one-click "Copy to Clipboard" function.
- **Prompt Templates:** A dedicated UI for AI prompts featuring highlighted variables (e.g., \[Insert Error Log Here\]) that users can easily fill out before copying.
- **Smart File Collections:** Allow users to bundle related files (e.g., a .env.example, a setup.sh script, and a README.md) into a single post with in-browser previews for common formats (JSON, YAML, Markdown).
- **Rich Media & Link Previews:** Auto-expanding summaries, thumbnails, and estimated reading times for shared articles or external documentation.
- **Multile file grouping:** Allow users to bundle related files (e.g., a .env.example, a setup.sh script, and a README.md) into a single post with in-browser previews for common formats (JSON, YAML, Markdown).
- **Share URL:** Allow users to share a link to interesting posts or videos online. The platform should automatically generate a preview of the content with metadata for the search system.
- **Favorite/Bookmark:** Allow users to favorite/bookmark posts for later reference.
- **Tagging:** Allow users to tag posts with relevant keywords. Tags should be searchable and filterable.

### **B. Versioning & Collaboration**

Collaboration tools that provide the safety of Git without the overhead of a full repository.

- **Visual Diffs:** Side-by-side or inline highlights (red/green) showing exactly what changed between versions of a snippet, prompt, or document.
- **Revision History & Rollback:** A clear, timestamped timeline of edits with a simple mechanism to revert to previous states.
- **Forking System:** Allow developers to duplicate an existing snippet or prompt to create their own variation, keeping it linked to the original for transparent knowledge evolution.
- **Inline Commenting:** Context-specific discussions where devs can highlight a single line of code or a specific sentence to leave feedback, rather than relying on a generic comment section at the bottom.

### **C. Discoverability & User Experience (UX)**

If the platform isn't instantly searchable and comfortable to use, adoption will fail.

- **Advanced Search:** Tolerant of typos (fuzzy search) with support for Regex and advanced filters (e.g., searching specifically within \#kubernetes tags or Python snippets).
- **Tailored Feeds & Taxonomy:** A robust tagging system allowing users to subscribe to specific topics. The homepage should feature a personalized "Trending" or "For You" feed based on these subscriptions.
- **Developer Quality of Life:**
  - **Dark Mode:** Default and toggleable.
  - **Keyboard Shortcuts:** Comprehensive hotkeys for navigation, search (Cmd/Ctrl \+ K), and publishing.
  - **Lightweight Gamification:** Stack Overflow-style upvotes/downvotes to bubble up the best solutions, highlighting subject matter experts organically.
