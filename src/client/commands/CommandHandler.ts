import {
  ApplicationCommandData,
  AutocompleteInteraction,
  CommandInteraction,
  EmbedBuilder,
  Interaction,
  InteractionReplyOptions,
} from 'discord.js';
import { BunClient, BunCommand } from '@client';
import { sync } from 'glob';
import { CommandHandlerOptions } from '@struct/commands/CommandHandler';

export class CommandHandler {
  private commands: Map<string, BunCommand> = new Map();
  constructor(
    private client: BunClient,
    private options: CommandHandlerOptions
  ) {}

  public async loadCommands(): Promise<void> {
    sync(`${this.options.path}**/*.ts`).forEach(async (file) => {
      let required = await require(file);
      const command: BunCommand = new required.default();
      command.client = this.client;
      this.commands.set(command.name, command);
    });
  }

  public registerCommands(): void {
    let data: ApplicationCommandData[] = [];

    this.commands.forEach((command) => {
      data.push(command.toJSON());
    });

    this.client?.application?.commands.set(data);
  }

  public async handleInteraction(interaction: Interaction): Promise<void> {
    if (interaction.isCommand())
      this.handleCommand(interaction as CommandInteraction);
    else if (interaction.isAutocomplete())
      this.handleAutocomplete(interaction as AutocompleteInteraction);
  }

  private async handleCommand(interaction: CommandInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (!command) return;

    if (this.client.bunClientOptions.commands?.default.autoDefer == true)
      await interaction.deferReply();

    let args: Record<string, any> = {};

    for (let argument of command.options.options ?? []) {
      if (interaction.options.get(argument.name) !== undefined) {
        if (argument.type == BunCommand.Type.USER) {
          args[argument.name] = interaction.options.getUser(argument.name);
        } else {
          args[argument.name] = interaction.options.get(argument.name)?.value;
        }
      } else if (argument.default !== undefined) {
        args[argument.name] = argument.default;
      }
    }

    let result = await command.execute(interaction, args);

    let response: InteractionReplyOptions = {};

    if (result instanceof EmbedBuilder) {
      response.embeds = [...(response.embeds || []), result];
    } else if (typeof result === 'string') {
      response.content = result;
    } else if (
      Array.isArray(result) &&
      result.every((embed) => embed instanceof EmbedBuilder)
    ) {
      response.embeds = result as EmbedBuilder[];
    } else if (typeof result === 'object') {
      response = result as InteractionReplyOptions;
    }

    if (this.client.bunClientOptions.commands?.default.useEphemeral == true) {
      response.ephemeral = true;
    }

    if (response) {
      if (interaction.replied || interaction.deferred)
        interaction.editReply(response);
      else interaction.reply(response);
    }
  }

  private async handleAutocomplete(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (!command) return;

    let { name } = interaction.options.getFocused(true);

    if (name) {
      const option = command.options.options?.find(
        (option) => option.name === name
      );

      if (!option) return;

      let result = await option.onAutocomplete?.(this.client, interaction);

      if (!result) return;
      interaction.respond(result);
    }
  }
}
