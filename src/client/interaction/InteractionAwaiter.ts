import { Interaction } from 'discord.js';
import { BunClient } from '..';

export class InteractionAwaiter<CustomClient extends BunClient<CustomClient>> {
  private awaitMap: Map<
    string,
    {
      resolve: (value: any) => void;
      maxUses: number;
      currentUses: number;
    }
  > = new Map();

  constructor(public client: CustomClient) {
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

await<T extends Interaction>(
    customId: IDResolvable,
    maxUses = 1
  ): CustomListener<T> {
    const listener = new CustomListener<T>();
    this.awaitMap.set(customId, {
      resolve: listener.resolve.bind(listener),
      maxUses,
      currentUses: 0,
    });
    return listener
  }
}

export class CustomListener<T> {
    private resolvers: ((data: T) => void)[] = [];
    then(callback: (data: T) => void) {
        this.resolvers.push(callback);
    }
    resolve(data: T) {
        for (let resolver of this.resolvers) {
            resolver(data);
        }
    }
}

type IDResolvable = `${string}:${string}:${string}` | string;
