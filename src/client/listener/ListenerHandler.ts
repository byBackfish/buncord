import { BunListener, type ListenerResolvable } from "@client";
import type { BunClient } from "@client";
import { ClientEvents } from "discord.js";
import { glob } from "glob";
import { resolve } from "path";

export class ListenerHandler {
  public listeners: ListenerResolvable[] = [];

  constructor(private client: BunClient) {}

  /** Register a listener programmatically (alternative to `listenerDirPath`). */
  public add(listener: ListenerResolvable): this {
    this.wire(listener);
    this.listeners.push(listener);
    return this;
  }

  public async loadListeners(): Promise<void> {
    const dir = this.client.options.listeners?.listenerDirPath;
    if (!dir) return;

    const path = resolve(dir);
    const files = (
      await glob(`${path}/**/*.{ts,js,mjs}`, { ignore: '**/*.d.ts' })
    ).sort();

    for (const file of files) {
      try {
        const filePath = resolve(file);
        const mod = await import(filePath);
        const exported = mod.default;
        if (!exported) {
          this.client.logger.warn(`Skipping ${file}: no default export`);
          continue;
        }
        const listener: ListenerResolvable =
          typeof exported === 'function' ? new exported() : exported;
        if (
          !listener ||
          typeof (listener as any).event !== 'string' ||
          typeof (listener as any).execute !== 'function'
        ) {
          this.client.logger.warn(
            `Skipping ${file}: default export is not a listener`
          );
          continue;
        }
        this.add(listener);
      } catch (error) {
        this.client.logger.error(`Failed to load listener ${file}:`, error);
      }
    }
  }

  private wire(listener: ListenerResolvable): void {
    if (listener instanceof BunListener) {
      listener.client = this.client;
      const run = (...args: ClientEvents[typeof listener.event]) => {
        Promise.resolve(listener.execute(...args)).catch((error) => {
          this.client.logger.error(
            `Error in listener for "${String(listener.event)}":`,
            error
          );
        });
      };
      if (listener.once) this.client.once(listener.event, run);
      else this.client.on(listener.event, run);
      return;
    }

    const ctx = { client: this.client };
    const run = (...args: ClientEvents[typeof listener.event]) => {
      try {
        const result = (listener.execute as (...a: any[]) => unknown).apply(
          ctx,
          args
        );
        Promise.resolve(result).catch((error) => {
          this.client.logger.error(
            `Error in listener for "${String(listener.event)}":`,
            error
          );
        });
      } catch (error) {
        this.client.logger.error(
          `Error in listener for "${String(listener.event)}":`,
          error
        );
      }
    };
    if (listener.once) this.client.once(listener.event, run as never);
    else this.client.on(listener.event, run as never);
  }
}
