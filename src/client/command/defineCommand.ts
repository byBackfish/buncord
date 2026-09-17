import { BunCommand } from "./BunCommand";
import type {
  ArgsFromOptions,
  BunChatInputInteraction,
  CommandOption,
  Pretty,
} from "@struct/command/CommandArgument";
import type { CommandData, CommandReturnable } from "@struct/command/Command";
import type { BunClient } from "..";
import {
  ApplicationCommandType,
  type MessageContextMenuCommandInteraction,
  type UserContextMenuCommandInteraction,
} from "discord.js";

type ExecuteFn<Opts extends readonly CommandOption[]> = (
  this: { client: BunClient },
  interaction: BunChatInputInteraction<BunClient>,
  args: Pretty<ArgsFromOptions<Opts>>
) => Promise<CommandReturnable>;

interface LeafDefinition<
  Opts extends readonly CommandOption[] = readonly CommandOption[],
> extends Omit<CommandData, "options" | "subcommands"> {
  options?: Opts;
  subcommands?: never;
  execute: ExecuteFn<Opts>;
}

interface ParentDefinition extends Omit<
  CommandData,
  "options" | "subcommands"
> {
  options?: never;
  /** Nested subcommands/groups. A node with these has no `execute`. */
  subcommands: BunCommand[];
  execute?: never;
}

export type CommandDefinition<
  Opts extends readonly CommandOption[] = readonly CommandOption[],
> = LeafDefinition<Opts> | ParentDefinition;

export type SubcommandDefinition<
  Opts extends readonly CommandOption[] = readonly CommandOption[],
> =
  | (Omit<LeafDefinition<Opts>, "type"> & { type?: never })
  | (Omit<ParentDefinition, "type"> & { type?: never });

/**
 * Define a command as an object instead of a class. The `args` parameter of
 * `execute` is inferred from `options` (`required`/`default` control
 * optionality, static `choices` narrow to their value union). Use method
 * shorthand — not an arrow function — if you need `this.client`.
 * A node with `subcommands` is a group/parent and takes no `execute`.
 *
 * @example
 * export default defineCommand({
 *   name: 'ping',
 *   description: 'Replies with pong',
 *   async execute(interaction, args) {
 *     return 'Pong!';
 *   },
 * });
 */
export function defineCommand<const Opts extends readonly CommandOption[]>(
  def: CommandDefinition<Opts>
): BunCommand {
  return instantiate(def);
}

/**
 * Same factory as {@link defineCommand}, distinct name for readability:
 * use it for leaves and groups nested inside a command. A node with
 * `subcommands` is a group (no `options`/`execute`); without, a leaf.
 * Only one group level is allowed (Discord limit).
 */
export function defineSubcommand<const Opts extends readonly CommandOption[]>(
  def: SubcommandDefinition<Opts>
): BunCommand {
  return instantiate(def);
}

export type ContextMenuCommandDefinition = Omit<
  CommandData,
  "description" | "options" | "subcommands" | "type" | "nsfw"
> & {
  // Context menu commands carry no description on Discord.
  description?: never;
};

export interface UserCommandDefinition extends ContextMenuCommandDefinition {
  execute: (
    this: { client: BunClient },
    interaction: UserContextMenuCommandInteraction & { client: BunClient }
  ) => Promise<CommandReturnable>;
}

export interface MessageCommandDefinition
  extends ContextMenuCommandDefinition {
  execute: (
    this: { client: BunClient },
    interaction: MessageContextMenuCommandInteraction & { client: BunClient }
  ) => Promise<CommandReturnable>;
}

/** Define a user context menu command (right-click a user). */
export function defineUserCommand(def: UserCommandDefinition): BunCommand {
  const { execute, ...rest } = def;
  const cmd = new BunCommand({
    ...rest,
    description: '',
    type: ApplicationCommandType.User,
  });
  const fn = execute;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cmd.execute = async function (interaction: any): Promise<CommandReturnable> {
    return (fn as (...a: any[]) => CommandReturnable).call(this, interaction);
  };
  return cmd;
}

/** Define a message context menu command (right-click a message). */
export function defineMessageCommand(
  def: MessageCommandDefinition
): BunCommand {
  const { execute, ...rest } = def;
  const cmd = new BunCommand({
    ...rest,
    description: '',
    type: ApplicationCommandType.Message,
  });
  const fn = execute;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cmd.execute = async function (interaction: any): Promise<CommandReturnable> {
    return (fn as (...a: any[]) => CommandReturnable).call(this, interaction);
  };
  return cmd;
}

function instantiate<const Opts extends readonly CommandOption[]>(
  def: CommandDefinition<Opts> | SubcommandDefinition<Opts>
): BunCommand {
  const { execute, options, subcommands, ...rest } = def as Omit<
    CommandData,
    "options" | "subcommands"
  > & {
    options?: readonly CommandOption[];
    subcommands?: BunCommand[];
    execute?: ExecuteFn<readonly CommandOption[]>;
  };
  const cmd = new BunCommand({
    ...rest,
    options: options ? [...options] : undefined,
    subcommands,
  });
  // Groups have no execute of their own; routing always lands on a leaf.
  if (!execute) return cmd;
  const fn = execute;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cmd.execute = async function (
    interaction: any,
    args: any
  ): Promise<CommandReturnable> {
    return (fn as (...a: any[]) => CommandReturnable).call(
      this,
      interaction,
      args
    );
  };
  return cmd;
}
