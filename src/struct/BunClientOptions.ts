import { ClientOptions, IntentsBitField, Snowflake } from "discord.js";

type BunClientOptions = {
  groups?: {
    owners: Snowflake[];
    developers: Snowflake[];
  };
  commands?: {
    default: {
      allowBots: boolean;
      allowDM: boolean;
      allowGuild: boolean;
      allowNSFW: boolean;
      allowThread: boolean;
      allowForum: boolean;

      autoDefer: boolean;
      useEphemeral: boolean;
      autoEmbed: boolean;
    };
  };

  whitelist?: {
    whitelistEnabled: boolean;
    guilds: {
      [guildID: Snowflake]: {
        isBlacklisted: boolean;
        isWhitelisted: boolean;
      };
    };
  };

  token: string;
};

type FinalOptions = /*Omit<ClientOptions, 'intents'> & {
  intents: IntentsBitField;
} & BunClientOptions;
*/ BunClientOptions & ClientOptions;
export { FinalOptions as BunClientOptions };
