import { Alert, Button, Snackbar } from '@mui/material';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface Message {
  key: number;
  text: string;
  severity: 'success' | 'info' | 'warning' | 'error';
  retry?: () => void;
}

interface NotifyValue {
  notify: (text: string, severity?: Message['severity'], retry?: () => void) => void;
}

const Ctx = createContext<NotifyValue | null>(null);

/** One snackbar at a time; errors can offer a Retry action and stay until dismissed. */
export function NotifyProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<Message | null>(null);
  const [counter, setCounter] = useState(0);

  const notify = useCallback<NotifyValue['notify']>(
    (text, severity = 'info', retry) => {
      setCounter((c) => c + 1);
      setMsg({ key: counter + 1, text, severity, ...(retry ? { retry } : {}) });
    },
    [counter],
  );
  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Snackbar
        key={msg?.key}
        open={!!msg}
        autoHideDuration={msg?.severity === 'error' || msg?.retry ? null : 4500}
        onClose={(_e, reason) => reason !== 'clickaway' && setMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {msg ? (
          <Alert
            severity={msg.severity}
            variant="filled"
            onClose={() => setMsg(null)}
            action={
              msg.retry ? (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    const retry = msg.retry;
                    setMsg(null);
                    retry?.();
                  }}
                >
                  Retry
                </Button>
              ) : undefined
            }
            sx={{ width: '100%', alignItems: 'center' }}
          >
            {msg.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Ctx.Provider>
  );
}

export function useNotify(): NotifyValue['notify'] {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotify must be used inside NotifyProvider');
  return v.notify;
}
