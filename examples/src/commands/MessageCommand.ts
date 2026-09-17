import { defineCommand, type CommandReturnable } from '@bybackfish/buncord';
import {
  ApplicationCommandOptionType,
  MessageFlags,
  EmbedBuilder,
} from 'discord.js';

export default defineCommand({
  name: 'message',
  description: 'Message command',
  /* Specifying the arguments that should be given with the slash command execution */
  options: [
    {
      name: 'message',
      description: 'Message you want to use',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
    {
      name: 'person',
      description: 'Person you want to use as an arg',
      type: ApplicationCommandOptionType.User,
      required: false,
    },
  ],

  /* This will only be execute if /message is called.
     message/person are inferred from the options above. */
  async execute(interaction, { message, person }): Promise<CommandReturnable> {
    /* You can directly return a CommandReturnable, alternatively
     you can just access the interaction directly and return manually */

    if (person) {
      return {
        content: `You said ${message} to ${person.username}`,
        flags: MessageFlags.Ephemeral,
      };
    }

    return new EmbedBuilder()
      .setTitle('Message')
      .setDescription(`You said ${message}`)
      .setColor('Random')
      .setThumbnail(interaction.user.displayAvatarURL());
  },
});
