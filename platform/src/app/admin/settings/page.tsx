'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { api } from '@/lib/client';

type Setting = { key: string; value: boolean };
type MailLog = { to: string; subject: string; delivered: boolean };

const TOGGLES = [
  { key: 'signupsEnabled', label: 'New sign-ups enabled', help: 'When off, the signup endpoint refuses new accounts with 503.' },
  { key: 'playgroundEnabled', label: 'Playground enabled', help: 'Shown for future use — playground availability flag.' },
];

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Setting[] | null>(null);
  const [mailLogs, setMailLogs] = useState<MailLog[] | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ settings: Setting[]; mailLogs: MailLog[] }>('/api/admin/settings');
      setSettings(d.settings); setMailLogs(d.mailLogs);
    }
    catch (err) { toast(err instanceof Error ? err.message : 'Load failed', 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function toggle(key: string, current: boolean | undefined) {
    const value = !(current ?? true);
    try {
      const d = await api<{ setting: Setting }>('/api/admin/settings', { method: 'POST', body: JSON.stringify({ key, value }) });
      setSettings((s) => [...(s ?? []).filter((x) => x.key !== key), d.setting].sort((a, b) => a.key.localeCompare(b.key)));
      toast(`${key} → ${value}`, 'success');
    } catch (err) { toast(err instanceof Error ? err.message : 'Update failed', 'error'); }
  }

  const val = (key: string) => settings?.find((s) => s.key === key)?.value ?? true;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Platform settings</h1>
      <p className="mt-1 mb-8 text-sm text-ink-soft dark:text-white/60">Feature flags stored in the database and enforced server-side.</p>
      <div className="grid gap-4">
        {TOGGLES.map((t) => (
          <div key={t.key} className="card flex items-center justify-between p-6">
            <div>
              <p className="font-bold">{t.label}</p>
              <p className="mt-0.5 text-xs text-ink-soft dark:text-white/55">{t.help}</p>
            </div>
            <button
              className={`rounded-full px-4 py-1.5 text-xs font-semibold ${val(t.key) ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' : 'bg-black/10 dark:bg-white/10'}`}
              onClick={() => toggle(t.key, val(t.key))}
            >
              {val(t.key) ? 'on' : 'off'}
            </button>
          </div>
        ))}

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">Email delivery</p>
              <p className="mt-0.5 text-xs text-ink-soft dark:text-white/55">Last 50 OTP/receipt send attempts from your mail provider. "delivered" means the provider accepted the email.</p>
            </div>
            <button className="btn-ghost px-4 py-1.5 text-xs" onClick={() => void load()}>Refresh</button>
          </div>
          {!mailLogs && <div className="skeleton mt-4 h-20" />}
          {mailLogs?.length === 0 && <p className="mt-4 text-sm text-ink-soft dark:text-white/55">No emails sent yet. Trigger a signup to see the first OTP attempt.</p>}
          {mailLogs && mailLogs.length > 0 && (
            <ul className="mt-4 divide-y divide-black/5 dark:divide-white/10">
              {mailLogs.map((m, i) => (
                <li key={`${m.to}-${m.subject}-${i}`} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.subject}</p>
                    <p className="truncate text-xs text-ink-soft dark:text-white/55">to {m.to}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${m.delivered ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200'}`}>{m.delivered ? 'delivered' : 'FAILED'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
