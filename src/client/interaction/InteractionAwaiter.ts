import { Events, Interaction } from 'discord.js';
import type { BunClient } from '..';

export interface AwaitInteractionOptions<T extends Interaction = Interaction> {
  /**
   * Only resolve for interactions passing this filter. Use it to scope a
   * shared static customId to the right user/message, e.g.
   * `(i) => i.user.id === interaction.user.id`.
   */
  filter?: (interaction: T) => boolean | Promise<boolean>;
  /** Reject after this many ms. Defaults to 60_000. Use 0 to disable. */
  time?: number;
  /**
   * Resolve after this many matching interactions. Defaults to 1 (resolves
   * a single interaction); values > 1 resolve an array.
   */
  maxUses?: number;
}

interface PendingAwaiter<T extends Interaction> {
  filter?: (interaction: T) => boolean | Promise<boolean>;
  maxUses: number;
  collected: T[];
  resolve: (value: T | T[]) => void;
  reject: (reason: Error) => void;
  timeout?: NodeJS.Timeout;
}

interface CollectorEntry<T extends Interaction> {
  filter?: (interaction: T) => boolean | Promise<boolean>;
  max: number;
  collected: T[];
  onCollect: (interaction: T) => void;
  onEnd: (collected: T[], reason: CollectorEndReason) => void;
  timeout?: NodeJS.Timeout;
  finished: boolean;
}

export interface CollectOptions<T extends Interaction = Interaction> {
  /**
   * Only collect interactions passing this filter (e.g. scope a shared
   * static customId to one user or message).
   */
  filter?: (interaction: T) => boolean | Promise<boolean>;
  /** End after this many ms. Defaults to 60_000. Use 0 to run until stopped. */
  time?: number;
  /** End after this many collected. Defaults to no limit. */
  max?: number;
}

export type CollectorEndReason = 'time' | 'limit' | 'stopped';

export class InteractionCollector<T extends Interaction> {
  public collected: T[] = [];
  public ended = false;
  public endReason: CollectorEndReason | null = null;
  private listeners = new Map<string, Set<(...args: never[]) => void>>();

  public on(
    event: 'collect',
    listener: (interaction: T) => void
  ): this;
  public on(
    event: 'end',
    listener: (collected: T[], reason: CollectorEndReason) => void
  ): this;
  public on(event: string, listener: (...args: never[]) => void): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }

  public off(event: string, listener: (...args: never[]) => void): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  /** End the collector. The `end` event fires with reason `'stopped'`. */
  public stop(): void {
    this._stop?.();
  }

  /** @internal */
  public _stop: (() => void) | null = null;

  /** @internal */
  public _emitCollect(interaction: T): void {
    for (const listener of [...(this.listeners.get('collect') ?? [])])
      (listener as (interaction: T) => void)(interaction);
  }

  /** @internal */
  public _emitEnd(collected: T[], reason: CollectorEndReason): void {
    for (const listener of [...(this.listeners.get('end') ?? [])])
      (
        listener as (
          collected: T[],
          reason: CollectorEndReason
        ) => void
      )(collected, reason);
  }

  public async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    const queue: T[] = [];
    let done = false;
    let wake: (() => void) | null = null;
    const onCollect = (item: T) => {
      queue.push(item);
      wake?.();
    };
    const onEnd = () => {
      done = true;
      wake?.();
    };
    this.on('collect', onCollect);
    this.on('end', onEnd);
    try {
      while (true) {
        const item = queue.shift();
        if (item !== undefined) {
          yield item;
          continue;
        }
        if (done || this.ended) return;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = null;
      }
    } finally {
      this.off('collect', onCollect);
      this.off('end', onEnd);
    }
  }
}

const DEFAULT_TIMEOUT = 60_000;

/**
 * Static-customId friendly awaiter. Multiple callers can await the same
 * customId concurrently; each registers its own filter/timeout and only
 * resolves for interactions passing its filter.
 */
export class InteractionAwaiter {
  private awaitMap: Map<string, Set<PendingAwaiter<any>>> = new Map();
  private collectorMap: Map<string, Set<CollectorEntry<any>>> = new Map();

  constructor(private client: BunClient) {
    this.client.on(Events.InteractionCreate, (interaction: Interaction) => {
      void this.handle(interaction);
    });
  }

  // Single interaction when maxUses is 1 (default).
  awaitInteraction<T extends Interaction>(
    customId: string,
    options?: AwaitInteractionOptions<T> & { maxUses?: 1 }
  ): Promise<T>;
  // Array of interactions when collecting more than one.
  awaitInteraction<T extends Interaction>(
    customId: string,
    options: AwaitInteractionOptions<T> & { maxUses: number }
  ): Promise<T[]>;
  awaitInteraction<T extends Interaction>(
    customId: string,
    options: AwaitInteractionOptions<T> = {}
  ): Promise<T | T[]> {
    const { filter, time = DEFAULT_TIMEOUT, maxUses = 1 } = options;

    if (!customId) throw new Error('customId must be a non-empty string');
    if (maxUses < 1) throw new Error('maxUses must be >= 1');

    return new Promise<T | T[]>((resolve, reject) => {
      const pending: PendingAwaiter<T> = {
        filter,
        maxUses,
        collected: [],
        resolve: resolve as (value: T | T[]) => void,
        reject,
        timeout: undefined,
      };

      if (time > 0) {
        pending.timeout = setTimeout(() => {
          this.remove(customId, pending as PendingAwaiter<any>);
          reject(
            new Error(
              `Timed out waiting for interaction "${customId}" after ${time}ms`
            )
          );
        }, time);
        // Don't keep the process alive just for a pending await.
        pending.timeout.unref?.();
      }

      let set = this.awaitMap.get(customId);
      if (!set) {
        set = new Set();
        this.awaitMap.set(customId, set);
      }
      set.add(pending as PendingAwaiter<any>);
    });
  }

  /**
   * Collect every matching interaction until `time`/`max`/`stop()`.
   * Unlike `awaitInteraction`, one call observes many interactions —
   * via `.on('collect')` events or `for await` iteration.
   */
  collect<T extends Interaction>(
    customId: string,
    options: CollectOptions<T> = {}
  ): InteractionCollector<T> {
    const { filter, time = DEFAULT_TIMEOUT, max = Infinity } = options;
    if (!customId) throw new Error('customId must be a non-empty string');

    const collector = new InteractionCollector<T>();
    const entry: CollectorEntry<T> = {
      filter,
      max,
      collected: collector.collected,
      onCollect: (interaction: T) => {
        collector.collected.push(interaction);
        collector._emitCollect(interaction);
      },
      onEnd: (collected: T[], reason: CollectorEndReason) => {
        collector.ended = true;
        collector.endReason = reason;
        collector._emitEnd(collected, reason);
      },
      timeout: undefined,
      finished: false,
    };

    const finish = (reason: CollectorEndReason) => {
      if (entry.finished) return;
      entry.finished = true;
      if (entry.timeout) clearTimeout(entry.timeout);
      const set = this.collectorMap.get(customId);
      set?.delete(entry as CollectorEntry<any>);
      if (set && set.size === 0) this.collectorMap.delete(customId);
      entry.onEnd(collector.collected, reason);
    };
    collector._stop = () => finish('stopped');

    if (time > 0) {
      entry.timeout = setTimeout(() => finish('time'), time);
      entry.timeout.unref?.();
    }

    let set = this.collectorMap.get(customId);
    if (!set) {
      set = new Set();
      this.collectorMap.set(customId, set);
    }
    set.add(entry as CollectorEntry<any>);

    return collector;
  }

  /** Reject and drop every pending await for a customId. */
  cancelAwaits(customId: string, reason?: string): void {
    const set = this.awaitMap.get(customId);
    if (!set) return;
    this.awaitMap.delete(customId);
    for (const pending of set) {
      if (pending.timeout) clearTimeout(pending.timeout);
      pending.reject(new Error(reason ?? `Awaits for "${customId}" cancelled`));
    }
  }

  private remove(customId: string, pending: PendingAwaiter<any>): void {
    const set = this.awaitMap.get(customId);
    if (!set) return;
    if (pending.timeout) clearTimeout(pending.timeout);
    set.delete(pending);
    if (set.size === 0) this.awaitMap.delete(customId);
  }

  private async passes(
    filter: ((interaction: never) => boolean | Promise<boolean>) | undefined,
    interaction: Interaction
  ): Promise<boolean> {
    if (!filter) return true;
    try {
      return await filter(interaction as never);
    } catch {
      return false;
    }
  }

  private async handle(interaction: Interaction): Promise<void> {
    const customId = (interaction as Interaction & { customId?: unknown })
      .customId;
    if (typeof customId !== 'string' || !customId) return;

    const set = this.awaitMap.get(customId);
    if (set) {
      for (const pending of [...set]) {
        if (!(await this.passes(pending.filter, interaction))) continue;
        // Re-check: a concurrent handler may have settled this await while
        // the filter was being evaluated.
        if (!this.awaitMap.get(customId)?.has(pending)) continue;

        pending.collected.push(interaction);
        if (pending.collected.length >= pending.maxUses) {
          this.remove(customId, pending);
          pending.resolve(
            pending.maxUses === 1 ? pending.collected[0] : pending.collected
          );
        }
      }
    }

    const collectors = this.collectorMap.get(customId);
    if (collectors) {
      for (const entry of [...collectors]) {
        if (entry.finished) continue;
        if (!(await this.passes(entry.filter, interaction))) continue;
        // Re-check: a concurrent handler may have finished this collector
        // while the filter was being evaluated.
        if (entry.finished || !this.collectorMap.get(customId)?.has(entry))
          continue;

        entry.onCollect(interaction as never);
        if (entry.collected.length >= entry.max) {
          if (entry.timeout) clearTimeout(entry.timeout);
          entry.finished = true;
          collectors.delete(entry);
          if (collectors.size === 0) this.collectorMap.delete(customId);
          entry.onEnd(entry.collected, 'limit');
        }
      }
    }
  }
}
