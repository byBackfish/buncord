import type { Precondition } from "@struct/command/Command";
import { ChannelType, type GuildMember } from "discord.js";

function hasRoleId(member: unknown, roleId: string): boolean {
  if (!member || typeof member !== 'object') return false;
  const roles = (member as { roles?: unknown }).roles;
  if (Array.isArray(roles)) return roles.includes(roleId);
  if (roles && typeof roles === 'object' && 'cache' in roles) {
    const cache = (roles as { cache?: { has?: unknown } }).cache;
    if (cache && typeof cache.has === 'function')
      return (cache.has as (id: string) => boolean).call(cache, roleId);
  }
  return false;
}

/** Pass when the member has the given role. */
export function hasRole(roleId: string, message?: string): Precondition {
  return async (interaction) => {
    if (hasRoleId(interaction.member, roleId)) return true;
    return message ?? 'You do not have the required role for this command.';
  };
}

/** Pass when the user is in any voice channel of the guild. */
export function inVoiceChannel(message?: string): Precondition {
  return async (interaction) => {
    const member = interaction.member as GuildMember | null;
    const channel =
      member && 'voice' in member ? member.voice.channel : null;
    if (channel) return true;
    return message ?? 'You must be in a voice channel to use this command.';
  };
}

/** Pass when the channel is (or isn't) a thread. */
export function inThread(
  allowed = true,
  message?: string
): Precondition {
  return async (interaction) => {
    const type =
      interaction.channel && 'type' in interaction.channel
        ? interaction.channel.type
        : null;
    const isThread =
      type === ChannelType.PublicThread ||
      type === ChannelType.PrivateThread ||
      type === ChannelType.AnnouncementThread;
    if (isThread === allowed) return true;
    return (
      message ??
      (allowed
        ? 'This command can only be used in threads.'
        : 'This command cannot be used in threads.')
    );
  };
}
