import {
  Client,
  ClientOptions,
  IntentsBitField,
  Interaction,
} from 'discord.js';
import { BunClientOptions } from '@struct/BunClientOptions.js';
import { CommandHandlerOptions } from '@struct/commands/CommandHandler.js';
import { CommandHandler } from '@client/commands/CommandHandler.js';
import { InteractionAwaiter } from './interactions/InteractionAwaiter';
export class BunClient extends Client {
  private commandHandler?: CommandHandler;
  private interactionAwaiter?: InteractionAwaiter;

  declare options: BunClientOptions &
    Omit<ClientOptions, 'intents'> & { intents: IntentsBitField };

  constructor(options: BunClientOptions) {
    super(options);

    this.commandHandler = new CommandHandler(this);
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
