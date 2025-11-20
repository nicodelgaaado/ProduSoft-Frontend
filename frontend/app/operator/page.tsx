'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { InlineLoading, Tag, Toggle } from '@carbon/react';
import { RequireAuth } from '@/components/RequireAuth';
import { Modal } from '@/components/Modal';
import { StageBadge } from '@/components/StageBadge';
import { AiChatPanel } from '@/components/AiChatPanel';
import { useAuth } from '@/hooks/useAuth';
import { WorkflowApi } from '@/lib/api';
import type { ChecklistItem, StageType, WorkQueueItem } from '@/types/api';

const stageOptions: StageType[] = ['PREPARATION', 'ASSEMBLY', 'DELIVERY'];

type ModalState =
  | { type: 'claim'; item: WorkQueueItem }
  | { type: 'checklist'; item: WorkQueueItem }
  | { type: 'complete'; item: WorkQueueItem }
  | { type: 'exception'; item: WorkQueueItem }
  | null;

export default function OperatorConsole() {
  return (
    <RequireAuth allowedRoles={['OPERATOR']}>
      <OperatorView />
    </RequireAuth>
  );
}

function OperatorView() {
  const { user, token } = useAuth();
  const [stage, setStage] = useState<StageType>('PREPARATION');
  const [queue, setQueue] = useState<WorkQueueItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [serviceTime, setServiceTime] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [exceptionReason, setExceptionReason] = useState<string>('');
  const [exceptionNotes, setExceptionNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [checklists, setChecklists] = useState<Record<string, ChecklistItem[]>>({});
  const [checklistSaving, setChecklistSaving] = useState<boolean>(false);
  const buildChecklistKey = (orderId: number, stageType: StageType) => `${orderId}:${stageType}`;

  const nextStageFor = useCallback((currentStage: StageType) => {
    const idx = stageOptions.indexOf(currentStage);
    if (idx === -1 || idx === stageOptions.length - 1) {
      return null;
    }
    return stageOptions[idx + 1];
  }, []);

  const loadQueue = useCallback(
    async (targetStage?: StageType) => {
      if (!token) return;
      const stageToLoad = targetStage ?? stage;
      if (targetStage && targetStage !== stage) {
        setStage(targetStage);
      }
      setLoading(true);
      setError(null);
      try {
        const response = await WorkflowApi.operatorQueue(stageToLoad, token);
        setQueue(response);
        const nextChecklists: Record<string, ChecklistItem[]> = {};
        response.forEach((item) => {
          nextChecklists[buildChecklistKey(item.orderId, item.stage)] = item.checklist?.map((task) => ({ ...task })) ?? [];
        });
        setChecklists(nextChecklists);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch queue';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [stage, token],
  );

  useEffect(() => {
    loadQueue().catch((err) => console.error(err));
  }, [loadQueue]);

  const closeModal = () => {
    setModalState(null);
    setServiceTime('');
    setNotes('');
    setExceptionReason('');
    setExceptionNotes('');
    setSubmitting(false);
    setChecklistSaving(false);
  };

  const refreshAfterAction = async (targetStage?: StageType) => {
    await loadQueue(targetStage);
    closeModal();
  };

  const handleClaimConfirm = async (item: WorkQueueItem) => {
    if (!token || !user) return;
    setSubmitting(true);
    try {
      const status = await WorkflowApi.claimStage(item.orderId, item.stage, user.username, token);
      const tasks = status.checklist?.map((task) => ({ ...task })) ?? [];
      const updatedItem: WorkQueueItem = {
        ...item,
        stageState: status.state,
        assignee: status.assignee ?? user.username,
        claimedAt: status.claimedAt,
        updatedAt: status.updatedAt,
        notes: status.notes,
        checklist: tasks,
        overallState: 'IN_PROGRESS',
        currentStage: item.stage,
      };
      setChecklists((prev) => ({
        ...prev,
        [buildChecklistKey(item.orderId, item.stage)]: tasks,
      }));
      setQueue((prev) =>
        prev.map((row) =>
          row.orderId === item.orderId && row.stage === item.stage ? updatedItem : row,
        ),
      );
      setModalState({ type: 'checklist', item: updatedItem });
      setSubmitting(false);
      loadQueue().catch((err) => console.error(err));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to claim stage';
      setError(message);
      setSubmitting(false);
    }
  };

  const handleChecklistToggle = async (item: WorkQueueItem, taskId: string, completed: boolean) => {
    if (!token || !user) return;
    if (item.assignee && item.assignee !== user.username) {
      setError('Only the assigned operator can update the checklist.');
      return;
    }
    const key = buildChecklistKey(item.orderId, item.stage);
    const previousTasks = checklistForItem(item).map((task) => ({ ...task }));
    const optimisticTasks = previousTasks.map((task) =>
      task.id === taskId ? { ...task, completed } : task,
    );
    setChecklists((prev) => ({
      ...prev,
      [key]: optimisticTasks,
    }));
    setModalState((prev) => {
      if (!prev || !('item' in prev)) {
        return prev;
      }
      if (prev.item.orderId === item.orderId && prev.item.stage === item.stage) {
        return {
          ...prev,
          item: {
            ...prev.item,
            checklist: optimisticTasks,
          },
        };
      }
      return prev;
    });
    setChecklistSaving(true);
    try {
      const status = await WorkflowApi.updateChecklistItem(item.orderId, item.stage, { taskId, completed }, token);
      const tasks = status.checklist?.map((task) => ({ ...task })) ?? [];
      setChecklists((prev) => ({
        ...prev,
        [key]: tasks,
      }));
      setQueue((prev) =>
        prev.map((row) =>
          row.orderId === item.orderId && row.stage === item.stage
            ? {
                ...row,
                stageState: status.state,
                assignee: status.assignee ?? row.assignee,
                claimedAt: status.claimedAt,
                updatedAt: status.updatedAt,
                notes: status.notes,
                checklist: tasks,
              }
            : row,
        ),
      );
      setModalState((prev) => {
        if (!prev || !('item' in prev)) {
          return prev;
        }
        if (prev.item.orderId === item.orderId && prev.item.stage === item.stage) {
          return {
            ...prev,
            item: {
              ...prev.item,
              stageState: status.state,
              assignee: status.assignee ?? prev.item.assignee,
              claimedAt: status.claimedAt,
              updatedAt: status.updatedAt,
              notes: status.notes,
              checklist: tasks,
            },
          } as ModalState;
        }
        return prev;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update checklist';
      setError(message);
      setChecklists((prev) => ({
        ...prev,
        [key]: previousTasks,
      }));
      setModalState((prev) => {
        if (!prev || !('item' in prev)) {
          return prev;
        }
        if (prev.item.orderId === item.orderId && prev.item.stage === item.stage) {
          return {
            ...prev,
            item: {
              ...prev.item,
              checklist: previousTasks,
            },
          };
        }
        return prev;
      });
    } finally {
      setChecklistSaving(false);
    }
  };
  const checklistForItem = useCallback((item: WorkQueueItem) => {
    const key = buildChecklistKey(item.orderId, item.stage);
    return checklists[key] ?? item.checklist ?? [];
  }, [checklists]);

  const isChecklistComplete = useCallback(
    (item: WorkQueueItem) => checklistForItem(item).every((task) => !task.required || task.completed),
    [checklistForItem],
  );
  const activeChecklistTasks = useMemo(
    () => (modalState?.type === 'checklist' ? checklistForItem(modalState.item) : []),
    [modalState, checklistForItem],
  );

  const handleComplete = async (item: WorkQueueItem) => {
    if (!token || !user) return;
    if (!isChecklistComplete(item)) {
      setError('Complete all required tasks before finishing the stage.');
      return;
    }
    setSubmitting(true);
    try {
      await WorkflowApi.completeStage(
        item.orderId,
        item.stage,
        {
          assignee: user.username,
          serviceTimeMinutes: serviceTime ? Number(serviceTime) : null,
          notes,
        },
        token,
      );
      const nextStage = nextStageFor(item.stage);
      await refreshAfterAction(nextStage ?? nextStageFor(stage) ?? stage);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete stage';
      setError(message);
      setSubmitting(false);
    }
  };

  const handleException = async (item: WorkQueueItem) => {
    if (!token || !user) return;
    setSubmitting(true);
    try {
      await WorkflowApi.flagException(
        item.orderId,
        item.stage,
        {
          assignee: user.username,
          exceptionReason,
          notes: exceptionNotes || undefined,
        },
        token,
      );
      await refreshAfterAction();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to flag exception';
      setError(message);
      setSubmitting(false);
    }
  };

  const decoratedQueue = useMemo(
    () =>
      queue.map((item) => {
        const key = buildChecklistKey(item.orderId, item.stage);
        const tasks = checklists[key];
        return tasks ? { ...item, checklist: tasks } : item;
      }),
    [queue, checklists],
  );

  const orderedQueue = useMemo(
    () =>
      [...decoratedQueue].sort((a, b) => {
        const priorityA = a.priority ?? 0;
        const priorityB = b.priority ?? 0;
        if (priorityA === priorityB) {
          return (a.orderNumber ?? '').localeCompare(b.orderNumber ?? '');
        }
        return priorityB - priorityA;
      }),
    [decoratedQueue],
  );

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Operator Console</h1>
          <p>Claim, complete, or flag staged work items sequentially.</p>
        </div>
        <div className="stage-tabs" role="tablist">
          {stageOptions.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={stage === option}
              className={stage === option ? 'active' : ''}
              onClick={() => setStage(option)}
            >
              {option.toLowerCase()}
            </button>
          ))}
        </div>
      </header>

      {error && <div className="page-alert">{error}</div>}

      <section className="card">
        <header className="card__header">
          <h2>
            Stage queue <span className="muted">({orderedQueue.length})</span>
          </h2>
          <button type="button" className="link-button" onClick={() => loadQueue()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </header>
        <div className="table">
          <div className="table__head">
            <span>Order</span>
            <span>Priority</span>
            <span>Status</span>
            <span>Assignee</span>
            <span>Updated</span>
            <span>Actions</span>
          </div>
          <div className="table__body">
            {loading && orderedQueue.length === 0 && <div className="table__empty">Loading queue...</div>}
            {!loading && orderedQueue.length === 0 && <div className="table__empty">No items ready for this stage.</div>}
            {orderedQueue.map((item) => {
              const canEditChecklist = item.assignee === user?.username;
              const canComplete = isChecklistComplete(item);
              return (
                <article key={`${item.orderId}-${item.stage}`} className="table__row">
                  <span>
                    <strong>{item.orderNumber}</strong>
                  </span>
                  <span>{item.priority ?? '-'}</span>
                  <span>
                    <StageBadge state={item.stageState} />
                    {item.exceptionReason && <small className="muted"> {item.exceptionReason}</small>}
                  </span>
                  <span>{item.assignee ?? 'Unassigned'}</span>
                  <span>{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '-'}</span>
                  <span className="table__actions">
                    {(item.stageState === 'PENDING' || item.stageState === 'REWORK') && (
                      <button type="button" onClick={() => setModalState({ type: 'claim', item })}>
                        Claim
                      </button>
                    )}
                    {item.stageState === 'IN_PROGRESS' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setModalState({ type: 'checklist', item })}
                          disabled={!canEditChecklist}
                          title={!canEditChecklist ? 'Only the assigned operator can update the checklist' : undefined}
                        >
                          Checklist
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalState({ type: 'complete', item })}
                          disabled={!canEditChecklist || !canComplete}
                          title={!canComplete && canEditChecklist ? 'Complete all required tasks first' : undefined}
                        >
                          Complete
                        </button>
                        {canEditChecklist && (
                          <button type="button" className="danger" onClick={() => setModalState({ type: 'exception', item })}>
                            Flag exception
                          </button>
                        )}
                      </>
                    )}
                  </span>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <AiChatPanel />

      <Modal
        open={modalState?.type === 'claim'}
        title="Claim stage"
        onClose={closeModal}
        footer={
          <div className="modal-actions">
            <button type="button" onClick={closeModal} className="ghost">
              Cancel
            </button>
            {modalState?.type === 'claim' && (
              <button
                type="button"
                onClick={() => modalState && handleClaimConfirm(modalState.item)}
                disabled={submitting}
              >
                {submitting ? 'Claiming...' : 'Claim stage'}
              </button>
            )}
          </div>
        }
      >
        {modalState?.type === 'claim' && (
          <p>
            Confirm claim of <strong>{modalState.item.orderNumber}</strong> at the{' '}
            <strong>{modalState.item.stage.toLowerCase()}</strong> stage.
          </p>
        )}
      </Modal>

      <Modal
        open={modalState?.type === 'checklist'}
        title="Stage checklist"
        onClose={closeModal}
        footer={
          <div className="modal-actions">
            <button type="button" onClick={closeModal}>
              Close
            </button>
          </div>
        }
      >
        {modalState?.type === 'checklist' && (
          <div className="modal-form">
            <p>
              Check off the tasks for <strong>{modalState.item.orderNumber}</strong> at the{' '}
              <strong>{modalState.item.stage.toLowerCase()}</strong> stage.
            </p>
            {activeChecklistTasks.length === 0 ? (
              <p className="muted">No checklist is configured for this stage.</p>
            ) : (
              <div className="stage-checklist">
                {activeChecklistTasks.map((task) => {
                  const disabled = checklistSaving || modalState.item.assignee !== user?.username;
                  const toggleId = `stage-checklist-${modalState.item.orderId}-${task.id}`;
                  const labelId = `${toggleId}-label`;
                  const itemClasses = [
                    'stage-checklist__item',
                    task.completed ? 'stage-checklist__item--complete' : '',
                    disabled ? 'stage-checklist__item--disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <div key={task.id} className={itemClasses}>
                      <div className="stage-checklist__label" id={labelId}>
                        <span className="stage-checklist__title">{task.label}</span>
                        <div className="stage-checklist__meta">
                          <Tag type={task.required ? 'magenta' : 'cool-gray'} size="sm">
                            {task.required ? 'Required' : 'Optional'}
                          </Tag>
                          <span className={`stage-checklist__status${task.completed ? ' stage-checklist__status--done' : ''}`}>
                            {task.completed ? 'Completed' : 'Pending'}
                          </span>
                        </div>
                      </div>
                      <div className="stage-checklist__control">
                        <Toggle
                          id={toggleId}
                          aria-labelledby={labelId}
                          className="stage-checklist__toggle"
                          hideLabel
                          labelA=""
                          labelB=""
                          size="sm"
                          toggled={task.completed}
                          disabled={disabled}
                          onToggle={(checked) => handleChecklistToggle(modalState.item, task.id, checked)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {checklistSaving && (
              <div className="stage-checklist__feedback">
                <InlineLoading description="Saving checklist updates..." status="active" />
              </div>
            )}
            {modalState.item.assignee !== user?.username && activeChecklistTasks.length > 0 && (
              <p className="muted">Only the assigned operator can update this checklist.</p>
            )}
            {!isChecklistComplete(modalState.item) && modalState.item.assignee === user?.username && (
              <p className="muted">All required tasks must be marked before completing the stage.</p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={modalState?.type === 'complete'}
        title="Complete stage"
        onClose={closeModal}
        footer={
          <div className="modal-actions">
            <button type="button" onClick={closeModal} className="ghost">
              Cancel
            </button>
            {modalState?.type === 'complete' && (
              <button
                type="button"
                onClick={() => modalState && handleComplete(modalState.item)}
                disabled={submitting || !isChecklistComplete(modalState.item)}
                title={!isChecklistComplete(modalState.item) ? 'Complete all required tasks first' : undefined}
              >
                {submitting ? 'Completing...' : 'Complete stage'}
              </button>
            )}
          </div>
        }
      >
        {modalState?.type === 'complete' && (
          <form className="modal-form" onSubmit={(event) => event.preventDefault()}>
            <p>
              Wrap up <strong>{modalState.item.orderNumber}</strong> and capture optional service details.
            </p>
            {!isChecklistComplete(modalState.item) && (
              <p className="muted">Complete the stage checklist before submitting.</p>
            )}
            <label htmlFor="serviceTime">Service time (minutes)</label>
            <input
              id="serviceTime"
              type="number"
              min="0"
              step="1"
              value={serviceTime}
              onChange={(event) => setServiceTime(event.target.value)}
              placeholder="45"
            />
            <label htmlFor="completionNotes">Completion notes</label>
            <textarea
              id="completionNotes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Details captured while closing the task"
            />
          </form>
        )}
      </Modal>

      <Modal
        open={modalState?.type === 'exception'}
        title="Flag exception"
        onClose={closeModal}
        footer={
          <div className="modal-actions">
            <button type="button" onClick={closeModal} className="ghost">
              Cancel
            </button>
            {modalState?.type === 'exception' && (
              <button
                type="button"
                onClick={() => modalState && handleException(modalState.item)}
                disabled={submitting || !exceptionReason}
                className="danger"
              >
                {submitting ? 'Submitting...' : 'Flag exception'}
              </button>
            )}
          </div>
        }
      >
        {modalState?.type === 'exception' && (
          <form className="modal-form" onSubmit={(event) => event.preventDefault()}>
            <p>
              Provide context for the exception on <strong>{modalState.item.orderNumber}</strong>.
            </p>
            <label htmlFor="exceptionReason">Exception reason</label>
            <input
              id="exceptionReason"
              type="text"
              value={exceptionReason}
              onChange={(event) => setExceptionReason(event.target.value)}
              placeholder="Waiting on supplier"
              required
            />
            <label htmlFor="exceptionNotes">Notes</label>
            <textarea
              id="exceptionNotes"
              rows={3}
              value={exceptionNotes}
              onChange={(event) => setExceptionNotes(event.target.value)}
              placeholder="Add optional context for supervisors"
            />
          </form>
        )}
      </Modal>
    </section>
  );
}

















