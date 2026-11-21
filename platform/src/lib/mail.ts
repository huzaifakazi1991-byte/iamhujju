import { env } from '@/lib/env';
import { prisma } from '@/lib/db';

export type Mail = { to: string; subject: string; text: string; html?: string };

export function mailConfigured(): boolean {
  return Boolean(env.resendApiKey || env.brevoApiKey);
}

async function sendViaResend(mail: Mail, from: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, ...(mail.html ? { html: mail.html } : {}) }),
  });
  if (!res.ok) console.error('[mail:resend]', res.status, (await res.text().catch(() => '')).slice(0, 200));
  return res.ok;
}

async function sendViaBrevo(mail: Mail, from: string): Promise<boolean> {
  const m = from.match(/^(.*)<(.+)>$/);
  const sender = m ? { name: m[1].trim() || 'IamHujju AI', email: m[2].trim() } : { name: 'IamHujju AI', email: from };
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.brevoApiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender,
      to: [{ email: mail.to }],
      subject: mail.subject,
      textContent: mail.text,
      ...(mail.html ? { htmlContent: mail.html } : {}),
    }),
  });
  if (!res.ok) console.error('[mail:brevo]', res.status, (await res.text().catch(() => '')).slice(0, 200));
  return res.ok;
}

export async function sendMail(mail: Mail): Promise<{ delivered: boolean }> {
  const from = env.mailFrom;
  let delivered = false;
  try {
    if (env.resendApiKey) delivered = await sendViaResend(mail, from);
    else if (env.brevoApiKey) delivered = await sendViaBrevo(mail, from);
  } catch (err) {
    console.error('[mail] delivery failed', err);
  }
  if (!delivered) {
    console.log('[mail:not-delivered]', mail.subject, '->', mail.to, mailConfigured() ? '(provider rejected — check MAIL_FROM/domain)' : '(no mail provider configured: set RESEND_API_KEY or BREVO_API_KEY)');
  }
  await prisma.platformSetting.create({
    data: { key: `mail:log:${Date.now()}`, value: { to: mail.to, subject: mail.subject, delivered } },
  }).catch(() => undefined);
  return { delivered };
}
