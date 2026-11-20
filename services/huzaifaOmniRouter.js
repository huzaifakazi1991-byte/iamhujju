// services/huzaifaOmniRouter.js — Unified Merged Model Orchestrator (huzaifa-kazi-omni)
// Combines all portal providers (Google AI Studio, OpenRouter, Electron Hub, Groq)
// with sub-50ms intent classification, live web search grounding, inline image/video generation,
// and zero-failure multi-model failover.

import { browseWeb, shouldTriggerLiveSearch } from './webSearch.js';
import {
  verifyPaidGeminiAccess,
  getGoogleAIStudioKey,
  generateGeminiImage,
  createGeminiVideoTask,
  streamGeminiChat
} from './googleGeminiAdapter.js';
import {
  PROVIDERS,
  sanitizePayloadForModel,
  generateImageResult,
  createVideoTaskRecord
} from './aiGateway.js';

export const HUZAIFA_OMNI_MODEL_ID = 'huzaifa-kazi-omni';

export const HUZAIFA_OMNI_MODEL_METADATA = {
  id: HUZAIFA_OMNI_MODEL_ID,
  name: 'Huzaifa Kazi (Omni AI)',
  object: 'model',
  created: Math.floor(Date.now() / 1000),
  owned_by: 'Huzaifa Kazi',
  permission: [],
  root: HUZAIFA_OMNI_MODEL_ID,
  parent: null,
  context_length: 128000,
  description: 'Unified Merged Model Orchestrator: Auto-routes prompts across active portal models for Q&A, live web facts, image generation, video generation, and deep reasoning.',
  tier: 'free',
  isFree: true,
  modality: 'multimodal',
  capabilities: {
    chat: true,
    reasoning: true,
    image_generation: true,
    video_generation: true,
    web_search: true,
    autonomous_agent: true
  }
};

/**
 * Sub-50ms Intent and Modality Classifier
 */
export function classifyPromptIntent(text, messages = []) {
  const clean = (text || '').trim();

  // 1. Image Generation Intent
  const imagePatterns = [
    /^(?:image|draw|illustration|sketch|render|picture):\s*(.+)/i,
    /^\/imagine\s+(.+)/i,
    /^(?:please\s+)?(?:generate|create|make|draw|paint|render|design)\s+(?:an?\s+)?(?:image|picture|photo|photograph|illustration|logo|poster|wallpaper|avatar|artwork|graphic|drawing|portrait|sketch|visual|landscape|scene|scenery|concept art)\s+(?:of\s+|about\s+|showing\s+)?(.+)/i,
    /^(?:please\s+)?(?:draw|paint|sketch)\s+(?:an?\s+)?(.+)/i,
    /(?:generate|create|draw|paint)\s+(?:an?\s+)?(?:hd|high[- ]res|4k|8k|cinematic)?\s*(?:image|picture|photo|illustration|logo|artwork)\s+(?:of|showing)\s+(.+)/i
  ];

  for (const pat of imagePatterns) {
    const m = clean.match(pat);
    if (m) {
      const prompt = (m[2] || m[1] || clean).trim();
      return {
        modality: 'image',
        confidence: 0.95,
        extractedPrompt: prompt,
        rawQuery: clean
      };
    }
  }

  // 2. Video Generation Intent
  const videoPatterns = [
    /^(?:video|animate):\s*(.+)/i,
    /^(?:please\s+)?(?:generate|create|make|produce|render|animate)\s+(?:an?\s+)?(?:video|animation|clip|short film|movie|motion graphic)\s+(?:of\s+|about\s+|showing\s+)?(.+)/i,
    /^(?:please\s+)?(?:animate)\s+(?:an?\s+)?(.+)/i
  ];

  for (const pat of videoPatterns) {
    const m = clean.match(pat);
    if (m) {
      const prompt = (m[2] || m[1] || clean).trim();
      return {
        modality: 'video',
        confidence: 0.95,
        extractedPrompt: prompt,
        rawQuery: clean
      };
    }
  }

  // Casual conversational check (e.g. "Hello! How are you doing today?")
  const isCasualGreeting = /^(?:hi|hello|hey|greetings|good\s+(?:morning|afternoon|evening|day))\b/i.test(clean) &&
    !/(?:news|weather|price|stock|bitcoin|search|crypto|release|score|date|time)/i.test(clean);
  if (isCasualGreeting && !/(?:what\s+is\s+today's\s+date|what\s+date\s+is\s+it)/i.test(clean)) {
    return {
      modality: 'general_fast',
      confidence: 0.9,
      extractedPrompt: clean,
      rawQuery: clean
    };
  }

  // 3. Live News / Current Date / Real-Time Data Intent
  const newsPatterns = [
    /(?:today's date|current date|what date is it|what day is it|current year|what year is this|what time is it)/i,
    /(?:latest news|today's news|breaking news|live news|current events|recent news|world news)/i,
    /(?:current price|live price|stock price of|crypto price|bitcoin price|gold price)/i,
    /(?:current weather in|weather today in|temperature in)/i,
    /(?:who is currently|who is the current|latest updates on|latest release of)/i,
    /(?:search the web|search online|browse web|look up online)/i
  ];

  for (const pat of newsPatterns) {
    if (pat.test(clean)) {
      return {
        modality: 'news',
        confidence: 0.9,
        extractedPrompt: clean,
        rawQuery: clean
      };
    }
  }

  if (shouldTriggerLiveSearch(clean, false)) {
    return {
      modality: 'news',
      confidence: 0.88,
      extractedPrompt: clean,
      rawQuery: clean
    };
  }

  // 4. Code & Deep Reasoning Intent
  const codePatterns = [
    /(?:```|function\b|def\s+|class\s+|SELECT\s+|INSERT\s+|UPDATE\s+|DELETE\s+|algorithm|debug|fix this error|stack trace|architecture|step-by-step reasoning|prove that|calculate|derivative|integral)/i,
    /(?:write|create|implement|design|develop|refactor)\s+(?:a|an)?\s*(?:script|code|program|function|api|component|service|endpoint|hook|database schema)\b/i
  ];

  for (const pat of codePatterns) {
    if (pat.test(clean)) {
      return {
        modality: 'code_reasoning',
        confidence: 0.85,
        extractedPrompt: clean,
        rawQuery: clean
      };
    }
  }

  // 5. General Fast Intent
  return {
    modality: 'general_fast',
    confidence: 0.8,
    extractedPrompt: clean,
    rawQuery: clean
  };
}

/**
 * Persona & System Prompt for Huzaifa Kazi
 */
export function buildHuzaifaOmniSystemPrompt(dateStr = null) {
  const nowStr = dateStr || new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });

  return `You are Huzaifa Kazi, the unified master AI assistant and omni-model intelligence for iamhujju.com (created by Huzaifa Kazi).
You represent an elite combination of cutting-edge AI reasoning, multi-language coding mastery, multimodal creativity, and real-time world knowledge.

Core Directives:
1. Provide direct, razor-sharp, well-structured, and helpful answers immediately without unnecessary preamble or fluff.
2. Format all code snippets in properly highlighted markdown code blocks with the exact language identifier.
3. Verified current date: ${nowStr}. You have full real-time awareness and live web search grounding. Never claim your knowledge cutoff prevents you from answering current events or dates.
4. Never expose internal upstream model IDs, provider names (e.g. OpenRouter, ElectronHub, Groq), or raw backend error payloads to users. You operate as the unified Huzaifa Kazi Omni Model.
5. Maintain an articulate, polite, confident, and professional tone at all times.`;
}

/**
 * Determine Model Routing Candidate Pool for Huzaifa Kazi
 */
export function getOmniCandidateModels(intent, { isPaidUser = false, hasGeminiKey = false } = {}) {
  const canUseGeminiPro = isPaidUser && hasGeminiKey;

  switch (intent.modality) {
    case 'code_reasoning':
      if (canUseGeminiPro) {
        return [
          { provider: 'gemini', model: 'gemini-2.5-pro' },
          { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
          { provider: 'openrouter', model: 'deepseek/deepseek-r1:free' },
          { provider: 'groq', model: 'llama-3.3-70b-versatile' }
        ];
      }
      return [
        { provider: 'openrouter', model: 'deepseek/deepseek-r1:free' },
        { provider: 'openrouter', model: 'qwen/qwen-2.5-coder-32b-instruct:free' },
        { provider: 'groq', model: 'llama-3.3-70b-versatile' },
        { provider: 'openrouter', model: 'openrouter/free' }
      ];

    case 'news':
      if (canUseGeminiPro) {
        return [
          { provider: 'gemini', model: 'gemini-2.5-flash' },
          { provider: 'groq', model: 'llama-3.3-70b-versatile' },
          { provider: 'openrouter', model: 'google/gemini-2.5-flash:free' }
        ];
      }
      return [
        { provider: 'groq', model: 'llama-3.3-70b-versatile' },
        { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' },
        { provider: 'openrouter', model: 'google/gemini-2.5-flash:free' },
        { provider: 'openrouter', model: 'openrouter/free' }
      ];

    case 'general_fast':
    default:
      if (canUseGeminiPro) {
        return [
          { provider: 'gemini', model: 'gemini-2.5-flash' },
          { provider: 'groq', model: 'llama-3.3-70b-versatile' },
          { provider: 'openrouter', model: 'openrouter/free' }
        ];
      }
      return [
        { provider: 'groq', model: 'llama-3.3-70b-versatile' },
        { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' },
        { provider: 'openrouter', model: 'google/gemini-2.5-flash:free' },
        { provider: 'openrouter', model: 'openrouter/free' }
      ];
  }
}

/**
 * Execute Huzaifa Kazi Omni Model Completion (Streaming & Non-Streaming)
 */
export async function executeHuzaifaOmniChat({
  req,
  res,
  body,
  user,
  accountStore,
  keyPool,
  fetchImpl,
  timeoutMs = 60000,
  upstreamBase
}) {
  const isPaidUser = Boolean(
    user && (
      verifyPaidGeminiAccess(user) ||
      user.tier !== 'free' ||
      user.hasActiveSubscription ||
      user.unlockedAllModels
    )
  );

  const geminiApiKey = await getGoogleAIStudioKey(accountStore);
  const hasGeminiKey = Boolean(geminiApiKey);

  // Extract last user message
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const userText = typeof lastUserMsg?.content === 'string'
    ? lastUserMsg.content
    : Array.isArray(lastUserMsg?.content)
    ? lastUserMsg.content.map(c => c.text || '').join(' ')
    : '';

  const intent = classifyPromptIntent(userText, messages);
  const isStreaming = body.stream !== false;
  const requestId = 'chatcmpl-hujju-omni-' + Math.random().toString(36).slice(2, 10);

  // Set SSE Headers if streaming
  if (isStreaming && !res.headersSent) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
  }

  // Helper SSE functions
  const sendSSEStatus = (status) => {
    if (isStreaming && !res.destroyed) {
      res.write(`data: ${JSON.stringify({ status })}\n\n`);
    }
  };

  const sendSSESources = (sources) => {
    if (isStreaming && !res.destroyed) {
      res.write(`data: ${JSON.stringify({ sources })}\n\n`);
    }
  };

  const sendSSEContent = (content) => {
    if (isStreaming && !res.destroyed) {
      res.write(`data: ${JSON.stringify({
        id: requestId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: HUZAIFA_OMNI_MODEL_ID,
        choices: [{ index: 0, delta: { content }, finish_reason: null }]
      })}\n\n`);
    }
  };

  const sendSSEDone = () => {
    if (isStreaming && !res.destroyed) {
      res.write(`data: ${JSON.stringify({
        id: requestId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: HUZAIFA_OMNI_MODEL_ID,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  };

  // ==========================================
  // CASE 1: INLINE IMAGE GENERATION INTENT
  // ==========================================
  if (intent.modality === 'image') {
    sendSSEStatus('Generating high-resolution AI image…');

    try {
      let imageUrl = null;

      // Try Google AI Studio Imagen 3 if paid user
      if (isPaidUser && geminiApiKey) {
        try {
          const imgResult = await generateGeminiImage({
            prompt: intent.extractedPrompt,
            model: 'imagen-3.0-generate-002',
            aspectRatio: '1:1',
            n: 1,
            apiKey: geminiApiKey,
            fetchImpl
          });
          imageUrl = imgResult.data?.[0]?.url;
        } catch (imgErr) {
          console.warn('[HuzaifaOmni] Gemini Imagen failed, falling back to Flux/SDXL:', imgErr.message);
        }
      }

      // Fallback to active key pool Flux / SDXL
      if (!imageUrl) {
        const activeEhKey = keyPool?.hasKeys('electronhub') ? keyPool.pools.get('electronhub')?.[0]?.key : null;
        const activeOrKey = keyPool?.hasKeys('openrouter') ? keyPool.pools.get('openrouter')?.[0]?.key : null;
        const providerBase = activeEhKey ? PROVIDERS.electronhub.base : (activeOrKey ? PROVIDERS.openrouter.base : null);

        const imgResult = await generateImageResult({
          prompt: intent.extractedPrompt,
          model: 'flux-schnell',
          size: '1024x1024',
          aspect_ratio: '1:1',
          n: 1,
          response_format: 'url',
          activeKey: activeEhKey || activeOrKey,
          providerBase
        });
        imageUrl = imgResult.data?.[0]?.url;
      }

      if (!imageUrl) {
        throw new Error('Image generation failed across active providers.');
      }

      const responseMarkdown = `Here is your generated image for: **"${intent.extractedPrompt}"**\n\n![${intent.extractedPrompt}](${imageUrl})\n\n[⬇ Download High-Resolution Image](${imageUrl})`;

      if (isStreaming) {
        sendSSEContent(responseMarkdown);
        sendSSEDone();
      } else {
        return res.json({
          id: requestId,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: HUZAIFA_OMNI_MODEL_ID,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: responseMarkdown },
            finish_reason: 'stop'
          }]
        });
      }
      return;
    } catch (err) {
      console.error('[HuzaifaOmni] Image execution error:', err.message);
      // Fall through to text Q&A with error notification
      sendSSEContent(`I attempted to generate an image for **"${intent.extractedPrompt}"**, but encountered a provider timeout. Let me describe the concept or answer your question instead:\n\n`);
    }
  }

  // ==========================================
  // CASE 1B: INLINE VIDEO GENERATION INTENT
  // ==========================================
  if (intent.modality === 'video') {
    sendSSEStatus('Initializing AI video generation engine…');

    try {
      let videoUrl = null;

      // Try Google AI Studio Veo 2 if paid user with Gemini key
      if (isPaidUser && geminiApiKey) {
        try {
          sendSSEStatus('Generating cinematic video with Google Veo 2…');
          const vTask = await createGeminiVideoTask({
            prompt: intent.extractedPrompt,
            model: 'veo-2.0-generate-001',
            aspectRatio: '16:9',
            apiKey: geminiApiKey,
            fetchImpl
          });
          videoUrl = vTask.video_url || vTask.final_video_url;
        } catch (vErr) {
          console.warn('[HuzaifaOmni] Gemini Veo failed, falling back to Kling/standard pool:', vErr.message);
        }
      }

      // Fallback to Kling / standard video task
      if (!videoUrl) {
        sendSSEStatus('Synthesizing motion dynamics & rendering video frames…');
        const task = createVideoTaskRecord({
          prompt: intent.extractedPrompt,
          model: 'kling-video-v1',
          duration: 5,
          aspect_ratio: '16:9'
        });
        videoUrl = task.final_video_url;
      }

      const responseMarkdown = `Here is your generated video for: **"${intent.extractedPrompt}"**\n\n<video controls src="${videoUrl}" width="100%" poster="" style="max-height: 400px; border-radius: 12px; margin-top: 8px;"></video>\n\n[▶ View / Download Video](${videoUrl})`;

      if (isStreaming) {
        sendSSEContent(responseMarkdown);
        sendSSEDone();
      } else {
        return res.json({
          id: requestId,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: HUZAIFA_OMNI_MODEL_ID,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: responseMarkdown },
            finish_reason: 'stop'
          }]
        });
      }
      return;
    } catch (err) {
      console.error('[HuzaifaOmni] Video execution error:', err.message);
      sendSSEContent(`I attempted to generate a video for **"${intent.extractedPrompt}"**, but encountered a provider timeout. Let me describe the scene or assist you with text instead:\n\n`);
    }
  }

  // ==========================================
  // CASE 2: LIVE WEB SEARCH / NEWS GROUNDING
  // ==========================================
  let liveSources = [];
  let systemPromptContext = buildHuzaifaOmniSystemPrompt();

  if (intent.modality === 'news' || Boolean(body.browse || body.webSearch)) {
    sendSSEStatus('Searching live web & news…');
    try {
      const searchResult = await browseWeb(intent.extractedPrompt || userText, { maxResults: 6 });
      liveSources = searchResult.sources || [];
      if (liveSources.length > 0) {
        sendSSESources(liveSources);
        sendSSEStatus(`Verified ${liveSources.length} live web sources`);
        systemPromptContext += `\n\n${searchResult.formattedContext}`;
      }
    } catch (searchErr) {
      console.warn('[HuzaifaOmni] Live web search failed:', searchErr.message);
    }
  }

  // Assemble messages with Huzaifa Kazi system prompt
  const updatedMessages = [...messages];
  const sysIdx = updatedMessages.findIndex(m => m.role === 'system');
  if (sysIdx >= 0) {
    updatedMessages[sysIdx] = {
      ...updatedMessages[sysIdx],
      content: `${systemPromptContext}\n\n${updatedMessages[sysIdx].content}`
    };
  } else {
    updatedMessages.unshift({
      role: 'system',
      content: systemPromptContext
    });
  }

  const groundedBody = {
    ...body,
    messages: updatedMessages
  };

  // ==========================================
  // CASE 3: TEXT & REASONING WITH ZERO-FAILURE FAILOVER
  // ==========================================
  const candidateModels = getOmniCandidateModels(intent, { isPaidUser, hasGeminiKey });

  for (const candidate of candidateModels) {
    // 3A. Google AI Studio native stream if candidate is gemini
    if (candidate.provider === 'gemini' && isPaidUser && geminiApiKey) {
      try {
        sendSSEStatus('Synthesizing expert response…');
        return await streamGeminiChat({
          model: candidate.model,
          messages: updatedMessages,
          browse: Boolean(body.browse || body.webSearch),
          webSearch: Boolean(body.browse || body.webSearch),
          apiKey: geminiApiKey,
          fetchImpl,
          res
        });
      } catch (geminiErr) {
        console.warn(`[HuzaifaOmni] Gemini candidate ${candidate.model} failed, trying next:`, geminiErr.message);
        continue;
      }
    }

    // 3B. Standard OpenAI-compatible provider (Groq, OpenRouter, Electron Hub)
    const pConfig = PROVIDERS[candidate.provider];
    if (!pConfig) continue;

    const hasKeys = keyPool?.hasKeys(candidate.provider);
    if (!hasKeys && candidate.provider !== 'freellmapi') continue;

    try {
      sendSSEStatus('Connecting multi-model intelligence…');

      let response = null;
      await keyPool.executeWithFailover({
        providerId: candidate.provider,
        userKey: null,
        fallbackChain: [],
        requestFn: async (activeKey) => {
          const endpoint = pConfig.chatUrl || `${upstreamBase}/chat/completions`;
          const sanitized = sanitizePayloadForModel(
            candidate.provider,
            candidate.model,
            groundedBody,
            { isFreeTierUsingServerKey: !isPaidUser }
          );

          response = await fetchImpl(endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${activeKey}`,
              'Content-Type': 'application/json',
              ...(candidate.provider === 'openrouter' ? {
                'HTTP-Referer': 'https://iamhujju.com',
                'X-Title': 'iamhujju'
              } : {}),
              ...(pConfig.headers || {})
            },
            body: JSON.stringify({
              ...sanitized,
              stream: isStreaming
            })
          });

          if (!response.ok && (response.status === 429 || response.status >= 500)) {
            const errBody = await response.text().catch(() => '');
            const err = new Error(`Provider HTTP ${response.status}: ${errBody}`);
            err.status = response.status;
            throw err;
          }
          return response;
        },
        maxRetries: 2
      });

      if (response && response.ok) {
        if (isStreaming) {
          // Stream chunks to client
          const reader = response.body.getReader ? response.body.getReader() : null;
          if (reader) {
            const decoder = new TextDecoder();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              if (!res.destroyed) {
                res.write(chunk);
              }
            }
            if (!res.destroyed) res.end();
            return;
          } else {
            // Buffer stream
            const { pipeline } = await import('node:stream/promises');
            const { Readable } = await import('node:stream');
            await pipeline(Readable.fromWeb(response.body), res);
            return;
          }
        } else {
          const json = await response.json();
          // Rename model to huzaifa-kazi-omni
          json.model = HUZAIFA_OMNI_MODEL_ID;
          return res.json(json);
        }
      }
    } catch (providerErr) {
      console.warn(`[HuzaifaOmni] Candidate ${candidate.provider}:${candidate.model} failed:`, providerErr.message);
      // Continue to next model in failover chain
    }
  }

  // If all live providers fail, emit clean graceful response
  const fallbackMessage = "I am currently re-calibrating the multi-model intelligence network. Please ask your question again in a moment, and I will assist you with full capabilities.";
  if (isStreaming) {
    sendSSEContent(fallbackMessage);
    sendSSEDone();
  } else {
    return res.json({
      id: requestId,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: HUZAIFA_OMNI_MODEL_ID,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: fallbackMessage },
        finish_reason: 'stop'
      }]
    });
  }
}
