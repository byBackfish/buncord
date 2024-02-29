import { Client, Interaction } from 'discord.js';
import { BunClientOptions } from '@struct/BunClientOptions.js';
import { CommandHandlerOptions } from '@struct/commands/CommandHandler.js';
import { CommandHandler } from '@client/commands/CommandHandler.js';
import {
  Interactable,
  InteractionAwaiter,
} from './interactions/InteractionAwaiter';
export class BunClient extends Client {
  private commandHandler?: CommandHandler;
  private interactionAwaiter?: InteractionAwaiter;

  constructor(
    public bunClientOptions: BunClientOptions,
    commandOptions: CommandHandlerOptions
  ) {
    super(bunClientOptions);

    this.commandHandler = new CommandHandler(this, commandOptions);
    this.commandHandler.loadCommands();

    this.on('ready', () => {
      this.interactionAwaiter = new InteractionAwaiter(this);
      this.commandHandler?.registerCommands();
    });

    this.on('interactionCreate', async (interaction: Interaction) => {
      this.commandHandler?.handleInteraction(interaction);
    });
  }

  login() {
    return super.login(this.bunClientOptions.token);
  }

  stop() {
    return super.destroy();
  }

  public await(customId: string, maxUses = 1): Promise<Interactable> {
    return this.interactionAwaiter!!.await(customId, maxUses);
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
