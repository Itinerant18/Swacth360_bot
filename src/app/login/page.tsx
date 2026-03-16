'use client';

/**
 * src/app/login/page.tsx
 *
 * Two-tab auth page: Sign In (email+password) and Register (name, phone, email, password).
 * Open registration — any valid email. Admin email routed to /admin after sign-in.
 */

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { login, register, resendConfirmation, resetPassword, getSession } from '@/lib/auth';

const ERROR_MESSAGES: Record<string, string> = {
    missing_code: 'Invalid or expired confirmation link. Please request a new one.',
    auth_failed: 'Authentication failed. Please try again.',
    unauthorized_domain: 'Access restricted. Please contact support.',
};

// ── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:        #f8f7f3;
  --surface:   #ffffff;
  --border:    #e0dcd4;
  --border-hi: #d0ccc4;
  --text:      #1a1a1a;
  --muted:     #666666;
  --accent:    #0066cc;
  --accent-lo: rgba(0, 102, 204, 0.1);
  --success:   #00a854;
  --error:     #d32f2f;
}

html, body { height: 100%; background: var(--bg); }

.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif;
  background:
    radial-gradient(ellipse 80% 50% at 20% -10%, rgba(0,102,204,0.05) 0%, transparent 60%),
    radial-gradient(ellipse 60% 40% at 80% 110%, rgba(14,147,132,0.03) 0%, transparent 60%),
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
  opacity: 0.04;
  pointer-events: none;
}

.card {
  position: relative; z-index: 1;
  width: 100%; max-width: 440px;
  background: var(--surface);
  border: 1px solid var(--border-hi);
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 8px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.5);
  animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

.card::before {
  content: '';
  position: absolute; top: -1px; left: 0;
  width: 120px; height: 2px;
  background: linear-gradient(90deg, var(--accent) 0%, transparent 100%);
  border-radius: 0;
}
.card::after {
  content: '';
  position: absolute; bottom: -1px; right: 0;
  width: 120px; height: 2px;
  background: linear-gradient(90deg, transparent 0%, var(--accent) 100%);
  border-radius: 0;
}

.logo-row { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
.logo-icon {
  width: 40px; height: 40px; background: linear-gradient(135deg, var(--accent) 0%, #0052a3 100%); border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; font-weight: 700; font-size: 16px; color: #fff;
  letter-spacing: -0.5px; flex-shrink: 0;
}
.logo-text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; font-weight: 700; font-size: 18px; color: var(--text); letter-spacing: -0.02em; }
.logo-sub { font-size: 12px; color: var(--muted); letter-spacing: 0; margin-top: 2px; font-weight: 400; }
.divider-v { width: 1px; height: 32px; background: var(--border-hi); margin: 0 8px; }

/* Tabs */
.tabs { display: flex; border-bottom: 1px solid var(--border-hi); margin-bottom: 28px; gap: 0; }
.tab-btn {
  flex: 1; padding: 12px 0;
  font-family: 'Trebuchet MS', 'Segoe UI', sans-serif; font-size: 13px; font-weight: 600;
  letter-spacing: -0.01em; text-transform: capitalize; cursor: pointer;
  background: none; border: none; color: var(--muted);
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.tab-btn.active { color: var(--text); border-bottom-color: var(--accent); }
.tab-btn:hover:not(.active) { color: var(--text); }

/* Fields */
.field { margin-bottom: 16px; }
.field-label {
  display: block; font-size: 12px; font-weight: 600; color: var(--text);
  letter-spacing: -0.01em; margin-bottom: 8px;
}
input[type="text"], input[type="email"], input[type="password"], input[type="tel"] {
  width: 100%; background: #faf9f6; border: 1px solid var(--border-hi);
  border-radius: 8px; padding: 12px 14px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; font-size: 14px; color: var(--text);
  outline: none; transition: border-color 0.15s, box-shadow 0.15s;
  caret-color: var(--accent);
}
input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-lo); background: #ffffff; }
input::placeholder { color: var(--muted); }
input.err { border-color: var(--error); box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.12); }

.hint { font-size: 12px; color: var(--muted); margin-top: 6px; }
.hint.warn { color: var(--error); }

.row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.btn {
  width: 100%; background: linear-gradient(135deg, var(--accent) 0%, #0052a3 100%); color: #fff; border: none;
  border-radius: 8px; padding: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; font-weight: 600; font-size: 14px;
  letter-spacing: -0.01em; cursor: pointer;
  transition: all 0.2s ease;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 8px;
}
.btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 16px rgba(0, 102, 204, 0.15); }
.btn:active:not(:disabled) { transform: scale(0.98); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.spinner {
  width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff; border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.msg {
  border-radius: 8px; padding: 12px 14px;
  font-size: 13px; line-height: 1.6; margin-top: 16px;
  display: flex; gap: 10px; align-items: flex-start;
}
.msg.success { background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); color: var(--success); }
.msg.error   { background: rgba(239,68,68,0.12);  border: 1px solid rgba(239,68,68,0.3);  color: var(--error); }
.msg.info    { background: rgba(59,130,246,0.12);  border: 1px solid rgba(59,130,246,0.3);  color: var(--accent); }
.msg-icon { flex-shrink: 0; font-size: 14px; }

.footer-note {
  margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border);
  font-size: 12px; color: var(--muted); text-align: center; line-height: 1.6;
}

.link-btn {
  background: none; border: none; color: var(--accent); cursor: pointer;
  font-family: inherit; font-size: 12px; text-decoration: none;
  padding: 0; transition: color 0.15s;
}
.link-btn:hover { color: #60a5fa; text-decoration: underline; }
`;

// ── Inner component (uses useSearchParams, must be in Suspense) ───────────────
function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [tab, setTab] = useState<'signin' | 'register'>('signin');

    // Sign-in state
    const [siEmail, setSiEmail] = useState('');
    const [siPass, setSiPass] = useState('');
    const [siStatus, setSiStatus] = useState<'idle' | 'loading' | 'error'>('idle');
    const [siError, setSiError] = useState('');
    const [needsConfirmation, setNeedsConfirmation] = useState(false);
    const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const [resendMsg, setResendMsg] = useState('');

    // Forgot password state
    const [showForgot, setShowForgot] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotStatus, setForgotStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
    const [forgotMsg, setForgotMsg] = useState('');

    // Register state
    const [rName, setRName] = useState('');
    const [rPhone, setRPhone] = useState('');
    const [rEmail, setREmail] = useState('');
    const [rPass, setRPass] = useState('');
    const [rPass2, setRPass2] = useState('');
    const [rStatus, setRStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [rError, setRError] = useState('');

    // Redirect if already logged in
    useEffect(() => {
        getSession().then(session => {
            if (session) {
                const email = session.user.email ?? '';
                router.replace(email.toLowerCase() === 'aniket.karmakar@seple.in' ? '/admin' : '/');
            }
        });
    }, [router]);

    const err = searchParams.get('error');
    const confirmed = searchParams.get('confirmed');
    const globalMsg = err && ERROR_MESSAGES[err]
        ? { type: 'error' as const, text: ERROR_MESSAGES[err] }
        : confirmed === '1'
            ? { type: 'info' as const, text: 'Email confirmed! Sign in below with your password.' }
            : null;

    // ── Sign In submit ────────────────────────────────────────────────────────
    async function handleSignIn(e: React.FormEvent) {
        e.preventDefault();
        if (!siEmail || !siPass) return;
        setSiStatus('loading');
        setSiError('');
        setNeedsConfirmation(false);
        setResendStatus('idle');
        setResendMsg('');
        const { error, needsConfirmation: nc, redirectTo } = await login(siEmail, siPass);
        if (error) {
            setSiStatus('error');
            setSiError(error);
            setNeedsConfirmation(nc ?? false);
        } else {
            router.push(redirectTo ?? '/');
        }
    }

    // ── Resend confirmation email ─────────────────────────────────────────────
    async function handleResend() {
        if (!siEmail || resendStatus === 'sending' || resendStatus === 'sent') return;
        setResendStatus('sending');
        const { error } = await resendConfirmation(siEmail);
        if (error) {
            setResendStatus('error');
            setResendMsg(error);
        } else {
            setResendStatus('sent');
            setResendMsg(`Confirmation email sent to ${siEmail}. Check your inbox.`);
        }
    }

    // ── Forgot password ───────────────────────────────────────────────────────
    async function handleForgotPassword(e: React.FormEvent) {
        e.preventDefault();
        if (!forgotEmail) return;
        setForgotStatus('loading');
        setForgotMsg('');
        const { error } = await resetPassword(forgotEmail);
        if (error) {
            setForgotStatus('error');
            setForgotMsg(error);
        } else {
            setForgotStatus('sent');
            setForgotMsg(`Password reset email sent to ${forgotEmail}. Check your inbox.`);
        }
    }

    // ── Register submit ───────────────────────────────────────────────────────
    async function handleRegister(e: React.FormEvent) {
        e.preventDefault();
        if (rPass !== rPass2) { setRError('Passwords do not match.'); setRStatus('error'); return; }
        setRStatus('loading');
        setRError('');
        const { error } = await register(rEmail, rPass, rName, rPhone);
        if (error) {
            setRStatus('error');
            setRError(error);
        } else {
            setRStatus('success');
        }
    }

    return (
        <div className="page">
            <div className="card">
                {/* Logo */}
                <div className="logo-row">
                    <div className="logo-icon">DX</div>
                    <div className="divider-v" />
                    <div>
                        <div className="logo-text">Dexter HMS</div>
                        <div className="logo-sub">Industrial Support Bot</div>
                    </div>
                </div>

                {/* Global message (confirmed / error from URL) */}
                {globalMsg && (
                    <div className={`msg ${globalMsg.type}`} style={{ marginBottom: 16 }}>
                        <span className="msg-icon">{globalMsg.type === 'info' ? '\u2713' : '\u2715'}</span>
                        <span>{globalMsg.text}</span>
                    </div>
                )}

                {/* Forgot Password View */}
                {showForgot ? (
                    <>
                        <div style={{ marginBottom: 20 }}>
                            <button className="link-btn" onClick={() => { setShowForgot(false); setForgotStatus('idle'); }}>
                                &larr; Back to Sign In
                            </button>
                        </div>
                        <form onSubmit={handleForgotPassword}>
                            <div className="field">
                                <label className="field-label" htmlFor="forgot-email">Email Address</label>
                                <input
                                    id="forgot-email" type="email" placeholder="you@example.com"
                                    value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                                    disabled={forgotStatus === 'loading' || forgotStatus === 'sent'}
                                    autoComplete="email" autoFocus required
                                />
                            </div>
                            {forgotStatus === 'sent' && (
                                <div className="msg success">
                                    <span className="msg-icon">{'\u2713'}</span>
                                    <span>{forgotMsg}</span>
                                </div>
                            )}
                            {forgotStatus === 'error' && (
                                <div className="msg error">
                                    <span className="msg-icon">{'\u2715'}</span>
                                    <span>{forgotMsg}</span>
                                </div>
                            )}
                            {forgotStatus !== 'sent' && (
                                <button type="submit" className="btn" disabled={forgotStatus === 'loading' || !forgotEmail}>
                                    {forgotStatus === 'loading' ? <><div className="spinner" /> Sending...</> : 'Send Reset Link'}
                                </button>
                            )}
                        </form>
                    </>
                ) : (
                    <>
                        {/* Tabs */}
                        <div className="tabs">
                            <button className={`tab-btn ${tab === 'signin' ? 'active' : ''}`} onClick={() => setTab('signin')}>Sign In</button>
                            <button className={`tab-btn ${tab === 'register' ? 'active' : ''}`} onClick={() => setTab('register')}>Register</button>
                        </div>

                        {/* ── Sign In Tab ────────────────────────────────────────────── */}
                        {tab === 'signin' && (
                            <>
                                {rStatus === 'success' && (
                                    <div className="msg info" style={{ marginBottom: 16 }}>
                                        <span className="msg-icon">{'\u2713'}</span>
                                        <span>Registration successful! Check your email to confirm your account, then sign in here.</span>
                                    </div>
                                )}
                                <form onSubmit={handleSignIn}>
                                    <div className="field">
                                        <label className="field-label" htmlFor="si-email">Email</label>
                                        <input
                                            id="si-email" type="email" placeholder="you@example.com"
                                            value={siEmail}
                                            onChange={e => {
                                                setSiEmail(e.target.value);
                                                if (siStatus === 'error') {
                                                    setSiStatus('idle');
                                                    setSiError('');
                                                    setNeedsConfirmation(false);
                                                    setResendStatus('idle');
                                                }
                                            }}
                                            disabled={siStatus === 'loading'}
                                            autoComplete="email" autoFocus required
                                        />
                                    </div>
                                    <div className="field">
                                        <label className="field-label" htmlFor="si-pass">Password</label>
                                        <input
                                            id="si-pass" type="password" placeholder="********"
                                            value={siPass} onChange={e => setSiPass(e.target.value)}
                                            disabled={siStatus === 'loading'}
                                            autoComplete="current-password" required
                                        />
                                    </div>

                                    {/* Forgot password link */}
                                    <div style={{ textAlign: 'right', marginBottom: 6 }}>
                                        <button type="button" className="link-btn" onClick={() => { setShowForgot(true); setForgotEmail(siEmail); }}>
                                            Forgot password?
                                        </button>
                                    </div>

                                    {/* Standard error (wrong password, no account, etc.) */}
                                    {siStatus === 'error' && !needsConfirmation && (
                                        <div className="msg error">
                                            <span className="msg-icon">{'\u2715'}</span>
                                            <span>{siError}</span>
                                        </div>
                                    )}

                                    {/* Email not confirmed — show resend option */}
                                    {siStatus === 'error' && needsConfirmation && (
                                        <div className="msg error" style={{ flexDirection: 'column', gap: 10 }}>
                                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                                <span className="msg-icon">{'\u2715'}</span>
                                                <span>{siError}</span>
                                            </div>
                                            {resendStatus === 'sent' ? (
                                                <div style={{ fontSize: 11, color: 'var(--success)', paddingLeft: 24 }}>
                                                    {'\u2713'} {resendMsg}
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={handleResend}
                                                    disabled={resendStatus === 'sending'}
                                                    style={{
                                                        background: 'transparent',
                                                        border: '1px solid var(--error)',
                                                        borderRadius: 2,
                                                        color: 'var(--error)',
                                                        fontSize: 11,
                                                        fontFamily: 'inherit',
                                                        letterSpacing: '0.08em',
                                                        textTransform: 'uppercase' as const,
                                                        cursor: resendStatus === 'sending' ? 'not-allowed' : 'pointer',
                                                        padding: '6px 12px',
                                                        marginLeft: 24,
                                                        opacity: resendStatus === 'sending' ? 0.6 : 1,
                                                    }}
                                                >
                                                    {resendStatus === 'sending' ? 'Sending...' : 'Resend confirmation email'}
                                                </button>
                                            )}
                                            {resendStatus === 'error' && (
                                                <div style={{ fontSize: 11, color: 'var(--error)', paddingLeft: 24 }}>
                                                    {resendMsg}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <button type="submit" className="btn" disabled={siStatus === 'loading' || !siEmail || !siPass}>
                                        {siStatus === 'loading' ? <><div className="spinner" /> Signing in...</> : 'Sign In'}
                                    </button>
                                </form>
                                <div className="footer-note">
                                    No account yet?{' '}
                                    <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setTab('register')}>Register here</span>
                                </div>
                            </>
                        )}

                        {/* ── Register Tab ──────────────────────────────────────────── */}
                        {tab === 'register' && (
                            <>
                                {rStatus === 'success' ? (
                                    <>
                                        <div className="msg success">
                                            <span className="msg-icon">{'\u2713'}</span>
                                            <span>
                                                Account created! We sent a confirmation link to <strong>{rEmail}</strong>.
                                                Click the link, then come back to Sign In.
                                            </span>
                                        </div>
                                        <div className="footer-note">
                                            <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setTab('signin')}>&larr; Back to Sign In</span>
                                        </div>
                                    </>
                                ) : (
                                    <form onSubmit={handleRegister}>
                                        <div className="row-2">
                                            <div className="field">
                                                <label className="field-label" htmlFor="r-name">Full Name</label>
                                                <input id="r-name" type="text" placeholder="John Doe"
                                                    value={rName} onChange={e => setRName(e.target.value)}
                                                    disabled={rStatus === 'loading'} autoComplete="name" required />
                                            </div>
                                            <div className="field">
                                                <label className="field-label" htmlFor="r-phone">Phone</label>
                                                <input id="r-phone" type="tel" placeholder="+91 98765 43210"
                                                    value={rPhone} onChange={e => setRPhone(e.target.value)}
                                                    disabled={rStatus === 'loading'} autoComplete="tel" />
                                            </div>
                                        </div>
                                        <div className="field">
                                            <label className="field-label" htmlFor="r-email">Email</label>
                                            <input id="r-email" type="email" placeholder="you@example.com"
                                                value={rEmail} onChange={e => setREmail(e.target.value)}
                                                disabled={rStatus === 'loading'} autoComplete="email" required />
                                        </div>
                                        <div className="row-2">
                                            <div className="field">
                                                <label className="field-label" htmlFor="r-pass">Password</label>
                                                <input id="r-pass" type="password" placeholder="min 8 chars"
                                                    value={rPass} onChange={e => setRPass(e.target.value)}
                                                    disabled={rStatus === 'loading'} autoComplete="new-password" required />
                                            </div>
                                            <div className="field">
                                                <label className="field-label" htmlFor="r-pass2">Confirm</label>
                                                <input id="r-pass2" type="password" placeholder="repeat"
                                                    value={rPass2} onChange={e => setRPass2(e.target.value)}
                                                    className={rPass2 && rPass !== rPass2 ? 'err' : ''}
                                                    disabled={rStatus === 'loading'} autoComplete="new-password" required />
                                                {rPass2 && rPass !== rPass2 && (
                                                    <div className="hint warn">Passwords don&apos;t match</div>
                                                )}
                                            </div>
                                        </div>
                                        {rStatus === 'error' && (
                                            <div className="msg error">
                                                <span className="msg-icon">{'\u2715'}</span>
                                                <span>{rError}</span>
                                            </div>
                                        )}
                                        <button
                                            type="submit" className="btn"
                                            disabled={rStatus === 'loading' || !rName || !rEmail || !rPass || !rPass2 || rPass !== rPass2}
                                        >
                                            {rStatus === 'loading' ? <><div className="spinner" /> Creating account...</> : 'Create Account'}
                                        </button>
                                        <div className="footer-note">
                                            Already have an account?{' '}
                                            <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setTab('signin')}>Sign in here</span>
                                        </div>
                                    </form>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ── Page wrapper with Suspense ────────────────────────────────────────────────
export default function LoginPage() {
    return (
        <>
            <style>{CSS}</style>
            <Suspense fallback={
                <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0c0f' }}>
                    <div style={{ color: '#5a6070', fontFamily: 'monospace', fontSize: 13 }}>Loading...</div>
                </div>
            }>
                <LoginContent />
            </Suspense>
        </>
    );
}
