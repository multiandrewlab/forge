export const ContentType = {
  Snippet: 'snippet',
  Prompt: 'prompt',
  Document: 'document',
  Link: 'link',
} as const;

export type ContentType = (typeof ContentType)[keyof typeof ContentType];

export const Visibility = {
  Public: 'public',
  Private: 'private',
} as const;

export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const AuthProvider = {
  Google: 'google',
  Local: 'local',
} as const;

export type AuthProvider = (typeof AuthProvider)[keyof typeof AuthProvider];
