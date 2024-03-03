import { BunClient } from "..";
import { ClientEvents } from "discord.js";

export class BunListener<T extends keyof ClientEvents> {
  public client: BunClient | undefined;

  constructor(public event: T) {}

  execute(...args: ClientEvents[T]) {}
}
