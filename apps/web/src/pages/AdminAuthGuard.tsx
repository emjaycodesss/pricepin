/**
 * Protects admin routes: user enters admin token; backend validates via GET /admin/me.
 * Token is stored in sessionStorage and sent as X-Admin-Token on all admin API calls.
 * No secret in frontend bundle — ADMIN_TOKEN is set only in API .env.
 */
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { verifyAdminToken } from '../lib/adminApi';

const ADMIN_TOKEN_KEY = 'pricepin_admin_token';

/** Sync check: we consider authorized if we have a token in session (re-validated in useEffect). */
function getInitialAuthorized(): boolean {
  if (typeof window === 'undefined') return false;
  return !!sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

interface AdminAuthGuardProps {
  children: ReactNode;
}

export function AdminAuthGuard({ children }: AdminAuthGuardProps) {
  const [authorized, setAuthorized] = useState(getInitialAuthorized);
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);

  /** Re-validate stored token on mount so refresh doesn't keep a stale session. */
  useEffect(() => {
    if (!authorized) return;
    const stored = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (!stored) {
      setAuthorized(false);
      return;
    }
    let cancelled = false;
    verifyAdminToken(stored).then((ok) => {
      if (cancelled) return;
      if (!ok) {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        setAuthorized(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authorized]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('admin_token') as HTMLInputElement;
    const value = (input?.value ?? '').trim();
    if (!value) {
      setError('Enter the admin token.');
      return;
    }
    setError('');
    setValidating(true);
    try {
      const ok = await verifyAdminToken(value);
      if (ok) {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, value);
        setAuthorized(true);
      } else {
        setError('Invalid or expired token.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not verify. Check API is running and ADMIN_TOKEN is set.';
      setError(message);
    } finally {
      setValidating(false);
    }
  };

  if (authorized) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Admin Access</h1>
        <p className="text-sm text-gray-500 mb-4">Enter the admin token to continue.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            name="admin_token"
            autoComplete="current-password"
            placeholder="Admin token"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#EA000B] focus:outline-none focus:ring-1 focus:ring-[#EA000B]"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={validating}
            className="w-full rounded-xl bg-[#EA000B] py-2.5 text-sm font-semibold text-white hover:bg-[#c20009] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] disabled:opacity-50"
          >
            {validating ? 'Checking…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
