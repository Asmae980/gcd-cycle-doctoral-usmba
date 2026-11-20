import React from 'react';
import { BookUser, ShieldCheck, X } from 'lucide-react';
import { UserRole } from '../types/library';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoogleLogin: () => void;
  onDemoLogin: (role: UserRole) => void;
  isSigningIn: boolean;
  errorMessage: string | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onGoogleLogin,
  onDemoLogin,
  isSigningIn,
  errorMessage,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="auth-modal-title" className="font-display text-xl font-bold text-slate-900">
              Connexion à la bibliothèque
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Authentification Google ou accès direct par rôle de démonstration.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre de connexion"
            className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
          >
            {errorMessage}
          </div>
        )}

        {/* Connexion Google (Firebase Authentication) */}
        <div className="mt-6 space-y-2.5">
          <button
            type="button"
            disabled={isSigningIn}
            onClick={onGoogleLogin}
            className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition-colors duration-150 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            {isSigningIn ? 'Connexion en cours...' : 'Continuer avec Google'}
          </button>

          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-500">Compte USMBA (@usmba.ac.ma)</span>
            <button
              type="button"
              disabled={isSigningIn}
              onClick={onGoogleLogin}
              className="cursor-pointer font-medium text-blue-800 underline underline-offset-2 hover:text-blue-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Utiliser un autre compte Google
            </button>
          </div>
        </div>

        {/* Séparateur */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium text-slate-400">ou</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        {/* Section Accès rapide démo (par rôle) */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Accès rapide démo (par rôle)
          </h3>

          <button
            type="button"
            onClick={() => onDemoLogin('student')}
            className="flex w-full cursor-pointer items-start gap-3.5 rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 text-left transition-colors duration-150 hover:border-blue-800/40 hover:bg-blue-50/40"
          >
            <BookUser className="mt-0.5 h-5 w-5 shrink-0 text-[#172554]" aria-hidden="true" />
            <div>
              <div className="text-sm font-semibold text-slate-900">Étudiant</div>
              <div className="mt-0.5 text-xs text-slate-600">
                Salma Benali · Filière GI · CNE G134829104 · Emprunts, retards et tickets QR prêts.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onDemoLogin('librarian')}
            className="flex w-full cursor-pointer items-start gap-3.5 rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 text-left transition-colors duration-150 hover:border-blue-800/40 hover:bg-blue-50/40"
          >
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#172554]" aria-hidden="true" />
            <div>
              <div className="text-sm font-semibold text-slate-900">Bibliothécaire</div>
              <div className="mt-0.5 text-xs text-slate-600">
                Karim El Idrissi · Gestion des emprunts, catalogue, adhérents, rapports et journal.
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
