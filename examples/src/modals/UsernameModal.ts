import { defineModal } from '@bybackfish/buncord';
import { TextInputStyle } from 'discord.js';

/* Shared modal: any command can show it, submits parse to typed values. */
export const usernameModal = defineModal({
  action: 'username-modal',
  title: 'Submit me!',
  fields: [
    {
      id: 'name',
      label: 'What is your name?',
      style: TextInputStyle.Short,
      required: true,
    },
  ],
});
