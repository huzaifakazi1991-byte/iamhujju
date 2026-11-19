import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import './App.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HomePage from './HomePage.jsx';
import ApiKeysPage from './ApiKeysPage.jsx';
import IntegrationsPage from './IntegrationsPage.jsx';
import SavedChatsPage from './SavedChatsPage.jsx';
import ModelsPage from './ModelsPage.jsx';
import SkillsPage from './SkillsPage.jsx';
import AccountMenu from './AccountMenu.jsx';
import { sanitizeMarkdown } from './safeMarkdown.js';
import {
  clearChatState,
  clearLegacyChatState,
  loadChatState,
  loadLegacyChatState
} from './chatStorage.js';
import {
  clearConversations,
  deleteConversation,
  importConversations,
  loadConversations,
  saveConversation,
  setActiveConversation
} from './conversationApi.js';
import {
  isFirebaseConfigured,
  saveConversationToFirestore,
  deleteConversationFromFirestore
} from './firebase.js';

function extractCodeText(node) {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(extractCodeText).join('');
  }

  if (node && typeof node === 'object' && node.props) {
    return extractCodeText(node.props.children);
  }

  return '';
}

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    const code = extractCodeText(children);

    try {
      await navigator.clipboard.writeText(code.trimEnd());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
      setCopied(false);
    }
  }

  return (
    <div className="code-block-wrapper">
      <div className="code-block-toolbar">
        <span>CODE</span>
        <button type="button" onClick={copyCode}>
          {copied ? 'Copied!' : 'Copy code'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

function MarkdownMessage({ content }) {
  const safeContent = useMemo(() => sanitizeMarkdown(content), [content]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        pre: CodeBlock,
        a: ({ children, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        )
      }}
    >
      {safeContent}
    </ReactMarkdown>
  );
}

async function responseErrorMessage(response, fallback) {
  try {
    const body = await response.json();
    const message = body?.error?.message
      || (typeof body?.error === 'string' ? body.error : '')
      || body?.message;

    if (typeof message === 'string' && message.trim()) {
      return message.trim().slice(0, 500);
    }
  } catch {
    return `${fallback} (HTTP ${response.status}).`;
  }

  return `${fallback} (HTTP ${response.status}).`;
}

function App() {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('openrouter:openrouter/free');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [chatStorageOwnerId, setChatStorageOwnerId] = useState(null);
  const [chatStorageReady, setChatStorageReady] = useState(false);
  const [storageWritable, setStorageWritable] = useState(true);
  const [storageError, setStorageError] = useState('');
  const [legacyChatDataAvailable, setLegacyChatDataAvailable] = useState(false);
  const [legacyImportNotice, setLegacyImportNotice] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [currentView, setCurrentView] = useState(() => {
    if (typeof window === 'undefined') return 'home';
    const path = window.location.pathname;
    if (path.startsWith('/chat')) return 'chat';
    if (path.startsWith('/models')) return 'models';
    if (path.startsWith('/skills')) return 'skills';
    if (path.startsWith('/saved-chats')) return 'saved-chats';
    if (path.startsWith('/api-keys')) return 'api-keys';
    if (path.startsWith('/integrations')) return 'integrations';
    return 'home';
  });
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [authRestoreError, setAuthRestoreError] = useState('');
  const [authRestoreAttempt, setAuthRestoreAttempt] = useState(0);
  const [requestedModelId, setRequestedModelId] = useState(null);
  const [modelsInitialQuery, setModelsInitialQuery] = useState('');
  const messagesEnd = useRef(null);
  const abortController = useRef(null);
  const currentUserRef = useRef(null);
  const loadVersionRef = useRef(0);
  const persistenceQueueRef = useRef(Promise.resolve());
  const persistenceTimerRef = useRef(null);
  const savedFingerprintRef = useRef(new Map());
  const savedActiveIdRef = useRef(null);

  const enqueuePersistence = useCallback((ownerId, operation) => {
    const queued = persistenceQueueRef.current.then(async () => {
      if (currentUserRef.current?.id !== ownerId) return false;
      await operation();
      return true;
    });
    persistenceQueueRef.current = queued.catch(() => {});
    return queued;
  }, []);

  const loadChatsForUser = useCallback(async (userId, signal) => {
    const loadVersion = ++loadVersionRef.current;
    clearTimeout(persistenceTimerRef.current);
    setChatStorageReady(false);
    setChatStorageOwnerId(userId || null);
    setChats([]);
    setActiveChatId(null);
    setMessages([]);
    savedFingerprintRef.current = new Map();
    savedActiveIdRef.current = null;
    setStorageError('');
    setLegacyImportNotice('');

    if (!userId) {
      const localState = loadChatState(null);
      setStorageWritable(false);
      setLegacyChatDataAvailable(localState.legacyDataAvailable);
      setChatStorageReady(true);
      return;
    }

    try {
      let state = await loadConversations(signal);
      if (
        signal?.aborted ||
        loadVersion !== loadVersionRef.current ||
        currentUserRef.current?.id !== userId
      ) return;
      const localState = loadChatState(userId);
      let localNotice = localState.error;
      if (localState.readable && localState.chats.length) {
        try {
          state = await importConversations(
            localState.chats.map(chat => ({ ...chat, id: String(chat.id) })),
            localState.activeChatId ? String(localState.activeChatId) : null
          );
          if (currentUserRef.current?.id === userId) {
            const cleared = clearChatState(userId);
            if (!cleared.ok) localNotice = cleared.error;
          }
        } catch (error) {
          localNotice = `Cloud history loaded, but this browser's saved copy was not imported: ${error.message}`;
        }
      } else if (!localState.readable) {
        localNotice = localState.error;
      }

      if (signal?.aborted || loadVersion !== loadVersionRef.current) return;
      const loadedChats = state.conversations || [];
      const activeId = state.activeConversationId || null;
      savedFingerprintRef.current = new Map(
        loadedChats.map(chat => [
          String(chat.id),
          JSON.stringify({ title: chat.title, messages: chat.messages })
        ])
      );
      savedActiveIdRef.current = activeId;
      setChats(loadedChats);
      setActiveChatId(activeId);
      setMessages(loadedChats.find(chat =>
        String(chat.id) === String(activeId)
      )?.messages || []);
      setStorageWritable(true);
      setStorageError(localNotice);
      setLegacyChatDataAvailable(localState.legacyDataAvailable);
      setChatStorageReady(true);
    } catch (loadError) {
      if (signal?.aborted || loadVersion !== loadVersionRef.current) return;
      setStorageWritable(false);
      setStorageError(
        loadError.message || 'Could not load saved conversations from the cloud.'
      );
      setLegacyChatDataAvailable(loadChatState(userId).legacyDataAvailable);
      setChatStorageReady(true);
    }
  }, []);

  function navigateToView(view, query = '') {
    window.scrollTo(0, 0);
    setCurrentView(view);
    if (typeof window !== 'undefined') {
      const pathMap = {
        home: '/',
        chat: '/chat',
        models: '/models',
        skills: '/skills',
        'saved-chats': '/saved-chats',
        'api-keys': '/api-keys',
        integrations: '/integrations',
        login: '/login'
      };
      const targetPath = pathMap[view] || '/';
      const targetUrl = query ? `${targetPath}?${query}` : targetPath;
      if (window.location.pathname + window.location.search !== targetUrl) {
        window.history.pushState({ view }, '', targetUrl);
      }
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function handlePopState() {
      const path = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      const urlModel = searchParams.get('model');
      if (urlModel) {
        setSelectedModel(urlModel);
      }
      if (path.startsWith('/chat')) {
        setCurrentView('chat');
      } else if (path.startsWith('/models')) {
        setCurrentView('models');
      } else if (path.startsWith('/skills')) {
        setCurrentView('skills');
      } else if (path.startsWith('/saved-chats')) {
        setCurrentView('saved-chats');
      } else if (path.startsWith('/api-keys')) {
        setCurrentView('api-keys');
      } else if (path.startsWith('/integrations')) {
        setCurrentView('integrations');
      } else {
        setCurrentView('home');
      }
    }

    const searchParams = new URLSearchParams(window.location.search);
    const initialModel = searchParams.get('model');
    if (initialModel) {
      setSelectedModel(initialModel);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const loadModels = useCallback(async signal => {
    setModelsLoading(true);

    try {
      const response = await fetch('/api/models', { signal });
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response, 'Could not load models'));
      }

      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error('FreeLLMAPI returned an invalid model list.');
      }

      const available = Array.isArray(result?.data)
        ? result.data.filter(model => model && typeof model.id === 'string')
        : [];

      if (!available.length) {
        throw new Error('FreeLLMAPI returned no available models.');
      }

      setModels(available);

      const checkFree = m => Boolean(
        m.isFree ||
        m.tier === 'free' ||
        m.id?.includes(':free') ||
        m.id === 'openrouter:openrouter/free' ||
        m.id === 'openrouter:openrouter/auto' ||
        m.id === 'auto'
      );
      const defaultAutoModel =
        available.find(m => m.id === 'openrouter:openrouter/free' || m.id === 'openrouter/free') ||
        available.find(m => m.id === 'openrouter:openrouter/auto' || m.id === 'openrouter/auto') ||
        available.find(checkFree) ||
        available[0];

      setSelectedModel(current => {
        const found = available.find(model => model.id === current);
        if (found && checkFree(found)) {
          return current;
        }
        return defaultAutoModel ? defaultAutoModel.id : available[0].id;
      });
      setConnected(true);
      setError('');
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') {
        setConnected(false);
        setError(err.message || 'Could not load models.');
      }
      return false;
    } finally {
      if (!signal?.aborted) setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadModels(controller.signal);
    return () => controller.abort();
  }, [loadModels]);

  const restoreSession = useCallback(async signal => {
    try {
      const response = await fetch('/api/auth/me', {
        signal,
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, 'Could not verify the saved sign-in session')
        );
      }

      const result = await response.json();
      if (signal?.aborted) return;
      const user = result.user || null;
      currentUserRef.current = user;
      setCurrentUser(user);
      await loadChatsForUser(user?.id, signal);
    } catch (restoreError) {
      if (restoreError.name !== 'AbortError' && !signal?.aborted) {
        currentUserRef.current = null;
        setCurrentUser(null);
        await loadChatsForUser(null, signal);
        setAuthRestoreError(
          'Could not verify the saved sign-in session. Check the local API and retry.'
        );
      }
    } finally {
      if (!signal?.aborted) setAuthChecking(false);
    }
  }, [loadChatsForUser]);

  useEffect(() => {
    const controller = new AbortController();
    restoreSession(controller.signal);
    return () => controller.abort();
  }, [restoreSession, authRestoreAttempt]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (
      !chatStorageReady ||
      !storageWritable ||
      !currentUser ||
      currentUser.id !== chatStorageOwnerId
    ) return undefined;

    clearTimeout(persistenceTimerRef.current);
    const ownerId = currentUser.id;
    const snapshot = chats.map(chat => ({ ...chat, id: String(chat.id) }));
    const activeId = activeChatId ? String(activeChatId) : null;
    persistenceTimerRef.current = setTimeout(() => {
      enqueuePersistence(ownerId, async () => {
        for (const chat of snapshot) {
          const fingerprint = JSON.stringify({
            title: chat.title,
            messages: chat.messages
          });
          if (savedFingerprintRef.current.get(chat.id) === fingerprint) continue;
          await saveConversation(chat);
          if (isFirebaseConfigured && ownerId) {
            saveConversationToFirestore(ownerId, chat).catch(() => {});
          }
          savedFingerprintRef.current.set(chat.id, fingerprint);
        }

        if (savedActiveIdRef.current !== activeId) {
          await setActiveConversation(activeId);
          savedActiveIdRef.current = activeId;
        }
      }).then(() => {
        if (currentUserRef.current?.id === ownerId) setStorageError('');
      }).catch(syncError => {
        if (currentUserRef.current?.id === ownerId) {
          setStorageError(syncError.message || 'Could not save this conversation to the cloud.');
        }
      });
    }, 1200);

    return () => clearTimeout(persistenceTimerRef.current);
  }, [
    activeChatId,
    chatStorageOwnerId,
    chatStorageReady,
    chats,
    currentUser,
    enqueuePersistence,
    storageWritable
  ]);

  // Automatically update the active conversation after every message.
  useEffect(() => {
    if (!activeChatId || !messages.length) return;

    setChats(previous => {
      const existing = previous.find(
        chat => String(chat.id) === String(activeChatId)
      );
      const firstUserMessage = messages.find(m => m.role === 'user');

      const updatedChat = {
        ...(previous.find(chat =>
          String(chat.id) === String(activeChatId)
        ) || {}),
        id: activeChatId,
        title: firstUserMessage?.content.slice(0, 35) || 'New conversation',
        messages
      };

      if (existing) {
        return previous.map(chat =>
          String(chat.id) === String(activeChatId) ? updatedChat : chat
        );
      }

      return [updatedChat, ...previous];
    });
  }, [messages, activeChatId]);

  function newChat() {
    setMessages([]);
    setActiveChatId(null);
    setError('');
  }

  function openChat(chat) {
    if (loading) return;

    setActiveChatId(chat.id);
    setMessages(chat.messages);
    setError('');
    navigateToView('chat');
  }

  const isFreeTierUser = !currentUser?.hasOpenRouterKey && (!currentUser || currentUser.tier === 'free');

  const isModelFree = useCallback((modelOrId) => {
    if (!modelOrId) return false;
    const model = typeof modelOrId === 'string'
      ? models.find(m => m.id === modelOrId)
      : modelOrId;
    if (model) {
      return Boolean(
        model.isFree ||
        model.tier === 'free' ||
        model.id?.includes(':free') ||
        model.id === 'openrouter:openrouter/free' ||
        model.id === 'openrouter:openrouter/auto' ||
        model.id === 'auto'
      );
    }
    const id = String(modelOrId);
    return id.endsWith(':free') || id === 'openrouter:openrouter/free' || id === 'openrouter/free' || id === 'auto';
  }, [models]);

  const getAutoFreeModelId = useCallback(() => {
    return (
      models.find(m => m.id === 'openrouter:openrouter/free' || m.id === 'openrouter/free')?.id ||
      models.find(m => m.id === 'openrouter:openrouter/auto' || m.id === 'openrouter/auto')?.id ||
      models.find(isModelFree)?.id ||
      'openrouter:openrouter/free'
    );
  }, [models, isModelFree]);

  const chatModelOptions = useMemo(() => {
    if (isFreeTierUser) {
      const freeList = models.filter(isModelFree);
      return freeList.length ? freeList : models;
    }
    return models;
  }, [models, isFreeTierUser, isModelFree]);

  useEffect(() => {
    if (chatModelOptions.length > 0 && !chatModelOptions.some(m => m.id === selectedModel)) {
      const fallback =
        chatModelOptions.find(m => m.id === 'openrouter:openrouter/free' || m.id === 'openrouter/free') ||
        chatModelOptions.find(m => m.id === 'openrouter:openrouter/auto' || m.id === 'openrouter/auto') ||
        chatModelOptions[0];
      if (fallback) {
        setSelectedModel(fallback.id);
      }
    }
  }, [chatModelOptions, selectedModel]);

  function openChatFromHome(modelId) {
    let effectiveModel = selectedModel;
    if (modelId && models.some(model => model.id === modelId)) {
      if (isFreeTierUser && !isModelFree(modelId)) {
        effectiveModel = getAutoFreeModelId();
      } else {
        effectiveModel = modelId;
      }
    } else if (modelId) {
      effectiveModel = modelId;
    } else if (isFreeTierUser && !isModelFree(selectedModel)) {
      effectiveModel = getAutoFreeModelId();
    }
    setSelectedModel(effectiveModel);
    setError('');
    const query = effectiveModel && effectiveModel !== 'auto' ? `model=${encodeURIComponent(effectiveModel)}` : '';
    navigateToView('chat', query);
  }

  function handleAuthenticated(user, modelId) {
    currentUserRef.current = user;
    setCurrentUser(user);
    setAuthRestoreError('');
    setRequestedModelId(null);
    loadChatsForUser(user.id);
    loadModels();
    const isFree = !user || user.tier === 'free';
    if (modelId && (!isFree || isModelFree(modelId))) {
      openChatFromHome(modelId);
    } else {
      const autoFree = getAutoFreeModelId();
      setSelectedModel(autoFree);
      openChatFromHome(autoFree);
    }
  }

  async function handleLogout() {
    currentUserRef.current = null;
    clearTimeout(persistenceTimerRef.current);
    loadVersionRef.current += 1;
    setChatStorageReady(false);
    setCurrentUser(null);
    setRequestedModelId(null);
    loadChatsForUser(null);
    navigateToView('home');
  }

  function openApiKeys() {
    navigateToView('api-keys');
  }

  function openIntegrations() {
    navigateToView('integrations');
  }

  function openModels(query = '') {
    setModelsInitialQuery(query);
    navigateToView('models');
  }

  function openSkills() {
    navigateToView('skills');
  }

  function requestSignInForModel(modelId) {
    setRequestedModelId(modelId || null);
    navigateToView('home');
  }

  function openSavedChats() {
    navigateToView('saved-chats');
  }

  async function deleteChat(chatId) {
    const ownerId = currentUserRef.current?.id;
    if (loading || !storageWritable || !ownerId) return;
    try {
      await enqueuePersistence(ownerId, () =>
        deleteConversation(String(chatId))
      );
      if (isFirebaseConfigured && ownerId) {
        deleteConversationFromFirestore(ownerId, String(chatId)).catch(() => {});
      }
      savedFingerprintRef.current.delete(String(chatId));
      setChats(previous => previous.filter(chat => String(chat.id) !== String(chatId)));
      if (String(activeChatId) === String(chatId)) {
        setActiveChatId(null);
        setMessages([]);
      }
      setStorageError('');
    } catch (deleteError) {
      setStorageError(deleteError.message || 'Could not delete the cloud conversation.');
    }
  }

  async function clearChats() {
    const ownerId = currentUserRef.current?.id;
    if (!ownerId) return;
    try {
      await enqueuePersistence(ownerId, clearConversations);
      savedFingerprintRef.current.clear();
      savedActiveIdRef.current = null;
      setChats([]);
      setActiveChatId(null);
      setMessages([]);
      setStorageWritable(true);
      setStorageError('');
    } catch (clearError) {
      setStorageError(clearError.message || 'Could not clear cloud conversations.');
    }
  }

  async function importLegacyBrowserChats() {
    const ownerId = currentUserRef.current?.id;
    if (!ownerId) return;
    const localState = loadLegacyChatState();
    if (!localState.readable) {
      setStorageError(localState.error);
      return;
    }
    if (!localState.chats.length) {
      setLegacyChatDataAvailable(false);
      setLegacyImportNotice('No older browser conversations were found to import.');
      return;
    }

    try {
      const state = await enqueuePersistence(ownerId, () =>
        importConversations(
          localState.chats.map(chat => ({ ...chat, id: String(chat.id) })),
          localState.activeChatId ? String(localState.activeChatId) : null
        )
      );
      if (!state || currentUserRef.current?.id !== ownerId) return;
      const cleared = clearLegacyChatState();
      const loadedChats = state.conversations || [];
      const activeId = state.activeConversationId || null;
      savedFingerprintRef.current = new Map(
        loadedChats.map(chat => [
          String(chat.id),
          JSON.stringify({ title: chat.title, messages: chat.messages })
        ])
      );
      savedActiveIdRef.current = activeId;
      setChats(loadedChats);
      setActiveChatId(activeId);
      setMessages(loadedChats.find(chat =>
        String(chat.id) === String(activeId)
      )?.messages || []);
      setLegacyChatDataAvailable(!cleared.ok);
      setLegacyImportNotice(
        cleared.ok
          ? `Imported ${state.importedCount} older conversation${state.importedCount === 1 ? '' : 's'} into your account.`
          : `${state.importedCount} conversation${state.importedCount === 1 ? '' : 's'} imported, but the browser copy could not be removed.`
      );
      setStorageError(cleared.error);
    } catch (importError) {
      setStorageError(importError.message || 'Could not import older browser conversations.');
    }
  }

  function stopGeneration() {
    abortController.current?.abort();
    abortController.current = null;
  }

  async function sendMessage(event, regenerate = false) {
    event.preventDefault();

    if (loading) return;

    const prompt = input.trim();

    if (!regenerate && !prompt) return;

    if (
      regenerate &&
      (
        messages.length < 2 ||
        messages[messages.length - 1].role !== 'assistant' ||
        messages[messages.length - 2].role !== 'user'
      )
    ) {
      return;
    }

    const chatId = activeChatId || Date.now();

    if (!activeChatId) {
      setActiveChatId(chatId);
    }

    const updatedMessages = regenerate
      ? messages.slice(0, -1)
      : [
          ...messages,
          { role: 'user', content: prompt }
        ];

    setMessages([
      ...updatedMessages,
      { role: 'assistant', content: '' }
    ]);

    if (!regenerate) {
      setInput('');
    }

    setLoading(true);
    setError('');

    try {
      abortController.current = new AbortController();

      const response = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.current.signal,
        body: JSON.stringify({
          model: selectedModel,
          messages: updatedMessages,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, 'FreeLLMAPI request failed')
        );
      }

      if (!response.body) {
        throw new Error('FreeLLMAPI did not return a streaming response.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullReply = '';

      function processLine(line) {
        line = line.replace(/\r$/, '');
        if (!line.startsWith('data:')) return;

        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') return;

        let data;
        try {
          data = JSON.parse(payload);
        } catch {
          throw new Error('FreeLLMAPI returned an invalid streaming event.');
        }

        if (data.error) {
          const message = typeof data.error === 'string'
            ? data.error
            : data.error.message;
          throw new Error(
            typeof message === 'string' && message.trim()
              ? message.trim().slice(0, 500)
              : 'FreeLLMAPI reported a streaming error.'
          );
        }

        const token = data.choices?.[0]?.delta?.content;

        if (typeof token === 'string') {
          fullReply += token;

          setMessages(previous => {
            const next = [...previous];
            next[next.length - 1] = {
              role: 'assistant',
              content: fullReply
            };
            return next;
          });
        }
      }

      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          processLine(line);
        }
      }

      buffer += decoder.decode();

      if (buffer.trim()) {
        processLine(buffer);
      }

      if (!fullReply) {
        throw new Error('The model returned no text. Try another model.');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'FreeLLMAPI request failed.');
      }

      setMessages(previous => {
        const next = [...previous];

        if (
          next[next.length - 1]?.role === 'assistant' &&
          !next[next.length - 1].content
        ) {
          next.pop();
        }

        return next;
      });
    } finally {
      abortController.current = null;
      setLoading(false);
    }
  }

  async function regenerateResponse() {
    if (loading || messages.length < 2) return;

    if (
      messages[messages.length - 1].role !== 'assistant' ||
      messages[messages.length - 2].role !== 'user'
    ) {
      return;
    }


    await sendMessage({ preventDefault() {} }, true);
  }


  function exportChat(format = 'md') {
    if (!messages.length || loading) return;

    const markdown = messages
      .map(message => {
        const speaker = message.role === 'user' ? 'You' : 'iamhujju';
        return `## ${speaker}\n\n${message.content}`;
      })
      .join('\n\n---\n\n');

    const plainText = messages
      .map(message => {
        const speaker = message.role === 'user' ? 'You' : 'iamhujju';
        return `${speaker}\n\n${message.content}`;
      })
      .join('\n\n------------------------------\n\n');

    if (format === 'pdf') {
      const printWindow = window.open('', '_blank');

      if (!printWindow) {
        setError('PDF popup blocked. Allow pop-ups for localhost and try again.');
        return;
      }

      const escapeHtml = text =>
        text.replace(/[&<>"']/g, character => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[character]);

      const printableContent = messages.map(message => {
        const speaker = message.role === 'user' ? 'You' : 'iamhujju';

        return `
          <section class="message">
            <h2>${speaker}</h2>
            <pre>${escapeHtml(message.content)}</pre>
          </section>
        `;
      }).join('');

      printWindow.document.open();
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>iamhujju Workspace Conversation</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                color: #222;
                max-width: 850px;
                margin: 40px auto;
                line-height: 1.6;
              }
              .toolbar {
                position: sticky;
                top: 0;
                padding: 15px;
                background: #eee;
                text-align: center;
              }
              button {
                padding: 12px 22px;
                cursor: pointer;
                font-size: 16px;
              }
              h1 {
                border-bottom: 2px solid #ddd;
                padding-bottom: 12px;
              }
              .message {
                margin: 24px 0;
                padding-bottom: 16px;
                border-bottom: 1px solid #ddd;
                break-inside: avoid;
              }
              h2 {
                font-size: 16px;
                color: #333;
              }
              pre {
                white-space: pre-wrap;
                overflow-wrap: anywhere;
                font-family: Arial, sans-serif;
              }
              @media print {
                .toolbar { display: none; }
                body { margin: 15mm; }
              }
            </style>
          </head>
          <body>
            <div class="toolbar">
              <button onclick="window.print()">Print / Save as PDF</button>
            </div>
            <h1>iamhujju Workspace Conversation</h1>
            ${printableContent}
          </body>
        </html>
      `);
      printWindow.document.close();
      return;
    }
    const isText = format === 'txt';
    const content = isText
      ? plainText
      : `# iamhujju Workspace Conversation\n\n${markdown}`;

    const blob = new Blob(
      [content],
      {
        type: isText
          ? 'text/plain;charset=utf-8'
          : 'text/markdown;charset=utf-8'
      }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `free-llm-chat-${new Date().toISOString().slice(0, 10)}.${format}`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  if (currentView === 'home') {
    return (
      <HomePage
        models={models}
        modelsLoading={modelsLoading}
        connected={connected}
        error={error}
        selectedModel={selectedModel}
        chatCount={chats.length}
        authChecking={authChecking}
        currentUser={currentUser}
        storageError={storageError}
        storageNotice={legacyChatDataAvailable
          ? 'Older browser conversations are not associated with an account. Import them from Saved conversations after signing in.'
          : ''}
        authRestoreError={authRestoreError}
        requestedModelId={requestedModelId}
        initialAuthOpen={typeof window !== 'undefined' && window.location.pathname === '/login'}
        onClearRequestedModel={() => setRequestedModelId(null)}
        onRetryAuth={() => {
          setAuthChecking(true);
          setAuthRestoreError('');
          setAuthRestoreAttempt(value => value + 1);
        }}
        onAuthenticated={handleAuthenticated}
        onLogout={handleLogout}
        onOpenApiKeys={openApiKeys}
        onOpenIntegrations={openIntegrations}
        onRefreshModels={() => loadModels()}
        onOpenChat={openChatFromHome}
        onOpenModels={openModels}
        onOpenSkills={openSkills}
        onOpenSavedChats={openSavedChats}
      />
    );
  }

  if (currentView === 'models') {
    return (
      <ModelsPage
        key={modelsInitialQuery}
        models={models}
        modelsLoading={modelsLoading}
        connected={connected}
        selectedModel={selectedModel}
        initialQuery={modelsInitialQuery}
        currentUser={currentUser}
        chatCount={chats.length}
        onOpenHome={() => navigateToView('home')}
        onLogout={handleLogout}
        onOpenChat={openChatFromHome}
        onRequestSignInForModel={requestSignInForModel}
        onOpenSavedChats={openSavedChats}
        onOpenApiKeys={openApiKeys}
        onOpenIntegrations={openIntegrations}
        onRefreshModels={() => loadModels()}
        onOpenSkills={openSkills}
      />
    );
  }

  if (currentView === 'skills') {
    return (
      <SkillsPage
        currentUser={currentUser}
        connected={connected}
        selectedModel={selectedModel}
        modelCount={models.length}
        chatCount={chats.length}
        onOpenHome={() => navigateToView('home')}
        onOpenModels={openModels}
        onOpenChat={openChatFromHome}
        onRequestSignIn={requestSignInForModel}
        onLogout={handleLogout}
        onOpenApiKeys={openApiKeys}
        onOpenIntegrations={openIntegrations}
        onOpenSavedChats={openSavedChats}
      />
    );
  }

  if (currentView === 'saved-chats') {
    return (
      <SavedChatsPage
        chats={chats}
        activeChatId={activeChatId}
        currentUser={currentUser}
        connected={connected}
        modelCount={models.length}
        loading={loading}
        storageError={storageError}
        storageNotice={legacyChatDataAvailable
          ? 'Older browser conversations are not associated with an account. Import them to this account when you are ready.'
          : ''}
        legacyImportNotice={legacyImportNotice}
        legacyDataAvailable={legacyChatDataAvailable}
        storageWritable={storageWritable}
        onOpenChat={openChat}
        onStartChat={() => openChatFromHome(selectedModel)}
        onDeleteChat={deleteChat}
        onClearChats={clearChats}
        onImportLegacy={importLegacyBrowserChats}
        onOpenHome={() => navigateToView('home')}
        onOpenModels={openModels}
        onOpenSkills={openSkills}
        onOpenApiKeys={openApiKeys}
        onOpenIntegrations={openIntegrations}
        onLogout={handleLogout}
      />
    );
  }

  if (currentView === 'api-keys') {
    return (
      <ApiKeysPage
        user={currentUser}
        connected={connected}
        modelCount={models.length}
        onLogout={handleLogout}
        onOpenHome={() => navigateToView('home')}
        onOpenModels={openModels}
        onOpenChat={() => openChatFromHome(selectedModel)}
        onOpenIntegrations={openIntegrations}
        onModelsChanged={() => loadModels()}
      />
    );
  }

  if (currentView === 'integrations') {
    return (
      <IntegrationsPage
        user={currentUser}
        connected={connected}
        modelCount={models.length}
        onLogout={handleLogout}
        onOpenHome={() => navigateToView('home')}
        onOpenModels={openModels}
        onOpenChat={() => openChatFromHome(selectedModel)}
        onOpenApiKeys={openApiKeys}
        onModelsChanged={() => loadModels()}
      />
    );
  }

  return (
    <div className="app-shell">

      <aside className="sidebar">
        <button
          className="brand brand-btn"
          type="button"
          onClick={() => navigateToView('home')}
          title="Return to iamhujju Explore"
          aria-label="Return to iamhujju Explore"
        >
          <div className="brand-icon">
            <img src="/mascot.jpg" alt="iamhujju mascot" className="brand-mascot-img" />
          </div>
          <div>
            <h2>iamhujju</h2>
            <span>PERSONAL AI</span>
          </div>
        </button>



        <button className="new-chat" onClick={newChat} disabled={loading}>
          <span>+</span> New chat
        </button>

        <div className="history-heading">YOUR CONVERSATIONS</div>

        <div className="history-list">
          {chats.map(chat => (
            <button
              className={`history-item ${
                String(chat.id) === String(activeChatId) ? 'active' : ''
              }`}
              key={chat.id}
              onClick={() => openChat(chat)}
              disabled={loading}
              title={chat.title}
            >
              {chat.title}
            </button>
          ))}

          {chats.length === 0 && (
            <p className="empty-history">Your saved chats will appear here.</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="connection">
            <span className={connected ? 'status-dot online' : 'status-dot'} />
            {connected ? 'API Connected' : 'API Disconnected'}
          </div>
          <span className="version">iamhujju AI Workspace · v2.0</span>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-branding-block">
            <div className="topbar-branding-row">
              <button
                className="topbar-brand-title"
                type="button"
                onClick={() => navigateToView('home')}
                title="Return to iamhujju Explore"
              >
                iamhujju
              </button>
              <span className="top-subtitle">Your Personal AI Workspace</span>
            </div>
            <button
              className="back-home-button"
              type="button"
              onClick={() => navigateToView('home')}
              title="Back to models & workspace explore"
            >
              ← Explore models
            </button>
          </div>

          <div className="model-control">
            <label htmlFor="model-select">MODEL</label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              disabled={!chatModelOptions.length || loading}
              aria-label="Select an AI model"
            >
              {chatModelOptions.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name || model.id}
                  {isModelFree(model) ? ' (100% Free)' : ''}
                </option>
              ))}
              {isFreeTierUser && (
                <option value="__pro_locked__" disabled>
                  ── 400+ Pro Models (Connect Key in Account) ──
                </option>
              )}
            </select>

            <button
              className="refresh-button"
              type="button"
              disabled={modelsLoading}
              title="Refresh available models"
              onClick={() => loadModels()}
            >
              {modelsLoading ? 'Loading…' : '↻ Models'}
            </button>
          </div>

          <div className="topbar-actions">
            <button
              className="refresh-button"
              disabled={!messages.length || loading}
              title="Export conversation"
              onClick={() => {
                const format = window.prompt(
                  'Choose export format:\n1 = Markdown (.md)\n2 = Text (.txt)\n3 = PDF (.pdf)',
                  '1'
                );

                if (format === '1') exportChat('md');
                else if (format === '2') exportChat('txt');
                else if (format === '3') exportChat('pdf');
              }}
            >
              Export Chat
            </button>
            {currentUser && (
              <AccountMenu
                user={currentUser}
                connected={connected}
                modelCount={models.length}
                onLogout={handleLogout}
                onOpenApiKeys={openApiKeys}
                onOpenIntegrations={openIntegrations}
              />
            )}
          </div>
        </header>

        <section className="chat-area">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-icon">
                <img src="/mascot.jpg" alt="iamhujju mascot" className="welcome-mascot-img" />
              </div>
              <p className="eyebrow">WELCOME TO YOUR AI WORKSPACE</p>
              <h1>What can I help you<br /><span>create today?</span></h1>
              <p className="welcome-description">
                One workspace. Multiple AI models. Your ideas without limits.
              </p>

              <div className="suggestions">
                {[
                  'Explain a complex topic simply',
                  'Help me write professional emails',
                  'Create a coding project',
                  'Brainstorm creative ideas'
                ].map(item => (
                  <button key={item} onClick={() => setInput(item)}>
                    {item} <span>-&gt;</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              className="messages"
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
              aria-label="Conversation messages"
            >
              {messages.map((message, index) => (
                <article className={`message ${message.role}`} key={index}>
                  <div className="avatar">
                    {message.role === 'user' ? 'U' : <img src="/mascot.jpg" alt="AI assistant" className="avatar-mascot-img" />}
                  </div>

                  <div className="message-content">

                    <strong>
                      {message.role === 'user' ? 'You' : 'iamhujju'}
                    </strong>
                    <div className="markdown-content">
                      {message.content
                        ? <MarkdownMessage content={message.content} />
                        : loading ? 'Thinking...' : ''}
                    </div>

                    {message.role === 'assistant' &&
                      index === messages.length - 1 &&
                      !loading && (
                        <button
                          className="regenerate-button"
                          type="button"
                          onClick={regenerateResponse}
                        >
                          ↻ Regenerate
                        </button>
                      )}

                  </div>
                </article>

              ))}

              <div ref={messagesEnd} />
            </div>
          )}
        </section>

        {storageError && (
          <div className="storage-warning" role="alert">{storageError}</div>
        )}
        {error && <div className="error-message" role="alert">{error}</div>}

        <footer className="composer-area">
          <form className="composer" onSubmit={sendMessage}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form.requestSubmit();
                }
              }}
              placeholder="Message your AI assistant..."
              aria-label="Message to the selected model"
              rows="1"
            />

            {loading ? (
              <button
                className="send-button stop-button"
                type="button"
                onClick={stopGeneration}
                title="Stop generation"
                aria-label="Stop response generation"
              >
                ■
              </button>
            ) : (
              <button
                className="send-button"
                type="submit"
                disabled={!input.trim() || !connected || !selectedModel}
                aria-label="Send message"
              >
                ↑
              </button>
            )}
          </form>

          <p className="disclaimer">
            AI responses can make mistakes. Verify important information.
          </p>
        </footer>
      </main>
    </div>
  );
}

export default App;
