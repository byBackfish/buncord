import {
  Embed,
  EmbedBuilder,
  InteractionReplyOptions,
  Snowflake,
} from 'discord.js';
import { CommandArgument } from './CommandArgument';

export interface Command {
  description: string;

  options?: CommandArgument[];
  nsfw?: boolean;

  guildIDs?: Snowflake[];
  ownerOnly?: boolean;
  userPermissions?: Snowflake[];
  selfPermissions?: Snowflake[];
}

export type CommandReturnable =
  | Promise<void>
  | Promise<EmbedBuilder>
  | Promise<EmbedBuilder[]>
  | Promise<string>
  | Promise<InteractionReplyOptions>;
