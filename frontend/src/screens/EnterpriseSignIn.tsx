import React, { useState, FormEvent } from 'react';
import { clearLocalIdentity, sapSignInTarget } from '../services/authNavigation';
import {
  ShieldCheck,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ArrowRight,
  CheckCircle2,
  Server,
  Cpu,
  Database,
  ExternalLink,
  AlertCircle,
  Sparkles,
  Layers,
  KeyRound
} from 'lucide-react';

export interface UserContext {
  user_id: string;
  email: string;
  name: string;
  roles: string[];
}

export interface EnterpriseSignInProps {
  onSignInSuccess?: (user: UserContext) => void;
  apiBaseUrl?: string;
  ssoRedirectUrl?: string;
}

export const EnterpriseSignIn: React.FC<EnterpriseSignInProps> = ({
  onSignInSuccess,
  apiBaseUrl = '',
  ssoRedirectUrl
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSsoLoading, setIsSsoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The protected AppRouter entry point starts SAP's hosted SSO flow.
  const handleSSORedirect = () => {
    setIsSsoLoading(true);
    setError(null);
    try {
      const target = ssoRedirectUrl || sapSignInTarget();
      clearLocalIdentity(false);
      window.location.assign(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SAP sign-in could not be started.');
      setIsSsoLoading(false);
    }
  };

  // Direct Credential Auth Submission (Corporate Email & Password)
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Please provide both corporate email address and master password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let userContext: UserContext | null = null;
      let token: string | null = null;

      try {
        const loginRes = await fetch(`${apiBaseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password, rememberMe })
        });

        const data = await loginRes.json();

        if (loginRes.ok && data.status === 'success') {
          userContext = data.user;
          token = data.token;
        } else {
          setError(data.detail || 'Invalid corporate email or password. Access denied.');
          setIsLoading(false);
          return;
        }
      } catch {
        setError('Authentication service unreachable. Valid SAP BTP IAS token or credentials required.');
        setIsLoading(false);
        return;
      }

      if (userContext) {
        clearLocalIdentity(false);
        if (token) {
          localStorage.setItem('auth_token', token);
          localStorage.setItem('auth_user', JSON.stringify(userContext));
        }
        if (onSignInSuccess) {
          onSignInSuccess(userContext);
        }
      } else {
        setError('Authentication failed. Invalid corporate credentials.');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Authentication service temporarily unreachable.';
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="enterprise-login-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap');

        .enterprise-login-root {
          font-family: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          min-height: 100vh;
          background: #F7F7F5;
          color: #111111;
          display: flex;
          align-items: stretch;
          -webkit-font-smoothing: antialiased;
        }

        /* Split Screen Container */
        .auth-split-wrapper {
          display: grid;
          grid-template-columns: 1fr 1fr;
          width: 100%;
          min-height: 100vh;
        }

        @media (max-width: 1024px) {
          .auth-split-wrapper {
            grid-template-columns: 1fr;
          }
          .auth-left-brand-pane {
            display: none !important;
          }
        }

        /* Left Column: Platform Status & Branding */
        .auth-left-brand-pane {
          background: #F3F2EF;
          border-right: 1px solid #E7E7E4;
          padding: 64px 72px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          overflow: hidden;
        }

        .auth-left-brand-pane::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-radial: radial-gradient(circle at 10% 20%, rgba(84, 122, 155, 0.05) 0%, transparent 60%);
          pointer-events: none;
        }

        .brand-top-row {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .brand-icon-box {
          width: 40px;
          height: 40px;
          background: #111111;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFFFFF;
          box-shadow: 0 4px 12px rgba(17,17,17,0.12);
        }

        .brand-title-group h1 {
          font-size: 17px;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0;
          color: #111111;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .brand-title-group p {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #777777;
          margin: 2px 0 0 0;
        }

        .brand-hero-content {
          max-width: 520px;
          margin: 48px 0;
        }

        .brand-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 4px 10px;
          background: #ECEBE8;
          border: 1px solid #DFDED9;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #555555;
          margin-bottom: 24px;
        }

        .brand-headline {
          font-size: 38px;
          font-weight: 600;
          line-height: 1.14;
          letter-spacing: -0.035em;
          color: #111111;
          margin: 0 0 20px 0;
        }

        .brand-description {
          font-size: 15px;
          line-height: 1.6;
          color: #6B6B6B;
          margin: 0 0 36px 0;
        }

        /* Architecture Telemetry Live Status Indicators */
        .system-status-panel {
          background: #FCFCFB;
          border: 1px solid #E7E7E4;
          border-radius: 18px;
          padding: 20px 22px;
          margin-top: 16px;
        }

        .status-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 14px;
          border-bottom: 1px solid #EEEEEB;
          margin-bottom: 14px;
        }

        .status-panel-title {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #777777;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .live-ping-wrapper {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          color: #287447;
          background: #E8F4EC;
          padding: 3px 8px;
          border-radius: 999px;
        }

        .live-dot {
          width: 6px;
          height: 6px;
          background: #287447;
          border-radius: 50%;
          animation: pulseStatus 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @keyframes pulseStatus {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.9); }
        }

        .status-item-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .status-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
        }

        .status-row-left {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #333333;
          font-weight: 500;
        }

        .status-badge-chip {
          font-family: 'Geist Mono', monospace;
          font-size: 11px;
          font-weight: 500;
          padding: 3px 8px;
          border-radius: 6px;
          background: #F3F2EF;
          color: #555555;
          border: 1px solid #E7E7E4;
        }

        .brand-footer-specs {
          font-size: 12px;
          color: #8A8A8A;
          display: flex;
          align-items: center;
          gap: 16px;
        }

        /* Right Column: Centered Login Form */
        .auth-right-form-pane {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 40px;
          background: #F7F7F5;
        }

        .auth-card-container {
          width: 100%;
          max-width: 440px;
        }

        .auth-card {
          background: #FCFCFB;
          border: 1px solid #E7E7E4;
          border-radius: 20px;
          padding: 36px 36px 32px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.03);
        }

        .auth-card-header {
          margin-bottom: 28px;
        }

        .auth-card-header h2 {
          font-size: 24px;
          font-weight: 600;
          letter-spacing: -0.025em;
          color: #111111;
          margin: 0 0 6px 0;
        }

        .auth-card-header p {
          font-size: 14px;
          color: #6B6B6B;
          margin: 0;
          line-height: 1.5;
        }

        /* SSO Primary Action */
        .btn-sso-primary {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          background: #111111;
          color: #FFFFFF;
          border: 1px solid #111111;
          padding: 12px 20px;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 180ms ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }

        .btn-sso-primary:hover:not(:disabled) {
          background: #2A2A2A;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(17,17,17,0.12);
        }

        .btn-sso-primary:active:not(:disabled) {
          transform: scale(0.99);
        }

        .btn-sso-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Monochromatic Divider */
        .auth-separator {
          display: flex;
          align-items: center;
          margin: 24px 0;
          color: #8A8A8A;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .auth-separator::before,
        .auth-separator::after {
          content: "";
          flex: 1;
          height: 1px;
          background: #E7E7E4;
        }

        .auth-separator span {
          padding: 0 14px;
        }

        /* Form Fields */
        .form-group {
          margin-bottom: 20px;
        }

        .form-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: -0.01em;
          color: #333333;
          margin-bottom: 8px;
        }

        .input-relative-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon-left {
          position: absolute;
          left: 14px;
          color: #8A8A8A;
          pointer-events: none;
        }

        .enterprise-input {
          width: 100%;
          height: 44px;
          padding: 0 42px 0 42px;
          background: #FCFCFB;
          border: 1px solid #DCDCD8;
          border-radius: 10px;
          font-family: inherit;
          font-size: 14px;
          color: #111111;
          transition: border-color 180ms ease, box-shadow 180ms ease;
          box-sizing: border-box;
        }

        .enterprise-input:focus {
          outline: none;
          border-color: #111111;
          box-shadow: 0 0 0 3px rgba(17, 17, 17, 0.05);
        }

        .enterprise-input::placeholder {
          color: #9E9E99;
        }

        .input-btn-right {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          padding: 4px;
          color: #777777;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          transition: color 150ms ease;
        }

        .input-btn-right:hover {
          color: #111111;
        }

        /* Checkbox & Forgot Password Row */
        .form-utility-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 4px 0 24px;
        }

        .remember-checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #555555;
          cursor: pointer;
          user-select: none;
        }

        .remember-checkbox-label input[type="checkbox"] {
          accent-color: #111111;
          width: 16px;
          height: 16px;
          border-radius: 4px;
          cursor: pointer;
        }

        .link-subtle {
          font-size: 13px;
          color: #555555;
          text-decoration: none;
          transition: color 150ms ease;
        }

        .link-subtle:hover {
          color: #111111;
          text-decoration: underline;
        }

        /* Secondary Submit Button */
        .btn-submit-secondary {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: transparent;
          color: #111111;
          border: 1px solid #D8D8D4;
          padding: 11px 20px;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 180ms ease;
        }

        .btn-submit-secondary:hover:not(:disabled) {
          background: #ECEBE8;
          border-color: #CFCFCB;
        }

        .btn-submit-secondary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Error Banner */
        .auth-error-banner {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          background: #FDF2F2;
          border: 1px solid #F5C6C6;
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 20px;
          color: #9B1C1C;
          font-size: 13px;
          line-height: 1.45;
        }

        /* Footnotes & Security Badge */
        .auth-compliance-footer {
          margin-top: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          text-align: center;
        }

        .compliance-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 500;
          color: #6B6B6B;
          background: #EFEFEA;
          border: 1px solid #E4E4DE;
          padding: 6px 12px;
          border-radius: 999px;
        }

        .bottom-links {
          display: flex;
          align-items: center;
          gap: 16px;
          font-size: 12px;
          color: #777777;
        }

        .bottom-links a {
          color: inherit;
          text-decoration: none;
          transition: color 150ms ease;
        }

        .bottom-links a:hover {
          color: #111111;
          text-decoration: underline;
        }

        /* Spinner */
        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #FFFFFF;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .spinner-dark {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(17,17,17,0.2);
          border-top-color: #111111;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="auth-split-wrapper">
        {/* Left Side: Editorial Platform Presentation & Telemetry */}
        <div className="auth-left-brand-pane">
          <div>
            <div className="brand-top-row">
              <div className="brand-icon-box">
                <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                  <path d="M9 23V9L17 23V9" stroke="#FCFCFB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="23" cy="11" r="2.2" fill="#547A9B" />
                </svg>
              </div>
              <div className="brand-title-group">
                <h1>NEOVATIC GEN-AI ANALYTICS PLATFORM</h1>
                <p>SAP HANA Cloud &amp; AI Core</p>
              </div>
            </div>

            <div className="brand-hero-content">
              <div className="brand-eyebrow">
                <Sparkles size={13} color="#547A9B" />
                Enterprise Analytics &amp; RAG Service
              </div>
              <h2 className="brand-headline">
                Unified Data Intelligence &amp; Autonomous Vector Synthesis
              </h2>
              <p className="brand-description">
                Direct conversational queries, real-time natural language to SAP HANA SQL generation, and multi-tenant RAG exploration across enterprise business records.
              </p>

              {/* Live Status Telemetry Box */}
              <div className="system-status-panel">
                <div className="status-panel-header">
                  <span className="status-panel-title">
                    <Layers size={13} />
                    Live Federated Infrastructure
                  </span>
                  <div className="live-ping-wrapper">
                    <span className="live-dot" />
                    <span>Operational</span>
                  </div>
                </div>

                <div className="status-item-list">
                  <div className="status-row">
                    <div className="status-row-left">
                      <Database size={15} color="#547A9B" />
                      <span>SAP HANA Cloud Vector Engine</span>
                    </div>
                    <span className="status-badge-chip">CONNECTED</span>
                  </div>

                  <div className="status-row">
                    <div className="status-row-left">
                      <Cpu size={15} color="#4F8065" />
                      <span>NVIDIA NIM Inference Runtime</span>
                    </div>
                    <span className="status-badge-chip">ONLINE</span>
                  </div>

                  <div className="status-row">
                    <div className="status-row-left">
                      <Server size={15} color="#756A98" />
                      <span>SAP AI Core &amp; XSUAA Identity</span>
                    </div>
                    <span className="status-badge-chip">READY</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="brand-footer-specs">
            <span>Tenant: eu10.hana.ondemand.com</span>
            <span>•</span>
            <span>MTA v1.0.0-PROD</span>
            <span>•</span>
            <span>Multi-Agent Mesh</span>
          </div>
        </div>

        {/* Right Side: Authentication Card */}
        <div className="auth-right-form-pane">
          <div className="auth-card-container">
            <div className="auth-card">
              <div className="auth-card-header">
                <h2>Enterprise Sign In</h2>
                <p>Authenticate with your corporate credentials to access tenant analytics.</p>
              </div>

              {/* Error Banner */}
              {error && (
                <div className="auth-error-banner" role="alert">
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>{error}</div>
                </div>
              )}

              {/* Primary Enterprise SSO Option */}
              <button
                type="button"
                className="btn-sso-primary"
                onClick={handleSSORedirect}
                disabled={isSsoLoading || isLoading}
              >
                {isSsoLoading ? (
                  <div className="spinner" />
                ) : (
                  <>
                    <KeyRound size={17} />
                    <span>Sign in with SAP Universal ID / BTP IAS</span>
                    <ArrowRight size={15} style={{ marginLeft: 2 }} />
                  </>
                )}
              </button>

              <div className="auth-separator">
                <span>or continue with corporate email</span>
              </div>

              {/* Secondary Direct Credential Form */}
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label" htmlFor="corporate-email">Corporate Email Address</label>
                  <div className="input-relative-wrap">
                    <Mail size={16} className="input-icon-left" />
                    <input
                      id="corporate-email"
                      type="email"
                      className="enterprise-input"
                      placeholder="name@enterprise.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="corporate-password">Enterprise Password</label>
                  <div className="input-relative-wrap">
                    <Lock size={16} className="input-icon-left" />
                    <input
                      id="corporate-password"
                      type={showPassword ? 'text' : 'password'}
                      className="enterprise-input"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="input-btn-right"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="form-utility-row">
                  <label className="remember-checkbox-label">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span>Remember session (12 hrs)</span>
                  </label>
                  <a href="#need-help" className="link-subtle">
                    Forgot password?
                  </a>
                </div>

                <button
                  type="submit"
                  className="btn-submit-secondary"
                  disabled={isLoading || isSsoLoading}
                >
                  {isLoading ? (
                    <div className="spinner-dark" />
                  ) : (
                    <>
                      <span>Direct Enterprise Authenticate</span>
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Compliance & Support Links Footer */}
            <div className="auth-compliance-footer">
              <div className="compliance-pill">
                <ShieldCheck size={14} color="#4F8065" />
                <span>Protected by SAP Authorization &amp; Trust Management (XSUAA) • 256-Bit SSL</span>
              </div>
              <div className="bottom-links">
                <a href="#access-help">Need access help?</a>
                <span>•</span>
                <a href="/api/health" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  System Health (/api/health)
                  <ExternalLink size={11} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>


    </div>
  );
};

export default EnterpriseSignIn;
