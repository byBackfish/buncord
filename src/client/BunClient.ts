import {
  Client,
  ClientOptions,
  IntentsBitField,
  Interaction,
} from "discord.js";
import { BunClientOptions } from "@struct/BunClientOptions.js";
import { CommandHandler } from "@client/command/CommandHandler.js";
import { InteractionAwaiter } from "./interaction/InteractionAwaiter";
import { BunConsole } from "./util/console";
import { ListenerHandler } from ".";
export class BunClient<CustomClient extends BunClient<CustomClient>> extends Client {
  private commandHandler: CommandHandler<CustomClient>;
  private interactionAwaiter: InteractionAwaiter<CustomClient>;
  private listenerHandler: ListenerHandler<CustomClient>;
  public console: BunConsole;

  declare options: BunClientOptions &
    Omit<ClientOptions, "intents"> & { intents: IntentsBitField };

  constructor(options: BunClientOptions) {
    super(options);

    // @ts-expect-error
    this.commandHandler = new CommandHandler(this);
    this.commandHandler.loadCommands();

    // @ts-expect-error
    this.listenerHandler = new ListenerHandler(this);

    // @ts-expect-error
    this.interactionAwaiter = new InteractionAwaiter(this);

    this.console = new BunConsole();

    this.on("ready", () => {
      this.commandHandler?.registerCommands();
    });

    this.on("interactionCreate", async (interaction: Interaction) => {
      this.commandHandler?.handleInteraction(interaction);
    });
  }

  login() {
    return super.login(this.options.token);
  }

  stop() {
    return super.destroy();
  }

  public await<T extends Interaction>(
    customId: string,
    maxUses = 1
  ): Promise<T> {
    return this.interactionAwaiter!!.await<T>(customId, maxUses);
  }

  public makeRandom(customId: string): string {
    return `${this.readyTimestamp}:${customId}:${this.makeRandomInteger(
      0,
      1000000
    )}`;
  }

  makeRandomInteger(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }
}
