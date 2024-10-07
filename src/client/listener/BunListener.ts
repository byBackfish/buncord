import { BunClient } from '..';
import { ClientEvents } from 'discord.js';

export class BunListener<CustomClient extends BunClient<CustomClient>, T extends keyof ClientEvents> {
  //@ts-expect-error
  public client: CustomClient;

  constructor(public event: T) {}

  async execute(...args: ClientEvents[T]): Promise<void> {}
}
