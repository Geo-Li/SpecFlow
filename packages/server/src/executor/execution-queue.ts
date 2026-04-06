type Task<T> = () => Promise<T>;

interface QueueItem<T> {
  task: Task<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export class ExecutionQueue {
  private maxConcurrent: number;
  private running = 0;
  private queue: QueueItem<any>[] = [];
  private repoLocks = new Map<string, boolean>();

  constructor(maxConcurrent: number) { this.maxConcurrent = maxConcurrent; }

  setMaxConcurrent(n: number): void { this.maxConcurrent = n; }
  getQueuePosition(): number { return this.queue.length + 1; }

  async enqueue<T>(task: Task<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processNext();
    });
  }

  acquireRepoLock(repoId: string): boolean {
    if (this.repoLocks.get(repoId)) return false;
    this.repoLocks.set(repoId, true);
    return true;
  }

  releaseRepoLock(repoId: string): void { this.repoLocks.delete(repoId); }

  private processNext(): void {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;
    const item = this.queue.shift()!;
    this.running++;
    item.task().then(item.resolve).catch(item.reject).finally(() => {
      this.running--;
      this.processNext();
    });
  }
}
