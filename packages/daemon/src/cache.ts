export class DataCache<T> {
  private data: T | null = null;
  private fetchedAt = 0;
  private fetching: Promise<T> | null = null;

  constructor(private ttlMs: number) {}

  get(): T | null {
    return this.data;
  }

  isStale(): boolean {
    return !this.data || Date.now() - this.fetchedAt > this.ttlMs;
  }

  async getOrFetch(fetcher: () => Promise<T>): Promise<T> {
    if (!this.isStale()) return this.data!;
    if (this.fetching) return this.fetching;
    this.fetching = fetcher()
      .then((result) => {
        this.data = result;
        this.fetchedAt = Date.now();
        this.fetching = null;
        return result;
      })
      .catch((err) => {
        this.fetching = null;
        throw err;
      });
    return this.fetching;
  }

  invalidate(): void {
    this.data = null;
    this.fetchedAt = 0;
  }
}
