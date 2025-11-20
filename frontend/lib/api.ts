import type {
  AiConversationResponse,
  AiConversationSummaryResponse,
  AuthUser,
  OrderResponse,
  StageState,
  StageType,
  WipSummaryResponse,
  WorkQueueItem,
  OrderStageStatus,
  AiStreamEvent,
  AuthRole,
} from '@/types/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

const defaultHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  Object.entries(defaultHeaders).forEach(([key, value]) => {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  });
  if (token) {
    headers.set('Authorization', `Basic ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload?.message) {
        errorMessage = payload.message;
      }
    } catch {
      try {
        const text = await response.text();
        if (text) {
          errorMessage = text;
        }
      } catch {
        // ignore secondary parse issues
      }
    }
    const suffix = response.status ? ` (HTTP ${response.status})` : '';
    throw new Error(errorMessage || `Request failed${suffix}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const WorkflowApi = {
  me: (token: string) => apiFetch<AuthUser>('/auth/me', { method: 'GET' }, token),
  signUp: (payload: { username: string; password: string; role: AuthRole }) =>
    apiFetch<AuthUser>(
      '/auth/signup',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  listOrders: (token: string) => apiFetch<OrderResponse[]>('/api/orders', { method: 'GET' }, token),
  getOrder: (orderId: number, token: string) =>
    apiFetch<OrderResponse>(`/api/orders/${orderId}`, { method: 'GET' }, token),
  createOrder: (req: { orderNumber: string; priority?: number | null; notes?: string | null }, token: string) =>
    apiFetch<OrderResponse>(
      '/api/orders',
      {
        method: 'POST',
        body: JSON.stringify(req),
      },
      token,
    ),
  updatePriority: (orderId: number, priority: number, token: string) =>
    apiFetch<OrderResponse>(
      `/api/orders/${orderId}/priority`,
      {
        method: 'PATCH',
        body: JSON.stringify({ priority }),
      },
      token,
    ),
  operatorQueue: (stage: StageType, token: string, states?: StageState[]) => {
    const params = new URLSearchParams({ stage });
    states?.forEach((state) => params.append('states', state));
    return apiFetch<WorkQueueItem[]>(`/api/operator/queue?${params.toString()}`, { method: 'GET' }, token);
  },
  claimStage: (orderId: number, stage: StageType, assignee: string, token: string) =>
    apiFetch<OrderStageStatus>(`/api/operator/orders/${orderId}/stages/${stage}/claim`, {
      method: 'POST',
      body: JSON.stringify({ assignee }),
    }, token),
  completeStage: (
    orderId: number,
    stage: StageType,
    payload: { assignee: string; serviceTimeMinutes?: number | null; notes?: string | null },
    token: string,
  ) =>
    apiFetch<OrderStageStatus>(`/api/operator/orders/${orderId}/stages/${stage}/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token),
  flagException: (
    orderId: number,
    stage: StageType,
    payload: { assignee: string; exceptionReason: string; notes?: string | null },
    token: string,
  ) =>
    apiFetch<OrderStageStatus>(`/api/operator/orders/${orderId}/stages/${stage}/flag-exception`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token),
  updateChecklistItem: (
    orderId: number,
    stage: StageType,
    payload: { taskId: string; completed: boolean },
    token: string,
  ) =>
    apiFetch<OrderStageStatus>(`/api/operator/orders/${orderId}/stages/${stage}/checklist`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }, token),
  wipSummary: (token: string) => apiFetch<WipSummaryResponse>('/api/supervisor/wip', { method: 'GET' }, token),
  approveSkip: (orderId: number, stage: StageType, payload: { approver: string; notes?: string | null }, token: string) =>
    apiFetch(`/api/supervisor/orders/${orderId}/stages/${stage}/approve-skip`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token),
  requestRework: (orderId: number, stage: StageType, payload: { approver: string; notes?: string | null }, token: string) =>
    apiFetch(`/api/supervisor/orders/${orderId}/stages/${stage}/request-rework`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token),
  listAiConversations: (token: string) =>
    apiFetch<AiConversationSummaryResponse[]>('/api/ai/conversations', { method: 'GET' }, token),
  createAiConversation: (
    payload: { title?: string | null; initialMessage?: string | null },
    token: string,
  ) =>
    apiFetch<AiConversationResponse>(
      '/api/ai/conversations',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token,
    ),
  getAiConversation: (conversationId: number, token: string) =>
    apiFetch<AiConversationResponse>(`/api/ai/conversations/${conversationId}`, { method: 'GET' }, token),
  sendAiMessage: (conversationId: number, content: string, token: string) =>
    apiFetch<AiConversationResponse>(
      `/api/ai/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ content }),
      },
      token,
    ),
  streamAiMessage: async (
    conversationId: number,
    content: string,
    token: string,
    onEvent: (event: AiStreamEvent) => void,
    signal?: AbortSignal,
  ) => {
    const response = await fetch(`${API_BASE_URL}/api/ai/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Authorization: `Basic ${token}`,
      },
      body: JSON.stringify({ content }),
      signal,
    });

    if (!response.ok) {
      let errorMessage = response.statusText || 'Request failed';
      try {
        const payload = (await response.json()) as { message?: string };
        if (payload?.message) {
          errorMessage = payload.message;
        }
      } catch {
        try {
          const text = await response.text();
          if (text) {
            errorMessage = text;
          }
        } catch {
          // ignore secondary parsing errors
        }
      }
      throw new Error(errorMessage || 'Failed to start streaming response');
    }

    if (!response.body) {
      throw new Error('This browser does not support streaming responses.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processBuffer = () => {
      let separatorIndex: number;
      while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        emitStreamEvent(chunk, onEvent);
      }
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
      }
      buffer += decoder.decode();
      processBuffer();
      if (buffer.trim()) {
        emitStreamEvent(buffer, onEvent);
      }
    } finally {
      reader.releaseLock();
    }
  },
  renameAiConversation: (conversationId: number, title: string, token: string) =>
    apiFetch<AiConversationResponse>(
      `/api/ai/conversations/${conversationId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      },
      token,
    ),
  deleteAiConversation: (conversationId: number, token: string) =>
    apiFetch<void>(`/api/ai/conversations/${conversationId}`, { method: 'DELETE' }, token),
};

function emitStreamEvent(rawChunk: string, onEvent: (event: AiStreamEvent) => void) {
  const parsed = parseSseChunk(rawChunk);
  if (!parsed) {
    return;
  }
  const event = mapToStreamEvent(parsed);
  if (event) {
    onEvent(event);
  }
}

function parseSseChunk(chunk: string): { event: string; data: unknown } | null {
  if (!chunk) {
    return null;
  }
  const lines = chunk.split('\n');
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }
    if (line.startsWith(':')) {
      continue;
    }
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      const value = line.slice(5);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  const payload = dataLines.join('\n');
  let data: unknown = payload;
  if (payload) {
    try {
      data = JSON.parse(payload);
    } catch {
      data = payload;
    }
  }
  return { event: eventName || 'message', data };
}

function mapToStreamEvent(parsed: { event: string; data: unknown }): AiStreamEvent | null {
  switch (parsed.event) {
    case 'token':
      if (typeof parsed.data === 'string') {
        return { type: 'token', delta: parsed.data };
      }
      if (parsed.data && typeof parsed.data === 'object' && 'delta' in parsed.data) {
        const delta = (parsed.data as { delta?: unknown }).delta;
        if (typeof delta === 'string') {
          return { type: 'token', delta };
        }
      }
      return null;
    case 'conversation':
      if (parsed.data && typeof parsed.data === 'object') {
        return { type: 'conversation', conversation: parsed.data as AiConversationResponse };
      }
      return null;
    case 'error':
      if (typeof parsed.data === 'string') {
        return { type: 'error', message: parsed.data };
      }
      if (parsed.data && typeof parsed.data === 'object' && 'message' in parsed.data) {
        const message = (parsed.data as { message?: unknown }).message;
        if (typeof message === 'string') {
          return { type: 'error', message };
        }
      }
      return { type: 'error', message: 'An unknown error occurred while streaming the response.' };
    default:
      return null;
  }
}
