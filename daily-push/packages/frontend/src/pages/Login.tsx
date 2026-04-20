import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = mode === 'login'
        ? await login({ email, password })
        : await register({ email, password, name });
      signIn(data.token, data.user);
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-[9px] text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-400 transition-shadow';
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-[5px]';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[380px]">

        {/* Brand */}
        <div className="text-center mb-7">
          <img src="/logo-mark.svg" alt="Daily Push" className="w-11 h-11 mx-auto mb-3" />
          <h1 className="font-display text-[26px] text-slate-900" style={{ letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            Daily Push
          </h1>
          <p className="text-slate-500 text-sm mt-1">Your personal upskilling system</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">

          {/* Mode toggle */}
          <div className="flex bg-slate-100 rounded-lg p-1 mb-[18px]">
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 py-[6px] rounded-md text-[13px] font-semibold transition-all ${
                  mode === m
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-[14px]">
            {mode === 'register' && (
              <div>
                <label className={labelCls}>Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  required placeholder="Your name" className={inputCls} />
              </div>
            )}
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="you@example.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                required minLength={8} placeholder="Min. 8 characters" className={inputCls} />
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white py-[11px] rounded-[10px] text-sm font-semibold disabled:opacity-50 transition-colors mt-1"
            >
              {loading
                ? (mode === 'login' ? 'Signing in...' : 'Creating account...')
                : (mode === 'login' ? 'Sign in' : 'Create account')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
