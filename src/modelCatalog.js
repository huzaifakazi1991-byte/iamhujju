export function getModelProvider(model) {
  if (model?.brand && !['OpenRouter', 'ElectronHub', 'Groq', 'FreeModel'].includes(model.brand)) {
    return model.brand;
  }
  const provider = String(model?.provider || model?.owned_by || 'Unknown provider');
  const normalized = provider.toLowerCase();

  if (normalized === 'freellmapi') return 'FreeLLMAPI';
  if (normalized === 'electronhub') return 'ElectronHub';
  if (normalized === 'groq') return 'Groq';
  if (normalized === 'freemodel') return 'FreeModel';
  if (normalized === 'openrouter') {
    const id = String(model?.sourceId || model?.id || '');
    const cleanId = id.startsWith('openrouter:') ? id.slice('openrouter:'.length) : id;
    if (cleanId.includes('/')) {
      const prefix = (cleanId.split('/')[0] || '').toLowerCase();
      if (prefix.includes('google')) return 'Google';
      if (prefix.includes('openai')) return 'OpenAI';
      if (prefix.includes('anthropic')) return 'Anthropic';
      if (prefix.includes('meta')) return 'Meta';
      if (prefix.includes('deepseek')) return 'DeepSeek';
      if (prefix.includes('mistral') || prefix.includes('codestral')) return 'Mistral';
      if (prefix.includes('qwen') || prefix.includes('alibaba')) return 'Qwen';
      if (prefix.includes('x-ai') || prefix.includes('xai')) return 'xAI';
      if (prefix.includes('cohere')) return 'Cohere';
      if (prefix.includes('nvidia')) return 'Nvidia';
      if (prefix.includes('baidu')) return 'Baidu';
      if (prefix.includes('tencent')) return 'Tencent';
    }
    return 'OpenRouter';
  }
  return model?.brand || provider;
}

export function getModelContextWindow(model) {
  const context = Number(model?.context_window ?? model?.context_length);
  return Number.isFinite(context) && context > 0 ? context : 0;
}

export function getModelProviderOptions(models) {
  const counts = new Map();
  for (const model of models) {
    const provider = getModelProvider(model);
    counts.set(provider, (counts.get(provider) || 0) + 1);
  }

  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getModelBenchmarks(model) {
  const id = String(model?.sourceId || model?.id || '').toLowerCase();
  const name = String(model?.name || '').toLowerCase();
  const target = `${id} ${name}`;

  if (target.includes('gpt-4o') || target.includes('gpt-5') || target.includes('o1') || target.includes('o3')) {
    return { intelligence: 96, coding: 97, speed: 85, latency: 140, modality: ['text', 'vision', 'code'] };
  }
  if (target.includes('gemini')) {
    return { intelligence: 92, coding: 91, speed: 115, latency: 120, modality: ['text', 'vision', 'code', 'audio'] };
  }
  if (target.includes('claude')) {
    return { intelligence: 98, coding: 99, speed: 68, latency: 180, modality: ['text', 'vision', 'code'] };
  }
  if (target.includes('deepseek')) {
    return { intelligence: 95, coding: 96, speed: 75, latency: 190, modality: ['text', 'code'] };
  }
  if (target.includes('llama')) {
    return { intelligence: 89, coding: 88, speed: 65, latency: 170, modality: ['text', 'code'] };
  }
  if (target.includes('qwen')) {
    return { intelligence: 90, coding: 94, speed: 68, latency: 175, modality: ['text', 'code'] };
  }
  if (target.includes('mistral') || target.includes('codestral')) {
    return { intelligence: 88, coding: 92, speed: 72, latency: 165, modality: ['text', 'code'] };
  }
  if (target.includes('ernie') || target.includes('glm')) {
    return { intelligence: 86, coding: 85, speed: 80, latency: 160, modality: ['text', 'code'] };
  }
  return { intelligence: 82, coding: 80, speed: 60, latency: 210, modality: ['text'] };
}

export function generateCodeSnippet(modelId, language = 'curl') {
  const safeId = modelId || 'openrouter/free';
  if (language === 'curl') {
    return `curl https://iamhujju.com/api/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${safeId}",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Hello, explain quantum computing simply." }
    ],
    "temperature": 0.7,
    "max_tokens": 2048,
    "stream": true
  }'`;
  }
  if (language === 'python') {
    return `from openai import OpenAI

# Drop-in compatible with the OpenAI Python SDK
client = OpenAI(
    base_url="https://iamhujju.com/api",
    api_key="your_account_session_or_key"
)

response = client.chat.completions.create(
    model="${safeId}",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello, explain quantum computing simply."}
    ],
    temperature=0.7,
    max_tokens=2048,
    stream=True
)

for chunk in response:
    content = chunk.choices[0].delta.content or ""
    print(content, end="", flush=True)`;
  }
  if (language === 'javascript' || language === 'typescript') {
    return `import OpenAI from 'openai';

// Drop-in compatible with the OpenAI Node.js SDK
const client = new OpenAI({
  baseURL: 'https://iamhujju.com/api',
  apiKey: 'your_account_session_or_key'
});

async function main() {
  const stream = await client.chat.completions.create({
    model: '${safeId}',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello, explain quantum computing simply.' }
    ],
    temperature: 0.7,
    max_tokens: 2048,
    stream: true
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
}

main();`;
  }
  if (language === 'go') {
    return `package main

import (
    "context"
    "fmt"
    "github.com/sashabaranov/go-openai"
)

func main() {
    config := openai.DefaultConfig("your_account_session_or_key")
    config.BaseURL = "https://iamhujju.com/api"
    client := openai.NewClientWithConfig(config)

    resp, err := client.CreateChatCompletion(
        context.Background(),
        openai.ChatCompletionRequest{
            Model: "${safeId}",
            Messages: []openai.ChatCompletionMessage{
                {Role: openai.ChatMessageRoleUser, Content: "Hello, explain quantum computing simply."},
            },
            Temperature: 0.7,
            MaxTokens: 2048,
        },
    )
    if err != nil {
        panic(err)
    }

    fmt.Println(resp.Choices[0].Message.Content)
}`;
  }
  return '';
}

export function filterAndSortModels(models, {
  query = '',
  providers = [],
  minimumContext = 0,
  availability = ['available', 'unavailable'],
  sort = 'gateway'
} = {}) {
  const term = query.trim().toLowerCase();
  const selectedProviders = new Set(providers);
  const selectedAvailability = new Set(availability);
  const filtered = models.filter(model => {
    const searchable = [
      model.id,
      model.name,
      model.owned_by,
      model.provider,
      model.description
    ].filter(Boolean).join(' ').toLowerCase();
    const available = model.available === true
      ? 'available'
      : model.available === false
        ? 'unavailable'
        : null;
    const matchesAvailability = available
      ? selectedAvailability.has(available)
      : selectedAvailability.size === 2;

    return (!term || searchable.includes(term))
      && (!selectedProviders.size || selectedProviders.has(getModelProvider(model)))
      && getModelContextWindow(model) >= Number(minimumContext || 0)
      && matchesAvailability;
  });

  if (sort === 'name-asc') {
    filtered.sort((left, right) =>
      String(left.name || left.id).localeCompare(String(right.name || right.id))
    );
  } else if (sort === 'name-desc') {
    filtered.sort((left, right) =>
      String(right.name || right.id).localeCompare(String(left.name || left.id))
    );
  } else if (sort === 'context-desc') {
    filtered.sort((left, right) =>
      getModelContextWindow(right) - getModelContextWindow(left)
    );
  } else if (sort === 'context-asc') {
    filtered.sort((left, right) =>
      getModelContextWindow(left) - getModelContextWindow(right)
    );
  } else if (sort === 'speed-desc') {
    filtered.sort((left, right) =>
      getModelBenchmarks(right).speed - getModelBenchmarks(left).speed
    );
  } else if (sort === 'intelligence-desc') {
    filtered.sort((left, right) =>
      getModelBenchmarks(right).intelligence - getModelBenchmarks(left).intelligence
    );
  }

  return filtered;
}

export function paginateModels(models, page, pageSize) {
  const total = models.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;

  return {
    items: models.slice(start, start + pageSize),
    page: safePage,
    pageCount,
    total
  };
}
