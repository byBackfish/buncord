import type { BunClient } from '..';
import { ClientEvents } from 'discord.js';

export class BunListener<
  T extends keyof ClientEvents,
  TClient extends BunClient = BunClient,
> {
  public client!: TClient;
  /** Use `client.once()` instead of `client.on()` for this listener. */
  public readonly once: boolean = false;

  constructor(public event: T) {}

  async execute(...args: ClientEvents[T]): Promise<void> {}
}

export type ListenerExecute<T extends keyof ClientEvents> = (
  this: { client: BunClient },
  ...args: ClientEvents[T]
) => Promise<void> | void;

export interface ListenerDefinition<T extends keyof ClientEvents = keyof ClientEvents> {
  event: T;
  once?: boolean;
  execute: ListenerExecute<T>;
}

/**
 * Define a listener with the event written once and `execute` args inferred.
 * Recommended over extending {@link BunListener}.
 *
 * @example
 * export default defineListener({
 *   event: Events.ClientReady,
 *   async execute(client) {
 *     this.client.logger.log(`Ready as ${client.user.tag}`);
 *   },
 * });
 */
export function defineListener<T extends keyof ClientEvents>(
  def: ListenerDefinition<T> & { event: T }
): ListenerDefinition<T> {
  return def;
}

export type ListenerResolvable =
  | BunListener<keyof ClientEvents, any>
  | ListenerDefinition<keyof ClientEvents>;
