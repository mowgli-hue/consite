/**
 * Shared types used by the AI form-fill engine.
 *
 * Mirrors the client-side types in src/types/form.ts but stays standalone
 * so the functions/ workspace doesn't need to import client code.
 */

export type FormFieldType =
  | 'text'
  | 'multiline'
  | 'dropdown'
  | 'checkbox'
  | 'signature'
  | 'image'
  | 'date';

export interface FormFieldBase {
  id: string;
  type: FormFieldType;
  label: string;
  required?: boolean;
  helperText?: string;
}

export interface FormField extends FormFieldBase {
  options?: string[];
  max?: number;
  mode?: 'date' | 'time' | 'datetime';
  placeholder?: string;
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
}

export interface FormSchema {
  id: string;
  title: string;
  description?: string;
  category?: string;
  version: number;
  sections: FormSection[];
}

export type FormValues = Record<string, unknown>;
