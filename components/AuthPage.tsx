import React, { useState } from 'react';
import { Button } from './Button';
import { User } from '../types';

interface AuthPageProps {
  onSuccess: (user: User) => void;
  onLogin: (username: string, password: string) => Promise<User>;
  onRegister: (username: string, password: string) => Promise<User>;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onSuccess, onLogin, onRegister }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);

    if (!username || !password) {
      setError('请填写用户名和密码');
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致');
        return;
      }
      if (password.length < 6) {
        setError('密码长度至少6位');
        return;
      }
      if (username.length < 3) {
        setError('用户名长度至少3个字符');
        return;
      }
    }

    setLoading(true);
    try {
      const user = mode === 'login'
        ? await onLogin(username, password)
        : await onRegister(username, password);
      onSuccess(user);
    } catch (err: any) {
      setError(err.message || (mode === 'login' ? '登录失败' : '注册失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center animate-fade-in">
      <div className="w-full max-w-md space-y-12">
        <div className="space-y-4 text-center">
          <div className="w-20 h-20 bg-zinc-900 rounded-3xl mx-auto flex items-center justify-center border border-white/5">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h2 className="text-4xl font-serif italic text-white">
            {mode === 'login' ? '欢迎回来' : '创建账户'}
          </h2>
          <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-black">
            {mode === 'login' ? 'Sign in to continue' : 'Join Lyra today'}
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-6 py-5 bg-zinc-900 border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-white/20 transition-colors"
              placeholder="请输入用户名"
              autoComplete="username"
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-6 py-5 bg-zinc-900 border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-white/20 transition-colors"
              placeholder="请输入密码"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'register' && (
            <div className="space-y-3">
              <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                确认密码
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-6 py-5 bg-zinc-900 border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-white/20 transition-colors"
                placeholder="请再次输入密码"
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <p className="text-red-500 text-[10px] uppercase tracking-widest font-black text-center py-2">
              {error}
            </p>
          )}

          <Button
            onClick={handleSubmit}
            isLoading={loading}
            className="w-full h-16 rounded-2xl bg-white text-black font-black text-sm mt-4"
          >
            {mode === 'login' ? '登录' : '注册'}
          </Button>

          <div className="text-center pt-4">
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
                setConfirmPassword('');
              }}
              className="text-zinc-500 text-[10px] uppercase tracking-widest font-black hover:text-white transition-colors"
            >
              {mode === 'login' ? '没有账户？立即注册' : '已有账户？立即登录'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
