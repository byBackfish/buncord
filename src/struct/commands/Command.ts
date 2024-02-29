import { EmbedBuilder, Snowflake } from "discord.js";
import { CommandArgument } from "./CommandArgument";

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
  | void
  | Promise<void>
  | EmbedBuilder
  | Promise<EmbedBuilder>
  | string
  | Promise<string>;
