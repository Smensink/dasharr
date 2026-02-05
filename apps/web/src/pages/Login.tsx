import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { getPlexClientId } from '@/lib/plex-client-id';

export function Login() {
  const location = useLocation();
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [pinCode, setPinCode] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'redirecting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const returnTo = useMemo(() => {
    const state = location.state as { from?: { pathname?: string; search?: string } } | null;
    if (state?.from?.pathname) {
      return `${state.from.pathname}${state.from.search || ''}`;
    }
    return '/';
  }, [location.state]);

  const startAuth = useMutation({
    mutationFn: () => api.auth.startPlexAuth({ clientId: getPlexClientId() }),
    onSuccess: (data) => {
      setAuthUrl(data.authUrl);
      setPinCode(data.code || null);
      setStatus('redirecting');
      setErrorMessage(null);
      try {
        window.sessionStorage.setItem('dasharr-return-to', returnTo);
        if (data.code) {
          window.sessionStorage.setItem('dasharr-plex-pin-code', data.code);
        }
      } catch {
        // ignore storage failures
      }
      window.location.assign(data.authUrl);
    },
    onError: () => {
      setStatus('error');
      setErrorMessage('Failed to start Plex login.');
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background-elevated to-background p-6">
      <div className="w-full max-w-lg rounded-3xl border border-border/50 bg-card-elevated/70 backdrop-blur-xl p-8 shadow-2xl shadow-primary/10">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-3xl font-bold text-primary-foreground mx-auto">
            D
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Sign in with Plex</h1>
          <p className="text-sm text-muted-foreground">
            Authenticate with your Plex account to access Dasharr.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <button
            onClick={() => startAuth.mutate()}
            disabled={startAuth.isPending || status === 'redirecting'}
            className="w-full rounded-2xl py-3 text-sm font-bold bg-gradient-to-r from-primary to-accent text-primary-foreground hover:shadow-lg hover:shadow-primary/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'redirecting' ? 'Redirecting to Plex…' : 'Continue with Plex'}
          </button>

          {authUrl && (
            <div className="rounded-2xl border border-border/50 bg-background/60 p-4 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground mb-1">Need help?</p>
              <p>If you were not redirected, open the Plex login manually:</p>
              <a
                href={authUrl}
                className="text-primary font-semibold underline underline-offset-4"
              >
                Open Plex Login
              </a>
              {pinCode && (
                <div className="mt-3 text-xs">
                  Or go to <span className="font-semibold">plex.tv/link</span> and enter code:{' '}
                  <span className="font-mono font-bold">{pinCode}</span>
                </div>
              )}
            </div>
          )}

          {status === 'error' && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage || 'Login failed. Please try again.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
