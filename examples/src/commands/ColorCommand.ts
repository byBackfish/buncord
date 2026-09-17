import { defineCommand } from '@bybackfish/buncord';
import {
  ActionRowBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';

/* Select menus have customIds, so the awaiter handles them like buttons. */
export default defineCommand({
  name: 'color',
  description: 'Pick a color',
  async execute(interaction) {
    const customId = this.client.createCustomId(
      'color-pick',
      interaction.user.id
    );
    const menu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Pick one')
      .addOptions(
        { label: 'Red', value: 'red' },
        { label: 'Blue', value: 'blue' },
        { label: 'Green', value: 'green' }
      );

    void this.client
      .awaitInteraction<StringSelectMenuInteraction>(customId, {
        filter: (i) => i.user.id === interaction.user.id,
        time: 60_000,
      })
      .then((selection) =>
        selection.reply({
          content: `You picked ${selection.values[0]}!`,
          flags: MessageFlags.Ephemeral,
        })
      )
      .catch(() =>
        interaction.followUp({
          content: 'Menu expired.',
          flags: MessageFlags.Ephemeral,
        })
      );

    return {
      content: 'Pick a color:',
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>({
          components: [menu],
        }),
      ],
    };
  },
});
