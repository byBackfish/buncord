import { describe, expect, test } from 'bun:test';
import {
  BunClient,
  defineCommand,
  defineSubcommand,
} from '../src/index';

describe('subcommand client wiring', () => {
  test('add() wires the client onto nested subcommands and groups', () => {
    const client = new BunClient({ intents: [] });
    const leaf = defineSubcommand({
      name: 'leaf',
      description: 'd',
      async execute() {
        return 'ok';
      },
    });
    const deepLeaf = defineSubcommand({
      name: 'deep',
      description: 'd',
      async execute() {
        return 'ok';
      },
    });
    const group = defineSubcommand({
      name: 'group',
      description: 'd',
      subcommands: [deepLeaf],
    });
    const root = defineCommand({
      name: 'root',
      description: 'd',
      subcommands: [leaf, group],
    });
    client.commandHandler.add(root);
    expect(root.client).toBe(client);
    expect(leaf.client).toBe(client);
    expect(group.client).toBe(client);
    expect(deepLeaf.client).toBe(client);
  });
});
