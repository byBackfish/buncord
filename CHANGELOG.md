# Changelog

## Unreleased

- Fix: `CommandHandler.add()` now wires `client` onto nested subcommands and
  groups, not just the root command. Previously `this.client` was
  `undefined` inside subcommand leaves (found via a paginated bot command
  crashing on `client.awaitInteraction`).

## 0.4.0 — 2026-09-17

Breaking. discord.js raised to `^14.27.0`.

### Factories (new, recommended)

- `defineCommand` with `args` inferred from `options` (`required`/`default`
  control optionality, static `choices` narrow to value unions).
- `defineSubcommand` for leaves/groups (same factory, distinct name).
  A node with `subcommands` takes no `execute`; routing, per-leaf args,
  and parent→leaf constraint inheritance are automatic.
- `defineUserCommand` / `defineMessageCommand` for context menus.
- `defineListener` — event written once, `execute` args inferred.
- `defineModal` — `build(state)` / `id(state)` / typed `parse(submit)`.

Classes (`extends BunCommand`, `extends BunListener`) keep working.

### Commands

- `super({ name, description, ... })` descriptor object; the descriptor
  moved from `command.options` to `command.data` (`name` getter kept).
- `Command` → `CommandData`, `CommandArgument` → `CommandOption` (old
  names kept as deprecated aliases).
- `CommandReturnable` is now a union of **values**, not promises.
- `userPermissions` is now `PermissionResolvable` (was `Snowflake[]`) and
  maps to `default_member_permissions`; added `contexts`, `dmPermission`,
  `defaultMemberPermissions`, `selfPermissions`, `cooldown`,
  `preconditions`, `errorMessage`, `name/descriptionLocalizations`,
  `channelTypes`, `subcommands`, per-command `autoDefer`/`useEphemeral`.
- New: `cooldown: { duration, scope, bypassOwners? }`,
  `preconditions: [...]` (`hasRole`, `inVoiceChannel`, `inThread`
  included), global preconditions via client options.
- New: `commandHandler.add()`, public `commands` map;
  `listenerHandler.add()`, public `listeners` list.
- New: `commandError` client event (`{ command, interaction, error }`);
  denial/error texts customizable via `commandHandler.messages`.
- Components V2 responses mixing `content`/`embeds`/`poll`/`stickers`
  now fail loudly instead of silently dropping fields; `IsComponentsV2`
  survives `editReply` (only `Ephemeral` is stripped).

### Client

- `groups: { owners }` → flat `owners: [...]`; `groups.developers`
  removed (was unused); `allowBots` removed (meaningless for app commands).
- `commands`/`listeners` config blocks and `token` are optional
  (`DISCORD_TOKEN` env fallback); `login()` loads commands/listeners first.
- `client.console` → `client.logger` (alias kept); `stop()` removed, use
  `destroy()`; internal `ready` usage → `clientReady`.
- `await` → `awaitInteraction` (alias kept, now returns a real `Promise`
  with `{ filter, time, maxUses }`); `makeRandom` → `createCustomId` /
  `parseCustomId` (alias kept). Standalone `createCustomId`,
  `parseCustomId`, and `paginate` are importable from the package root.
- New: `collectInteractions` (multi-collect with events + async iteration).

### Migration from 0.3

```ts
// before
export default class Ping extends BunCommand {
  constructor() { super('ping', { description: '…' }); }
  async execute(interaction: CommandInteraction, args: Record<string, any>) { … }
}
// after
export default defineCommand({
  name: 'ping',
  description: '…',
  async execute(interaction, args) { … },
});
```

- `command.options.X` → `command.data.X`; `Command` → `CommandData`.
- `this.client.console` → `this.client.logger`.
- `onAutocomplete(client, interaction)` → `onAutocomplete(interaction)`
  (`interaction.client` is now correctly typed).
- `BunListener<'ready'>` + `super('ready')` → `defineListener({ event:
  Events.ClientReady, … })` (or keep the class with the corrected
  `<Event, Client>` generic order).
- `new BunClient({ groups: { owners } })` → `new BunClient({ owners })`.
- `ephemeral: true` in reply objects → `flags: MessageFlags.Ephemeral`.
- Modals: `TextInputBuilder.setLabel` + ActionRow wrapping →
  `LabelBuilder` + `addLabelComponents` (see `examples/`).
