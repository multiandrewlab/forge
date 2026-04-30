export interface SandboxFile {
  filename: string;
  content: string;
}

export function pickEntrySource(files: readonly SandboxFile[], entryFile: string): string {
  const match = files.find((f) => f.filename === entryFile);
  if (!match) {
    throw new Error(
      `Entry file "${entryFile}" not present in files[]; got [${files.map((f) => f.filename).join(', ')}]`,
    );
  }
  return match.content;
}
