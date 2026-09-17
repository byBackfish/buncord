import { defineListener } from '@bybackfish/buncord';
import { Events, OAuth2Scopes, PermissionFlagsBits } from 'discord.js';

/* The event is written once; execute arguments are inferred from it */
export default defineListener({
  event: Events.ClientReady,

  /* The execute function, arguments are inferred for type safety */
  async execute(client) {
    const invite = client.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: PermissionFlagsBits.Administrator,
    });
    this.client.logger.log(`Ready as ${client.user?.tag}! Invite: ${invite}`);
  },
});
