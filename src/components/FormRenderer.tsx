/**
 * FormRenderer.
 *
 * Takes a FormSchema and current values, renders the appropriate field
 * component for each entry in the schema.
 *
 * v0.2: passes an optional `aiFilledKeys` set. Fields with IDs in that set
 * get a subtle teal accent on the left edge — telling the worker "this was
 * AI's guess, please verify." Trust calibration matters.
 *
 * To add a new field type:
 *   1. Add the type to FormFieldType in types/form.ts
 *   2. Create src/components/fields/<NewField>.tsx
 *   3. Add a case in the switch below
 */

import { View, Text, StyleSheet } from 'react-native';

import { colors, spacing, radii, typography } from '../theme';
import type { FormSchema, FormValues, FormField } from '../types';

import { TextField } from './fields/TextField';
import { MultilineField } from './fields/MultilineField';
import { DropdownField } from './fields/DropdownField';
import { CheckboxField } from './fields/CheckboxField';
import { SignatureField } from './fields/SignatureField';
import { ImageField } from './fields/ImageField';
import { DateField } from './fields/DateField';

interface Props {
  schema: FormSchema;
  values: FormValues;
  onChange: (next: FormValues) => void;
  /** Optional set of field IDs that were AI-filled. They get a left-edge accent. */
  aiFilledKeys?: Set<string>;
  /** When the worker edits an AI-filled field, we drop it from the set. */
  onFieldEdited?: (fieldId: string) => void;
}

export function FormRenderer({ schema, values, onChange, aiFilledKeys, onFieldEdited }: Props) {
  function update(fieldId: string, value: any) {
    onChange({ ...values, [fieldId]: value });
    // Worker just edited this field — no longer "AI-filled."
    if (aiFilledKeys?.has(fieldId)) onFieldEdited?.(fieldId);
  }

  return (
    <View>
      {schema.description ? <Text style={styles.description}>{schema.description}</Text> : null}

      {schema.sections.map((section) => (
        <View key={section.id} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.description ? (
            <Text style={styles.sectionDescription}>{section.description}</Text>
          ) : null}

          {section.fields.map((field) => {
            const aiFilled = aiFilledKeys?.has(field.id) ?? false;
            return (
              <View
                key={field.id}
                style={[styles.fieldWrap, aiFilled && styles.fieldWrapAiFilled]}
              >
                <FieldSwitch
                  field={field}
                  value={values[field.id]}
                  onChange={(v) => update(field.id, v)}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function FieldSwitch({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: any;
  onChange: (v: any) => void;
}) {
  switch (field.type) {
    case 'text':
      return <TextField field={field} value={value as string | undefined} onChange={onChange} />;
    case 'multiline':
      return <MultilineField field={field} value={value as string | undefined} onChange={onChange} />;
    case 'dropdown':
      return <DropdownField field={field} value={value as string | undefined} onChange={onChange} />;
    case 'checkbox':
      return <CheckboxField field={field} value={value} onChange={onChange} />;
    case 'signature':
      return <SignatureField field={field} value={value as string | undefined} onChange={onChange} />;
    case 'image':
      return <ImageField field={field} value={value as string[] | undefined} onChange={onChange} />;
    case 'date':
      return <DateField field={field} value={value as number | undefined} onChange={onChange} />;
    default:
      const _exhaustive: never = field;
      return null;
  }
}

const styles = StyleSheet.create({
  description: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  sectionDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  fieldWrap: {
    // base layout — fields paint their own backgrounds inside
  },
  fieldWrapAiFilled: {
    // Subtle teal left-edge stripe to mark AI-filled fields
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
    paddingLeft: spacing.sm,
    marginLeft: -spacing.sm,
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
    borderTopRightRadius: radii.sm,
    borderBottomRightRadius: radii.sm,
  },
});
