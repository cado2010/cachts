// A small worker_threads pool, so a depth-4 search never stalls the event loop. Design section 8.5.
import { extname } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { SearchResult } from './search.ts';

export interface Searcher {
  search(fen: string, depth: number, history: readonly string[]): Promise<SearchResult>;
  close(): Promise<void>;
}

interface Job {
  id: number;
  fen: string;
  depth: number;
  history: readonly string[];
  resolve: (r: SearchResult) => void;
  reject: (e: Error) => void;
}

export class SearchPool implements Searcher {
  private idle: Worker[] = [];
  private queue: Job[] = [];
  private running = new Map<Worker, Job>();
  private count = 0;
  private nextId = 1;
  private closed = false;
  private readonly size: number;

  constructor(size: number) {
    this.size = Math.max(1, size);
  }

  search(fen: string, depth: number, history: readonly string[] = []): Promise<SearchResult> {
    if (this.closed) return Promise.reject(new Error('Search pool is closed'));
    return new Promise((resolve, reject) => {
      this.queue.push({ id: this.nextId++, fen, depth, history, resolve, reject });
      this.pump();
    });
  }

  private spawn(): Worker {
    // .ts when run from source, .mjs in the desktop app's bundle.
    const extension = extname(new URL(import.meta.url).pathname);
    const worker = new Worker(new URL(`./searchWorker${extension}`, import.meta.url));
    this.count++;
    worker.on('message', (msg: { result?: SearchResult; error?: string }) => {
      const job = this.running.get(worker);
      this.running.delete(worker);
      if (msg.result) job?.resolve(msg.result);
      else job?.reject(new Error(msg.error ?? 'Search failed'));
      this.idle.push(worker);
      this.pump();
    });
    const lost = (error: Error): void => {
      const job = this.running.get(worker);
      this.running.delete(worker);
      this.idle = this.idle.filter((w) => w !== worker);
      this.count--;
      job?.reject(error);
      if (!this.closed) this.pump();
    };
    worker.on('error', lost);
    worker.on('exit', () => lost(new Error('Search worker exited')));
    return worker;
  }

  private pump(): void {
    while (this.queue.length > 0) {
      const worker = this.idle.pop() ?? (this.count < this.size ? this.spawn() : undefined);
      if (!worker) return;
      const job = this.queue.shift() as Job;
      this.running.set(worker, job);
      worker.postMessage({ id: job.id, fen: job.fen, depth: job.depth, history: job.history });
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    const workers = [...this.idle, ...this.running.keys()];
    await Promise.all(workers.map((w) => w.terminate()));
  }
}
