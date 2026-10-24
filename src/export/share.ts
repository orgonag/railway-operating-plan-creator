/**
 * Share links: the whole plan, deflated and base64url-encoded, in the URL
 * fragment. The fragment never reaches a server, so a static host serves it.
 * Engine notes are never included; the plan's own questions and provenance
 * are kept, since they are part of the file.
 */

import { materialize } from "../core/engine/materialize";
import type { FileProblem, PlanReading } from "../core/schema/types";
import { validateFile } from "../core/schema/validateFile";

export const SHARE_PREFIX = "#plan=v1.";
export const SHARE_NOTICE = "This link holds the whole plan, including names, reporting marks and callouts. Anyone with it can open it.";
export const SHARE_FAILED_TEXT = "This link could not be opened";

export function isShareHash(hash: string): boolean {
  return hash.startsWith(SHARE_PREFIX) && hash.length > SHARE_PREFIX.length;
}

async function pipeThrough(bytes: Uint8Array, stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const written = writer.write(bytes).then(() => writer.close());
  // A damaged stream fails on the reading side first; the writer's own rejection is then noise.
  written.catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await written;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** `base` plus the fragment; with no base, the fragment alone. */
export async function encodeShare(plan: PlanReading, base = ""): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(plan));
  const packed = await pipeThrough(json, new CompressionStream("deflate-raw"));
  return base + SHARE_PREFIX + toBase64Url(packed);
}

function failed(message: string): { plan: null; problems: FileProblem[] } {
  return { plan: null, problems: [{ path: "", message, repaired: false }] };
}

/** A null plan with one problem for a wrong prefix, bad base64, a failed inflate or a failed file check. */
export async function decodeShare(hash: string): Promise<{ plan: PlanReading | null; problems: FileProblem[] }> {
  if (!isShareHash(hash)) return failed(`${SHARE_FAILED_TEXT}: it is not a plan link this version understands.`);
  const bytes = fromBase64Url(hash.slice(SHARE_PREFIX.length));
  if (!bytes) return failed(`${SHARE_FAILED_TEXT}: the link is damaged.`);
  let raw: unknown;
  try {
    const unpacked = await pipeThrough(bytes, new DecompressionStream("deflate-raw"));
    raw = JSON.parse(new TextDecoder().decode(unpacked));
  } catch {
    return failed(`${SHARE_FAILED_TEXT}: the link is damaged.`);
  }
  const checked = validateFile(raw);
  if (!checked.plan) return failed(`${SHARE_FAILED_TEXT}: ${checked.problems[0]?.message ?? "the plan did not pass the file check."}`);
  const made = materialize(checked.plan);
  return { plan: made.plan, problems: [...checked.problems, ...made.problems] };
}
