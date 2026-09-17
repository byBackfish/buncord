import './env';

import { BunClient } from '@bybackfish/buncord';
import { IntentsBitField } from 'discord.js';
import { join } from 'path';

/* Creating the BunClient */
const Client = new BunClient({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildPresences,
  ],
  commands: {
    /* The relative path to where all the commands are in */
    commandDirPath: join(__dirname, './commands'),
  },
  listeners: {
    /* The relative path to where all the listeners are in */
    listenerDirPath: join(__dirname, './listeners'),
  },
  token: process.env.DISCORD_TOKEN,
});

/* Logging in */
Client.login();
