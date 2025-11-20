'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  ContainedList,
  ContainedListItem,
  InlineLoading,
  InlineNotification,
  Layer,
  OverflowMenu,
  OverflowMenuItem,
  Stack,
  TextArea,
  Tile,
} from '@carbon/react';
import { Add, Renew, Send } from '@carbon/icons-react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '@/hooks/useAuth';
import { WorkflowApi } from '@/lib/api';
import {
  askLangchainAgent,
  type AgentResult,
} from '@/lib/langchainAgent';
import type {
  AiConversationResponse,
  AiConversationSummaryResponse,
  AiMessageResponse,
  AiStreamEvent,
} from '@/types/api';
import styles from './AiChatPanel.module.css';

export function AiChatPanel() {
  const { token, user } = useAuth();
  const [conversations, setConversations] = useState<AiConversationSummaryResponse[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [activeConversation, setActiveConversation] = useState<AiConversationResponse | null>(null);
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [loadingConversation, setLoadingConversation] = useState<boolean>(false);
  const [messageInput, setMessageInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<boolean>(false);
  const [autoSelectEnabled, setAutoSelectEnabled] = useState<boolean>(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const tempIdRef = useRef<number>(-1);
  const streamingControllerRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<number | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<number | null>(null);
  const [agentQuestion, setAgentQuestion] = useState<string>('');
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [agentLoading, setAgentLoading] = useState<boolean>(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  const hasToken = Boolean(token);
  const messageCount = activeConversation?.messages.length ?? 0;

  const loadConversations = useCallback(async () => {
    if (!token) {
      setConversations([]);
      return;
    }
    setLoadingList(true);
    setError(null);
    try {
      const response = await WorkflowApi.listAiConversations(token);
      setConversations(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load conversations';
      setError(message);
    } finally {
      setLoadingList(false);
    }
  }, [token]);

  const openConversation = useCallback(
    async (conversationId: number) => {
      if (!token) {
        return;
      }
      setLoadingConversation(true);
      setError(null);
      try {
        const response = await WorkflowApi.getAiConversation(conversationId, token);
        setSelectedConversationId(conversationId);
        setActiveConversation(response);
        setAutoSelectEnabled(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load conversation';
        setError(message);
      } finally {
        setLoadingConversation(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) {
      setConversations([]);
      setActiveConversation(null);
      setSelectedConversationId(null);
      setMessageInput('');
      setAutoSelectEnabled(false);
      streamingControllerRef.current?.abort();
      streamingControllerRef.current = null;
      streamingMessageIdRef.current = null;
      setStreamingMessageId(null);
      setSending(false);
      return;
    }
    streamingControllerRef.current?.abort();
    streamingControllerRef.current = null;
    streamingMessageIdRef.current = null;
    setStreamingMessageId(null);
    setActiveConversation(null);
    setSelectedConversationId(null);
    setMessageInput('');
    setAutoSelectEnabled(false);
    loadConversations().catch((err) => console.error(err));
  }, [token, loadConversations]);

  useEffect(() => {
    if (!token || !autoSelectEnabled || selectedConversationId !== null) {
      return;
    }
    const first = conversations[0];
    if (first) {
      openConversation(first.id).catch((err) => console.error(err));
    }
  }, [conversations, token, selectedConversationId, autoSelectEnabled, openConversation]);

  useEffect(() => {
    return () => {
      streamingControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (messageCount === 0) {
      return;
    }
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [messageCount]);

  const handleNewConversation = () => {
    streamingControllerRef.current?.abort();
    streamingControllerRef.current = null;
    streamingMessageIdRef.current = null;
    setStreamingMessageId(null);
    setSending(false);
    setActiveConversation(null);
    setSelectedConversationId(null);
    setMessageInput('');
    setAutoSelectEnabled(false);
  };

  const handleRefresh = () => {
    void loadConversations();
  };

  const handleAgentSubmit = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      if (!hasToken) {
        setAgentError('You must be signed in to run the LangChain Agent.');
        return;
      }
      if (agentLoading) {
        return;
      }
      const prompt = agentQuestion.trim();
      if (!prompt) {
        return;
      }
      setAgentLoading(true);
      setAgentError(null);
      try {
        const result = await askLangchainAgent({ question: prompt, token });
        setAgentResult(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to reach the LangChain Agent.';
        setAgentError(message);
        setAgentResult(null);
      } finally {
        setAgentLoading(false);
      }
    },
    [agentLoading, agentQuestion, hasToken, token],
  );

  const handleAgentReset = useCallback(() => {
    if (agentLoading) {
      return;
    }
    setAgentQuestion('');
    setAgentResult(null);
    setAgentError(null);
  }, [agentLoading]);

  const handleSend = useCallback(async () => {
    if (!token) {
      setError('You must be signed in to chat with the assistant.');
      return;
    }
    if (sending) {
      return;
    }
    const trimmed = messageInput.trim();
    if (!trimmed) {
      return;
    }

    setSending(true);
    setError(null);

    const timestamp = new Date().toISOString();
    let conversationId = selectedConversationId;
    let seedConversation: AiConversationResponse | null = null;
    let assistantMessageId: number | null = null;
    let refreshedConversations = false;

    try {
      if (conversationId == null) {
        const created = await WorkflowApi.createAiConversation({ title: null }, token);
        conversationId = created.id;
        seedConversation = created;
        setSelectedConversationId(created.id);
      }

      if (conversationId == null) {
        throw new Error('Unable to identify the conversation to send this message.');
      }
      const ensuredConversationId = conversationId;

      const userMessageId = tempIdRef.current--;
      assistantMessageId = tempIdRef.current--;

      const userMessage: AiMessageResponse = {
        id: userMessageId,
        role: 'USER',
        content: trimmed,
        createdAt: timestamp,
      };
      const assistantPlaceholder: AiMessageResponse = {
        id: assistantMessageId,
        role: 'ASSISTANT',
        content: '',
        createdAt: timestamp,
      };

      setActiveConversation((prev) => {
        if (prev && prev.id === ensuredConversationId) {
          return {
            ...prev,
            messages: [...prev.messages, userMessage, assistantPlaceholder],
            updatedAt: timestamp,
          };
        }
        const seed: AiConversationResponse =
          seedConversation ?? {
            id: ensuredConversationId,
            title: null,
            createdAt: timestamp,
            updatedAt: timestamp,
            messages: [],
          };
        return {
          ...seed,
          messages: [...seed.messages, userMessage, assistantPlaceholder],
          updatedAt: timestamp,
        };
      });

      setMessageInput('');
      setAutoSelectEnabled(true);

      streamingMessageIdRef.current = assistantMessageId;
      setStreamingMessageId(assistantMessageId);

      const controller = new AbortController();
      streamingControllerRef.current = controller;

      await WorkflowApi.streamAiMessage(
        ensuredConversationId,
        trimmed,
        token,
        (event: AiStreamEvent) => {
          if (event.type === 'token') {
            setActiveConversation((prev) => {
              if (!prev || prev.id !== ensuredConversationId || streamingMessageIdRef.current === null) {
                return prev;
              }
              return {
                ...prev,
                messages: prev.messages.map((message) =>
                  message.id === streamingMessageIdRef.current
                    ? { ...message, content: message.content + event.delta }
                    : message,
                ),
              };
            });
          } else if (event.type === 'conversation') {
            streamingMessageIdRef.current = null;
            setStreamingMessageId(null);
            setActiveConversation(event.conversation);
            setSelectedConversationId(event.conversation.id);
            setAutoSelectEnabled(true);
            refreshedConversations = true;
            void loadConversations();
          } else if (event.type === 'error') {
            streamingMessageIdRef.current = null;
            setStreamingMessageId(null);
            setError(event.message);
            setActiveConversation((prev) => {
              if (!prev || prev.id !== ensuredConversationId || assistantMessageId === null) {
                return prev;
              }
              return {
                ...prev,
                messages: prev.messages.filter((message) => message.id !== assistantMessageId),
              };
            });
            refreshedConversations = true;
            void loadConversations();
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        const message = err instanceof Error ? err.message : 'Failed to send message';
        setError(message);
        refreshedConversations = true;
        void loadConversations();
      }
      if (assistantMessageId !== null) {
        const placeholderId = assistantMessageId;
        const conversationIdForRemoval = conversationId;
        setActiveConversation((prev) => {
          if (!prev || prev.id !== conversationIdForRemoval) {
            return prev;
          }
          return {
            ...prev,
            messages: prev.messages.filter((message) => message.id !== placeholderId),
          };
        });
      }
    } finally {
      streamingControllerRef.current = null;
      streamingMessageIdRef.current = null;
      setStreamingMessageId(null);
      setSending(false);
      if (!refreshedConversations) {
        void loadConversations();
      }
    }
  }, [token, sending, messageInput, selectedConversationId, loadConversations]);

  const handleComposerSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSend();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleRename = async (conversation: AiConversationSummaryResponse) => {
    if (!token) {
      return;
    }
    const currentTitle =
      (conversation.id === activeConversation?.id ? activeConversation.title : conversation.title) ?? '';
    const nextTitle = window.prompt('Conversation title', currentTitle) ?? undefined;
    if (nextTitle === undefined) {
      return;
    }
    const trimmed = nextTitle.trim();
    if (!trimmed) {
      setError('Title cannot be empty.');
      return;
    }
    setError(null);
    try {
      const response = await WorkflowApi.renameAiConversation(conversation.id, trimmed, token);
      if (activeConversation?.id === conversation.id) {
        setActiveConversation(response);
      }
      await loadConversations();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rename conversation';
      setError(message);
    }
  };

  const handleDelete = async (conversation: AiConversationSummaryResponse) => {
    if (!token) {
      return;
    }
    const confirmed = window.confirm('Delete this conversation?');
    if (!confirmed) {
      return;
    }
    if (activeConversation?.id === conversation.id) {
      streamingControllerRef.current?.abort();
      streamingControllerRef.current = null;
      streamingMessageIdRef.current = null;
      setStreamingMessageId(null);
      setSending(false);
    }
    setError(null);
    try {
      await WorkflowApi.deleteAiConversation(conversation.id, token);
      if (activeConversation?.id === conversation.id) {
        setActiveConversation(null);
        setSelectedConversationId(null);
        setMessageInput('');
        setAutoSelectEnabled(true);
      }
      await loadConversations();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete conversation';
      setError(message);
    }
  };

  const handleSelectConversation = (conversationId: number) => {
    streamingControllerRef.current?.abort();
    streamingControllerRef.current = null;
    streamingMessageIdRef.current = null;
    setStreamingMessageId(null);
    setSending(false);
    setAutoSelectEnabled(true);
    openConversation(conversationId).catch((err) => console.error(err));
  };

  const canSend = useMemo(
    () => hasToken && Boolean(messageInput.trim()) && !sending,
    [hasToken, messageInput, sending],
  );
  const canSubmitAgent = useMemo(
    () => hasToken && Boolean(agentQuestion.trim()) && !agentLoading,
    [agentLoading, agentQuestion, hasToken],
  );

  const conversationTitle = activeConversation?.title?.trim() || 'Untitled conversation';

  return (
    <Layer level={0}>
      <Tile className={styles.panel}>
        <Stack gap={6}>
          <div className={styles.header}>
            <div>
              <h2 className="cds--heading-05">AI Assistant</h2>
              <p className={styles.subtitle}>
                Ask for operational insights or guidance using your live data.
              </p>
            </div>
            <Button kind="ghost" renderIcon={Add} onClick={handleNewConversation} type="button">
              New chat
            </Button>
          </div>

          {error && (
            <InlineNotification
              kind="error"
              lowContrast
              title="There was a problem"
              subtitle={error}
              onClose={() => setError(null)}
            />
          )}

          <Layer level={1}>
            <Tile className={styles.agentTile}>
              <div className={styles.agentHeader}>
                <div>
                  <h3 className={`${styles.agentTitle} cds--heading-04`}>LangChain Agent</h3>
                  <p className={styles.agentMeta}>
                    Run a single prompt using the current workflow context.
                  </p>
                </div>
                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={Renew}
                  type="button"
                  onClick={handleAgentReset}
                  disabled={agentLoading || (!agentQuestion && !agentResult && !agentError)}
                >
                  Reset
                </Button>
              </div>
              {agentError && (
                <InlineNotification
                  kind="error"
                  lowContrast
                  title="LangChain Agent"
                  subtitle={agentError}
                  onClose={() => setAgentError(null)}
                />
              )}
              <form className={styles.agentForm} onSubmit={handleAgentSubmit}>
                <TextArea
                  labelText="LangChain question"
                  hideLabel
                  value={agentQuestion}
                  onChange={(event) => setAgentQuestion(event.target.value)}
                  placeholder={
                    hasToken
                        ? 'Ask about bottlenecks, KPIs, or next steps without starting a saved conversation...'
                      : 'Sign in to send prompts through the LangChain Agent.'
                  }
                  disabled={!hasToken || agentLoading}
                  rows={3}
                />
                <div className={styles.agentActions}>
                  <Button type="submit" kind="secondary" renderIcon={Send} disabled={!canSubmitAgent}>
                    {agentLoading ? 'Routing...' : 'Ask LangChain'}
                  </Button>
                </div>
              </form>
              {agentLoading && (
                <div className={styles.agentLoading}>
                  <InlineLoading status="active" description="Waiting for the LangChain Agent" />
                </div>
              )}
              {!agentLoading && agentResult && (
                <div className={styles.agentResult}>
                  <div className={styles.agentResultHeader}>
                    <span className={styles.agentResultLabel}>Response ({agentResult.model})</span>
                    {agentResult.contextWarning && (
                      <span className={styles.agentWarning}>{agentResult.contextWarning}</span>
                    )}
                  </div>
                  <div className={styles.agentAnswer}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {agentResult.answer}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </Tile>
          </Layer>

          <div className={styles.layout}>
            <Layer level={1}>
              <Tile className={styles.conversationTile}>
                <Stack gap={5}>
                  <div className={styles.conversationHeader}>
                    <div>
                      <h3 className={`${styles.conversationTitle} cds--heading-04`}>
                        {activeConversation ? conversationTitle : 'Start a conversation'}
                      </h3>
                      <p className={styles.conversationMeta}>
                        {activeConversation
                          ? `Updated ${formatRelative(activeConversation.updatedAt)}`
                          : 'Ask about workloads, bottlenecks, or next steps to receive AI suggestions.'}
                      </p>
                    </div>
                  </div>

                  <div
                    className={styles.messages}
                    role="log"
                    aria-live="polite"
                    ref={messagesContainerRef}
                  >
                    {loadingConversation && (
                      <div className={styles.placeholder}>
                        <InlineLoading status="active" description="Loading conversation" />
                      </div>
                    )}
                    {!loadingConversation && activeConversation && activeConversation.messages.length === 0 && (
                      <div className={styles.placeholder}>Send a question to begin.</div>
                    )}
                    {!loadingConversation && !activeConversation && (
                      <div className={styles.placeholder}>
                        Compose a message below to auto-create a new conversation. Your exchanges will stay available here.
                      </div>
                    )}
                    {!loadingConversation &&
                      activeConversation?.messages.map((message) => (
                        <ChatMessage
                          key={message.id}
                          message={message}
                          currentUser={user?.username ?? 'You'}
                          isStreaming={message.id === streamingMessageId}
                        />
                      ))}
                  </div>

                  <form className={styles.composer} onSubmit={handleComposerSubmit}>
                    <TextArea
                      labelText="Message"
                      hideLabel
                      value={messageInput}
                      onChange={(event) => setMessageInput(event.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        hasToken
                          ? 'Ask the assistant for help prioritising, summarising, or investigating work...'
                          : 'Sign in to chat with the assistant.'
                      }
                      disabled={!hasToken || sending}
                      rows={4}
                    />
                    <div className={styles.composerActions}>
                      <Button
                        type="submit"
                        kind="primary"
                        renderIcon={Send}
                        disabled={!canSend}
                      >
                        {sending ? 'Sending...' : 'Send'}
                      </Button>
                    </div>
                  </form>
                </Stack>
              </Tile>
            </Layer>

            <Layer level={1}>
              <Tile className={styles.sidebar}>
                <div className={styles.sidebarHeader}>
                  <h4 className={`${styles.sidebarTitle} cds--heading-03`}>Conversation history</h4>
                  <p className={styles.sidebarMeta}>
                    {loadingList
                      ? 'Loading conversations...'
                      : `${conversations.length} ${conversations.length === 1 ? 'thread' : 'threads'}`}
                  </p>
                </div>
                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={Renew}
                  onClick={handleRefresh}
                  type="button"
                  disabled={loadingList}
                  className={styles.refresh}
                >
                  Refresh
                </Button>
                {loadingList && conversations.length === 0 ? (
                  <div className={styles.placeholder}>
                    <InlineLoading status="active" description="Loading conversations" />
                  </div>
                ) : !loadingList && conversations.length === 0 ? (
                  <div className={styles.emptyState}>
                    Start a new chat to capture questions and AI responses for later reference.
                  </div>
                ) : (
                  <ContainedList kind="on-page" className={styles.list}>
                    {conversations.map((conversation) => {
                      const isActive = conversation.id === selectedConversationId;
                      const title = conversation.title?.trim() || 'Untitled conversation';
                      return (
                        <ContainedListItem
                          key={conversation.id}
                          onClick={() => handleSelectConversation(conversation.id)}
                          className={`${styles.listItem} ${isActive ? styles.listItemActive : ''}`}
                        >
                          <div className={styles.listItemContent}>
                            <div className={styles.listItemHeader}>
                              <span className={styles.listItemTitle}>{title}</span>
                              <div
                                className={styles.listItemMenu}
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                              >
                                <OverflowMenu ariaLabel="Conversation actions" size="sm" flipped>
                                  <OverflowMenuItem
                                    itemText="Rename"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleRename(conversation);
                                    }}
                                  />
                                  <OverflowMenuItem
                                    hasDivider
                                    isDelete
                                    itemText="Delete"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleDelete(conversation);
                                    }}
                                  />
                                </OverflowMenu>
                              </div>
                            </div>
                            <span className={styles.listItemTime}>
                              {formatRelative(conversation.updatedAt)}
                            </span>
                          </div>
                        </ContainedListItem>
                      );
                    })}
                  </ContainedList>
                )}
              </Tile>
            </Layer>
          </div>
        </Stack>
      </Tile>
    </Layer>
  );
}

function ChatMessage({
  message,
  currentUser,
  isStreaming = false,
}: {
  message: AiMessageResponse;
  currentUser: string;
  isStreaming?: boolean;
}) {
  const author =
    message.role === 'ASSISTANT' ? 'AI Assistant' : message.role === 'USER' ? currentUser : 'System';
  const roleClass =
    message.role === 'ASSISTANT'
      ? styles.messageAssistant
      : message.role === 'USER'
        ? styles.messageUser
        : styles.messageSystem;

  return (
    <article className={`${styles.message} ${roleClass}`}>
      <header className={styles.messageHeader}>
        <span className={styles.messageAuthor}>{author}</span>
        <span className={styles.messageTimestamp}>{formatTimestamp(message.createdAt)}</span>
      </header>
      <div className={styles.messageBody}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {message.content}
        </ReactMarkdown>
        {isStreaming && <span className={styles.typingCaret} aria-hidden="true" />}
      </div>
    </article>
  );
}

const markdownComponents: Components = {
  a(props) {
    return <a {...props} target="_blank" rel="noopener noreferrer" />;
  },
};

function formatRelative(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) {
    return 'Just now';
  }
  if (diff < hour) {
    const value = Math.round(diff / minute);
    return `${value} min ago`;
  }
  if (diff < day) {
    const value = Math.round(diff / hour);
    return `${value} hr${value === 1 ? '' : 's'} ago`;
  }
  return date.toLocaleDateString();
}

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
