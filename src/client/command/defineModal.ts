import {
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction,
} from "discord.js";
import { createCustomId } from "@client/util/customId";

export interface ModalField {
  id: string;
  label: string;
  description?: string;
  style?: TextInputStyle;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  value?: string;
}

export type ModalValues<Fields extends readonly ModalField[]> = {
  [F in Fields[number] as F["id"]]: string;
};

export interface ModalDefinition<
  Fields extends readonly ModalField[] = readonly ModalField[],
> {
  action: string;
  title: string;
  fields: Fields;
}

export interface DefinedModal<Fields extends readonly ModalField[]> {
  action: string;
  /** Full customId for this use (`action` or `action:state`). */
  id: (state?: string | number) => string;
  /** ModalBuilder to pass to `showModal`. Await submits of `id(state)`. */
  build: (state?: string | number) => ModalBuilder;
  /** Typed submitted values, keyed by field id. */
  parse: (interaction: ModalSubmitInteraction) => ModalValues<Fields>;
}

/**
 * Define a modal with typed fields. Modals are shown per-use, so `build`
 * takes the same state suffix you will await submits of:
 *
 * @example
 * const modal = usernameModal.build(userId);
 * await click.showModal(modal);
 * const submit = await client.awaitInteraction<ModalSubmitInteraction>(
 *   usernameModal.id(userId), { filter, time }
 * );
 * const { name } = usernameModal.parse(submit); // typed string
 */
export function defineModal<const Fields extends readonly ModalField[]>(
  def: ModalDefinition<Fields>
): DefinedModal<Fields> {
  const id = (state?: string | number) =>
    state === undefined ? def.action : createCustomId(def.action, state);

  return {
    action: def.action,
    id,
    build: (state?: string | number) => {
      const builder = new ModalBuilder()
        .setCustomId(id(state))
        .setTitle(def.title);
      for (const field of def.fields) {
        const input = new TextInputBuilder()
          .setCustomId(field.id)
          .setStyle(field.style ?? TextInputStyle.Short);
        if (field.required !== undefined)
          input.setRequired(field.required);
        if (field.minLength !== undefined)
          input.setMinLength(field.minLength);
        if (field.maxLength !== undefined)
          input.setMaxLength(field.maxLength);
        if (field.placeholder !== undefined)
          input.setPlaceholder(field.placeholder);
        if (field.value !== undefined) input.setValue(field.value);

        const label = new LabelBuilder().setLabel(field.label);
        if (field.description !== undefined)
          label.setDescription(field.description);
        builder.addLabelComponents(
          label.setTextInputComponent(input)
        );
      }
      return builder;
    },
    parse: (interaction: ModalSubmitInteraction) => {
      const values: Record<string, string> = {};
      for (const field of def.fields)
        values[field.id] = interaction.fields.getTextInputValue(field.id);
      return values as ModalValues<Fields>;
    },
  };
}
