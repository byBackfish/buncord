import { ClientOptions, Snowflake } from "discord.js";
import type { Precondition } from "./command/Command";

type BunClientOptions = {
  /** User IDs allowed to run `ownerOnly` commands. */
  owners?: Snowflake[];
  commands?: {
    commandDirPath?: string;

    allowDM?: boolean;
    allowGuild?: boolean;
    allowNSFW?: boolean;
    allowThread?: boolean;
    allowForum?: boolean;

    autoDefer?: boolean;
    useEphemeral?: boolean;
    /** Reply sent when a command throws. Per-command `errorMessage` wins. */
    errorMessage?: string;
    /** Global checks run for every command before its own preconditions. */
    preconditions?: Precondition[];
  };

  listeners?: {
    listenerDirPath?: string;
  };

  token?: string;
};

type FinalOptions = BunClientOptions & ClientOptions;
export { FinalOptions as BunClientOptions };
