import { defineCommand } from '@bybackfish/buncord';
import type { BunCommand } from '@bybackfish/buncord';
import { ApplicationCommandType, MessageFlags } from 'discord.js';

function describeLeaf(parent: string, leaf: BunCommand): string {
  const path =
    parent === leaf.name ? `/${parent}` : `/${parent} ${leaf.name}`;
  return `${path} — ${leaf.data.description}`;
}

function describe(command: BunCommand): string[] {
  const type = command.data.type ?? ApplicationCommandType.ChatInput;
  if (type === ApplicationCommandType.User)
    return [`Right-click user → ${command.name}`];
  if (type === ApplicationCommandType.Message)
    return [`Right-click message → ${command.name}`];
  if (!command.data.subcommands?.length)
    return [`/${command.name} — ${command.data.description}`];
  return command.data.subcommands.flatMap((sub) =>
    sub.isGroup
      ? (sub.data.subcommands ?? []).map(
          (leaf) => `/${command.name} ${sub.name} ${leaf.name} — ${leaf.data.description}`
        )
      : [describeLeaf(command.name, sub)]
  );
}

/* Possible with zero framework code: the command map is public. */
export default defineCommand({
  name: 'help',
  description: 'List all commands',
  async execute(interaction) {
    const lines = [...this.client.commandHandler.commands.values()]
      .flatMap(describe)
      .sort();
    return {
      content: lines.join('\n'),
      flags: MessageFlags.Ephemeral,
    };
  },
});
