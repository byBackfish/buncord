import {
  ApplicationCommandData,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  AutocompleteInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  EmbedBuilder,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  MessageFlags,
  MessageFlagsBitField,
  ModalBuilder,
} from 'discord.js';
import type { BunClient } from '@client';
import { BunCommand } from '@client';
import type { BunChatInputInteraction } from '@struct/command/CommandArgument';
import type {
  CommandData,
  CooldownOptions,
  Precondition,
  PreconditionResult,
} from '@struct/command/Command';
import type { CommandErrorPayload } from '@client/BunClient';
import { glob } from 'glob';
import { resolve } from 'path'

export type DenialReason =
  | 'owner'
  | 'permissions'
  | 'self'
  | 'guild'
  | 'dm'
  | 'guildOnly'
  | 'nsfw'
  | 'thread'
  | 'forum';

const DEFAULT_MESSAGES: Record<DenialReason | 'error' | 'cooldown', string> = {
  owner: 'Only bot owners can use this command.',
  permissions: 'You do not have permission to use this command.',
  self: "I do not have the permissions required to run this command.",
  guild: 'This command is not available in this server.',
  dm: 'This command cannot be used in DMs.',
  guildOnly: 'This command cannot be used in servers.',
  nsfw: 'This command can only be used in age-restricted channels.',
  thread: 'Commands cannot be used in threads.',
  forum: 'Commands cannot be used in forum channels.',
  error: 'Something went wrong while running this command.',
  cooldown: 'Slow down — try again in {remaining}.',
};

type AnyCommandInteraction =
  | ChatInputCommandInteraction
  | ContextMenuCommandInteraction;

interface ResolvedCommand {
  root: BunCommand;
  leaf: BunCommand;
  /** e.g. ['permissions', 'user', 'get'] — used for cooldown buckets. */
  path: string[];
}

interface EffectiveOptions {
  ownerOnly?: boolean;
  userPermissions?: CommandData['userPermissions'];
  selfPermissions?: CommandData['selfPermissions'];
  guildIDs?: CommandData['guildIDs'];
  nsfw?: boolean;
  autoDefer?: boolean;
  useEphemeral?: boolean;
  errorMessage?: string;
  cooldown?: CooldownOptions;
  preconditions: Precondition[];
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

const keyFor = (type: ApplicationCommandType, name: string) =>
  `${type}:${name}`;

export class CommandHandler {
  public commands = new Map<string, BunCommand>();
  /**
   * Override any denial / error reply. `{remaining}` in the cooldown
   * message is replaced with the time left. Per-command `errorMessage`
   * wins for execution errors.
   */
  public messages: Record<DenialReason | 'error' | 'cooldown', string> = {
    ...DEFAULT_MESSAGES,
  };
  private cooldowns = new Map<string, number>();

  constructor(private client: BunClient) {}

  /** Register a command programmatically (alternative to `commandDirPath`). */
  public add(command: BunCommand): this {
    if (!command?.name) throw new Error('Cannot add a command without a name');
    const key = keyFor(command.data.type ?? ApplicationCommandType.ChatInput, command.name);
    if (this.commands.has(key)) throw new Error(`Duplicate command: ${key}`);
    command.client = this.client;
    this.commands.set(key, command);
    return this;
  }

  public async loadCommands(): Promise<void> {
    const dir = this.client.options.commands?.commandDirPath;
    if (!dir) return;

    const path = resolve(dir);
    const files = (
      await glob(`${path}/**/*.{ts,js,mjs}`, { ignore: '**/*.d.ts' })
    ).sort();

    for (const file of files) {
      try {
        const filePath = resolve(file);
        const mod = await import(filePath);
        const exported = mod.default;
        if (!exported) {
          this.client.logger.warn(`Skipping ${file}: no default export`);
          continue;
        }
        // Classes are constructed; defineCommand() objects are used directly.
        const command: BunCommand =
          typeof exported === 'function' ? new exported() : exported;
        if (!(command instanceof BunCommand) || !command.name) {
          this.client.logger.warn(
            `Skipping ${file}: default export is not a BunCommand`
          );
          continue;
        }
        this.add(command);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith('Duplicate command')
        )
          throw error;
        this.client.logger.error(`Failed to load command ${file}:`, error);
      }
    }
  }

  public async registerCommands(): Promise<void> {
    const data: ApplicationCommandData[] = [];

    this.commands.forEach((command) => {
      data.push(command.toJSON());
    });

    if (!this.client.application) throw new Error('Client is not ready');
    await this.client.application.commands.set(data);
  }

  public async handleInteraction(interaction: Interaction): Promise<void> {
    try {
      if (interaction.isChatInputCommand())
        await this.handleChatInput(interaction);
      else if (
        interaction.isUserContextMenuCommand() ||
        interaction.isMessageContextMenuCommand()
      )
        await this.handleContextMenu(interaction);
      else if (interaction.isAutocomplete())
        await this.handleAutocomplete(interaction);
    } catch (error) {
      this.client.logger.error('Error handling interaction:', error);
    }
  }

  private async replyDenied(
    interaction: AnyCommandInteraction,
    content: string
  ): Promise<void> {
    // Note: editReply cannot change ephemeral state, so denials after a
    // non-ephemeral defer stay visible. Deny before deferring instead.
    if (interaction.replied || interaction.deferred)
      await interaction.editReply({ content });
    else
      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
      });
  }

  private async deny(
    interaction: AnyCommandInteraction,
    reason: DenialReason
  ): Promise<void> {
    await this.replyDenied(interaction, this.messages[reason]);
  }

  private effectiveOptions(root: BunCommand, leaf: BunCommand): EffectiveOptions {
    const r = root.data;
    const l = leaf.data;
    return {
      ownerOnly: l.ownerOnly ?? r.ownerOnly,
      userPermissions: l.userPermissions ?? r.userPermissions,
      selfPermissions: l.selfPermissions ?? r.selfPermissions,
      guildIDs: l.guildIDs ?? r.guildIDs,
      nsfw: l.nsfw ?? r.nsfw,
      autoDefer: l.autoDefer ?? r.autoDefer,
      useEphemeral: l.useEphemeral ?? r.useEphemeral,
      errorMessage: l.errorMessage ?? r.errorMessage,
      cooldown: l.cooldown ?? r.cooldown,
      preconditions: [
        ...(this.client.options.commands?.preconditions ?? []),
        ...(r.preconditions ?? []),
        ...(root === leaf ? [] : (l.preconditions ?? [])),
      ],
    };
  }

  /** Global + command constraints. Returns a denial reason, or null if allowed. */
  private checkConstraints(
    interaction: AnyCommandInteraction,
    eff: EffectiveOptions
  ): DenialReason | null {
    const global = this.client.options.commands ?? {};

    if (eff.ownerOnly) {
      const owners = this.client.options.owners ?? [];
      if (!owners.includes(interaction.user.id)) return 'owner';
    }

    if (eff.userPermissions) {
      const memberPerms = interaction.memberPermissions;
      if (!memberPerms || !memberPerms.has(eff.userPermissions as never))
        return 'permissions';
    }

    if (eff.selfPermissions) {
      const appPerms = interaction.appPermissions;
      if (!appPerms || !appPerms.has(eff.selfPermissions as never))
        return 'self';
    }

    if (eff.guildIDs && eff.guildIDs.length > 0) {
      if (!interaction.guildId || !eff.guildIDs.includes(interaction.guildId))
        return 'guild';
    }

    const inGuild = interaction.inGuild();
    if (global.allowDM === false && !inGuild) return 'dm';
    if (global.allowGuild === false && inGuild) return 'guildOnly';

    const channel = interaction.channel;
    const isNsfw =
      !!channel &&
      'nsfw' in channel &&
      (channel as { nsfw?: unknown }).nsfw === true;
    if (eff.nsfw && inGuild && !isNsfw) return 'nsfw';
    if (global.allowNSFW === false && isNsfw) return 'nsfw';

    if (channel && 'type' in channel) {
      const type = (channel as { type?: ChannelType }).type;
      const isThread =
        type === ChannelType.PublicThread ||
        type === ChannelType.PrivateThread ||
        type === ChannelType.AnnouncementThread;
      if (global.allowThread === false && isThread) return 'thread';
      if (global.allowForum === false && type === ChannelType.GuildForum)
        return 'forum';
    }

    return null;
  }

  private checkCooldown(
    interaction: AnyCommandInteraction,
    path: string[],
    cooldown: CooldownOptions
  ): string | null {
    const bypass = cooldown.bypassOwners ?? true;
    if (
      bypass &&
      (this.client.options.owners ?? []).includes(interaction.user.id)
    )
      return null;

    const scopeId =
      cooldown.scope === 'global'
        ? 'global'
        : cooldown.scope === 'guild'
          ? (interaction.guildId ?? 'dm')
          : cooldown.scope === 'channel'
            ? (interaction.channelId ?? 'none')
            : interaction.user.id;
    const key = `${path.join(' ')}:${scopeId}`;
    const now = Date.now();

    if (this.cooldowns.size > 1000) {
      for (const [k, expires] of this.cooldowns)
        if (expires <= now) this.cooldowns.delete(k);
    }

    const expires = this.cooldowns.get(key);
    if (expires && expires > now)
      return this.messages.cooldown.replace(
        '{remaining}',
        formatDuration(expires - now)
      );

    this.cooldowns.set(key, now + cooldown.duration);
    return null;
  }

  private resolveLeaf(
    interaction: ChatInputCommandInteraction
  ): ResolvedCommand | null {
    const root = this.commands.get(
      keyFor(ApplicationCommandType.ChatInput, interaction.commandName)
    );
    if (!root) return null;
    if (!root.data.subcommands?.length)
      return { root, leaf: root, path: [root.name] };

    let node = root;
    const path = [root.name];
    const groupName = interaction.options.getSubcommandGroup(false);
    if (groupName) {
      const group = root.data.subcommands.find(
        (s) => s.name === groupName && s.isGroup
      );
      if (!group) return null;
      node = group;
      path.push(groupName);
    }

    const subName = interaction.options.getSubcommand(false);
    if (!subName) return null;
    const pool = node.isGroup ? node.data.subcommands! : root.data.subcommands;
    const leaf = pool.find((s) => s.name === subName && !s.isGroup);
    if (!leaf) return null;
    path.push(subName);
    return { root, leaf, path };
  }

  private resolveArgs(
    interaction: ChatInputCommandInteraction,
    leaf: BunCommand
  ): Record<string, any> {
    const args: Record<string, any> = {};

    for (const argument of leaf.data.options ?? []) {
      const raw = interaction.options.get(argument.name);
      if (raw != null) {
        switch (argument.type) {
          case ApplicationCommandOptionType.User:
            args[argument.name] =
              interaction.options.getUser(argument.name) ?? raw.value;
            break;
          case ApplicationCommandOptionType.Channel:
            args[argument.name] =
              interaction.options.getChannel(argument.name) ?? raw.value;
            break;
          case ApplicationCommandOptionType.Role:
            args[argument.name] =
              interaction.options.getRole(argument.name) ?? raw.value;
            break;
          case ApplicationCommandOptionType.Mentionable:
            args[argument.name] =
              interaction.options.getMentionable(argument.name) ?? raw.value;
            break;
          case ApplicationCommandOptionType.Attachment:
            args[argument.name] =
              interaction.options.getAttachment(argument.name) ?? raw.value;
            break;
          default:
            args[argument.name] = raw.value;
        }
      } else if (argument.default !== undefined) {
        args[argument.name] = argument.default;
      }
    }

    return args;
  }

  private async fail(
    interaction: AnyCommandInteraction,
    command: BunCommand,
    error: unknown,
    errorMessage?: string
  ): Promise<void> {
    this.client.logger.error(
      `Error executing command "${command.name}":`,
      error
    );
    const payload: CommandErrorPayload = { command, interaction, error };
    this.client.emit('commandError', payload);
    const content =
      errorMessage ??
      this.client.options.commands?.errorMessage ??
      this.messages.error;
    if (interaction.replied || interaction.deferred)
      await interaction.editReply({ content });
    else
      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
      });
  }

  private assertComponentsV2Safe(response: InteractionReplyOptions): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bits = new MessageFlagsBitField((response.flags as any) ?? 0);
    if (!bits.has(MessageFlags.IsComponentsV2)) return;
    const r = response as InteractionReplyOptions & {
      poll?: unknown;
      stickers?: unknown;
    };
    if (
      r.content != null ||
      (r.embeds?.length ?? 0) > 0 ||
      r.poll != null ||
      r.stickers != null
    )
      throw new Error(
        'Responses with MessageFlags.IsComponentsV2 cannot include content, embeds, poll, or stickers — send everything as components.'
      );
  }

  private mapResult(
    result: Awaited<ReturnType<BunCommand['execute']>>
  ): InteractionReplyOptions | ModalBuilder | null {
    if (result == null) return null;
    if (result instanceof ModalBuilder) return result;

    let response: InteractionReplyOptions = {};
    if (typeof result === 'string') {
      response.content = result;
    } else if (typeof result === 'object') {
      if (Array.isArray(result)) {
        response.embeds = result as EmbedBuilder[];
      } else if (result instanceof EmbedBuilder) {
        response.embeds = [result];
      } else {
        response = result as InteractionReplyOptions;
      }
    }
    return response;
  }

  private async run(
    interaction: AnyCommandInteraction,
    command: BunCommand,
    leaf: BunCommand,
    args: Record<string, any>,
    eff: EffectiveOptions
  ): Promise<void> {
    const ephemeral =
      eff.useEphemeral ?? this.client.options.commands?.useEphemeral;
    if (eff.autoDefer ?? this.client.options.commands?.autoDefer) {
      await interaction.deferReply({
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    }

    let result: Awaited<ReturnType<BunCommand['execute']>>;
    try {
      // interaction.client IS this BunClient at runtime; context menu
      // interactions additionally aren't chat input interactions, so this
      // crosses two discord.js type boundaries at once.
      result = await leaf.execute(
        interaction as unknown as BunChatInputInteraction,
        args
      );
    } catch (error) {
      await this.fail(interaction, command, error, eff.errorMessage);
      return;
    }

    const mapped = this.mapResult(result);
    if (mapped == null) return;
    if (mapped instanceof ModalBuilder) {
      if (interaction.deferred || interaction.replied) {
        await this.fail(
          interaction,
          command,
          new Error(
            'A modal must be the initial response; disable autoDefer for this command'
          ),
          eff.errorMessage
        );
        return;
      }
      await interaction.showModal(mapped);
      return;
    }

    try {
      this.assertComponentsV2Safe(mapped);
    } catch (error) {
      await this.fail(interaction, command, error, eff.errorMessage);
      return;
    }

    if (ephemeral) {
      // Interaction reply flags and message flags are distinct BitField
      // types in discord.js; normalize through a fresh BitField.
      const bitfield = new MessageFlagsBitField();
      if (mapped.flags != null) bitfield.add(mapped.flags as never);
      bitfield.add(MessageFlags.Ephemeral);
      mapped.flags = bitfield.bitfield as InteractionReplyOptions['flags'];
    }

    if (Object.keys(mapped).length >= 1) {
      if (interaction.replied || interaction.deferred) {
        // editReply cannot set Ephemeral, but must keep IsComponentsV2.
        const { flags, ...rest } = mapped;
        const bits = new MessageFlagsBitField((flags as never) ?? 0);
        bits.remove(MessageFlags.Ephemeral);
        await interaction.editReply({
          ...rest,
          ...(bits.bitfield ? { flags: bits.bitfield } : {}),
        } as InteractionEditReplyOptions);
      } else {
        await interaction.reply(mapped);
      }
    }
  }

  private async handleChatInput(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const resolved = this.resolveLeaf(interaction);
    if (!resolved) return;

    const { root, leaf, path } = resolved;
    const eff = this.effectiveOptions(root, leaf);

    const denied = this.checkConstraints(interaction, eff);
    if (denied) {
      await this.deny(interaction, denied);
      return;
    }

    for (const check of eff.preconditions) {
      let verdict: PreconditionResult;
      try {
        verdict = await check(interaction as BunChatInputInteraction);
      } catch (error) {
        this.client.logger.error(
          `Error in precondition for "${path.join(' ')}":`,
          error
        );
        await this.replyDenied(interaction, this.messages.error);
        return;
      }
      if (verdict !== true) {
        await this.replyDenied(interaction, verdict);
        return;
      }
    }

    if (eff.cooldown) {
      const limited = this.checkCooldown(interaction, path, eff.cooldown);
      if (limited) {
        await this.replyDenied(interaction, limited);
        return;
      }
    }

    await this.run(
      interaction,
      root,
      leaf,
      this.resolveArgs(interaction, leaf),
      eff
    );
  }

  private async handleContextMenu(
    interaction: ContextMenuCommandInteraction
  ): Promise<void> {
    const type = interaction.isUserContextMenuCommand()
      ? ApplicationCommandType.User
      : ApplicationCommandType.Message;
    const command = this.commands.get(
      keyFor(type, interaction.commandName)
    );
    if (!command) return;

    const eff = this.effectiveOptions(command, command);

    const denied = this.checkConstraints(interaction, eff);
    if (denied) {
      await this.deny(interaction, denied);
      return;
    }

    for (const check of eff.preconditions) {
      let verdict: PreconditionResult;
      try {
        // Preconditions only rely on fields shared by all command
        // interactions (user/member/channel); chat-specific access must
        // narrow the interaction itself.
        verdict = await check(
          interaction as unknown as BunChatInputInteraction
        );
      } catch (error) {
        this.client.logger.error(
          `Error in precondition for "${command.name}":`,
          error
        );
        await this.replyDenied(interaction, this.messages.error);
        return;
      }
      if (verdict !== true) {
        await this.replyDenied(interaction, verdict);
        return;
      }
    }

    if (eff.cooldown) {
      const limited = this.checkCooldown(
        interaction,
        [command.name],
        eff.cooldown
      );
      if (limited) {
        await this.replyDenied(interaction, limited);
        return;
      }
    }

    await this.run(interaction, command, command, {}, eff);
  }

  private async handleAutocomplete(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    const command = this.commands.get(
      keyFor(ApplicationCommandType.ChatInput, interaction.commandName)
    );
    if (!command) return;

    let leaf = command;
    try {
      const groupName = interaction.options.getSubcommandGroup(false);
      let node = command;
      if (groupName) {
        const group = command.data.subcommands?.find(
          (s) => s.name === groupName && s.isGroup
        );
        if (group) node = group;
      }
      const subName = interaction.options.getSubcommand(false);
      if (subName) {
        const pool = node.isGroup
          ? (node.data.subcommands ?? [])
          : (command.data.subcommands ?? []);
        const found = pool.find((s) => s.name === subName && !s.isGroup);
        if (found) leaf = found;
      }
    } catch {
      // Fall through with the top-level command.
    }

    const { name } = interaction.options.getFocused(true);

    if (name) {
      const option = leaf.data.options?.find(
        (option) => option.name === name
      );

      if (!option) return;

      try {
        const result = await option.onAutocomplete?.(
          interaction as AutocompleteInteraction & {
            client: BunClient;
          }
        );

        if (!result) return;
        await interaction.respond(result);
      } catch (error) {
        this.client.logger.error(
          `Error in autocomplete for "${command.name}/${name}":`,
          error
        );
      }
    }
  }
}
