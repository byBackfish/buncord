import type { BunClient } from "@client/BunClient";
import {
  ApplicationCommandOptionAllowedChannelTypes,
  ApplicationCommandOptionType,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  LocalizationMap,
} from "discord.js";
import type { Attachment, Channel, Role, User } from "discord.js";

export interface CommandOption {
  name: string;
  description: string;
  type: ApplicationCommandOptionType;
  required?: boolean;
  choices?: CommandOptionChoices;
  nameLocalizations?: LocalizationMap;
  descriptionLocalizations?: LocalizationMap;

  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  /** Restrict CHANNEL options to these channel types. */
  channelTypes?: ApplicationCommandOptionAllowedChannelTypes[];

  autocomplete?: boolean;
  onAutocomplete?: (
    interaction: AutocompleteInteraction & { client: BunClient }
  ) => Promise<CommandOptionChoiceFixed[]>;

  default?: any;
}

/** @deprecated Use {@link CommandOption} instead. */
export type CommandArgument = CommandOption;

export type CommandOptionChoiceFixed = {
  name: string;
  value: string | number;
};
/** @deprecated Use {@link CommandOptionChoiceFixed} instead. */
export type CommandArgumentChoiceFixed = CommandOptionChoiceFixed;

export type CommandOptionChoicesFunction = (
  client: BunClient
) => CommandOptionChoiceFixed[];
/** @deprecated Use {@link CommandOptionChoicesFunction} instead. */
export type CommandArgumentChoiceFunction = CommandOptionChoicesFunction;

export type CommandOptionChoices =
  | CommandOptionChoiceFixed[]
  | CommandOptionChoicesFunction;
/** @deprecated Use {@link CommandOptionChoices} instead. */
export type CommandArgumentChoices = CommandOptionChoices;

/** Interaction with a correctly typed buncord client. */
export type BunChatInputInteraction<
  TClient extends BunClient = BunClient,
> = ChatInputCommandInteraction & { client: TClient };

export type Pretty<T> = { [K in keyof T]: T[K] } & {};

/** Maps an option declaration to its runtime arg type. */
export type CommandOptionValue<O extends CommandOption> =
  O extends { choices: readonly { value: infer V }[] }
    ? V
    : O['type'] extends ApplicationCommandOptionType.String
      ? string
      : O['type'] extends
            | ApplicationCommandOptionType.Integer
            | ApplicationCommandOptionType.Number
        ? number
        : O['type'] extends ApplicationCommandOptionType.Boolean
          ? boolean
          : O['type'] extends ApplicationCommandOptionType.User
            ? User
            : O['type'] extends ApplicationCommandOptionType.Channel
              ? Channel
              : O['type'] extends ApplicationCommandOptionType.Role
                ? Role
                : O['type'] extends ApplicationCommandOptionType.Mentionable
                  ? User | Role
                  : O['type'] extends ApplicationCommandOptionType.Attachment
                    ? Attachment
                    : unknown;

type RequiredOption<Opts extends readonly CommandOption[]> = Extract<
  Opts[number],
  { name: string } & ({ required: true } | { default: unknown })
>;

type OptionalOption<Opts extends readonly CommandOption[]> = Exclude<
  Extract<Opts[number], { name: string }>,
  { required: true } | { default: unknown }
>;

/**
 * Infers the `args` object from an `options` array. `required: true` (or a
 * `default`) makes the key required; static `choices` narrow to their value
 * union. Only works through `defineCommand` — class overrides cannot
 * inherit contextual types.
 */
export type ArgsFromOptions<Opts extends readonly CommandOption[]> = Pretty<
  {
    [O in RequiredOption<Opts> as O['name']]: CommandOptionValue<O>;
  } & {
    [O in OptionalOption<Opts> as O['name']]?: CommandOptionValue<O> | undefined;
  }
>;
