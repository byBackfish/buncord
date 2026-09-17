import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionReplyOptions,
  Snowflake,
  User,
} from "discord.js";
import type { BunClient } from "@client/BunClient";
import { randomUUID } from "crypto";

export type PaginatePage = string | EmbedBuilder | InteractionReplyOptions;

export interface PaginateOptions {
  /** Per-page idle timeout in ms. Defaults to 120_000. */
  time?: number;
  /** Only this user may turn pages. Defaults to the invoking user. */
  forUser?: User | Snowflake;
  /** What happens on timeout/stop. Defaults to `'disable'`. */
  onTimeout?: 'disable' | 'remove' | 'nothing';
}

const ACTIONS = ['prev', 'next', 'stop'] as const;

function toResponse(page: PaginatePage, index: number, total: number): InteractionReplyOptions {
  let response: InteractionReplyOptions;
  if (typeof page === 'string') {
    response = { content: page };
  } else if (page instanceof EmbedBuilder) {
    const embed = EmbedBuilder.from(page);
    if (!embed.data.footer && total > 1)
      embed.setFooter({ text: `Page ${index + 1}/${total}` });
    response = { embeds: [embed] };
  } else {
    response = { ...page };
  }
  return response;
}

function row(token: string, disabled: boolean) {
  const button = (action: (typeof ACTIONS)[number], label: string) =>
    new ButtonBuilder()
      .setCustomId(`paginate:${token}:${action}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled);
  return new ActionRowBuilder<ButtonBuilder>({
    components: [button('prev', '‹'), button('next', '›'), button('stop', '■')],
  });
}

/**
 * Paginate through pages with prev/next/stop buttons. Built on
 * `awaitInteraction`: each paginator gets a random per-instance token, so
 * many can run concurrently. Returns the final page index.
 */
export async function paginate(
  client: BunClient,
  interaction: ChatInputCommandInteraction,
  pages: PaginatePage[],
  options: PaginateOptions = {}
): Promise<number> {
  if (pages.length === 0) throw new Error('paginate requires at least one page');

  const { time = 120_000, onTimeout = 'disable' } = options;
  const userId =
    typeof options.forUser === 'string'
      ? options.forUser
      : (options.forUser ?? interaction.user).id;

  // Per-instance token: paginators are inherently per-use, so unlike
  // action ids these must be unique across concurrent instances.
  const token = randomUUID().split('-')[0];
  const ids = {
    prev: `paginate:${token}:prev`,
    next: `paginate:${token}:next`,
    stop: `paginate:${token}:stop`,
  };

  let index = 0;
  const send = async (disabled: boolean, strip = false) => {
    const response = toResponse(pages[index], index, pages.length);
    if (!strip && pages.length > 1)
      response.components = [row(token, disabled)];
    else if (strip) response.components = [];
    if (interaction.replied || interaction.deferred)
      await interaction.editReply(response as never);
    else await interaction.reply(response);
  };

  await send(false);

  if (pages.length === 1) return 0;

  const filter = (i: { user: { id: string } }) => i.user.id === userId;

  while (true) {
    const race = await Promise.race([
      client
        .awaitInteraction<ButtonInteraction>(ids.prev, { filter, time })
        .then(() => 'prev' as const),
      client
        .awaitInteraction<ButtonInteraction>(ids.next, { filter, time })
        .then(() => 'next' as const),
      client
        .awaitInteraction<ButtonInteraction>(ids.stop, { filter, time })
        .then(() => 'stop' as const),
    ]).catch(() => null);
    for (const id of Object.values(ids)) client.interactionAwaiter.cancelAwaits(id);

    if (race === null) {
      try {
        if (onTimeout === 'remove') await send(false, true);
        else if (onTimeout === 'disable') await send(true);
      } catch {
        // Message deleted mid-pagination; nothing left to do.
      }
      return index;
    }

    if (race === 'stop') {
      try {
        await send(false, true);
      } catch {
        // Message deleted mid-pagination; nothing left to do.
      }
      return index;
    }

    index =
      race === 'next'
        ? (index + 1) % pages.length
        : (index - 1 + pages.length) % pages.length;
    try {
      await send(false);
    } catch {
      return index;
    }
  }
}
