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
  font-family: ui-monospace, 'SFMono-Regular', 'Cascadia Mono', Consolas, monospace;
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
  width: 100%; max-width: 440px;
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

.logo-row { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
.logo-icon {
  width: 32px; height: 32px; background: var(--accent); border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Trebuchet MS', 'Segoe UI', sans-serif; font-weight: 800; font-size: 14px; color: #fff;
  letter-spacing: -0.5px; flex-shrink: 0;
}
.logo-text { font-family: 'Trebuchet MS', 'Segoe UI', sans-serif; font-weight: 700; font-size: 16px; color: var(--text); letter-spacing: 0.05em; text-transform: uppercase; }
.logo-sub { font-size: 10px; color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase; margin-top: 1px; }
.divider-v { width: 1px; height: 28px; background: var(--border-hi); margin: 0 4px; }

/* Tabs */
.tabs { display: flex; border-bottom: 1px solid var(--border-hi); margin-bottom: 24px; gap: 0; }
.tab-btn {
  flex: 1; padding: 10px 0;
  font-family: 'Trebuchet MS', 'Segoe UI', sans-serif; font-size: 12px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
  background: none; border: none; color: var(--muted);
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.tab-btn.active { color: var(--text); border-bottom-color: var(--accent); }
.tab-btn:hover:not(.active) { color: var(--text); }

/* Fields */
.field { margin-bottom: 14px; }
.field-label {
  display: block; font-size: 10px; font-weight: 500; color: var(--muted);
  letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 6px;
}
input[type="text"], input[type="email"], input[type="password"], input[type="tel"] {
  width: 100%; background: var(--surface); border: 1px solid var(--border-hi);
  border-radius: 4px; padding: 11px 13px;
  font-family: ui-monospace, 'SFMono-Regular', 'Cascadia Mono', Consolas, monospace; font-size: 13px; color: var(--text);
  outline: none; transition: border-color 0.15s, box-shadow 0.15s;
  caret-color: var(--accent);
}
input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-lo); }
input::placeholder { color: var(--border-hi); }
input.err { border-color: var(--error); box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12); }

.hint { font-size: 11px; color: var(--muted); margin-top: 5px; }
.hint.warn { color: var(--error); }

.row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.btn {
  width: 100%; background: var(--text); color: #fff; border: none;
  border-radius: 4px; padding: 13px;
  font-family: 'Trebuchet MS', 'Segoe UI', sans-serif; font-weight: 700; font-size: 13px;
  letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
  transition: background 0.15s, transform 0.1s, opacity 0.15s;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 6px;
}
.btn:hover:not(:disabled) { background: #44403C; }
.btn:active:not(:disabled) { transform: scale(0.99); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.spinner {
  width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff; border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.msg {
  border-radius: 4px; padding: 12px 14px;
  font-size: 12px; line-height: 1.6; margin-top: 14px;
  display: flex; gap: 10px; align-items: flex-start;
}
.msg.success { background: rgba(13,148,136,0.08); border: 1px solid rgba(13,148,136,0.25); color: var(--success); }
.msg.error   { background: rgba(220,38,38,0.08);  border: 1px solid rgba(220,38,38,0.25);  color: var(--error); }
.msg.info    { background: rgba(202,138,4,0.08);  border: 1px solid rgba(202,138,4,0.25);  color: var(--accent); }
.msg-icon { flex-shrink: 0; font-size: 14px; }

.footer-note {
  margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--border);
  font-size: 11px; color: var(--muted); text-align: center; line-height: 1.6;
}

.link-btn {
  background: none; border: none; color: var(--accent); cursor: pointer;
  font-family: inherit; font-size: 11px; text-decoration: underline;
  padding: 0; transition: color 0.15s;
}
.link-btn:hover { color: #A16207; }
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
                    <div className="logo-icon">S</div>
                    <div className="divider-v" />
                    <div>
                        <div className="logo-text">SAI</div>
                        <div className="logo-sub">SWATCH Panel Support</div>
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
