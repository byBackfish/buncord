import { ClientOptions, IntentsBitField, Snowflake } from "discord.js";

type BunClientOptions = {
  groups?: {
    owners: Snowflake[];
    developers: Snowflake[];
  };
  commands: {
    commandDirPath: string;

    allowBots?: boolean;
    allowDM?: boolean;
    allowGuild?: boolean;
    allowNSFW?: boolean;
    allowThread?: boolean;
    allowForum?: boolean;

    autoDefer?: boolean;
    useEphemeral?: boolean;
  };

  listeners: {
    listenerDirPath: string;
  };

  token: string;
};

type FinalOptions = BunClientOptions & ClientOptions;
export { FinalOptions as BunClientOptions };
