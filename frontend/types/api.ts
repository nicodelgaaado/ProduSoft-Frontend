export type StageType = 'PREPARATION' | 'ASSEMBLY' | 'DELIVERY';

export type StageState =
  | 'BLOCKED'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'EXCEPTION'
  | 'SKIPPED'
  | 'REWORK';

export interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  completed: boolean;
}

export interface OrderStageStatus {
  id: number;
  stage: StageType;
  state: StageState;
  assignee: string | null;
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  serviceTimeMinutes: number | null;
  notes: string | null;
  exceptionReason: string | null;
  supervisorNotes: string | null;
  approvedBy: string | null;
  updatedAt: string | null;
  checklist: ChecklistItem[];
}

export interface OrderResponse {
  id: number;
  orderNumber: string;
  priority: number | null;
  currentStage: StageType;
  overallState: StageState;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
  stages: OrderStageStatus[];
}

export interface WorkQueueItem {
  orderId: number;
  orderNumber: string;
  priority: number | null;
  stage: StageType;
  stageState: StageState;
  currentStage: StageType;
  overallState: StageState;
  assignee: string | null;
  claimedAt: string | null;
  updatedAt: string | null;
  exceptionReason: string | null;
  notes: string | null;
  checklist: ChecklistItem[];
}

export interface StageSummaryResponse {
  stage: StageType;
  pending: number;
  inProgress: number;
  exceptions: number;
  completed: number;
}

export interface WipSummaryResponse {
  totalOrders: number;
  completedOrders: number;
  exceptionOrders: number;
  stages: StageSummaryResponse[];
}

export interface AuthUser {
  username: string;
  roles: string[];
}

export type AuthRole = 'OPERATOR' | 'SUPERVISOR';

export type AiMessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM';

export interface AiConversationSummaryResponse {
  id: number;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview: string | null;
}

export interface AiMessageResponse {
  id: number;
  role: AiMessageRole;
  content: string;
  createdAt: string;
}

export interface AiConversationResponse {
  id: number;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AiMessageResponse[];
}

export type AiStreamEvent =
  | { type: 'token'; delta: string }
  | { type: 'conversation'; conversation: AiConversationResponse }
  | { type: 'error'; message: string };
