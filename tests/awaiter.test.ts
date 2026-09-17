import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'events';
import { ApplicationCommandOptionType, MessageFlags } from 'discord.js';
import {
  BunClient,
  defineCommand,
  defineListener,
  defineModal,
  defineSubcommand,
  defineUserCommand,
  paginate,
} from '../src/index';
import { BunCommand } from '../src/client/command/BunCommand';
import { InteractionAwaiter } from '../src/client/interaction/InteractionAwaiter';

function mockAwaiter() {
  const emitter = new EventEmitter();
  const awaiter = new InteractionAwaiter({
    on: emitter.on.bind(emitter),
  } as unknown as BunClient);
  return { emitter, awaiter };
}

const fakeInteraction = (customId: string, userId = '1') =>
  ({ customId, user: { id: userId } }) as never;

describe('InteractionAwaiter (static customIds)', () => {
  test('filter scoping: wrong user is ignored', async () => {
    const { emitter, awaiter } = mockAwaiter();
    const p = awaiter.awaitInteraction<any>('clickme', {
      filter: (i) => i.user.id === '2',
      time: 1000,
    });
    emitter.emit('interactionCreate', fakeInteraction('clickme', '1'));
    emitter.emit('interactionCreate', fakeInteraction('clickme', '2'));
    const got = await p;
    expect(got.user.id).toBe('2');
  });

  test('concurrent awaiters on one static id each get their own', async () => {
    const { emitter, awaiter } = mockAwaiter();
    const a = awaiter.awaitInteraction<any>('vote', {
      filter: (i) => i.user.id === 'a',
      time: 1000,
    });
    const b = awaiter.awaitInteraction<any>('vote', {
      filter: (i) => i.user.id === 'b',
      time: 1000,
    });
    emitter.emit('interactionCreate', fakeInteraction('vote', 'b'));
    emitter.emit('interactionCreate', fakeInteraction('vote', 'a'));
    expect((await a).user.id).toBe('a');
    expect((await b).user.id).toBe('b');
  });

  test('rejects on timeout and cleans up', async () => {
    const { awaiter } = mockAwaiter();
    const p = awaiter.awaitInteraction<any>('ghost', { time: 20 });
    await expect(p).rejects.toThrow('Timed out');
    expect((awaiter as any).awaitMap.size).toBe(0);
  });

  test('maxUses collects an array', async () => {
    const { emitter, awaiter } = mockAwaiter();
    const p = awaiter.awaitInteraction<any>('poll', {
      time: 1000,
      maxUses: 2,
    });
    emitter.emit('interactionCreate', fakeInteraction('poll', '1'));
    emitter.emit('interactionCreate', fakeInteraction('poll', '2'));
    const got = await p;
    expect(Array.isArray(got)).toBe(true);
    expect(got.length).toBe(2);
  });
});

describe('custom ids', () => {
  test('create/parse roundtrip + guards', () => {
    const client = new BunClient({ intents: [] });
    expect(client.parseCustomId(client.createCustomId('vote', 'abc'))).toEqual(
      { action: 'vote', state: 'abc' }
    );
    expect(client.parseCustomId('clickme')).toEqual({ action: 'clickme' });
    expect(() => client.createCustomId('a', 'x'.repeat(100))).toThrow('1-100');
    expect(() => client.createCustomId('has:colon')).toThrow();
    expect(typeof client.makeRandom('x')).toBe('string');
  });
});

describe('command permissions', () => {
  test('userPermissions maps to default_member_permissions', () => {
    const cmd = new BunCommand({
      name: 'mod',
      description: 'd',
      userPermissions: 'Administrator',
    });
    expect(cmd.toJSON().defaultMemberPermissions).toBe('Administrator');
  });

  test('explicit defaultMemberPermissions passes through', () => {
    const cmd = new BunCommand({
      name: 'mod',
      description: 'd',
      defaultMemberPermissions: '8',
    });
    expect(cmd.toJSON().defaultMemberPermissions).toBe('8');
  });

  test('legacy (name, options) constructor still works', () => {
    const cmd = new BunCommand('mod', { description: 'd' });
    expect(cmd.name).toBe('mod');
    expect(cmd.data.description).toBe('d');
  });
});

function stubOptions(optionValues: Record<string, unknown> = {}) {
  return {
    get: (name: string) =>
      name in optionValues ? { value: optionValues[name] } : null,
    getSubcommandGroup: (_required?: boolean) => null,
    getSubcommand: (_required?: boolean) => null,
  };
}

function stubCommandInteraction(commandName = 'test', overrides: any = {}) {
  const calls: any = {};
  return {
    calls,
    interaction: {
      commandName,
      user: { id: 'user1', bot: false },
      memberPermissions: null,
      appPermissions: null,
      guildId: null,
      inGuild: () => false,
      channel: null,
      replied: false,
      deferred: false,
      options: stubOptions(),
      isChatInputCommand: () => true,
      isUserContextMenuCommand: () => false,
      isMessageContextMenuCommand: () => false,
      isAutocomplete: () => false,
      reply: async (opts: any) => {
        calls.reply = opts;
        return null;
      },
      editReply: async (opts: any) => {
        calls.editReply = opts;
        return null;
      },
      ...overrides,
    } as never,
  };
}

describe('CommandHandler', () => {
  test('add() registers programmatically; duplicates throw', () => {
    const client = new BunClient({ intents: [] });
    class Ping extends BunCommand {
      constructor() {
        super({ name: 'ping', description: 'd' });
      }
    }
    client.commandHandler.add(new Ping());
    expect(client.commandHandler.commands.has('1:ping')).toBe(true);
    expect(() => client.commandHandler.add(new Ping())).toThrow('Duplicate');

    // Same name with a different command type coexists.
    client.commandHandler.add(
      defineUserCommand({
        name: 'ping',
        async execute() {
          return 'pong';
        },
      })
    );
    expect(client.commandHandler.commands.has('2:ping')).toBe(true);
  });

  test('execute throw emits commandError and replies', async () => {
    const client = new BunClient({ intents: [] });
    class Boom extends BunCommand {
      constructor() {
        super({ name: 'test', description: 'd' });
      }
      async execute(): Promise<never> {
        throw new Error('boom');
      }
    }
    client.commandHandler.add(new Boom() as never);

    let payload: any = null;
    client.on('commandError', (p) => {
      payload = p;
    });

    const { interaction, calls } = stubCommandInteraction();
    await client.commandHandler.handleInteraction(interaction as never);

    expect(payload?.command.name).toBe('test');
    expect(String(payload?.error)).toContain('boom');
    expect(calls.reply.content).toBe(
      client.commandHandler.messages.error
    );
  });

  test('ownerOnly denies non-owners ephemerally', async () => {
    const client = new BunClient({ intents: [], owners: ['owner1'] });
    class Secret extends BunCommand {
      constructor() {
        super({ name: 'test', description: 'd', ownerOnly: true });
      }
      async execute() {
        return 'should never run';
      }
    }
    client.commandHandler.add(new Secret() as never);

    const { interaction, calls } = stubCommandInteraction();
    await client.commandHandler.handleInteraction(interaction as never);

    expect(calls.reply.content).toBe(
      client.commandHandler.messages.owner
    );
  });
});

describe('defineCommand', () => {
  test('factory commands run with args and this.client', async () => {
    const client = new BunClient({ intents: [] });
    let seenClient: unknown = null;
    const cmd = defineCommand({
      name: 'test',
      description: 'd',
      options: [
        {
          name: 'msg',
          description: 'm',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
      async execute(interaction, args) {
        seenClient = this.client;
        return `got:${args.msg}`;
      },
    });
    client.commandHandler.add(cmd);

    const { interaction, calls } = stubCommandInteraction('test', {
      options: {
        get: (name: string) => (name === 'msg' ? { value: 'hello' } : null),
      },
    });
    await client.commandHandler.handleInteraction(interaction as never);

    expect(calls.reply.content).toBe('got:hello');
    expect(seenClient).toBe(client);
  });
});

describe('subcommands', () => {
  test('toJSON nests groups and leaves', () => {
    const cmd = defineCommand({
      name: 'perms',
      description: 'd',
      subcommands: [
        defineSubcommand({
          name: 'user',
          description: 'g',
          subcommands: [
            defineSubcommand({
              name: 'get',
              description: 'l',
              options: [
                {
                  name: 'target',
                  description: 't',
                  type: ApplicationCommandOptionType.User,
                  required: true,
                },
              ],
              async execute() {
                return 'x';
              },
            }),
          ],
        }),
        defineSubcommand({
          name: 'stats',
          description: 's',
          async execute() {
            return 'y';
          },
        }),
      ],
      async execute() {
        throw new Error('parent should never run');
      },
    });

    const json = cmd.toJSON() as any;
    expect(json.options.length).toBe(2);
    expect(json.options[0].type).toBe(2); // group
    expect(json.options[0].options[0].type).toBe(1); // leaf
    expect(json.options[0].options[0].options[0].name).toBe('target');
    expect(json.options[1].type).toBe(1); // bare leaf alongside group
  });

  test('mixing options and subcommands throws', () => {
    const cmd = defineCommand({
      name: 'bad',
      description: 'd',
      options: [
        {
          name: 'x',
          description: 'x',
          type: ApplicationCommandOptionType.String,
        },
      ],
      subcommands: [
        defineSubcommand({
          name: 's',
          description: 's',
          async execute() {
            return 'x';
          },
        }),
      ] as never,
      async execute() {
        return 'x';
      },
    });
    expect(() => cmd.toJSON()).toThrow('cannot be combined');
  });

  test('routing reaches the leaf with leaf args', async () => {
    const client = new BunClient({ intents: [] });
    let seen: unknown = null;
    client.commandHandler.add(
      defineCommand({
        name: 'info',
        description: 'd',
        subcommands: [
          defineSubcommand({
            name: 'user',
            description: 'u',
            options: [
              {
                name: 'target',
                description: 't',
                type: ApplicationCommandOptionType.String,
                required: true,
              },
            ],
            async execute(interaction, args) {
              seen = args;
              return `hi ${(args as any).target}`;
            },
          }),
        ],
        async execute() {
          throw new Error('parent should never run');
        },
      })
    );

    const { interaction, calls } = stubCommandInteraction('info', {
      options: {
        ...stubOptions({ target: 'fish' }),
        getSubcommandGroup: () => null,
        getSubcommand: () => 'user',
      },
    });
    await client.commandHandler.handleInteraction(interaction as never);
    expect(calls.reply.content).toBe('hi fish');
    expect(seen).toEqual({ target: 'fish' });
  });
});

describe('context menus', () => {
  test('user command routes by type and sees targetUser', async () => {
    const client = new BunClient({ intents: [] });
    client.commandHandler.add(
      defineUserCommand({
        name: 'Show avatar',
        async execute(interaction) {
          return `avatar of ${(interaction as any).targetUser.username}`;
        },
      })
    );

    const { interaction, calls } = stubCommandInteraction('Show avatar', {
      isChatInputCommand: () => false,
      isUserContextMenuCommand: () => true,
      isMessageContextMenuCommand: () => false,
      targetUser: { username: 'fish' },
    });
    await client.commandHandler.handleInteraction(interaction as never);
    expect(calls.reply.content).toBe('avatar of fish');
  });
});

describe('cooldowns and preconditions', () => {
  test('second immediate use is denied, expiry allows again', async () => {
    const client = new BunClient({ intents: [] });
    let runs = 0;
    client.commandHandler.add(
      defineCommand({
        name: 'test',
        description: 'd',
        cooldown: { duration: 50 },
        async execute() {
          runs++;
          return 'ok';
        },
      })
    );

    const first = stubCommandInteraction();
    await client.commandHandler.handleInteraction(first.interaction as never);
    expect(first.calls.reply.content).toBe('ok');

    const second = stubCommandInteraction();
    await client.commandHandler.handleInteraction(second.interaction as never);
    expect(second.calls.reply.content).toContain('Slow down');

    await new Promise((r) => setTimeout(r, 60));
    const third = stubCommandInteraction();
    await client.commandHandler.handleInteraction(third.interaction as never);
    expect(third.calls.reply.content).toBe('ok');
    expect(runs).toBe(2);
  });

  test('precondition denial replies with its message', async () => {
    const client = new BunClient({ intents: [] });
    let ran = false;
    client.commandHandler.add(
      defineCommand({
        name: 'test',
        description: 'd',
        preconditions: [async () => 'nope'],
        async execute() {
          ran = true;
          return 'ok';
        },
      })
    );

    const { interaction, calls } = stubCommandInteraction();
    await client.commandHandler.handleInteraction(interaction as never);
    expect(calls.reply.content).toBe('nope');
    expect(ran).toBe(false);
  });
});

describe('collectors', () => {
  test('collects until max, then ends with limit', async () => {
    const { emitter, awaiter } = mockAwaiter();
    const c = awaiter.collect<any>('vote', { time: 1000, max: 2 });
    const seen: string[] = [];
    let endReason: unknown = null;
    c.on('collect', (i) => seen.push(i.user.id));
    c.on('end', (_collected, reason) => {
      endReason = reason;
    });
    emitter.emit('interactionCreate', fakeInteraction('vote', 'a'));
    emitter.emit('interactionCreate', fakeInteraction('vote', 'b'));
    emitter.emit('interactionCreate', fakeInteraction('vote', 'c'));
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toEqual(['a', 'b']);
    expect(c.ended).toBe(true);
    expect(endReason).toBe('limit');
    expect(c.collected.length).toBe(2);
  });

  test('async iteration yields items then ends on time', async () => {
    const { emitter, awaiter } = mockAwaiter();
    const c = awaiter.collect<any>('v', { time: 30 });
    const seen: string[] = [];
    const done = (async () => {
      for await (const i of c) seen.push(i.user.id);
    })();
    emitter.emit('interactionCreate', fakeInteraction('v', 'x'));
    await done;
    expect(seen).toEqual(['x']);
    expect(c.endReason).toBe('time');
  });

  test('stop() ends early with stopped', () => {
    const { awaiter } = mockAwaiter();
    const c = awaiter.collect<any>('s', { time: 0 });
    let ended = false;
    c.on('end', () => {
      ended = true;
    });
    c.stop();
    expect(c.ended).toBe(true);
    expect(ended).toBe(true);
    expect(c.endReason).toBe('stopped');
  });
});

describe('defineModal', () => {
  test('builds ids and parses typed values', () => {
    const m = defineModal({
      action: 'username-modal',
      title: 'T',
      fields: [{ id: 'name', label: 'Name?' }],
    });
    expect(m.id()).toBe('username-modal');
    expect(m.id('u1')).toBe('username-modal:u1');
    expect(m.build('u1').data.custom_id).toBe('username-modal:u1');
    const values = m.parse({
      fields: {
        getTextInputValue: (id: string) => (id === 'name' ? 'fish' : ''),
      },
    } as never);
    expect(values).toEqual({ name: 'fish' });
  });
});

describe('paginate', () => {
  const quietFake = (customId: string, userId = 'u1') => ({
    customId,
    user: { id: userId },
    isChatInputCommand: () => false,
    isUserContextMenuCommand: () => false,
    isMessageContextMenuCommand: () => false,
    isAutocomplete: () => false,
  });

  const buttonIds = (reply: any) => {
    const out: Record<string, string> = {};
    for (const b of reply.components[0].components)
      out[b.data.custom_id.split(':').pop()!] = b.data.custom_id;
    return out;
  };

  test('next/prev turn pages, stop strips components', async () => {
    const client = new BunClient({ intents: [] });
    const calls: any = {};
    const interaction: any = {
      user: { id: 'u1', bot: false },
      replied: false,
      deferred: false,
      reply: async (opts: any) => {
        interaction.replied = true;
        calls.reply = opts;
        return null;
      },
      editReply: async (opts: any) => {
        calls.edit = opts;
        return null;
      },
    };
    const done = paginate(client, interaction as never, ['a', 'b', 'c'], {
      time: 1000,
    });
    await new Promise((r) => setTimeout(r, 10));

    const ids = buttonIds(calls.reply);
    client.emit('interactionCreate', quietFake(ids.next) as never);
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.edit.content).toBe('b');

    client.emit('interactionCreate', quietFake(ids.prev) as never);
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.edit.content).toBe('a');

    client.emit('interactionCreate', quietFake(ids.stop) as never);
    expect(await done).toBe(0);
    expect(calls.edit.components).toEqual([]);
  });

  test('timeout applies onTimeout behavior', async () => {
    const client = new BunClient({ intents: [] });
    const calls: any = {};
    const interaction: any = {
      user: { id: 'u1', bot: false },
      replied: false,
      deferred: false,
      reply: async (opts: any) => {
        interaction.replied = true;
        calls.reply = opts;
        return null;
      },
      editReply: async (opts: any) => {
        calls.edit = opts;
        return null;
      },
    };
    const done = paginate(client, interaction as never, ['a', 'b'], {
      time: 30,
      onTimeout: 'remove',
    });
    expect(await done).toBe(0);
    expect(calls.edit.components).toEqual([]);
  });
});

describe('components v2', () => {
  test('content mixed with IsComponentsV2 is rejected clearly', async () => {
    const client = new BunClient({ intents: [] });
    client.commandHandler.add(
      defineCommand({
        name: 'test',
        description: 'd',
        async execute() {
          return {
            content: 'oops',
            flags: MessageFlags.IsComponentsV2,
          } as never;
        },
      })
    );

    let detail: unknown = null;
    client.on('commandError', (p) => {
      detail = p.error;
    });
    const { interaction, calls } = stubCommandInteraction();
    await client.commandHandler.handleInteraction(interaction as never);
    expect(String(detail)).toContain('IsComponentsV2');
    expect(calls.reply.content).toBe(client.commandHandler.messages.error);
  });
});

describe('defineListener', () => {
  test('factory listeners wire up and receive events', async () => {
    const client = new BunClient({ intents: [] });

    let got: any = null;
    client.listenerHandler.add(
      defineListener({
        event: 'commandError' as never,
        execute(p: any) {
          got = p;
        },
      }) as never
    );

    client.emit('commandError', {
      command: null,
      interaction: null,
      error: new Error('x'),
    } as never);
    await new Promise((r) => setTimeout(r, 10));
    expect(String((got as any)?.error)).toContain('x');
  });
});
