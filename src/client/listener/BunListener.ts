import { BunClient } from '..';
import { ClientEvents } from 'discord.js';

export class BunListener<T extends keyof ClientEvents> {
  //@ts-expect-error
  public client: BunClient;

  constructor(public event: T) {}

  async execute(...args: ClientEvents[T]): Promise<void> {}
}
