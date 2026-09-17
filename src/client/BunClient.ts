import {
  Client,
  ClientOptions,
  Events,
  IntentsBitField,
  Interaction,
} from "discord.js";
import type { BunClientOptions } from "@struct/BunClientOptions.js";
import { CommandHandler } from "@client/command/CommandHandler.js";
import {
  InteractionAwaiter,
  type AwaitInteractionOptions,
  type CollectOptions,
  type InteractionCollector,
} from "./interaction/InteractionAwaiter";
import { BunConsole } from "./util/console";
import { createCustomId, parseCustomId } from "./util/customId";
import { ListenerHandler } from ".";
import { randomUUID } from "crypto";
import type { BunCommand } from "@client";
import type {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
} from "discord.js";

export interface CommandErrorPayload {
  command: BunCommand;
  interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction;
  error: unknown;
}

declare module "discord.js" {
  interface ClientEvents {
    commandError: [payload: CommandErrorPayload];
  }
}

export class BunClient extends Client {
  public readonly commandHandler: CommandHandler;
  public readonly interactionAwaiter: InteractionAwaiter;
  public readonly listenerHandler: ListenerHandler;
  public readonly logger: BunConsole;
  private loaded = false;

  declare options: BunClientOptions &
    Omit<ClientOptions, "intents"> & { intents: IntentsBitField };

  constructor(options: BunClientOptions & ClientOptions) {
    super(options);

    this.commandHandler = new CommandHandler(this);
    this.listenerHandler = new ListenerHandler(this);
    this.interactionAwaiter = new InteractionAwaiter(this);

    this.logger = new BunConsole();

    this.once(Events.ClientReady, () => {
      this.commandHandler.registerCommands().catch((error) => {
        this.logger.error("Failed to register commands:", error);
      });
    });

    this.on(Events.InteractionCreate, (interaction: Interaction) => {
      this.commandHandler.handleInteraction(interaction).catch((error) => {
        this.logger.error("Error handling interaction:", error);
      });
    });
  }

  /** @deprecated Use {@link logger} instead. */
  public get console(): BunConsole {
    return this.logger;
  }

  /** Load commands + listeners. Idempotent; called automatically by login(). */
  public async loadAll(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    await this.commandHandler.loadCommands();
    await this.listenerHandler.loadListeners();
  }

  public override async login(token?: string): Promise<string> {
    await this.loadAll();
    return super.login(token ?? this.options.token ?? process.env.DISCORD_TOKEN);
  }

  /**
   * Wait for a component/modal interaction with a static customId.
   * Multiple callers can await the same id — scope with `filter`
   * (e.g. by user or message) and always pass `time`.
   */
  public awaitInteraction<T extends Interaction>(
    customId: string,
    options?: AwaitInteractionOptions<T> & { maxUses?: 1 }
  ): Promise<T>;
  public awaitInteraction<T extends Interaction>(
    customId: string,
    options: AwaitInteractionOptions<T> & { maxUses: number }
  ): Promise<T[]>;
  public awaitInteraction<T extends Interaction>(
    customId: string,
    options: AwaitInteractionOptions<T> & { maxUses?: number } = {}
  ): Promise<T | T[]> {
    const awaiter = this.interactionAwaiter.awaitInteraction as (
      customId: string,
      options: AwaitInteractionOptions<T> & { maxUses?: number }
    ) => Promise<T | T[]>;
    return awaiter.call(this.interactionAwaiter, customId, options);
  }

  /**
   * Collect every matching interaction until `time`/`max`/`stop()`.
   * Unlike `awaitInteraction`, one call observes many interactions —
   * via `.on('collect')` events or `for await` iteration.
   */
  public collectInteractions<T extends Interaction>(
    customId: string,
    options: CollectOptions<T> = {}
  ): InteractionCollector<T> {
    return this.interactionAwaiter.collect<T>(customId, options);
  }

  /**
   * @deprecated Use {@link awaitInteraction} instead.
   */
  public await<T extends Interaction>(
    customId: string,
    maxUses = 1
  ): Promise<T | T[]> {
    return this.interactionAwaiter.awaitInteraction<T>(customId, {
      maxUses: maxUses as 1,
    });
  }

  /**
   * Build a namespaced customId (`action` or `action:state`) within Discord's
   * 1-100 character limit. Prefer one stable id per action and disambiguate
   * concurrent uses with `awaitInteraction` filters, not random ids.
   */
  public createCustomId(action: string, state?: string | number): string {
    return createCustomId(action, state);
  }

  public parseCustomId(customId: string): { action: string; state?: string } {
    return parseCustomId(customId);
  }

  /**
   * @deprecated Prefer stable ids via {@link createCustomId} plus
   * `awaitInteraction` filters. Kept for backwards compatibility.
   */
  public makeRandom(customId: string): string {
    return `${customId}:${randomUUID().split("-")[0]}`;
  }
}
