import {
  ApplicationCommandType,
  EmbedBuilder,
  InteractionContextType,
  InteractionReplyOptions,
  LocalizationMap,
  ModalBuilder,
  PermissionResolvable,
  Snowflake,
} from 'discord.js';
import type { BunCommand } from '@client/command/BunCommand';
import type {
  BunChatInputInteraction,
  CommandOption,
} from './CommandArgument';

export type PreconditionResult = true | string;
/**
 * Return `true` to pass, or a denial message to reject (sent ephemerally).
 */
export type Precondition = (
  interaction: BunChatInputInteraction
) => PreconditionResult | Promise<PreconditionResult>;

export interface CooldownOptions {
  /** Cooldown length in milliseconds. */
  duration: number;
  /** What the cooldown is tracked per. Defaults to `'user'`. */
  scope?: 'user' | 'guild' | 'channel' | 'global';
  /** Owners bypass the cooldown. Defaults to `true`. */
  bypassOwners?: boolean;
}

export interface CommandData {
  name: string;
  description: string;
  /** Defaults to `ChatInput`. Set for context menu commands. */
  type?: ApplicationCommandType;
  nameLocalizations?: LocalizationMap;
  descriptionLocalizations?: LocalizationMap;

  options?: CommandOption[];
  /**
   * Nested subcommands/groups. Cannot be combined with `options` —
   * Discord requires one or the other. Only one group level is allowed
   * (group → subcommand), and `defaultMemberPermissions` can only be set
   * on the top-level command, so leaf `userPermissions` are runtime-only.
   */
  subcommands?: BunCommand[];
  nsfw?: boolean;

  /** Restrict usage to these guilds at runtime. Registration stays global. */
  guildIDs?: Snowflake[];
  ownerOnly?: boolean;
  /**
   * Discord-side + runtime requirement. Mapped to
   * `default_member_permissions` at registration so users without the
   * permissions don't even see the command.
   */
  userPermissions?: PermissionResolvable;
  /** Explicit Discord-side value. `userPermissions` wins if both are set. */
  defaultMemberPermissions?: PermissionResolvable | null;
  /** Runtime requirement for the bot itself (checked via appPermissions). */
  selfPermissions?: PermissionResolvable;
  /** Legacy DM visibility flag, passed through to Discord. */
  dmPermission?: boolean;
  /** Where the command is visible. Passed through to Discord. */
  contexts?: readonly InteractionContextType[];

  autoDefer?: boolean;
  useEphemeral?: boolean;
  /** Overrides the global execution-error reply for this command. */
  errorMessage?: string;
  cooldown?: CooldownOptions;
  /** Custom checks run after built-in constraints. First denial wins. */
  preconditions?: Precondition[];
}

/** @deprecated Use {@link CommandData} instead. */
export type Command = CommandData;

export type CommandReturnable =
  | void
  | null
  | undefined
  | EmbedBuilder
  | EmbedBuilder[]
  | ModalBuilder
  | string
  | InteractionReplyOptions;
