import { defineUserCommand } from '@bybackfish/buncord';
import { EmbedBuilder } from 'discord.js';

/* Right-click a user → Apps → Show avatar. No options, no description. */
export default defineUserCommand({
  name: 'Show avatar',
  async execute(interaction) {
    const user = interaction.targetUser;
    return new EmbedBuilder()
      .setTitle(`${user.username}'s avatar`)
      .setImage(user.displayAvatarURL({ size: 1024 }));
  },
});
