import { Interaction } from 'discord.js';
import { BunClient } from '..';

export class InteractionAwaiter {
  private awaitMap: Map<
    string,
    {
      resolve: <T extends Interaction>(value: T) => void;
      maxUses: number;
      currentUses: number;
    }
  > = new Map();

  constructor(public client: BunClient) {
    this.client.on('interactionCreate', (interaction: Interaction) => {
      //@ts-expect-error
      let customId = interaction.customId;
      if (!customId) return;
      if (this.awaitMap.has(customId)) {
        let obj = this.awaitMap.get(customId)!!;
        obj.currentUses++;
        if (obj.currentUses >= obj.maxUses) {
          this.awaitMap.delete(customId);
        }

        obj.resolve(interaction as any);
      }
    });
  }

  async await<T extends Interaction>(
    customId: IDResolvable,
    maxUses = 1
  ): Promise<T> {
    return new Promise<T>((resolve) => {
      let pair = {
        resolve,
        maxUses,
        currentUses: 0,
      };
      //@ts-expect-error
      this.awaitMap.set(customId, pair);
    });
  }
}

type IDResolvable = `${string}:${string}:${string}` | string;
