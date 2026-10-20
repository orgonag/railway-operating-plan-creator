/** Deep copy of a JSON document. Core code has no DOM or Node globals, so no structuredClone. */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
