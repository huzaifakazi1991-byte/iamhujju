async function request(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(path, {
    method,
    signal,
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!response.ok) {
    let message = `Could not sync conversations (HTTP ${response.status}).`;
    try {
      const result = await response.json();
      if (typeof result?.error?.message === 'string') {
        message = result.error.message.slice(0, 500);
      }
    } catch {
      // Keep the generic message when the server does not return JSON.
    }
    throw new Error(message);
  }

  return response.status === 204 ? null : response.json();
}

export function loadConversations(signal) {
  return request('/api/conversations', { signal });
}

export function saveConversation(conversation, activeConversationId) {
  return request(`/api/conversations/${encodeURIComponent(conversation.id)}`, {
    method: 'PUT',
    body: {
      title: conversation.title,
      messages: conversation.messages,
      createdAt: conversation.createdAt || null,
      ...(activeConversationId === undefined ? {} : { activeConversationId })
    }
  });
}

export function setActiveConversation(activeConversationId) {
  return request('/api/conversations/workspace', {
    method: 'PUT',
    body: { activeConversationId }
  });
}

export function deleteConversation(conversationId) {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE'
  });
}

export function clearConversations() {
  return request('/api/conversations', { method: 'DELETE' });
}

export function importConversations(conversations, activeConversationId) {
  return request('/api/conversations/import', {
    method: 'POST',
    body: { conversations, activeConversationId }
  });
}
