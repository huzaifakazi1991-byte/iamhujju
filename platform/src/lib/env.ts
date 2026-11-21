export const env = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-insecure-jwt-secret-change-me-please-32ch',
  appUrl: process.env.APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  keyEncryptionSecret: process.env.KEY_ENCRYPTION_SECRET ?? process.env.JWT_SECRET ?? 'dev-only-insecure-key-secret-change-me',
  redisUrl: process.env.REDIS_URL ?? '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  smtpUrl: process.env.SMTP_URL ?? '',
  isProd: process.env.NODE_ENV === 'production',
};
