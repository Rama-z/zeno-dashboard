export type SessionSnapshot = { updatedAt: string };

export type SessionSaveCallbacks<T> = {
  optimistic: (id: string, snapshot: T) => void;
  success: (id: string, saved: T, hasQueuedSuccessor: boolean) => void;
  failure: (id: string, error: unknown) => void;
};

type PendingSave<T> = {
  snapshot: T;
  callbacks: SessionSaveCallbacks<T>;
};

type SessionQueue<T> = {
  items: PendingSave<T>[];
  running: boolean;
  failed: boolean;
  latestUpdatedAt?: string;
};

export class SerializedSessionSaveQueue<T extends SessionSnapshot> {
  private readonly queues = new Map<string, SessionQueue<T>>();
  private readonly save: (id: string, snapshot: T) => Promise<T>;

  constructor(save: (id: string, snapshot: T) => Promise<T>) {
    this.save = save;
  }

  enqueue(id: string, snapshot: T, callbacks: SessionSaveCallbacks<T>) {
    callbacks.optimistic(id, snapshot);
    const queue = this.queues.get(id) ?? { items: [], running: false, failed: false };
    queue.items.push({ snapshot, callbacks });
    this.queues.set(id, queue);
    void this.drain(id, queue);
  }

  hasPending() {
    return [...this.queues.values()].some((queue) => queue.items.length > 0);
  }

  discard(id?: string) {
    if (id === undefined) {
      this.queues.clear();
      return;
    }
    this.queues.delete(id);
  }

  retryFailed() {
    let retried = false;
    for (const [id, queue] of this.queues) {
      if (!queue.failed) continue;
      queue.failed = false;
      retried = true;
      void this.drain(id, queue);
    }
    return retried;
  }

  private async drain(id: string, queue: SessionQueue<T>) {
    if (queue.running || queue.failed) return;
    queue.running = true;
    while (queue.items.length > 0 && !queue.failed) {
      const current = queue.items[0];
      const snapshot = queue.latestUpdatedAt
        ? { ...current.snapshot, updatedAt: queue.latestUpdatedAt }
        : current.snapshot;
      try {
        const saved = await this.save(id, snapshot);
        queue.latestUpdatedAt = saved.updatedAt;
        queue.items.shift();
        current.callbacks.success(id, saved, queue.items.length > 0);
      } catch (error) {
        queue.failed = true;
        current.callbacks.failure(id, error);
      }
    }
    queue.running = false;
    if (queue.items.length === 0) this.queues.delete(id);
  }
}
