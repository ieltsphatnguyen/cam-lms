import { supabase } from '@/lib/supabase';

/**
 * Extracts a human-readable message from any error thrown by a Supabase RPC call.
 *
 * Supabase RPC errors are plain objects shaped like:
 *   { code: "P0001", details: null, hint: null, message: "...", ... }
 * They are NOT Error instances, so `err instanceof Error` is false and
 * `String(err)` produces "[object Object]". This function checks every
 * known property and returns the first useful message it finds.
 */
export function rpcErrorMessage(err: unknown, fallback: string): string {
  if (err == null) return fallback;

  // Already an Error instance
  if (err instanceof Error) return err.message || fallback;

  // PostgREST / Postgres error object
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const message = obj['message'];
    if (typeof message === 'string' && message.trim()) return message.trim();

    const details = obj['details'];
    if (typeof details === 'string' && details.trim()) return details.trim();

    const hint = obj['hint'];
    if (typeof hint === 'string' && hint.trim()) return hint.trim();
  }

  if (typeof err === 'string' && err.trim()) return err.trim();

  // Last resort — stringify without producing [object Object]
  try {
    return JSON.stringify(err) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Logs the complete error object (raw + JSON) so the full details —
 * code, constraint, policy, table — are visible in the browser console.
 */
export function logRpcError(label: string, err: unknown): void {
  console.error(`[${label}] Raw error:`, err);
  console.error(`[${label}] JSON:`, JSON.stringify(err));
}

/**
 * Convenience: logs + extracts message in one call.
 */
export function reportRpcError(label: string, err: unknown): string {
  logRpcError(label, err);
  return rpcErrorMessage(err, `${label} failed`);
}
