import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataCache } from '../cache.js';

describe('DataCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null before first fetch', () => {
    const cache = new DataCache<string>(1000);
    expect(cache.get()).toBeNull();
  });

  it('fetches data on first getOrFetch', async () => {
    const cache = new DataCache<string>(1000);
    const fetcher = vi.fn().mockResolvedValue('hello');

    const result = await cache.getOrFetch(fetcher);

    expect(result).toBe('hello');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(cache.get()).toBe('hello');
  });

  it('returns cached data within TTL', async () => {
    const cache = new DataCache<string>(1000);
    const fetcher = vi.fn().mockResolvedValue('hello');

    await cache.getOrFetch(fetcher);
    vi.advanceTimersByTime(500); // still within TTL
    const result = await cache.getOrFetch(fetcher);

    expect(result).toBe('hello');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('refetches after TTL expires', async () => {
    const cache = new DataCache<string>(1000);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    const first = await cache.getOrFetch(fetcher);
    expect(first).toBe('first');

    vi.advanceTimersByTime(1001); // past TTL

    const second = await cache.getOrFetch(fetcher);
    expect(second).toBe('second');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(cache.get()).toBe('second');
  });

  it('deduplicates concurrent fetches', async () => {
    const cache = new DataCache<string>(1000);
    let resolve: (value: string) => void;
    const promise = new Promise<string>((r) => {
      resolve = r;
    });
    const fetcher = vi.fn().mockReturnValue(promise);

    const p1 = cache.getOrFetch(fetcher);
    const p2 = cache.getOrFetch(fetcher);

    resolve!('deduped');

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('deduped');
    expect(r2).toBe('deduped');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('invalidate forces refetch', async () => {
    const cache = new DataCache<string>(1000);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce('original')
      .mockResolvedValueOnce('refreshed');

    await cache.getOrFetch(fetcher);
    expect(cache.get()).toBe('original');

    cache.invalidate();
    expect(cache.get()).toBeNull();

    const result = await cache.getOrFetch(fetcher);
    expect(result).toBe('refreshed');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('propagates fetcher errors', async () => {
    const cache = new DataCache<string>(1000);
    const error = new Error('fetch failed');
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('recovered');

    // First call should reject
    await expect(cache.getOrFetch(fetcher)).rejects.toThrow('fetch failed');
    expect(cache.get()).toBeNull();

    // Next call should retry and succeed
    const result = await cache.getOrFetch(fetcher);
    expect(result).toBe('recovered');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
