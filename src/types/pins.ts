/**
 * Pin-tasks on drawings — "install this here", assigned from the blueprint.
 * Stored at projects/{pid}/plans/{planId}/pins/{pinId}.
 */

export type PinType = 'task' | 'issue';
export type PinStatus = 'open' | 'done' | 'accepted';

export interface DrawingPin {
  id: string;
  planId: string;
  projectId: string;
  /** Normalized 0–1 coordinates on the drawing image. */
  x: number;
  y: number;
  type: PinType;
  instruction: string;
  assigneeUid?: string;
  assigneeName?: string;
  status: PinStatus;
  createdBy: string;
  createdByName?: string;
  createdAt: number;
  completedAt?: number;
  completionNote?: string;
  completionPhotoPath?: string;
  acceptedBy?: string;
}
