'use client';

/**
 * src/app/reset-password/page.tsx
 *
 * Password reset page. User arrives here after clicking the reset link in their email.
 * They set a new password and are redirected to the main page.
 */

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseAuth } from '@/lib/auth';

function ResetPasswordContent() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  // Verify we have a valid session (user came from email link)
  useEffect(() => {
    const supabase = getSupabaseAuth();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/login?error=auth_failed');
      }
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      setStatus('error');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setError('');

    const supabase = getSupabaseAuth();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setStatus('error');
    } else {
      setStatus('success');
      setTimeout(() => router.push('/'), 2000);
    }
  }

  const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@600;700;800&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:        #FAF7F2;
  --surface:   #FFFFFF;
  --border:    #E8E0D4;
  --border-hi: #D6CFC4;
  --text:      #1C1917;
  --muted:     #78716C;
  --accent:    #CA8A04;
  --accent-lo: rgba(202, 138, 4, 0.12);
  --success:   #0D9488;
  --error:     #DC2626;
}

html, body { height: 100%; background: var(--bg); }

.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'DM Mono', monospace;
  background:
    radial-gradient(ellipse 80% 50% at 20% -10%, rgba(202,138,4,0.06) 0%, transparent 60%),
    radial-gradient(ellipse 60% 40% at 80% 110%, rgba(13,148,136,0.04) 0%, transparent 60%),
    var(--bg);
  padding: 24px;
}

.page::before {
  content: '';
  position: fixed; inset: 0;
  background-image:
    linear-gradient(var(--border) 1px, transparent 1px),
    linear-gradient(90deg, var(--border) 1px, transparent 1px);
  background-size: 40px 40px;
  opacity: 0.6;
  pointer-events: none;
}

.card {
  position: relative; z-index: 1;
  width: 100%; max-width: 400px;
  background: var(--surface);
  border: 1px solid var(--border-hi);
  border-radius: 4px;
  padding: 36px 40px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.02) inset;
  animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

.card::before {
  content: '';
  position: absolute; top: -1px; left: -1px;
  width: 40px; height: 40px;
  border-top: 2px solid var(--accent); border-left: 2px solid var(--accent);
  border-radius: 4px 0 0 0;
}
.card::after {
  content: '';
  position: absolute; bottom: -1px; right: -1px;
  width: 40px; height: 40px;
  border-bottom: 2px solid var(--accent); border-right: 2px solid var(--accent);
  border-radius: 0 0 4px 0;
}

h1 {
  font-family: 'Syne', sans-serif; font-weight: 700; font-size: 18px; color: var(--text);
  letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 8px;
}
p.sub { font-size: 12px; color: var(--muted); margin-bottom: 24px; }

/* Fields */
.field { margin-bottom: 14px; }
.field-label {
  display: block; font-size: 10px; font-weight: 500; color: var(--muted);
  letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 6px;
}
input[type="password"] {
  width: 100%; background: var(--surface); border: 1px solid var(--border-hi);
  border-radius: 4px; padding: 11px 13px;
  font-family: 'DM Mono', monospace; font-size: 13px; color: var(--text);
  outline: none; transition: border-color 0.15s, box-shadow 0.15s;
  caret-color: var(--accent);
}
input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-lo); }
input::placeholder { color: var(--border-hi); }
input.err { border-color: var(--error); box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12); }

.hint { font-size: 11px; color: var(--muted); margin-top: 5px; }
.hint.warn { color: var(--error); }

.btn {
  width: 100%; background: var(--text); color: #fff; border: none;
  border-radius: 4px; padding: 13px;
  font-family: 'Syne', sans-serif; font-weight: 700; font-size: 13px;
  letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
  transition: background 0.15s, transform 0.1s, opacity 0.15s;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 6px;
}
.btn:hover:not(:disabled) { background: #44403C; }
.btn:active:not(:disabled) { transform: scale(0.99); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.msg {
  border-radius: 4px; padding: 12px 14px;
  font-size: 12px; line-height: 1.6; margin-bottom: 14px;
}
.msg.success { background: rgba(13,148,136,0.08); border: 1px solid rgba(13,148,136,0.25); color: var(--success); }
.msg.error   { background: rgba(220,38,38,0.08);  border: 1px solid rgba(220,38,38,0.25);  color: var(--error); }
`;

  return (
    <div className="page">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="card">
        <h1>Reset Password</h1>
        <p className="sub">Enter your new password below.</p>

        {status === 'success' ? (
          <div className="msg success">
            ✓ Password updated successfully! Redirecting...
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="field-label">New Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="min 8 characters"
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label className="field-label">Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="repeat password"
                required
                className={confirm && password !== confirm ? 'err' : ''}
              />
              {confirm && password !== confirm && (
                <div className="hint warn">Passwords don&apos;t match</div>
              )}
            </div>

            {status === 'error' && (
              <div className="msg error">
                ✕ {error}
              </div>
            )}

            <button
              type="submit"
              className="btn"
              disabled={status === 'loading' || !password || !confirm || password !== confirm}
            >
              {status === 'loading' ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF7F2' }}>
        <div style={{ color: '#78716C', fontFamily: 'monospace', fontSize: 13 }}>Loading...</div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
