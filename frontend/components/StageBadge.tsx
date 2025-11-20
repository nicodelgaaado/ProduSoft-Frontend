'use client';

import { Tag } from '@carbon/react';
import type { StageState } from '@/types/api';

type TagTone =
  | 'red'
  | 'magenta'
  | 'purple'
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'green'
  | 'gray'
  | 'cool-gray'
  | 'warm-gray'
  | 'high-contrast'
  | 'outline';

const stageTokens: Record<StageState, { label: string; tone: TagTone }> = {
  BLOCKED: { label: 'Blocked', tone: 'red' },
  PENDING: { label: 'Pending', tone: 'cool-gray' },
  IN_PROGRESS: { label: 'In progress', tone: 'blue' },
  COMPLETED: { label: 'Completed', tone: 'green' },
  EXCEPTION: { label: 'Exception', tone: 'magenta' },
  SKIPPED: { label: 'Skipped', tone: 'teal' },
  REWORK: { label: 'Rework', tone: 'purple' },
};

export function StageBadge({ state }: { state: StageState }) {
  const config = stageTokens[state];
  return (
    <Tag type={config.tone} size="sm">
      {config.label}
    </Tag>
  );
}

