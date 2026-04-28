const APIS_TO_REMOVE = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'indexedDB',
  'caches',
  'EventSource',
] as const;

export function neutralizeBrowserApis(scope: Record<string, unknown>): void {
  for (const api of APIS_TO_REMOVE) {
    Reflect.deleteProperty(scope, api);
  }
}
