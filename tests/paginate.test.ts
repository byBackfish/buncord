import { describe, expect, test } from 'bun:test';
import { ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { BunClient, paginate } from '../src/index';

const quietFake = (customId: string, userId = 'u1', calls: any = {}) => ({
  customId,
  user: { id: userId },
  deferUpdate: async () => {
    calls.deferred = [...(calls.deferred ?? []), customId];
  },
  showModal: async () => {
    calls.modal = customId;
  },
  isChatInputCommand: () => false,
  isUserContextMenuCommand: () => false,
  isMessageContextMenuCommand: () => false,
  isAutocomplete: () => false,
});

const buttonIds = (reply: any) => {
  const row = reply.components.find((c: any) =>
    (c.components ?? []).some((b: any) => b.data?.custom_id)
  );
  const out: Record<string, string> = {};
  for (const b of row.components) out[b.data.custom_id.split(':').pop()!] = b.data.custom_id;
  return out;
};

const buttonLabels = (reply: any): string[] => {
  const row = reply.components.find((c: any) =>
    (c.components ?? []).some((b: any) => b.data?.custom_id)
  );
  return row.components.map((b: any) => b.data.label);
};

function stubPager() {
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
  return { calls, interaction };
}

describe('paginate', () => {
  test('prev / x-y-jump / next layout, clicks acknowledged, pages turn', async () => {
    const client = new BunClient({ intents: [] });
    const { calls, interaction } = stubPager();
    const done = paginate(client, interaction as never, ['a', 'b', 'c'], {
      time: 1000,
    });
    await new Promise((r) => setTimeout(r, 10));

    // Layout: prev left, x/y middle, next right.
    expect(buttonLabels(calls.reply)).toEqual(['‹', '1/3', '›']);

    const ids = buttonIds(calls.reply);
    client.emit('interactionCreate', quietFake(ids.next, 'u1', calls) as never);
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.edit.content).toBe('b');
    // The click itself was acknowledged — no "interaction failed".
    expect(calls.deferred).toEqual([ids.next]);

    client.emit('interactionCreate', quietFake(ids.prev, 'u1', calls) as never);
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.edit.content).toBe('a');
    expect(await done).toBe(0);
  });

  test('jump button opens the page modal', async () => {
    const client = new BunClient({ intents: [] });
    const { calls, interaction } = stubPager();
    const done = paginate(client, interaction as never, ['a', 'b', 'c'], {
      time: 200,
      modalTime: 50,
    });
    await new Promise((r) => setTimeout(r, 10));

    const ids = buttonIds(calls.reply);
    client.emit('interactionCreate', quietFake(ids.jump, 'u1', calls) as never);
    await new Promise((r) => setTimeout(r, 150));
    // Modal shown for the jump click; modal timeout just resumes waiting.
    expect(calls.modal).toBe(ids.jump);
    expect(await done).toBe(0);
  });

  test('container pages render V2 with buttons below content', async () => {
    const client = new BunClient({ intents: [] });
    const { calls, interaction } = stubPager();
    const page = () =>
      new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent('hello')
      );
    const done = paginate(client, interaction as never, [page(), page()], {
      time: 100,
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.reply.flags).toBeDefined();
    // Content container first, button row after it.
    expect(calls.reply.components.length).toBe(2);
    expect(calls.reply.components[0].constructor.name).toBe('ContainerBuilder');
    expect(await done).toBe(0);
  });

  test('timeout disables all buttons', async () => {
    const client = new BunClient({ intents: [] });
    const { calls, interaction } = stubPager();
    const done = paginate(client, interaction as never, ['a', 'b'], {
      time: 30,
    });
    expect(await done).toBe(0);
    const labels = buttonLabels(calls.edit);
    expect(labels).toEqual(['‹', '1/2', '›']);
    const row = calls.edit.components.find((c: any) =>
      (c.components ?? []).some((b: any) => b.data?.custom_id)
    );
    expect(row.components.every((b: any) => b.data.disabled)).toBe(true);
  });

  test('timeout applies onTimeout remove', async () => {
    const client = new BunClient({ intents: [] });
    const { calls, interaction } = stubPager();
    const done = paginate(client, interaction as never, ['a', 'b'], {
      time: 30,
      onTimeout: 'remove',
    });
    expect(await done).toBe(0);
    expect(calls.edit.components).toEqual([]);
  });
});
