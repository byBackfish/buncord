import { Command, CommandReturnable } from "@/struct/command/Command";
import {
  CommandArgument,
  CommandArgumentChoices,
} from "@struct/command/CommandArgument";
import {
  ApplicationCommandChoicesData,
  ApplicationCommandData,
  ApplicationCommandNumericOptionData,
  ApplicationCommandOptionChoiceData,
  ApplicationCommandOptionData,
  ApplicationCommandStringOptionData,
  ApplicationCommandType,
  CommandInteraction,
} from "discord.js";
import { BunClient } from "..";

export class BunCommand<CustomClient extends BunClient<CustomClient>> {
  static Type = {
    SUB_COMMAND: 1,
    SUB_COMMAND_GROUP: 2,
    STRING: 3,
    INTEGER: 4,
    BOOLEAN: 5,
    USER: 6,
    CHANNEL: 7,
    ROLE: 8,
    MENTIONABLE: 9,
    NUMBER: 10,
    ATTACHMENT: 11,
  };

  // @ts-ignore
  client: CustomClient;

  constructor(
    public name: string,
    public options: Command
  ) {}

  async execute(
    interaction: CommandInteraction,
    args: Record<string, any>
  ): Promise<CommandReturnable> {}

  private buildJSON(): ApplicationCommandData {
    return {
      name: this.name,
      description: this.options.description,
      type: ApplicationCommandType.ChatInput,
      nsfw: this.options.nsfw,
      options: this.options.options?.map(this.buildOption.bind(this)),
    };
  }

  private buildOption(option: CommandArgument): ApplicationCommandOptionData {
    let baseOptions: ApplicationCommandOptionData = {
      name: option.name,
      description: option.description,
      type: option.type,
      required: option.required ?? false,
      autocomplete: option.autocomplete ?? false,
    };

    if (
      option.type === BunCommand.Type.NUMBER ||
      option.type === BunCommand.Type.INTEGER
    ) {
      (baseOptions as ApplicationCommandNumericOptionData).minValue =
        option.minValue;
      (baseOptions as ApplicationCommandNumericOptionData).maxValue =
        option.maxValue;
    } else if (option.type === BunCommand.Type.STRING) {
      (baseOptions as ApplicationCommandStringOptionData).minLength =
        option.minLength;
      (baseOptions as ApplicationCommandStringOptionData).maxLength =
        option.maxLength;
    }

    if (option.choices) {
      (baseOptions as ApplicationCommandChoicesData<string | number>).choices =
        this.buildChoices(option.choices);
    }

    return baseOptions;
  }

  private buildChoices(
    choices: CommandArgumentChoices
  ): ApplicationCommandOptionChoiceData<string | number>[] {
    if (typeof choices === "function") {
      return choices(this.client!!);
    }

    return choices;
  }

  public toJSON(): ApplicationCommandData {
    return this.buildJSON();
  }
}
