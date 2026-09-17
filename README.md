# Buncord

A command framework for [discord.js](https://discord.js.org), made with [Bun](https://bun.sh).

```ts
import { BunClient } from '@bybackfish/buncord';
import { IntentsBitField } from 'discord.js';

const client = new BunClient({
  intents: [IntentsBitField.Flags.Guilds],
  commands: { commandDirPath: './src/commands' },
  listeners: { listenerDirPath: './src/listeners' },
  token: process.env.DISCORD_TOKEN,
});

await client.login();
```

Commands live in files (or register programmatically). See `examples/` for a
working bot: slash commands, subcommands, context menus, buttons, select
menus, modals, pagination, and cooldowns.

## Defining things

```ts
// commands/ping.ts
import { defineCommand } from '@bybackfish/buncord';

export default defineCommand({
  name: 'ping',
  description: 'Replies with pong',
  cooldown: { duration: 5_000 },          // per-user spam protection
  async execute(interaction, args) {      // args inferred from options
    return 'Pong!';
  },
});
```

```ts
// listeners/ready.ts
import { defineListener } from '@bybackfish/buncord';
import { Events } from 'discord.js';

export default defineListener({
  event: Events.ClientReady,             // written once, args inferred
  async execute(client) {
    this.client.logger.log(`Ready as ${client.user.tag}`);
  },
});
```

Classes (`extends BunCommand` / `extends BunListener`) still work; factories
are recommended. `defineSubcommand`, `defineUserCommand`,
`defineMessageCommand`, and `defineModal` follow the same pattern.

## Conventions

- **One stable id per action.** `client.createCustomId('poll', pollId)` →
  `poll:abc`; `client.parseCustomId` splits it back. Scope concurrent uses
  with `awaitInteraction` filters, not random ids. State in ids must stay
  small and public (snowflakes, not secrets) — Discord limits `custom_id`
  to 100 characters.
- **Always time-box awaits.** `awaitInteraction(id, { filter, time })`
  rejects on timeout; un-awaited promises need `.catch` (unhandled
  rejections crash the process).
- **Stateless where it matters.** Cooldowns and pending awaits are
  per-process memory; command definitions and id state survive restarts
  and work across shards.
- **Errors.** `execute` throwing emits `commandError` on the client and
  replies with a generic message. Customize via
  `commandHandler.messages` (denials) and `errorMessage` (failures, global
  or per-command).

## Features

Slash commands, subcommands/groups, user/message context commands,
autocomplete, buttons/selects/modals via collectors and one-shot awaits,
pagination helper, cooldowns, preconditions (`hasRole`,
`inVoiceChannel`, `inThread` included), owner-only + permission gating
enforced on Discord (`default_member_permissions`, `contexts`) and at
runtime, Components V2 validation, localizations, audit-friendly logging.

## Versioning

Pre-1.0: minor versions may break APIs (deprecated aliases are kept where
cheap). See CHANGELOG.md, including the 0.3 → 0.4 migration guide.
