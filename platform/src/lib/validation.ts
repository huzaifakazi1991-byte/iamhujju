import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.');
export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters.').max(200);

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1, 'Name is required.').max(120),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
});

const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1).max(40000),
});
const imagePartSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string()
      .regex(/^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/, 'Only inline PNG/JPEG/WebP/GIF images are supported.')
      .max(5_600_000, 'Image is too large (max ~4 MB).'),
  }),
});
const contentSchema = z.union([
  z.string().min(1, 'Message content cannot be empty.').max(32000),
  z.array(z.union([textPartSchema, imagePartSchema])).min(1).max(10)
    .refine((parts) => parts.some((p) => p.type === 'text'), 'A text part is required.')
    .refine(
      (parts) => parts.reduce((n, p) => n + (p.type === 'text' ? p.text.length : 0), 0) <= 120000,
      'Attached text is too large (max ~120k characters per message).',
    )
    .refine(
      (parts) => parts.filter((p) => p.type === 'image_url').length <= 4,
      'Max 4 images per message.',
    ),
]);

export const chatSchema = z.object({
  model: z.string().trim().min(1).max(120),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: contentSchema,
  })).min(1).max(80),
  conversationId: z.string().trim().max(64).optional().nullable(),
  maxTokens: z.number().int().min(1).max(8192).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const providerCreateSchema = z.object({
  name: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes.'),
  kind: z.enum(['mock', 'gemini', 'google', 'mistral', 'openai', 'anthropic', 'groq', 'custom']).default('custom'),
  baseUrl: z.string().trim().url('Base URL must be a valid URL.').max(400).optional().or(z.literal('')),
  apiKey: z.string().trim().max(400).optional().or(z.literal('')),
});

export const providerUpdateSchema = z.object({
  apiKey: z.string().trim().max(400).optional(),
  enabled: z.boolean().optional(),
  baseUrl: z.string().trim().url().max(400).optional().or(z.literal('')),
});

export const modelUpsertSchema = z.object({
  providerId: z.string().min(1),
  slug: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dots, dashes and underscores.'),
  displayName: z.string().trim().min(1).max(120),
  contextWindow: z.number().int().min(512).max(10_000_000).default(8192),
  maxOutputTokens: z.number().int().min(16).max(100_000).default(4096),
  costPer1kInput: z.number().min(0).max(1000).default(0),
  costPer1kOutput: z.number().min(0).max(1000).default(0),
  tierRequired: z.enum(['free', 'pro', 'business']).default('free'),
  adminEnabled: z.boolean().default(false),
  displayOrder: z.number().int().min(0).max(10000).default(0),
});

export const planUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  priceMonthly: z.number().int().min(0).max(10_000_000).optional(),
  priceYearly: z.number().int().min(0).max(100_000_000).nullable().optional(),
  priceMonthlyInrPaise: z.number().int().min(0).max(100_000_000).nullable().optional(),
  priceYearlyInrPaise: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  dailyTokens: z.number().int().min(0).max(1_000_000_000).optional(),
  monthlyTokens: z.number().int().min(0).max(10_000_000_000).optional(),
  tokensPerMinute: z.number().int().min(60).max(10_000_000).optional(),
  requestsPerMin: z.number().int().min(1).max(100000).optional(),
  allowedModels: z.array(z.string().max(120)).max(200).optional(),
  isActive: z.boolean().optional(),
});

export const adminSettingsSchema = z.object({
  key: z.string().min(1).max(80),
  value: z.unknown(),
});

export const keyCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const checkoutSchema = z.object({
  planSlug: z.enum(['pro', 'business']),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
});
