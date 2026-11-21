'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type Toast = { id: number; message: string; kind: 'success' | 'error' | 'info' };
type Ctx = { toast: (message: string, kind?: Toast['kind']) => void };

const ToastCtx = createContext<Ctx>({ toast: () => undefined });

export function useToast() { return useContext(ToastCtx); }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              role="status"
              className={`card px-4 py-3 text-sm shadow-lg max-w-xs ${t.kind === 'error' ? 'border-red-300 dark:border-red-800' : t.kind === 'success' ? 'border-green-400 dark:border-green-800' : ''}`}
            >
              <span className="mr-2">{t.kind === 'error' ? '⚠️' : t.kind === 'success' ? '✅' : 'ℹ️'}</span>
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
