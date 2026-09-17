import {
  CommandData,
  CommandReturnable,
} from "@/struct/command/Command";
import {
  BunChatInputInteraction,
  CommandOption,
  CommandOptionChoices,
} from "@struct/command/CommandArgument";
import {
  ApplicationCommandChannelOptionData,
  ApplicationCommandChoicesData,
  ApplicationCommandData,
  ApplicationCommandNumericOptionData,
  ApplicationCommandOptionChoiceData,
  ApplicationCommandOptionData,
  ApplicationCommandOptionType,
  ApplicationCommandStringOptionData,
  ApplicationCommandSubCommandData,
  ApplicationCommandSubGroupData,
  ApplicationCommandType,
  ChatInputCommandInteraction,
} from "discord.js";
import type { BunClient } from "..";

type LeafOptionData = Exclude<
  ApplicationCommandOptionData,
  ApplicationCommandSubGroupData | ApplicationCommandSubCommandData
>;

export class BunCommand<TClient extends BunClient = BunClient> {
  /**
   * @deprecated Use `ApplicationCommandOptionType` from discord.js instead.
   */
  static Type = {
    SUB_COMMAND: ApplicationCommandOptionType.Subcommand,
    SUB_COMMAND_GROUP: ApplicationCommandOptionType.SubcommandGroup,
    STRING: ApplicationCommandOptionType.String,
    INTEGER: ApplicationCommandOptionType.Integer,
    BOOLEAN: ApplicationCommandOptionType.Boolean,
    USER: ApplicationCommandOptionType.User,
    CHANNEL: ApplicationCommandOptionType.Channel,
    ROLE: ApplicationCommandOptionType.Role,
    MENTIONABLE: ApplicationCommandOptionType.Mentionable,
    NUMBER: ApplicationCommandOptionType.Number,
    ATTACHMENT: ApplicationCommandOptionType.Attachment,
  } as const;

  public client!: TClient;
  public readonly data: CommandData;

  constructor(def: CommandData);
  /**
   * @deprecated Pass a single descriptor object instead:
   * `super({ name, description, ... })`.
   */
  constructor(name: string, options: Omit<CommandData, "name">);
  constructor(
    defOrName: CommandData | string,
    legacyOptions?: Omit<CommandData, "name">
  ) {
    this.data =
      typeof defOrName === "string"
        ? { ...legacyOptions!, name: defOrName }
        : defOrName;
  }

  public get name(): string {
    return this.data.name;
  }

  /** @deprecated Use {@link data} instead. */
  public get options(): CommandData {
    return this.data;
  }

  /** True when this node is a subcommand group (has nested subcommands). */
  public get isGroup(): boolean {
    return !!this.data.subcommands && this.data.subcommands.length > 0;
  }

  async execute(
    interaction: BunChatInputInteraction<TClient>,
    args: Record<string, any>
  ): Promise<CommandReturnable> {
    throw new Error(`Command "${this.name}" has no execute() implementation`);
  }

  private buildJSON(): ApplicationCommandData {
    const type = this.data.type ?? ApplicationCommandType.ChatInput;

    if (type !== ApplicationCommandType.ChatInput) {
      if (this.data.options?.length || this.data.subcommands?.length)
        throw new Error(
          `Command "${this.data.name}": context menu commands cannot have options or subcommands`
        );
      // Discord requires these commands without a description.
      return {
        name: this.data.name,
        type,
        defaultMemberPermissions:
          this.data.userPermissions ?? this.data.defaultMemberPermissions,
        dmPermission: this.data.dmPermission,
        contexts: this.data.contexts,
      } as ApplicationCommandData;
    }

    if (this.data.subcommands?.length && this.data.options?.length)
      throw new Error(
        `Command "${this.data.name}": options and subcommands cannot be combined`
      );

    if (this.data.subcommands?.length) {
      const seen = new Set<string>();
      for (const sub of this.data.subcommands) {
        if (seen.has(sub.data.name))
          throw new Error(
            `Command "${this.data.name}": duplicate subcommand "${sub.data.name}"`
          );
        seen.add(sub.data.name);
      }
    }

    const options: ApplicationCommandOptionData[] | undefined =
      this.data.subcommands?.length
        ? this.data.subcommands.map((sub) => this.buildSubcommand(sub, 0))
        : this.data.options?.map(this.buildOption.bind(this));

    return {
      name: this.data.name,
      description: this.data.description,
      type: ApplicationCommandType.ChatInput,
      nsfw: this.data.nsfw,
      nameLocalizations: this.data.nameLocalizations,
      descriptionLocalizations: this.data.descriptionLocalizations,
      defaultMemberPermissions:
        this.data.userPermissions ?? this.data.defaultMemberPermissions,
      dmPermission: this.data.dmPermission,
      contexts: this.data.contexts,
      options,
    };
  }

  private buildSubcommand(
    sub: BunCommand,
    depth: number
  ): ApplicationCommandSubCommandData | ApplicationCommandSubGroupData {
    if (sub.data.type)
      throw new Error(
        `Command "${this.data.name}": subcommand "${sub.data.name}" cannot set type`
      );

    if (sub.isGroup) {
      if (depth > 0)
        throw new Error(
          `Command "${this.data.name}": only one subcommand group level is allowed`
        );
      const seen = new Set<string>();
      for (const leaf of sub.data.subcommands!) {
        if (leaf.isGroup)
          throw new Error(
            `Command "${this.data.name}": group "${sub.data.name}" cannot contain another group`
          );
        if (leaf.data.options?.length && leaf.data.subcommands?.length)
          throw new Error(
            `Command "${this.data.name}": subcommand "${leaf.data.name}" cannot combine options and subcommands`
          );
        if (seen.has(leaf.data.name))
          throw new Error(
            `Command "${this.data.name}": duplicate subcommand "${leaf.data.name}" in group "${sub.data.name}"`
          );
        seen.add(leaf.data.name);
      }
      return {
        name: sub.data.name,
        description: sub.data.description,
        nameLocalizations: sub.data.nameLocalizations,
        descriptionLocalizations: sub.data.descriptionLocalizations,
        type: ApplicationCommandOptionType.SubcommandGroup,
        options: sub.data.subcommands!.map((leaf) =>
          this.buildLeaf(leaf)
        ),
      };
    }

    return this.buildLeaf(sub);
  }

  private buildLeaf(sub: BunCommand): ApplicationCommandSubCommandData {
    if (sub.data.subcommands?.length)
      throw new Error(
        `Command "${this.data.name}": subcommand "${sub.data.name}" cannot combine options and subcommands`
      );
    return {
      name: sub.data.name,
      description: sub.data.description,
      nameLocalizations: sub.data.nameLocalizations,
      descriptionLocalizations: sub.data.descriptionLocalizations,
      type: ApplicationCommandOptionType.Subcommand,
      options: sub.data.options?.map(this.buildOption.bind(this)),
    };
  }

  private buildOption(option: CommandOption): LeafOptionData {
    if (
      option.type === ApplicationCommandOptionType.Subcommand ||
      option.type === ApplicationCommandOptionType.SubcommandGroup
    )
      throw new Error(
        `Command "${this.data.name}": option "${option.name}" uses a subcommand type — declare it under subcommands instead`
      );

    const baseOptions = {
      name: option.name,
      description: option.description,
      nameLocalizations: option.nameLocalizations,
      descriptionLocalizations: option.descriptionLocalizations,
      type: option.type,
      required: option.required ?? false,
      autocomplete: option.autocomplete ?? false,
    } as LeafOptionData;

    if (
      option.type === ApplicationCommandOptionType.Number ||
      option.type === ApplicationCommandOptionType.Integer
    ) {
      (baseOptions as ApplicationCommandNumericOptionData).minValue =
        option.minValue;
      (baseOptions as ApplicationCommandNumericOptionData).maxValue =
        option.maxValue;
    } else if (option.type === ApplicationCommandOptionType.String) {
      (baseOptions as ApplicationCommandStringOptionData).minLength =
        option.minLength;
      (baseOptions as ApplicationCommandStringOptionData).maxLength =
        option.maxLength;
    } else if (option.type === ApplicationCommandOptionType.Channel) {
      (baseOptions as ApplicationCommandChannelOptionData).channelTypes =
        option.channelTypes;
    }

    if (option.choices) {
      (baseOptions as ApplicationCommandChoicesData<string | number>).choices =
        this.buildChoices(option.choices);
    }

    return baseOptions;
  }

  private buildChoices(
    choices: CommandOptionChoices
  ): ApplicationCommandOptionChoiceData<string | number>[] {
    if (typeof choices === "function") {
      return choices(this.client);
    }

    return choices;
  }

  public toJSON(): ApplicationCommandData {
    return this.buildJSON();
  }
}
