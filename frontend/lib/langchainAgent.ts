type AgentPayload = {
  question: string;
  token?: string | null;
};

export type AgentResult = {
  answer: string;
  model: string;
  contextWarning?: string;
};

export async function askLangchainAgent(payload: AgentPayload): Promise<AgentResult> {
  const response = await fetch('/api/langchain/assistant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = (await response.json()) as { message?: string };
      if (data?.message) {
        message = data.message;
      }
    } catch {
      // ignore parse issues; fall back to status text
    }
    throw new Error(message || 'Unable to reach the LangChain assistant.');
  }
  return (await response.json()) as AgentResult;
}
