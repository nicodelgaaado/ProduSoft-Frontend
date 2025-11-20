'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/Modal';
import { AiChatPanel } from '@/components/AiChatPanel';
import { RequireAuth } from '@/components/RequireAuth';
import { StageBadge } from '@/components/StageBadge';
import { useAuth } from '@/hooks/useAuth';
import { WorkflowApi } from '@/lib/api';
import type { OrderResponse, OrderStageStatus, StageType, WipSummaryResponse } from '@/types/api';

const stageOrder: Record<StageType, number> = {
  PREPARATION: 0,
  ASSEMBLY: 1,
  DELIVERY: 2,
};

const stageLabels: Record<StageType, string> = {
  PREPARATION: 'Preparation',
  ASSEMBLY: 'Assembly',
  DELIVERY: 'Delivery',
};

type LaneKey = 'new' | 'inProgress' | 'escalated' | 'completed';

const laneFilters: Record<LaneKey, { label: string; states: OrderStageStatus['state'][] }> = {
  new: { label: 'New', states: ['PENDING'] },
  inProgress: { label: 'In Progress', states: ['IN_PROGRESS', 'REWORK'] },
  escalated: { label: 'Escalated', states: ['EXCEPTION', 'BLOCKED'] },
  completed: { label: 'Completed', states: ['COMPLETED', 'SKIPPED'] },
};

const laneOrder: LaneKey[] = ['new', 'inProgress', 'escalated', 'completed'];

type ActionModalState =
  | { type: 'skip' | 'rework'; order: OrderResponse; stage: StageType }
  | null;

type CreateModalState = {
  open: boolean;
  orderNumber: string;
  priority: string;
  notes: string;
};

export default function SupervisorDashboard() {
  return (
    <RequireAuth allowedRoles={['SUPERVISOR']}>
      <SupervisorView />
    </RequireAuth>
  );
}

function SupervisorView() {
  const { token, user } = useAuth();
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [summary, setSummary] = useState<WipSummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [priorityDrafts, setPriorityDrafts] = useState<Record<number, string>>({});
  const [actionModal, setActionModal] = useState<ActionModalState>(null);
  const [modalNotes, setModalNotes] = useState<string>('');
  const [modalSubmitting, setModalSubmitting] = useState<boolean>(false);
  const [createModal, setCreateModal] = useState<CreateModalState>({
    open: false,
    orderNumber: '',
    priority: '',
    notes: '',
  });
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);
  const [activeLane, setActiveLane] = useState<LaneKey>('new');

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [ordersResponse, summaryResponse] = await Promise.all([
        WorkflowApi.listOrders(token),
        WorkflowApi.wipSummary(token),
      ]);
      setOrders(ordersResponse);
      setSummary(summaryResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load supervisor data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData().catch((err) => console.error(err));
  }, [loadData]);

  const closeActionModal = () => {
    setActionModal(null);
    setModalNotes('');
    setModalSubmitting(false);
  };

  const handlePriorityChange = (order: OrderResponse, value: string) => {
    setPriorityDrafts((previous) => ({ ...previous, [order.id]: value }));
  };

  const handlePriorityBlur = async (order: OrderResponse) => {
    if (!token) return;
    const draft = priorityDrafts[order.id] ?? String(order.priority ?? '');
    if (draft.trim() === '') {
      return;
    }
    const parsed = Number(draft);
    if (Number.isNaN(parsed)) {
      setError('Priority must be a number');
      return;
    }
    try {
      await WorkflowApi.updatePriority(order.id, parsed, token);
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update priority';
      setError(message);
    }
  };

  const openActionModal = (order: OrderResponse, stage: StageType, type: 'skip' | 'rework') => {
    setActionModal({ order, stage, type });
    setModalNotes('');
    setModalSubmitting(false);
  };

  const handleActionConfirm = async () => {
    if (!token || !user || !actionModal) return;
    setModalSubmitting(true);
    const payload = { approver: user.username, notes: modalNotes || undefined };
    try {
      if (actionModal.type === 'skip') {
        await WorkflowApi.approveSkip(actionModal.order.id, actionModal.stage, payload, token);
      } else {
        await WorkflowApi.requestRework(actionModal.order.id, actionModal.stage, payload, token);
      }
      await loadData();
      closeActionModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      setError(message);
      setModalSubmitting(false);
    }
  };

  const openCreateModal = () => {
    setCreateModal({ open: true, orderNumber: '', priority: '', notes: '' });
    setCreateSubmitting(false);
  };

  const closeCreateModal = () => {
    setCreateModal((current) => ({ ...current, open: false }));
    setCreateSubmitting(false);
  };

  const handleCreateOrder = async () => {
    if (!token) return;
    if (!createModal.orderNumber.trim()) {
      setError('Order number is required');
      return;
    }
    setCreateSubmitting(true);
    try {
      const priorityValue = createModal.priority.trim() === '' ? undefined : Number(createModal.priority);
      if (priorityValue !== undefined && Number.isNaN(priorityValue)) {
        throw new Error('Priority must be numeric');
      }
      await WorkflowApi.createOrder(
        {
          orderNumber: createModal.orderNumber.trim(),
          priority: priorityValue,
          notes: createModal.notes.trim() || undefined,
        },
        token,
      );
      await loadData();
      closeCreateModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create order';
      setError(message);
      setCreateSubmitting(false);
    }
  };

  const sortedOrders = useMemo(
    () =>
      [...orders].sort((a, b) => {
        const priorityA = a.priority ?? 0;
        const priorityB = b.priority ?? 0;
        if (priorityA === priorityB) {
          return a.orderNumber.localeCompare(b.orderNumber);
        }
        return priorityB - priorityA;
      }),
    [orders],
  );

  const laneCounts = useMemo(
    () =>
      laneOrder.reduce((acc, key) => {
        acc[key] = sortedOrders.filter((order) => laneFilters[key].states.includes(order.overallState)).length;
        return acc;
      }, {} as Record<LaneKey, number>),
    [sortedOrders],
  );

  const laneOrders = useMemo(
    () => sortedOrders.filter((order) => laneFilters[activeLane].states.includes(order.overallState)),
    [activeLane, sortedOrders],
  );

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Supervisor Dashboard</h1>
          <p>Monitor workflow, reprioritise orders, and approve resolution paths.</p>
        </div>
        <button type="button" onClick={openCreateModal}>
          New order
        </button>
      </header>

      {error && <div className="page-alert">{error}</div>}

      <section className="summary-grid">
        <article className="summary-card">
          <h3>Total orders</h3>
          <strong>{summary?.totalOrders ?? (loading ? '…' : 0)}</strong>
        </article>
        <article className="summary-card">
          <h3>Completed</h3>
          <strong>{summary?.completedOrders ?? (loading ? '…' : 0)}</strong>
        </article>
        <article className="summary-card">
          <h3>Exceptions</h3>
          <strong>{summary?.exceptionOrders ?? (loading ? '…' : 0)}</strong>
        </article>
        <article className="summary-card summary-card--span">
          <h3>Stage breakdown</h3>
          <div className="summary-stage-grid">
            {summary?.stages.map((stage) => (
              <div key={stage.stage}>
                <h4>{stageLabels[stage.stage]}</h4>
                <dl>
                  <div>
                    <dt>Pending</dt>
                    <dd>{stage.pending}</dd>
                  </div>
                  <div>
                    <dt>In progress</dt>
                    <dd>{stage.inProgress}</dd>
                  </div>
                  <div>
                    <dt>Exceptions</dt>
                    <dd>{stage.exceptions}</dd>
                  </div>
                  <div>
                    <dt>Completed</dt>
                    <dd>{stage.completed}</dd>
                  </div>
                </dl>
              </div>
            )) || <span>{loading ? 'Loading…' : 'No data yet'}</span>}
          </div>
        </article>
      </section>

      <section className="card">
        <header className="card__header">
          <h2>Orders in flight</h2>
          <button type="button" className="link-button" onClick={loadData} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>
        {loading && orders.length === 0 && <div className="table__empty">Loading orders…</div>}
        {!loading && orders.length === 0 && <div className="table__empty">No orders captured yet.</div>}
        {orders.length > 0 && (
          <div className="order-lanes">
            <div className="order-tabs" role="tablist" aria-label="Order lanes">
              {laneOrder.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeLane === key}
                  className={`order-tab ${activeLane === key ? 'order-tab--active' : ''}`}
                  onClick={() => setActiveLane(key)}
                >
                  <span>{laneFilters[key].label}</span>
                  <span className="order-tab__count">{laneCounts[key] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="order-lane-panel" role="tabpanel" aria-label={`${laneFilters[activeLane].label} orders`}>
              {laneOrders.length === 0 && <div className="table__empty">No orders in this lane.</div>}
              {laneOrders.map((order) => (
                <article key={order.id} className="order-card">
                  <header className="order-card__header">
                    <div>
                      <h3>{order.orderNumber}</h3>
                      <p className="muted">Current stage: {stageLabels[order.currentStage]}</p>
                    </div>
                    <div className="order-card__meta">
                      <label htmlFor={`priority-${order.id}`}>Priority</label>
                      <input
                        id={`priority-${order.id}`}
                        type="number"
                        step="1"
                        value={priorityDrafts[order.id] ?? String(order.priority ?? '')}
                        onChange={(event) => handlePriorityChange(order, event.target.value)}
                        onBlur={() => handlePriorityBlur(order)}
                        className="order-card__priority"
                      />
                    </div>
                  </header>
                  {order.notes && <p className="order-card__notes">{order.notes}</p>}
                  <div className="stage-list">
                    {order.stages
                      .slice()
                      .sort((a: OrderStageStatus, b: OrderStageStatus) => stageOrder[a.stage] - stageOrder[b.stage])
                      .map((stage) => (
                        <div key={stage.id ?? `${order.id}-${stage.stage}`} className="stage-list__row">
                          <div className="stage-list__info">
                            <span className="stage-list__name">{stageLabels[stage.stage]}</span>
                            <StageBadge state={stage.state} />
                            {stage.assignee && <span className="muted"> • {stage.assignee}</span>}
                          </div>
                          <div className="stage-list__details">
                            {stage.notes && <p>{stage.notes}</p>}
                            {stage.exceptionReason && <p className="exception">Exception: {stage.exceptionReason}</p>}
                            {stage.supervisorNotes && <p className="muted">Supervisor: {stage.supervisorNotes}</p>}
                          </div>
                          <div className="stage-list__actions">
                            {stage.state === 'EXCEPTION' && (
                              <>
                                <button type="button" className="ghost" onClick={() => openActionModal(order, stage.stage, 'skip')}>
                                  Approve skip
                                </button>
                                <button type="button" onClick={() => openActionModal(order, stage.stage, 'rework')}>
                                  Request rework
                                </button>
                              </>
                            )}
                            {stage.state === 'COMPLETED' && (
                              <button type="button" onClick={() => openActionModal(order, stage.stage, 'rework')}>
                                Request rework
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <AiChatPanel />

      <Modal
        open={Boolean(actionModal)}
        title={
          actionModal?.type === 'skip'
            ? 'Approve stage skip'
            : actionModal?.type === 'rework'
              ? 'Request rework'
              : 'Supervisor action'
        }
        onClose={closeActionModal}
        footer={
          <div className="modal-actions">
            <button type="button" onClick={closeActionModal} className="ghost">
              Cancel
            </button>
            <button type="button" onClick={handleActionConfirm} disabled={modalSubmitting}>
              {modalSubmitting ? 'Submitting…' : 'Confirm'}
            </button>
          </div>
        }
      >
        {actionModal && (
          <form className="modal-form" onSubmit={(event) => event.preventDefault()}>
            <p>
              {actionModal.type === 'skip'
                ? `Approve skipping the ${stageLabels[actionModal.stage]} stage for ${actionModal.order.orderNumber}.`
                : `Send ${actionModal.order.orderNumber} back for ${stageLabels[actionModal.stage]} rework.`}
            </p>
            <label htmlFor="modalNotes">Supervisor notes</label>
            <textarea
              id="modalNotes"
              rows={4}
              value={modalNotes}
              onChange={(event) => setModalNotes(event.target.value)}
              placeholder="Optional context for operators"
            />
          </form>
        )}
      </Modal>

      <Modal
        open={createModal.open}
        title="Create order"
        onClose={closeCreateModal}
        footer={
          <div className="modal-actions">
            <button type="button" onClick={closeCreateModal} className="ghost">
              Cancel
            </button>
            <button type="button" onClick={handleCreateOrder} disabled={createSubmitting}>
              {createSubmitting ? 'Saving…' : 'Create order'}
            </button>
          </div>
        }
      >
        <form className="modal-form" onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="newOrderNumber">Order number</label>
          <input
            id="newOrderNumber"
            type="text"
            value={createModal.orderNumber}
            onChange={(event) => setCreateModal((prev) => ({ ...prev, orderNumber: event.target.value }))}
            placeholder="PO-2040"
            required
          />
          <label htmlFor="newOrderPriority">Priority</label>
          <input
            id="newOrderPriority"
            type="number"
            value={createModal.priority}
            onChange={(event) => setCreateModal((prev) => ({ ...prev, priority: event.target.value }))}
            placeholder="Higher number = higher priority"
          />
          <label htmlFor="newOrderNotes">Notes</label>
          <textarea
            id="newOrderNotes"
            rows={3}
            value={createModal.notes}
            onChange={(event) => setCreateModal((prev) => ({ ...prev, notes: event.target.value }))}
            placeholder="Add optional instructions"
          />
        </form>
      </Modal>
    </section>
  );
}

