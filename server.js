import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Provider configuration - supports FreeLLMAPI, OpenAI, Anthropic, Google
const FREELLM_BASE = process.env.FREELLMAPI_BASE_URL || 'https://openrouter.ai/api/v1';
const FREELLM_KEY = process.env.FREELLMAPI_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';
const ALLOW_SHARED = process.env.ALLOW_SHARED_FREELLMAPI_KEY === 'true' || true;
const APP_ORIGIN = process.env.APP_ORIGIN || '*';

// Middleware
app.use(cors({
  origin: APP_ORIGIN === '*' ? '*' : [APP_ORIGIN],
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-OpenRouter-Title']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint (Render expects /health)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'iamhujju-backend', upstream: FREELLM_BASE });
});

// Models endpoint
app.get('/api/models', async (req, res) => {
  if (!FREELLM_KEY && !ALLOW_SHARED) {
    return res.status(503).json({ error: { message: 'Configure API key on backend.' } });
  }

  try {
    const response = await axios.get(`${FREELLM_BASE}/models`, {
      headers: FREELLM_KEY ? { Authorization: `Bearer ${FREELLM_KEY}`, 'X-OpenRouter-Title': 'iamhujju' } : {}
    });
    const models = response.data.data || response.data.models || [];
    res.json({
      object: 'list',
      models: [{ id: 'auto', name: 'Auto (Intelligent Routing)', provider: 'FreeLLM', available: true }, ...models],
      data: models
    });
  } catch (error) {
    console.error('Failed to fetch models:', error.message);
    res.status(502).json({ error: { message: 'Could not fetch models.' } });
  }
});

// Chat completions endpoint
app.post('/api/chat', async (req, res) => {
  const { model = 'auto', messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: { message: 'Messages array is required' } });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  try {
    const response = await axios.post(`${FREELLM_BASE}/chat/completions`, {
      model: model === 'auto' ? 'google/gemini-2.5-flash' : model,
      messages,
      stream: true,
      max_tokens: 4000
    }, {
      headers: { 
        'Authorization': `Bearer ${FREELLM_KEY}`, 
        'Content-Type': 'application/json',
        'X-OpenRouter-Title': 'iamhujju' 
      },
      responseType: 'stream'
    });

    response.data.on('data', (chunk) => res.write(chunk));
    response.data.on('end', () => res.end());
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: { message: error.message } })}\n\n`);
    res.end();
  }
});

app.listen(PORT, HOST, () => console.log(`Backend running on port ${PORT}`));
