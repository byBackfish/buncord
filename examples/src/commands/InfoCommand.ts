import { defineCommand, defineSubcommand } from '@bybackfish/buncord';
import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';

/* Leaves first: each is independently readable and testable. */
const userInfo = defineSubcommand({
  name: 'user',
  description: 'Info about a user',
  options: [
    {
      name: 'target',
      description: 'The user to inspect',
      type: ApplicationCommandOptionType.User,
    },
  ],
  async execute(interaction, { target }) {
    const user = target ?? interaction.user;
    return new EmbedBuilder()
      .setTitle(user.username)
      .setThumbnail(user.displayAvatarURL());
  },
});

const serverInfo = defineSubcommand({
  name: 'server',
  description: 'Info about the server',
  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) return 'This command only works in servers.';
    return `${guild.name} has ${guild.memberCount} members.`;
  },
});

/* The parent only assembles; routing lands on a leaf, never here. */
export default defineCommand({
  name: 'info',
  description: 'Get info about a user or a server',
  subcommands: [userInfo, serverInfo],
});
