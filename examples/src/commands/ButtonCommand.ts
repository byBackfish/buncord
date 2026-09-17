import { defineCommand } from '@bybackfish/buncord';
import {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ButtonInteraction,
  MessageFlags,
} from 'discord.js';

export default defineCommand({
  name: 'button',
  description: 'Button command',

  async execute(interaction) {
    /* One stable id per action; concurrent uses are scoped by filter below */
    const customId = this.client.createCustomId('clickme');

    const button = new ButtonBuilder()
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Click me')
      .setEmoji('🔗')
      .setCustomId(customId);

    /* Fire-and-forget: only the invoking user counts, expires after 60s */
    void this.client
      .awaitInteraction<ButtonInteraction>(customId, {
        filter: (i) => i.user.id === interaction.user.id,
        time: 60_000,
      })
      .then((clickInteraction) =>
        clickInteraction.reply({
          content: 'You clicked me!',
          flags: MessageFlags.Ephemeral,
        })
      )
      .catch(() =>
        interaction.followUp({
          content: 'Button expired.',
          flags: MessageFlags.Ephemeral,
        })
      );

    const row = new ActionRowBuilder<ButtonBuilder>({
      components: [button],
    });

    /* Returning the command reply options */
    return {
      content: 'Click me!',
      components: [row],
    };
  },
});
