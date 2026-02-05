import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { getPlexClientId } from '@/lib/plex-client-id';

type CallbackStatus = 'waiting' | 'authorized' | 'expired' | 'error';

export function PlexCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<CallbackStatus>('waiting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const state = params.get('state');
  const pinId = params.get('pinId');
  const returnTo = useMemo(() => {
    try {
      const stored = window.sessionStorage.getItem('dasharr-return-to');
      if (stored) return stored;
    } catch {
      // ignore storage failures
    }
    return '/';
  }, []);

  const pinCode = useMemo(() => {
    try {
      return window.sessionStorage.getItem('dasharr-plex-pin-code');
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!state || !pinId) {
      setStatus('error');
      setErrorMessage('Missing Plex auth details. Please try again.');
      return;
    }

    let polling = true;

    const check = async () => {
      if (!polling) return;
      try {
        const result = await api.auth.completePlexAuth({
          state,
          pinId,
          clientId: getPlexClientId(),
        });

        if (result?.status === 'authorized') {
          polling = false;
          setStatus('authorized');
          queryClient.invalidateQueries({ queryKey: ['auth'] });
          try {
            window.sessionStorage.removeItem('dasharr-return-to');
          } catch {
            // ignore storage failures
          }
          navigate(returnTo, { replace: true });
          return;
        }

        if (result?.status === 'expired') {
          polling = false;
          setStatus('expired');
        }
      } catch (err) {
        polling = false;
        setStatus('error');
        setErrorMessage('Plex login failed. Please try again.');
      }
    };

    check();
    const interval = setInterval(check, 5000);

    return () => {
      polling = false;
      clearInterval(interval);
    };
  }, [navigate, pinId, queryClient, returnTo, state]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background-elevated to-background p-6">
      <div className="w-full max-w-lg rounded-3xl border border-border/50 bg-card-elevated/70 backdrop-blur-xl p-8 shadow-2xl shadow-primary/10">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-3xl font-bold text-primary-foreground mx-auto">
            D
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Completing Plex Login</h1>
          <p className="text-sm text-muted-foreground">
            {status === 'waiting' && 'Waiting for Plex authorization…'}
            {status === 'authorized' && 'Login successful. Redirecting…'}
            {status === 'expired' && 'Session expired. Please start again.'}
            {status === 'error' && (errorMessage || 'Login failed. Please try again.')}
          </p>
        </div>

        <div className="mt-6 space-y-4 text-sm text-muted-foreground">
          {pinCode && status === 'waiting' && (
            <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
              <p className="font-semibold text-foreground mb-1">Manual fallback</p>
              <p>
                Open <span className="font-semibold">plex.tv/link</span> and enter code:{' '}
                <span className="font-mono font-bold">{pinCode}</span>
              </p>
            </div>
          )}

          {status !== 'waiting' && status !== 'authorized' && (
            <a
              href="/login"
              className="w-full block text-center rounded-2xl py-3 text-sm font-bold bg-gradient-to-r from-primary to-accent text-primary-foreground hover:shadow-lg hover:shadow-primary/30 transition-all"
            >
              Back to Login
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
