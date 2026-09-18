import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendEmailVerification } from 'firebase/auth';
import { auth } from './firebase';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const validate = () => {
    if (!email.trim()) { setError('Email is required'); return false; }
    if (!/\S+@\S+\.\S+/.test(email.trim())) { setError('Please enter a valid email address'); return false; }
    if (!password) { setError('Password is required'); return false; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return false; }
    return true;
  };

  const getErrorMessage = (code) => {
    const messages = {
      'auth/invalid-email': 'Please enter a valid email address',
      'auth/user-not-found': 'No account found with this email',
      'auth/wrong-password': 'Incorrect password',
      'auth/email-already-in-use': 'An account with this email already exists',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later',
      'auth/network-request-failed': 'Network error. Check your connection',
      'auth/invalid-credential': 'Invalid login credentials. Please check your email and password.',
    };
    return messages[code] || 'Authentication failed. Please check your details and try again.';
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setInfoMessage('');
    if (!validate()) return;
    setLoading(true);
    try {
      if (isRegister) {
        const userCred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        try {
          await sendEmailVerification(userCred.user);
          setInfoMessage('Account created! A verification email has been sent to your inbox.');
        } catch (vErr) {
          console.log('Verification email notice:', vErr.message);
        }
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      setTimeout(() => navigate('/'), 1200);
    } catch (err) {
      setError(getErrorMessage(err.code));
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate('/');
    } catch (err) {
      setError(getErrorMessage(err.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Glow Effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-purple-600 to-cyan-500 rounded-2xl shadow-xl shadow-purple-500/20 mb-4 border border-purple-400/30 animate-pulseGlow">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 tracking-tight">
            DocSync
          </h1>
          <p className="text-slate-400 mt-1.5 text-sm font-semibold">Enterprise Cybernetic Document Platform</p>
        </div>

        {/* Card */}
        <div className="bg-[#131b2e]/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-purple-500/30 neon-glow-purple">
          {/* Tab Switcher */}
          <div className="flex rounded-2xl bg-[#1e293b] p-1.5 mb-6 border border-purple-500/10">
            <button
              type="button"
              onClick={() => { setIsRegister(false); setError(''); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                !isRegister
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setIsRegister(true); setError(''); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                isRegister
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Register
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-semibold flex items-start gap-2.5 animate-fadeIn">
              <svg className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Info Banner */}
          {infoMessage && (
            <div className="mb-5 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-semibold flex items-start gap-2.5 animate-fadeIn">
              <svg className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM13.707 8.707a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
              </svg>
              <span>{infoMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Email Field */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-300 mb-1.5">EMAIL ADDRESS</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="name@example.com"
                className="w-full px-4 py-3 border border-purple-500/20 rounded-xl focus:outline-none focus:border-purple-500 transition text-sm text-white bg-[#1e293b] placeholder-slate-500"
              />
            </div>

            {/* Password Field */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-300 mb-1.5">PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-purple-500/20 rounded-xl focus:outline-none focus:border-purple-500 transition text-sm text-white bg-[#1e293b] placeholder-slate-500"
              />
              {isRegister && <p className="text-xs text-slate-400 mt-1">Must be at least 6 characters</p>}
            </div>

            {/* Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold hover:opacity-95 active:opacity-90 transition shadow-lg shadow-purple-600/30 disabled:opacity-50 text-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Processing...
                </span>
              ) : isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-purple-500/20" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-[#131b2e] text-xs font-bold text-slate-400">OR CONTINUE WITH</span>
            </div>
          </div>

          {/* Google Button */}
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={loading}
            className="w-full py-3 bg-[#1e293b] border border-purple-500/20 rounded-xl flex items-center justify-center gap-3 text-slate-200 text-sm font-bold hover:bg-[#283552] transition disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1.04.69-2.36 1.1-3.71 1.1-2.85 0-5.27-1.92-6.13-4.5H2.25v2.82C4.06 20.42 7.73 23 12 23z"/>
              <path fill="#FBBC05" d="M5.87 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.25C1.2 8.88.68 10.87.68 12.99c0 2.12.52 4.11 1.57 5.92l3.62-2.82z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.73 1 4.06 3.58 2.25 7.07l3.62 2.82C6.73 7.31 9.15 5.38 12 5.38z"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;