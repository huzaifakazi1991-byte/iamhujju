'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { api } from '@/lib/client';

type Setting = { key: string; value: boolean };

const TOGGLES = [
  { key: 'signupsEnabled', label: 'New sign-ups enabled', help: 'When off, the signup endpoint refuses new accounts with 503.' },
  { key: 'playgroundEnabled', label: 'Playground enabled', help: 'Shown for future use — playground availability flag.' },
];

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Setting[] | null>(null);

  const load = useCallback(async () => {
    try { const d = await api<{ settings: Setting[] }>('/api/admin/settings'); setSettings(d.settings); }
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
      <h1 className="text-2xl font-extrabold tracking-tight">Platform settings</h1>
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
      </div>
    </div>
  );
}
