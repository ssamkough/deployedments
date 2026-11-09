export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface FetchOptions {
  headers?: Record<string, string>;
  retries?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Performs a request, retrying on 429 / 5xx / network errors with backoff. */
export async function request(url: string, options: FetchOptions = {}): Promise<Response> {
  const { headers, retries = 3, timeoutMs = 30_000 } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
        continue;
      }
      throw new HttpError(res.status, url, `${res.status} ${res.statusText} for ${redact(url)}`);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      lastError = error;
      if (attempt < retries) await sleep(500 * 2 ** attempt);
    }
  }
  throw new Error(`Request failed for ${redact(url)}: ${String(lastError)}`);
}

export async function fetchJson<T>(url: string, options?: FetchOptions): Promise<T> {
  const res = await request(url, options);
  return (await res.json()) as T;
}

/** Strip query strings so tokens / ids never leak into logs. */
function redact(url: string): string {
  return url.split('?')[0] ?? url;
}

/** Maps with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
