import React, { useState } from 'react';
import { ArrowLeft, Copy, Eye, EyeOff, Lock, LogOut, ShieldCheck } from 'lucide-react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth';
import { auth, googleProvider } from '../../lib/firebase';
import { loginWithCredentials } from '../../services/adminStoreService';

interface AdminLoginGateProps {
  user: User | null;
  authLoading: boolean;
  isAdmin: boolean;
  onCredentialSuccess: (email: string) => void;
  onBackToSite: () => void;
}

export function AdminLoginGate({
  user,
  authLoading,
  isAdmin,
  onCredentialSuccess,
  onBackToSite
}: AdminLoginGateProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Informe seu login e senha para entrar.');
      return;
    }

    setError('');
    setSigningIn(true);
    try {
      const result = await loginWithCredentials(cleanEmail, password);
      if (!result.ok || !result.email) {
        setError(result.error || 'Login ou senha inválidos.');
        return;
      }

      // Tentativa silenciosa opcional no Firebase Auth caso Email/Senha esteja habilitado no Console
      try {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      } catch {
        // Sessão administrativa autenticada via credencial segura no servidor
      }

      onCredentialSuccess(result.email);
    } catch {
      setError('Não foi possível validar o acesso. Tente novamente.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir o login com o Google.'
      );
    } finally {
      setGoogleSigningIn(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E6E2DA] rounded-2xl px-8 py-6 text-sm text-[#52525B]">
          Verificando sessão administrativa...
        </div>
      </div>
    );
  }

  if (user && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-[#E6E2DA] rounded-2xl p-8 space-y-5">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-[#FEF3C7] text-[#92400E]">
            <Lock className="w-5 h-5" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold text-[#18181B]">
              Acesso administrativo pendente de autorização
            </h1>
            <p className="text-sm text-[#52525B] leading-relaxed">
              Você está autenticado como <strong>{user.email}</strong>, porém este usuário ainda
              não foi incluído na coleção de administradores autorizados.
            </p>
          </div>

          <div className="bg-[#FAF9F6] border border-[#E6E2DA] rounded-xl p-4 space-y-2 text-xs">
            <p className="text-[#71717A]">Seu UID do Firebase Authentication:</p>
            <div className="flex items-center justify-between gap-2">
              <code className="font-mono-tabular text-[#18181B] break-all">{user.uid}</code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(user.uid);
                  setCopiedUid(true);
                  setTimeout(() => setCopiedUid(false), 2000);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-[#E6E2DA] rounded-lg text-[#18181B] shrink-0 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedUid ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#1E4D5C] rounded-xl cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Trocar conta Google</span>
            </button>
            <button
              type="button"
              onClick={onBackToSite}
              className="px-4 py-2.5 text-xs font-medium text-[#52525B] hover:text-[#18181B] cursor-pointer"
            >
              Voltar ao site público
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-[#E6E2DA] rounded-2xl p-8 space-y-6">
        <button
          type="button"
          onClick={onBackToSite}
          className="inline-flex items-center gap-2 text-xs font-medium text-[#52525B] hover:text-[#18181B] cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Voltar ao site público</span>
        </button>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-[#1E4D5C]">
            <ShieldCheck className="w-4 h-4" />
            <span>Área Privada · Patrícia Vicente</span>
          </div>
          <h1 className="font-display text-3xl font-semibold text-[#18181B]">
            Painel Administrativo & CRM
          </h1>
          <p className="text-sm text-[#52525B] leading-relaxed">
            Acesso exclusivo para gestão de imóveis, empreendimentos, landing page, leads,
            visitas e propostas.
          </p>
        </div>

        {error ? (
          <div className="text-xs text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-3">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleCredentialLogin} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#52525B]">Login (E-mail)</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@x.com"
              className="w-full px-3.5 py-2.5 text-sm bg-[#FAF9F6] border border-[#E6E2DA] rounded-xl text-[#18181B] focus:outline-none focus:border-[#1E4D5C]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#52525B]">Senha</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                className="w-full px-3.5 py-2.5 pr-10 text-sm bg-[#FAF9F6] border border-[#E6E2DA] rounded-xl text-[#18181B] focus:outline-none focus:border-[#1E4D5C]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-[#18181B] cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={signingIn || googleSigningIn}
            className="w-full px-5 py-3 text-sm font-semibold text-white bg-[#1E4D5C] rounded-xl hover:bg-[#173c48] disabled:opacity-60 transition-colors cursor-pointer"
          >
            {signingIn ? 'Entrando no painel...' : 'Entrar no Painel'}
          </button>
        </form>

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-[#E6E2DA]" />
          <span className="shrink mx-3 text-[11px] text-[#71717A]">ou</span>
          <div className="flex-grow border-t border-[#E6E2DA]" />
        </div>

        <button
          type="button"
          disabled={signingIn || googleSigningIn}
          onClick={handleGoogleLogin}
          className="w-full px-5 py-3 text-xs font-semibold text-[#18181B] bg-[#FAF9F6] border border-[#E6E2DA] rounded-xl hover:bg-[#F3F1EC] disabled:opacity-60 transition-colors cursor-pointer"
        >
          {googleSigningIn ? 'Autenticando com Google...' : 'Entrar com conta Google autorizada'}
        </button>
      </div>
    </div>
  );
}
