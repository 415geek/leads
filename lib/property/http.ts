import { PropertyError } from './types';

export type FetchImpl = typeof fetch;

export async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number },
  fetchImpl: FetchImpl = fetch,
): Promise<{ status: number; body: unknown }> {
  const timeoutMs = init.timeoutMs ?? 12_000;
  const { timeoutMs: _t, ...rest } = init;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      ...rest,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new PropertyError(`Request timed out after ${timeoutMs}ms`, 'timeout', err);
    }
    throw new PropertyError('Network request failed', 'upstream', err);
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch (err) {
      throw new PropertyError('Invalid JSON from provider', 'parse', err);
    }
  }

  if (res.status === 401 || res.status === 403) {
    throw new PropertyError(`Provider auth failed (${res.status})`, 'auth');
  }
  if (res.status === 429) {
    throw new PropertyError('Provider rate limited', 'rate_limit');
  }
  if (!res.ok) {
    throw new PropertyError(`Provider HTTP ${res.status}`, 'upstream');
  }

  return { status: res.status, body };
}
