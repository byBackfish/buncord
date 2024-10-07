import { BunClient } from "@client/BunClient";
import { AutocompleteInteraction } from "discord.js";

export interface CommandArgument {
  name: string;
  description: string;
  type: number;
  required?: boolean;
  choices?: CommandArgumentChoices;

  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;

  autocomplete?: boolean;
  onAutocomplete?: <CustomClient extends BunClient<CustomClient>>(
    client: CustomClient,
    interaction: AutocompleteInteraction,
  ) => Promise<CommandArgumentChoiceFixed[]>;

  default?: any;
}

type CommandArgumentChoiceFixed = {
  name: string;
  value: string | number;
};
type CommandArgumentChoiceFunction = <CustomClient extends BunClient<CustomClient>>(
  client: CustomClient,
) => CommandArgumentChoiceFixed[];

export type CommandArgumentChoices =
  | CommandArgumentChoiceFixed[]
  | CommandArgumentChoiceFunction;
