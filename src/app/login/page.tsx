'use client';

/**
 * src/app/login/page.tsx
 *
 * Login page — Magic link auth restricted to @seple.in emails.
 * Clean industrial aesthetic matching the Dexter HMS brand.
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { sendMagicLink, isAllowedEmail, getSession } from '@/lib/auth';

const ERROR_MESSAGES: Record<string, string> = {
    missing_code: 'Invalid login link. Please request a new one.',
    auth_failed: 'Authentication failed. Please try again.',
    unauthorized_domain: 'Access restricted to @seple.in email addresses only.',
};

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [domainErr, setDomainErr] = useState(false);

    // If already logged in, redirect to app
    useEffect(() => {
        getSession().then(session => {
            if (session) router.replace('/');
        });
    }, [router]);

    // Show error from auth callback redirect
    useEffect(() => {
        const err = searchParams.get('error');
        if (err && ERROR_MESSAGES[err]) {
            setStatus('error');
            setErrorMsg(ERROR_MESSAGES[err]);
        }
    }, [searchParams]);

    function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
        const val = e.target.value;
        setEmail(val);
        // Live domain hint
        if (val.includes('@') && !isAllowedEmail(val) && val.length > 6) {
            setDomainErr(true);
        } else {
            setDomainErr(false);
        }
        if (status === 'error') { setStatus('idle'); setErrorMsg(''); }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim()) return;

        setStatus('loading');
        setErrorMsg('');

        const { error } = await sendMagicLink(email);
        if (error) {
            setStatus('error');
            setErrorMsg(error);
        } else {
            setStatus('sent');
        }
    }

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:        #0a0c0f;
          --surface:   #111318;
          --border:    #1e2128;
          --border-hi: #2e3340;
          --text:      #e8eaf0;
          --muted:     #5a6070;
          --accent:    #f97316;
          --accent-lo: rgba(249,115,22,0.12);
          --success:   #22d3a8;
          --error:     #f43f5e;
        }

        html, body { height: 100%; background: var(--bg); }

        .page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'DM Mono', monospace;
          background:
            radial-gradient(ellipse 80% 50% at 20% -10%, rgba(249,115,22,0.06) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 110%, rgba(34,211,168,0.04) 0%, transparent 60%),
            var(--bg);
          padding: 24px;
        }

        /* Grid texture */
        .page::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px);
          background-size: 40px 40px;
          opacity: 0.35;
          pointer-events: none;
        }

        .card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          background: var(--surface);
          border: 1px solid var(--border-hi);
          border-radius: 2px;
          padding: 40px;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.03) inset,
            0 32px 64px rgba(0,0,0,0.5);
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Corner accent */
        .card::before {
          content: '';
          position: absolute;
          top: -1px; left: -1px;
          width: 40px; height: 40px;
          border-top: 2px solid var(--accent);
          border-left: 2px solid var(--accent);
          border-radius: 2px 0 0 0;
        }
        .card::after {
          content: '';
          position: absolute;
          bottom: -1px; right: -1px;
          width: 40px; height: 40px;
          border-bottom: 2px solid var(--accent);
          border-right: 2px solid var(--accent);
          border-radius: 0 0 2px 0;
        }

        .logo-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 32px;
        }

        .logo-icon {
          width: 32px; height: 32px;
          background: var(--accent);
          border-radius: 2px;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 14px;
          color: #fff;
          letter-spacing: -0.5px;
          flex-shrink: 0;
        }

        .logo-text {
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          font-size: 16px;
          color: var(--text);
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .logo-sub {
          font-size: 10px;
          color: var(--muted);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-top: 1px;
        }

        .divider {
          width: 1px;
          height: 28px;
          background: var(--border-hi);
          margin: 0 4px;
        }

        h1 {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 22px;
          color: var(--text);
          letter-spacing: -0.02em;
          line-height: 1.2;
          margin-bottom: 6px;
        }

        .subtitle {
          font-size: 12px;
          color: var(--muted);
          letter-spacing: 0.02em;
          margin-bottom: 28px;
          line-height: 1.5;
        }

        .field-label {
          display: block;
          font-size: 10px;
          font-weight: 500;
          color: var(--muted);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .input-wrap {
          position: relative;
          margin-bottom: 6px;
        }

        input[type="email"] {
          width: 100%;
          background: var(--bg);
          border: 1px solid var(--border-hi);
          border-radius: 2px;
          padding: 12px 14px;
          font-family: 'DM Mono', monospace;
          font-size: 13px;
          color: var(--text);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          caret-color: var(--accent);
        }

        input[type="email"]:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-lo);
        }

        input[type="email"]::placeholder { color: var(--muted); }

        input[type="email"].error-input {
          border-color: var(--error);
          box-shadow: 0 0 0 3px rgba(244,63,94,0.12);
        }

        .domain-hint {
          font-size: 11px;
          color: var(--muted);
          margin-bottom: 20px;
          margin-top: 6px;
        }
        .domain-hint.warn { color: var(--error); }

        .btn {
          width: 100%;
          background: var(--accent);
          color: #fff;
          border: none;
          border-radius: 2px;
          padding: 13px;
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s, opacity 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .btn:hover:not(:disabled) { background: #ea6c10; }
        .btn:active:not(:disabled) { transform: scale(0.99); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .spinner {
          width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .message-box {
          border-radius: 2px;
          padding: 14px;
          font-size: 12px;
          line-height: 1.6;
          margin-top: 16px;
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }

        .message-box.success {
          background: rgba(34,211,168,0.08);
          border: 1px solid rgba(34,211,168,0.25);
          color: var(--success);
        }

        .message-box.error {
          background: rgba(244,63,94,0.08);
          border: 1px solid rgba(244,63,94,0.25);
          color: var(--error);
        }

        .msg-icon { flex-shrink: 0; font-size: 14px; margin-top: 1px; }

        .footer-note {
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid var(--border);
          font-size: 11px;
          color: var(--muted);
          text-align: center;
          line-height: 1.6;
        }

        .tag {
          display: inline-block;
          background: rgba(249,115,22,0.1);
          color: var(--accent);
          border: 1px solid rgba(249,115,22,0.2);
          border-radius: 2px;
          padding: 1px 6px;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          vertical-align: middle;
          margin-left: 4px;
        }
      `}</style>

            <div className="page">
                <div className="card">
                    {/* Logo */}
                    <div className="logo-row">
                        <div className="logo-icon">DX</div>
                        <div className="divider" />
                        <div>
                            <div className="logo-text">Dexter HMS</div>
                            <div className="logo-sub">Industrial Support Bot</div>
                        </div>
                    </div>

                    {status === 'sent' ? (
                        /* ── Sent state ───────────────────────────────────────── */
                        <>
                            <h1>Check your inbox</h1>
                            <p className="subtitle">
                                We sent a login link to<br />
                                <strong style={{ color: 'var(--text)' }}>{email}</strong>
                            </p>
                            <div className="message-box success">
                                <span className="msg-icon">✓</span>
                                <span>
                                    Click the link in the email to sign in.
                                    The link expires in 1 hour. Check your spam folder if you don't see it.
                                </span>
                            </div>
                            <div className="footer-note">
                                Wrong email?{' '}
                                <button
                                    onClick={() => { setStatus('idle'); setEmail(''); }}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
                                >
                                    Try again
                                </button>
                            </div>
                        </>
                    ) : (
                        /* ── Login form ───────────────────────────────────────── */
                        <>
                            <h1>Sign in</h1>
                            <p className="subtitle">
                                Access restricted to SEPLe employees.
                                We'll email you a one-time login link.
                            </p>

                            <form onSubmit={handleSubmit}>
                                <label className="field-label" htmlFor="email">
                                    Work Email
                                </label>

                                <div className="input-wrap">
                                    <input
                                        id="email"
                                        type="email"
                                        placeholder="yourname@seple.in"
                                        value={email}
                                        onChange={handleEmailChange}
                                        className={domainErr ? 'error-input' : ''}
                                        autoComplete="email"
                                        autoFocus
                                        disabled={status === 'loading'}
                                        required
                                    />
                                </div>

                                <div className={`domain-hint ${domainErr ? 'warn' : ''}`}>
                                    {domainErr
                                        ? '⚠ Only @seple.in addresses are permitted'
                                        : 'Only @seple.in addresses are permitted'
                                    }
                                </div>

                                {status === 'error' && (
                                    <div className="message-box error" style={{ marginBottom: 16, marginTop: 0 }}>
                                        <span className="msg-icon">✕</span>
                                        <span>{errorMsg}</span>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className="btn"
                                    disabled={status === 'loading' || !email.trim() || domainErr}
                                >
                                    {status === 'loading' ? (
                                        <><div className="spinner" /> Sending link…</>
                                    ) : (
                                        'Send Login Link'
                                    )}
                                </button>
                            </form>

                            <div className="footer-note">
                                Passwordless login <span className="tag">Magic Link</span><br />
                                No password needed — just click the email link.
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}