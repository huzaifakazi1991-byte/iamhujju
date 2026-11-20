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
import PricingPage from './PricingPage.jsx';
import AccountMenu from './AccountMenu.jsx';
import LiveSupportWidget from './LiveSupportWidget.jsx';
import ModelSwitcherModal from './ModelSwitcherModal.jsx';
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

function CodeBlock({ children, className }) {
  const [copied, setCopied] = useState(false);
  const langMatch = /language-(\w+)/.exec(className || '');
  const language = langMatch ? langMatch[1].toUpperCase() : 'CODE';

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
        <div className="code-block-dots">
          <span className="code-dot dot-red" />
          <span className="code-dot dot-yellow" />
          <span className="code-dot dot-green" />
          <span className="code-lang-label">{language}</span>
        </div>
        <button
          type="button"
          className={`copy-code-btn ${copied ? 'is-copied' : ''}`}
          onClick={copyCode}
          aria-label="Copy code snippet"
        >
          {copied ? '✓ Copied!' : '📋 Copy Code'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

function formatFileSize(bytes = 0) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
    reader.readAsText(file);
  });
}

function MarkdownMessage({ content }) {
  const normalizedText = useMemo(() => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map(p => {
          if (p.type === 'text') return p.text;
          if (p.type === 'image_url') return '';
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    return String(content || '');
  }, [content]);

  const safeContent = useMemo(() => sanitizeMarkdown(normalizedText), [normalizedText]);

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
  const [currentView, setCurrentView] = useState('home');
  const [liveSupportOpen, setLiveSupportOpen] = useState(false);
  const [modelSwitcherOpen, setModelSwitcherOpen] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [authRestoreError, setAuthRestoreError] = useState('');
  const [authRestoreAttempt, setAuthRestoreAttempt] = useState(0);
  const [requestedModelId, setRequestedModelId] = useState(null);
  const [modelsInitialQuery, setModelsInitialQuery] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [browseEnabled, setBrowseEnabled] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [sourcesOpen, setSourcesOpen] = useState({});
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [copiedMessageIndex, setCopiedMessageIndex] = useState(null);
  const fileInputRef = useRef(null);
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

  function navigateToView(view) {
    window.scrollTo(0, 0);
    setCurrentView(view);
    if (typeof window !== 'undefined' && window.history) {
      const path = view === 'home' ? '/' : `/${view}`;
      if (window.location.pathname !== path) {
        window.history.pushState({ view }, '', path);
      }
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.replace(/^\//, '');
      if (path === 'pricing') {
        setCurrentView('pricing');
      } else if (path === 'models') {
        setCurrentView('models');
      } else if (path === 'skills') {
        setCurrentView('skills');
      } else if (path === 'api-keys') {
        setCurrentView('api-keys');
      } else if (path === 'integrations') {
        setCurrentView('integrations');
      } else if (path === 'saved-chats') {
        setCurrentView('saved-chats');
      }

      function handlePopState(e) {
        if (e.state?.view) {
          setCurrentView(e.state.view);
        } else {
          const currentPath = window.location.pathname.replace(/^\//, '') || 'home';
          setCurrentView(currentPath);
        }
      }
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
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
      const user = result.user
        ? {
            ...result.user,
            connectedProviders: result.connectedProviders || [],
            hasOpenRouterKey: result.hasOpenRouterKey || false,
            hasExternalKeys: result.hasExternalKeys || false
          }
        : null;
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

  const isFreeTierUser = !currentUser?.hasExternalKeys && !currentUser?.hasOpenRouterKey && (!currentUser || currentUser.tier === 'free');

  const isModelFree = useCallback((modelOrId) => {
    if (!modelOrId) return false;
    const model = typeof modelOrId === 'string'
      ? models.find(m => m.id === modelOrId)
      : modelOrId;
    const id = typeof modelOrId === 'string' ? modelOrId : (model?.id || '');

    // Exclude paid, variable-cost, audio, and broken models
    if (
      id === 'openrouter:openrouter/auto' ||
      id === 'openrouter/auto' ||
      id.includes('lyria') ||
      id.includes('inclusionai/ling') ||
      (id.includes('gemma-4-26b-a4b-it:free') && id.startsWith('openrouter')) ||
      (id.includes('gemma-4-31b-it:free') && id.startsWith('openrouter')) ||
      id === 'electronhub:deepseek-v3.2:free' ||
      id === 'electronhub:deepseek-v4.1-flash:free' ||
      id === 'electronhub:glm-5.1:free' ||
      id === 'electronhub:glm-5.3-flash:free'
    ) {
      return false;
    }

    // Verified free routers
    if (
      id === 'openrouter:openrouter/free' ||
      id === 'openrouter/free' ||
      id === 'free-router' ||
      id === 'auto'
    ) {
      return true;
    }

    // Models explicitly ending in :free
    if (id.endsWith(':free')) {
      return true;
    }

    if (model) {
      if (model.isFree === true || model.tier === 'free') {
        return true;
      }
      if (model.pricing && model.pricing.prompt === '0' && model.pricing.completion === '0') {
        return true;
      }
    }

    return false;
  }, [models]);

  const getAutoFreeModelId = useCallback(() => {
    return (
      models.find(m => m.id === 'openrouter:openrouter/free' || m.id === 'openrouter/free')?.id ||
      models.find(m => m.id === 'free-router')?.id ||
      models.find(m => m.id === 'auto')?.id ||
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
    if (modelId && models.some(model => model.id === modelId)) {
      if (isFreeTierUser && !isModelFree(modelId)) {
        setSelectedModel(getAutoFreeModelId());
      } else {
        setSelectedModel(modelId);
      }
    } else if (isFreeTierUser && !isModelFree(selectedModel)) {
      setSelectedModel(getAutoFreeModelId());
    }
    setError('');
    navigateToView('chat');
  }

  function handleAuthenticated(user, modelId) {
    currentUserRef.current = user;
    setCurrentUser(user);
    setAuthRestoreError('');
    setRequestedModelId(null);
    loadChatsForUser(user.id);
    loadModels();

    try {
      const intended = sessionStorage.getItem('iamhujju_intended_plan');
      if (intended) {
        navigateToView('pricing');
        return;
      }
    } catch {}

    const isFree = !user || user.tier === 'free';
    if (modelId && (!isFree || isModelFree(modelId))) {
      openChatFromHome(modelId);
    } else {
      const autoFree = getAutoFreeModelId();
      setSelectedModel(autoFree);
      openChatFromHome(autoFree);
    }
  }

  function openPricing() {
    navigateToView('pricing');
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

  async function processSelectedFiles(fileList) {
    const newAttachments = [];
    for (const file of fileList) {
      if (file.size > 25 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds the 25 MB limit.`);
        continue;
      }
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');

      if (isImage) {
        const data = await readFileAsDataUrl(file);
        newAttachments.push({
          id,
          name: file.name,
          type: file.type,
          size: file.size,
          category: 'photo',
          data,
          previewUrl: data
        });
      } else if (isVideo) {
        const data = await readFileAsDataUrl(file);
        newAttachments.push({
          id,
          name: file.name,
          type: file.type,
          size: file.size,
          category: 'video',
          data,
          previewUrl: URL.createObjectURL(file)
        });
      } else {
        // Document
        let textPreview = '';
        if (
          file.type.includes('text') ||
          file.name.match(/\.(txt|md|json|csv|py|js|ts|html|css|yaml|yml|xml|log|sh)$/i)
        ) {
          textPreview = await readFileAsText(file);
        } else {
          textPreview = `[Document file: ${file.name} (${formatFileSize(file.size)})]`;
        }
        newAttachments.push({
          id,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          category: 'document',
          textPreview,
          previewUrl: null
        });
      }
    }
    if (newAttachments.length > 0) {
      setAttachments(prev => [...prev, ...newAttachments]);
    }
  }

  function removeAttachment(id) {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }

  function toggleSources(index) {
    setSourcesOpen(prev => ({
      ...prev,
      [index]: prev[index] === false ? true : false
    }));
  }

  function handleFileInputChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      processSelectedFiles(files);
    }
    e.target.value = '';
  }

  async function sendMessage(event, regenerate = false, overrideMessages = null) {
    if (event?.preventDefault) event.preventDefault();

    if (loading) return;

    const prompt = input.trim();
    const currentAttachments = [...attachments];

    if (!overrideMessages && !regenerate && !prompt && currentAttachments.length === 0) return;

    if (
      regenerate &&
      !overrideMessages &&
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

    // Format payload for AI model
    let payloadContent = prompt;
    if (currentAttachments.length > 0) {
      const docTexts = currentAttachments
        .filter(a => a.category === 'document' && a.textPreview)
        .map(a => `\n\n--- ATTACHED DOCUMENT: ${a.name} (${formatFileSize(a.size)}) ---\n${a.textPreview}\n--- END OF DOCUMENT ---`)
        .join('');

      const videoTexts = currentAttachments
        .filter(a => a.category === 'video')
        .map(a => `\n[Uploaded Video Attachment: "${a.name}" (${formatFileSize(a.size)})]`)
        .join('');

      const combinedText = (prompt + docTexts + videoTexts).trim();
      const photoAttachments = currentAttachments.filter(a => a.category === 'photo' && a.data);

      if (photoAttachments.length > 0) {
        payloadContent = [
          { type: 'text', text: combinedText || 'Please review and analyze the attached image(s).' },
          ...photoAttachments.map(p => ({
            type: 'image_url',
            image_url: { url: p.data }
          }))
        ];
      } else {
        payloadContent = combinedText || prompt;
      }
    }

    const newUserMessage = {
      role: 'user',
      content: payloadContent,
      displayPrompt: prompt,
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined
    };

    let updatedMessages;
    if (overrideMessages) {
      updatedMessages = overrideMessages;
    } else if (regenerate) {
      updatedMessages = messages.slice(0, -1);
    } else {
      updatedMessages = [
        ...messages,
        newUserMessage
      ];
    }

    setMessages([
      ...updatedMessages,
      { role: 'assistant', content: '' }
    ]);

    if (!regenerate && !overrideMessages) {
      setInput('');
      setAttachments([]);
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
          messages: updatedMessages.map(m => ({
            role: m.role,
            content: m.content
          })),
          stream: true,
          browse: browseEnabled,
          webSearch: browseEnabled
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

        // Capture real-time web browsing sources
        if (Array.isArray(data.sources)) {
          setMessages(previous => {
            const next = [...previous];
            const lastIdx = next.length - 1;
            if (next[lastIdx]) {
              next[lastIdx] = {
                ...next[lastIdx],
                sources: data.sources
              };
            }
            return next;
          });
          return;
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

  function startEditingMessage(index, content) {
    if (loading) return;
    setEditingIndex(index);
    setEditingText(typeof content === 'string' ? content : (content?.text || ''));
  }

  function cancelEditingMessage() {
    setEditingIndex(null);
    setEditingText('');
  }

  async function saveEditedMessage(index) {
    if (!editingText.trim()) return;
    const target = messages[index];
    if (!target) return;

    const trimmed = editingText.trim();
    setEditingIndex(null);

    if (target.role === 'user') {
      const updatedUserMsg = {
        ...target,
        content: trimmed,
        displayPrompt: trimmed
      };
      const baseMessages = [...messages.slice(0, index), updatedUserMsg];
      await sendMessage({ preventDefault() {} }, false, baseMessages);
    } else {
      setMessages(prev => prev.map((m, i) => i === index ? { ...m, content: trimmed } : m));
    }
  }

  async function regenerateAt(index) {
    if (loading || !messages.length) return;
    const target = messages[index];
    if (!target) return;

    let baseMessages;
    if (target.role === 'assistant') {
      baseMessages = messages.slice(0, index);
    } else {
      baseMessages = messages.slice(0, index + 1);
    }

    if (!baseMessages.length) return;
    await sendMessage({ preventDefault() {} }, false, baseMessages);
  }

  function undoMessage(index) {
    if (loading) return;
    const target = messages[index];
    if (!target) return;

    let nextMessages;
    if (target.role === 'user') {
      if (index + 1 < messages.length && messages[index + 1].role === 'assistant') {
        nextMessages = messages.filter((_, i) => i !== index && i !== index + 1);
      } else {
        nextMessages = messages.filter((_, i) => i !== index);
      }
      if (typeof target.content === 'string') {
        setInput(target.displayPrompt || target.content);
      }
    } else {
      nextMessages = messages.filter((_, i) => i !== index);
    }

    setMessages(nextMessages);
    setError('');
  }

  async function copyMessage(index, content) {
    const textToCopy = typeof content === 'string' ? content : JSON.stringify(content);
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedMessageIndex(index);
      setTimeout(() => setCopiedMessageIndex(null), 2000);
    } catch {}
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
        const speaker = message.role === 'user' ? 'You' : 'Ratnagiri_Enterprenuers';
        return `## ${speaker}\n\n${message.content}`;
      })
      .join('\n\n---\n\n');

    const plainText = messages
      .map(message => {
        const speaker = message.role === 'user' ? 'You' : 'Ratnagiri_Enterprenuers';
        return `${speaker}\n\n${message.content}`;
      })
      .join('\n\n------------------------------\n\n');

    if (format === 'pdf') {
      const printWindow = window.open('', '_blank');

      if (!printWindow) {
        setError('PDF popup blocked. Allow pop-ups for iamhujju.com and try again.');
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
        const speaker = message.role === 'user' ? 'You' : 'Ratnagiri_Enterprenuers';

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
            <title>Ratnagiri_Enterprenuers Workspace Conversation</title>
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
            <h1>Ratnagiri_Enterprenuers Workspace Conversation</h1>
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
      : `# Ratnagiri_Enterprenuers Workspace Conversation\n\n${markdown}`;

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

  // Quick model selection list
  const quickModels = useMemo(() => {
    const presets = [
      {
        id: 'auto-free',
        label: '⚡ Auto Free Router',
        match: m => m.id === 'openrouter:openrouter/free' || m.id === 'openrouter/free' || m.id === 'free-router' || m.id === 'auto',
        fallbackId: 'openrouter:openrouter/free'
      },
      {
        id: 'nemotron-ultra',
        label: '🧠 Nemotron 3 Ultra (Free)',
        match: m => m.id.includes('nemotron-3-ultra') || m.id.includes('nemotron-3-nano'),
        fallbackId: null
      },
      {
        id: 'gemma-4',
        label: '⚡ Gemma 4 31B (Free)',
        match: m => m.id === 'electronhub:gemma-4-31b-it:free' || (m.id.includes('gemma-4') && m.id.includes(':free') && !m.id.startsWith('openrouter')),
        fallbackId: null
      },
      {
        id: 'qwen-coder',
        label: '💻 Qwen 3 Coder (Free)',
        match: m => m.id.includes('qwen3-coder') || (m.id.includes('qwen') && m.id.includes('coder') && isModelFree(m)),
        fallbackId: null
      },
      {
        id: 'gpt-oss',
        label: '🚀 GPT OSS 120B (Free)',
        match: m => m.id.includes('gpt-oss-120b') || m.id.includes('gpt-oss-20b'),
        fallbackId: null
      }
    ];

    return presets.map(item => {
      const found = chatModelOptions.find(item.match);
      return {
        ...item,
        targetId: found ? found.id : item.fallbackId,
        available: Boolean(found || item.fallbackId)
      };
    }).filter(item => item.available);
  }, [chatModelOptions, isModelFree]);

  // Current active model display metadata
  const currentModelInfo = useMemo(() => {
    const found = chatModelOptions.find(m => m.id === selectedModel);
    if (!found) {
      if (selectedModel.includes('auto') || selectedModel.includes('free')) {
        return { name: 'Free Models Router', isFree: true, tag: '100% Free · Auto-Speed' };
      }
      return { name: selectedModel, isFree: true, tag: 'Active Model' };
    }
    return {
      name: found.name || found.id,
      isFree: isModelFree(found),
      tag: isModelFree(found) ? '100% Free' : 'Pro (Requires Credits)'
    };
  }, [chatModelOptions, selectedModel, isModelFree]);

  const renderLiveSupportWidget = () => (
    <LiveSupportWidget
      isOpen={liveSupportOpen}
      onToggle={() => setLiveSupportOpen(prev => !prev)}
      onOpenFullChat={(modelId) => openChatFromHome(modelId || selectedModel)}
      onOpenModels={openModels}
      onOpenSkills={openSkills}
      onOpenSavedChats={openSavedChats}
      onOpenPricing={openPricing}
      onOpenApiKeys={openApiKeys}
      onOpenIntegrations={openIntegrations}
      onScrollTo={(id) => {
        if (currentView !== 'home') {
          navigateToView('home');
          setTimeout(() => {
            const el = document.getElementById(id);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }, 150);
        } else {
          const el = document.getElementById(id);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }
      }}
      selectedModel={selectedModel}
      connected={connected}
      currentUser={currentUser}
      models={models}
    />
  );

  return (
    <>
      {currentView === 'home' && (
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
        onOpenPricing={openPricing}
        onOpenCheckout={openPricing}
        onOpenLiveSupport={() => setLiveSupportOpen(true)}
      />
      )}

      {currentView === 'models' && (
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
        onOpenPricing={openPricing}
      />
      )}

      {currentView === 'skills' && (
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
        onOpenPricing={openPricing}
      />
      )}

      {currentView === 'saved-chats' && (
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
        onOpenPricing={openPricing}
        onLogout={handleLogout}
      />
      )}

      {currentView === 'api-keys' && (
      <ApiKeysPage
        user={currentUser}
        connected={connected}
        modelCount={models.length}
        onLogout={handleLogout}
        onOpenHome={() => navigateToView('home')}
        onOpenModels={openModels}
        onOpenSkills={openSkills}
        onOpenSavedChats={openSavedChats}
        onOpenChat={() => openChatFromHome(selectedModel)}
        onOpenIntegrations={openIntegrations}
        onOpenPricing={openPricing}
        onModelsChanged={() => loadModels()}
      />
      )}

      {currentView === 'integrations' && (
      <IntegrationsPage
        user={currentUser}
        connected={connected}
        modelCount={models.length}
        onLogout={handleLogout}
        onOpenHome={() => navigateToView('home')}
        onOpenModels={openModels}
        onOpenSkills={openSkills}
        onOpenSavedChats={openSavedChats}
        onOpenChat={() => openChatFromHome(selectedModel)}
        onOpenApiKeys={openApiKeys}
        onOpenPricing={openPricing}
        onModelsChanged={() => loadModels()}
      />
      )}

      {currentView === 'pricing' && (
      <PricingPage
        user={currentUser}
        connected={connected}
        modelCount={models.length}
        onLogout={handleLogout}
        onOpenHome={() => navigateToView('home')}
        onOpenModels={openModels}
        onOpenChat={() => openChatFromHome(selectedModel)}
        onOpenApiKeys={openApiKeys}
        onOpenIntegrations={openIntegrations}
        onOpenSavedChats={openSavedChats}
        onAuthenticated={handleAuthenticated}
      />
      )}

      {(currentView === 'chat' || (currentView !== 'home' && currentView !== 'models' && currentView !== 'skills' && currentView !== 'saved-chats' && currentView !== 'api-keys' && currentView !== 'integrations' && currentView !== 'pricing')) && (
        <div className="app-shell">

      <aside className="sidebar">
        <button
          className="brand brand-btn"
          type="button"
          onClick={() => navigateToView('home')}
          title="Return to Ratnagiri_Enterprenuers Explore"
          aria-label="Return to Ratnagiri_Enterprenuers Explore"
        >
          <div className="brand-icon">
            <img src="/mascot.jpg" alt="Ratnagiri_Enterprenuers mascot" className="brand-mascot-img" />
          </div>
          <div>
            <h2>Ratnagiri_Enterprenuers</h2>
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
          <span className="version">Ratnagiri_Enterprenuers AI Workspace · v2.0</span>
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
                title="Return to Ratnagiri_Enterprenuers Explore"
              >
                Ratnagiri_Enterprenuers
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

          <div className="model-control-vfx">
            <button
              type="button"
              className="active-model-card-btn"
              onClick={() => setModelSwitcherOpen(true)}
              title="Click to toggle or browse 400+ AI models"
              aria-label="Current model, click to change"
            >
              <span className={`model-status-orb ${currentModelInfo.isFree ? 'orb-free' : 'orb-pro'}`} />
              <div className="model-info-column">
                <span className="model-title-text">{currentModelInfo.name}</span>
                <span className="model-subtitle-text">{currentModelInfo.tag} · Click to Switch ▾</span>
              </div>
            </button>

            <button
              className="models-catalog-trigger-btn"
              type="button"
              onClick={() => setModelSwitcherOpen(true)}
              title="Browse all 400+ models with 3D filters"
            >
              <span>⚡ All Models</span>
            </button>

            <button
              className="refresh-button"
              type="button"
              disabled={modelsLoading}
              title="Refresh available models"
              onClick={() => loadModels()}
            >
              {modelsLoading ? '…' : '↻'}
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
                onOpenPricing={openPricing}
                onOpenCheckout={openPricing}
                onOpenSavedChats={openSavedChats}
              />
            )}
          </div>
        </header>

        {/* Ambient 3D VFX Background */}
        <div className="chat-ambient-vfx" aria-hidden="true">
          <div className="chat-vfx-grid-floor" />
          <div className="chat-vfx-orb orb-cyan" />
          <div className="chat-vfx-orb orb-purple" />
          <div className="chat-vfx-scanlines" />
        </div>

        {/* Quick Model Fast-Switch Bar */}
        <div className="chat-quick-model-bar">
          <span className="quick-bar-title">⚡ Fast Switch:</span>
          <div className="quick-bar-pills">
            {quickModels.map(qm => {
              const isActive = qm.targetId === selectedModel;
              return (
                <button
                  key={qm.id}
                  type="button"
                  className={`quick-model-pill ${isActive ? 'is-active' : ''}`}
                  onClick={() => setSelectedModel(qm.targetId)}
                  title={`Switch to ${qm.label}`}
                >
                  <span>{qm.label}</span>
                  {isActive && <span className="active-glow-indicator" />}
                </button>
              );
            })}
            <button
              type="button"
              className="quick-model-pill browse-more-pill"
              onClick={() => setModelSwitcherOpen(true)}
              title="Explore all 400+ models in 3D modal"
            >
              <span>✨ 400+ Models...</span>
            </button>
          </div>
        </div>

        <section className="chat-area">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-3d-gyro-core" aria-hidden="true">
                <div className="gyro-ring ring-x" />
                <div className="gyro-ring ring-y" />
                <div className="gyro-ring ring-z" />
                <div className="gyro-center-orb">
                  <img src="/mascot.jpg" alt="Ratnagiri_Enterprenuers mascot" className="welcome-mascot-img" />
                </div>
                <div className="gyro-glow-pulse" />
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
                      {message.role === 'user' ? 'You' : 'Ratnagiri_Enterprenuers'}
                    </strong>
                    {/* Attached Photos, Videos, and Documents */}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="msg-attachments-container">
                        {message.attachments.some(a => a.category === 'photo') && (
                          <div className="msg-photos-grid">
                            {message.attachments.filter(a => a.category === 'photo').map(photo => (
                              <img
                                key={photo.id}
                                src={photo.previewUrl || photo.data}
                                alt={photo.name}
                                className="msg-photo-thumb"
                                onClick={() => setLightboxImage({ url: photo.previewUrl || photo.data, name: photo.name })}
                                title="Click to view full size"
                              />
                            ))}
                          </div>
                        )}

                        {message.attachments.some(a => a.category === 'video') && (
                          <div className="msg-videos-list">
                            {message.attachments.filter(a => a.category === 'video').map(video => (
                              <video
                                key={video.id}
                                src={video.previewUrl || video.data}
                                controls
                                className="msg-video-player"
                                preload="metadata"
                              />
                            ))}
                          </div>
                        )}

                        {message.attachments.some(a => a.category === 'document') && (
                          <div className="msg-docs-list">
                            {message.attachments.filter(a => a.category === 'document').map(doc => (
                              <div key={doc.id} className="msg-doc-card">
                                <span className="msg-doc-icon">📄</span>
                                <div className="msg-doc-meta">
                                  <span className="msg-doc-name" title={doc.name}>{doc.name}</span>
                                  <span className="msg-doc-size">{formatFileSize(doc.size)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Real-time Web Browsing Sources Card */}
                    {message.sources && message.sources.length > 0 && (
                      <div className="web-sources-card">
                        <button
                          type="button"
                          className="web-sources-toggle"
                          onClick={() => toggleSources(index)}
                        >
                          <span className="sources-icon">🌐</span>
                          <span className="sources-title">
                            Sources & Web Citations ({message.sources.length})
                          </span>
                          <span className="sources-arrow">
                            {sourcesOpen[index] !== false ? '▲ Hide' : '▼ View Sources'}
                          </span>
                        </button>

                        {sourcesOpen[index] !== false && (
                          <div className="web-sources-list">
                            {message.sources.map((s, sIdx) => (
                              <a
                                key={sIdx}
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="source-item"
                                title={s.snippet || s.title}
                              >
                                <span className="source-index">{sIdx + 1}</span>
                                <div className="source-details">
                                  <div className="source-name">{s.title}</div>
                                  <div className="source-meta">
                                    <span className="source-domain">{s.source || 'Web'}</span>
                                    {s.date && <span className="source-date"> • {s.date}</span>}
                                  </div>
                                </div>
                                <span className="source-link-icon">↗</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {editingIndex === index ? (
                      <div className="msg-inline-edit-box">
                        <textarea
                          className="msg-inline-edit-textarea"
                          value={editingText}
                          onChange={e => setEditingText(e.target.value)}
                          rows={Math.max(2, editingText.split('\n').length)}
                          autoFocus
                          placeholder="Edit message..."
                        />
                        <div className="msg-inline-edit-actions">
                          <button
                            type="button"
                            className="msg-edit-save-btn"
                            onClick={() => saveEditedMessage(index)}
                          >
                            {message.role === 'user' ? 'Save & Submit' : 'Save Changes'}
                          </button>
                          <button
                            type="button"
                            className="msg-edit-cancel-btn"
                            onClick={cancelEditingMessage}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="markdown-content">
                        {message.content
                          ? <MarkdownMessage content={message.content} />
                          : loading ? 'Thinking...' : ''}
                      </div>
                    )}

                    {/* Small action buttons toolbar below every message: edit, regenerate, undo, copy */}
                    {!loading && editingIndex !== index && (
                      <div className="message-action-bar">
                        <button
                          type="button"
                          className="msg-action-btn"
                          onClick={() => startEditingMessage(index, message.content)}
                          title="Edit message"
                          aria-label="Edit message"
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          className="msg-action-btn"
                          onClick={() => regenerateAt(index)}
                          title="Regenerate response from this point"
                          aria-label="Regenerate response"
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                          <span>Regenerate</span>
                        </button>

                        <button
                          type="button"
                          className="msg-action-btn"
                          onClick={() => undoMessage(index)}
                          title="Undo / Remove message"
                          aria-label="Undo message"
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="1 4 1 10 7 10" />
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                          </svg>
                          <span>Undo</span>
                        </button>

                        <button
                          type="button"
                          className={`msg-action-btn ${copiedMessageIndex === index ? 'is-copied' : ''}`}
                          onClick={() => copyMessage(index, message.content)}
                          title="Copy text to clipboard"
                          aria-label="Copy text"
                        >
                          {copiedMessageIndex === index ? (
                            <>
                              <span className="copied-check">✓</span>
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
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
        {error && (
          <div className="error-message enhanced-error-banner" role="alert">
            <div className="error-text-content">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
            {(error.toLowerCase().includes('credit') || error.toLowerCase().includes('paid') || error.toLowerCase().includes('pro model') || error.toLowerCase().includes('402')) && (
              <button
                type="button"
                className="error-action-btn switch-to-free-btn"
                onClick={() => {
                  setSelectedModel(getAutoFreeModelId());
                  setError('');
                }}
              >
                ⚡ Switch to 100% Free Model & Continue
              </button>
            )}
          </div>
        )}

        <footer className="composer-area">
          {browseEnabled && (
            <div className="browsing-status-pill">
              <span className="pulse-dot" />
              <span>Web Browsing Active — Live search & sources enabled</span>
            </div>
          )}

          <form className="composer" onSubmit={sendMessage}>
            {attachments.length > 0 && (
              <div className="composer-attachments-tray">
                {attachments.map(att => (
                  <div key={att.id} className={`composer-att-chip att-${att.category}`}>
                    {att.category === 'photo' && (
                      <img src={att.previewUrl || att.data} alt={att.name} className="att-thumb-preview" />
                    )}
                    {att.category === 'video' && (
                      <div className="att-type-icon">🎬</div>
                    )}
                    {att.category === 'document' && (
                      <div className="att-type-icon">📄</div>
                    )}
                    <div className="att-meta">
                      <span className="att-filename" title={att.name}>{att.name}</span>
                      <span className="att-filesize">{formatFileSize(att.size)}</span>
                    </div>
                    <button
                      type="button"
                      className="att-remove-btn"
                      onClick={() => removeAttachment(att.id)}
                      title="Remove attachment"
                      aria-label="Remove attachment"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="composer-input-row">
              <button
                type="button"
                className="composer-action-btn attach-action-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Upload document, photo, or video"
                aria-label="Upload document, photo, or video"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>

              <button
                type="button"
                className={`composer-action-btn browse-toggle-btn ${browseEnabled ? 'browse-active' : ''}`}
                onClick={() => setBrowseEnabled(prev => !prev)}
                title={browseEnabled ? 'Web Browsing ON (Click to disable)' : 'Enable Web Browsing (Real-time live search)'}
                aria-pressed={browseEnabled}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <span className="browse-toggle-text">Browse</span>
                {browseEnabled && <span className="browse-active-dot" />}
              </button>

              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form.requestSubmit();
                  }
                }}
                placeholder={attachments.length > 0 ? "Ask about the uploaded file(s)..." : "Message your AI assistant... (or drop files)"}
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
                  disabled={(!input.trim() && attachments.length === 0) || !connected || !selectedModel}
                  aria-label="Send message"
                >
                  ↑
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.md,.json,.csv,.py,.js,.ts,.html,.css"
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />
          </form>

          <p className="disclaimer">
            AI responses can make mistakes. Verify important information.
          </p>
        </footer>

        {lightboxImage && (
          <div className="image-lightbox-backdrop" onClick={() => setLightboxImage(null)}>
            <div className="image-lightbox-content" onClick={e => e.stopPropagation()}>
              <img src={lightboxImage.url} alt={lightboxImage.name || 'Image Preview'} className="image-lightbox-img" />
              <button
                type="button"
                className="image-lightbox-close"
                onClick={() => setLightboxImage(null)}
                aria-label="Close image preview"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <ModelSwitcherModal
          isOpen={modelSwitcherOpen}
          onClose={() => setModelSwitcherOpen(false)}
          models={chatModelOptions}
          selectedModel={selectedModel}
          onSelectModel={id => setSelectedModel(id)}
          isModelFree={isModelFree}
          isFreeTierUser={isFreeTierUser}
          onOpenIntegrations={openIntegrations}
        />
      </main>
        </div>
      )}

      {renderLiveSupportWidget()}
    </>
  );
}

export default App;
