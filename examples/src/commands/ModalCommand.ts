import { defineCommand } from '@bybackfish/buncord';
import { MessageFlags, ModalSubmitInteraction } from 'discord.js';
import { usernameModal } from '../modals/UsernameModal.js';

export default defineCommand({
  name: 'modal',
  description: 'Modal command',

  async execute(interaction) {
    /* Scope the submit to this user; the modal id carries the state. */
    const state = interaction.user.id;

    /* Awaiting the modal submit */
    void this.client
      .awaitInteraction<ModalSubmitInteraction>(usernameModal.id(state), {
        filter: (i) => i.user.id === interaction.user.id,
        time: 300_000,
      })
      .then((submitInteraction) => {
        const { name } = usernameModal.parse(submitInteraction);
        return submitInteraction.reply({
          content: `Hello, ${name}!`,
          flags: MessageFlags.Ephemeral,
        });
      })
      .catch(() =>
        interaction.followUp({
          content: 'Modal expired.',
          flags: MessageFlags.Ephemeral,
        })
      );

    /* Returning the modal to show. Alternatively, you could use interaction#showModal directly */
    return usernameModal.build(state);
  },
});
