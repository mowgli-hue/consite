/**
 * Form schema — the wedge feature.
 *
 * Forms are JSON documents stored in Firestore. Admin edits in the form
 * builder (v0.3); worker renders + fills via FormRenderer (v0.2).
 *
 * IMPORTANT: when a form schema is edited, BUMP THE VERSION. Old submissions
 * keep their schemaVersion so we can render historical submissions correctly
 * even after the schema evolves.
 */

export type FormFieldType =
  | 'text'
  | 'multiline'
  | 'dropdown'
  | 'checkbox'
  | 'signature'
  | 'image'
  | 'date';

/** Common props all fields share. */
interface FieldBase {
  id: string; // unique within form
  label: string;
  helperText?: string;
  required?: boolean;
}

export interface TextField extends FieldBase {
  type: 'text';
  placeholder?: string;
  maxLength?: number;
}

export interface MultilineField extends FieldBase {
  type: 'multiline';
  placeholder?: string;
  rows?: number;
}

export interface DropdownField extends FieldBase {
  type: 'dropdown';
  options: string[];
  allowOther?: boolean;
}

export interface CheckboxField extends FieldBase {
  type: 'checkbox';
  /** If set, renders as a group of checkboxes. Otherwise a single yes/no. */
  options?: string[];
}

export interface SignatureField extends FieldBase {
  type: 'signature';
}

export interface ImageField extends FieldBase {
  type: 'image';
  /** Maximum number of images allowed. Default 1. */
  max?: number;
  /** If true, only camera capture (no library). */
  cameraOnly?: boolean;
}

export interface DateField extends FieldBase {
  type: 'date';
  mode: 'date' | 'time' | 'datetime';
}

export type FormField =
  | TextField
  | MultilineField
  | DropdownField
  | CheckboxField
  | SignatureField
  | ImageField
  | DateField;

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
  category?: 'flha' | 'inspection' | 'toolbox' | 'incident' | 'custom';
  version: number;
  sections: FormSection[];
  archived: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Field values keyed by field id.
 *
 * - text/multiline → string
 * - dropdown       → string (selected option, or 'other:<value>')
 * - checkbox       → boolean (no options) | string[] (with options)
 * - signature      → string (storage path to PNG)
 * - image          → string[] (storage paths)
 * - date           → number (ms epoch)
 */
export type FormValues = Record<
  string,
  string | string[] | boolean | number | undefined
>;

export interface FormSubmission {
  id: string;
  schemaId: string;
  /** Snapshot of the schema version at submission time. */
  schemaVersion: number;
  projectId: string;
  values: FormValues;
  submittedBy: string;
  submittedAt: number;
  /** GPS at time of submission (optional, future use for incident geo-tagging). */
  gps?: { lat: number; lng: number; accuracy: number };
  /** Path in Storage to the exported PDF, populated by Cloud Function. */
  pdfStoragePath?: string;
  /** For offline-submitted forms — true until server confirms. */
  pendingSync?: boolean;
}
