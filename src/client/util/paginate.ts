import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  ChatInputCommandInteraction,
  ContainerBuilder,
  EmbedBuilder,
  InteractionReplyOptions,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  Snowflake,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  User,
} from "discord.js";
import type { BunClient } from "@client/BunClient";
import { randomUUID } from "crypto";

export type PaginatePage =
  | string
  | EmbedBuilder
  | ContainerBuilder
  | InteractionReplyOptions;

export interface PaginateOptions {
  /** Per-page idle timeout in ms. Defaults to 120_000. */
  time?: number;
  /** Only this user may turn pages. Defaults to the invoking user. */
  forUser?: User | Snowflake;
  /** What happens on timeout. Defaults to `'disable'`. (`'remove'` strips components.) */
  onTimeout?: 'disable' | 'remove' | 'nothing';
  /** Show the `x/y` button that opens a page-jump modal. Defaults to true. */
  pageJump?: boolean;
  /** Time to wait for the page-jump modal submit in ms. Defaults to 60_000. */
  modalTime?: number;
}

function isComponentsV2(response: InteractionReplyOptions): boolean {
  const bit = MessageFlags.IsComponentsV2 as unknown as number;
  const flags = response.flags as unknown;
  if (typeof flags === "number") return (flags & bit) !== 0;
  if (Array.isArray(flags)) {
    return flags.some(
      (entry) =>
        entry === MessageFlags.IsComponentsV2 ||
        (typeof entry === "number" && (entry & bit) !== 0)
    );
  }
  if (flags && typeof flags === "object" && "bitfield" in flags) {
    const inner = (flags as { bitfield: unknown }).bitfield;
    return typeof inner === "number" && (inner & bit) !== 0;
  }
  return false;
}

function containerFooter(container: ContainerBuilder, index: number, total: number): ContainerBuilder {
  const clone = new ContainerBuilder(container.toJSON());
  clone.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Page ${index + 1}/${total}`)
  );
  return clone;
}

function toResponse(
  page: PaginatePage,
  index: number,
  total: number
): InteractionReplyOptions {
  let response: InteractionReplyOptions;
  if (typeof page === 'string') {
    response = { content: page };
  } else if (page instanceof EmbedBuilder) {
    const embed = EmbedBuilder.from(page);
    if (!embed.data.footer && total > 1)
      embed.setFooter({ text: `Page ${index + 1}/${total}` });
    response = { embeds: [embed] };
  } else if (page instanceof ContainerBuilder) {
    const container = total > 1 ? containerFooter(page, index, total) : page;
    response = { components: [container], flags: MessageFlags.IsComponentsV2 };
  } else {
    response = { ...page };
  }
  return response;
}

function jumpModal(token: string, total: number): { id: string; modal: ModalBuilder } {
  const id = `paginate:${token}:jump`;
  const input = new TextInputBuilder()
    .setCustomId('page')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(String(total).length)
    .setPlaceholder(`Page number (1–${total})`);
  const modal = new ModalBuilder()
    .setCustomId(id)
    .setTitle('Go to page')
    .addLabelComponents(new LabelBuilder().setLabel('Page').setTextInputComponent(input));
  return { id, modal };
}

function row(
  token: string,
  index: number,
  total: number,
  disabled: boolean,
  pageJump: boolean
) {
  const prev = new ButtonBuilder()
    .setCustomId(`paginate:${token}:prev`)
    .setLabel('‹')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);
  const next = new ButtonBuilder()
    .setCustomId(`paginate:${token}:next`)
    .setLabel('›')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);
  const components = [prev];
  if (pageJump && total > 1) {
    components.push(
      new ButtonBuilder()
        .setCustomId(`paginate:${token}:jump`)
        .setLabel(`${index + 1}/${total}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled)
    );
  }
  components.push(next);
  return new ActionRowBuilder<ButtonBuilder>({ components });
}

/**
 * Paginate through pages: `‹ prev`, an `x/y` button opening a page-jump
 * modal, and `next ›`. Content always renders above the buttons (this
 * matters for Components V2, where order is significant).
 *
 * Every click is acknowledged (`deferUpdate`, or the modal itself), so
 * Discord never reports "interaction failed" while the pages still turn.
 * Built on `awaitInteraction`: each paginator gets a random per-instance
 * token, so many can run concurrently. Returns the final page index.
 */
export async function paginate(
  client: BunClient,
  interaction: ChatInputCommandInteraction,
  pages: PaginatePage[],
  options: PaginateOptions = {}
): Promise<number> {
  if (pages.length === 0) throw new Error('paginate requires at least one page');

  const { time = 120_000, onTimeout = 'disable', pageJump = true, modalTime = 60_000 } = options;
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
    jump: `paginate:${token}:jump`,
  };
  const jump = jumpModal(token, pages.length);

  let index = 0;
  const send = async (disabled: boolean, strip = false) => {
    const response = toResponse(pages[index], index, pages.length);
    if (!strip && pages.length > 1) {
      const buttons = row(token, index, pages.length, disabled, pageJump);
      if (isComponentsV2(response)) {
        response.components = [...(response.components ?? []), buttons];
      } else {
        response.components = [buttons];
      }
    } else if (strip) {
      response.components = [];
    }
    if (interaction.replied || interaction.deferred)
      await interaction.editReply(response as never);
    else await interaction.reply(response);
  };

  await send(false);

  if (pages.length === 1) return 0;

  const filter = (i: { user: { id: string } }) => i.user.id === userId;

  const ack = async (click: { deferUpdate?: () => Promise<unknown> }) => {
    try {
      await click.deferUpdate?.();
    } catch {
      // Interaction already answered or expired; the edit below still lands.
    }
  };

  type Click =
    | { kind: 'prev'; click: ButtonInteraction }
    | { kind: 'next'; click: ButtonInteraction }
    | { kind: 'jump'; click: ButtonInteraction };

  while (true) {
    const waiters: Promise<Click>[] = [
      client
        .awaitInteraction<ButtonInteraction>(ids.prev, { filter, time })
        .then((click) => ({ kind: 'prev', click }) as Click),
      client
        .awaitInteraction<ButtonInteraction>(ids.next, { filter, time })
        .then((click) => ({ kind: 'next', click }) as Click),
    ];
    if (pageJump) {
      waiters.push(
        client
          .awaitInteraction<ButtonInteraction>(ids.jump, { filter, time })
          .then((click) => ({ kind: 'jump', click }) as Click)
      );
    }
    const race = await Promise.race(waiters).catch(() => null);
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

    if (race.kind === 'jump') {
      // Showing the modal acknowledges the click.
      await race.click.showModal(jump.modal).catch(() => null);
      const submit = await client
        .awaitInteraction<ModalSubmitInteraction>(jump.id, { filter, time: modalTime })
        .catch(() => null);
      client.interactionAwaiter.cancelAwaits(jump.id);
      const target = submit ? Number(submit.fields.getTextInputValue('page')) : NaN;
      if (
        submit &&
        Number.isInteger(target) &&
        target >= 1 &&
        target <= pages.length
      ) {
        index = target - 1;
        // Dismiss the modal's loading state; the edit below still lands
        // even if this is already answered.
        await submit.deferUpdate().catch(() => null);
        try {
          await send(false);
        } catch {
          return index;
        }
      }
      continue;
    }

    await ack(race.click);
    index =
      race.kind === 'next'
        ? (index + 1) % pages.length
        : (index - 1 + pages.length) % pages.length;
    try {
      await send(false);
    } catch {
      return index;
    }
  }
}
