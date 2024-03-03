import { BunClient } from "..";
import { ClientEvents } from "discord.js";

export class BunListener<T extends keyof ClientEvents> {
  //@ts-expect-error
  public client: BunClient;

  constructor(public event: T) {}

  execute(...args: ClientEvents[T]) {}
}
