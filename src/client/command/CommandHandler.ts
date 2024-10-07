import {
  ApplicationCommandData,
  AutocompleteInteraction,
  CommandInteraction,
  EmbedBuilder,
  Interaction,
  InteractionReplyOptions,
  ModalBuilder,
} from 'discord.js';
import { BunClient, BunCommand } from '@client';
import { sync } from 'glob';
import { resolve } from 'path'

export class CommandHandler<CustomClient extends BunClient<CustomClient>> {
  private commands: Map<string, BunCommand<CustomClient>> = new Map();
  constructor(private client: CustomClient) {}

  public async loadCommands(): Promise<void> {
    const path = resolve(this.client.options.commands.commandDirPath);
    sync(`${path}/*.ts`).forEach(
      async (file) => {
        const filePath = resolve(file);
        let required = await require(filePath);
        const command: BunCommand<CustomClient> = new required.default();
        command.client = this.client;
        this.commands.set(command.name, command);
      }
    );
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

    if (this.client.options.commands.autoDefer) await interaction.deferReply();

    let args: Record<string, any> = {};

    for (let argument of command.options.options ?? []) {
      if (interaction.options.get(argument.name) !== undefined) {
        if (argument.type == BunCommand.Type.USER) {
          args[argument.name] = interaction.options.get(argument.name);
        } else {
          args[argument.name] = interaction.options.get(argument.name)?.value;
        }
      } else if (argument.default !== undefined) {
        args[argument.name] = argument.default;
      }
    }

    let result = await command.execute(interaction, args);

    let response: InteractionReplyOptions = {};

    if (typeof result === 'string') {
      response.content = result;
    } else if (typeof result === 'object') {
      let isArray = Array.isArray(result);
      if (isArray) {
        response.embeds = result as EmbedBuilder[];
      } else {
        let isEmbed = (result as any).data?.footer;
        let isModal = (result as any).data?.title;
        if (isEmbed) {
          response.embeds = [result as EmbedBuilder];
        } else if (isModal) {
          return interaction.showModal(result as ModalBuilder);
        } else {
          response = result as InteractionReplyOptions;
        }
      }
    }

    if (this.client.options.commands.useEphemeral) {
      response.ephemeral = true;
    }

    if (response && Object.keys(response).length >= 1) {
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
