import React from 'react';
import { BookOpen, QrCode } from 'lucide-react';
import { UserProfile } from '../types/library';

interface HomeBannerProps {
  totalBooks: number;
  totalCopies: number;
  availableCopies: number;
  currentUser: UserProfile | null;
  onOpenQrBorrow: () => void;
  onOpenCatalog: () => void;
  onOpenAuth: () => void;
  onNavigateWorkspace: () => void;
}

export const HomeBanner: React.FC<HomeBannerProps> = ({
  totalBooks,
  totalCopies,
  availableCopies,
  currentUser,
  onOpenQrBorrow,
  onOpenCatalog,
  onOpenAuth,
  onNavigateWorkspace,
}) => {
  const isLibrarian = currentUser?.role === 'librarian';

  return (
    <section aria-labelledby="hero-title" className="space-y-8">
      {/* Bannière principale à fond uni sans image */}
      <div className="rounded-xl bg-[#172554] px-6 py-12 text-white sm:px-10 sm:py-16">
        <div className="max-w-3xl space-y-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-blue-100">
            <span className="font-medium text-white">Année universitaire 2026–2027</span>
            <span aria-hidden="true">·</span>
            <span>Filières GI · GE · GIM · TM · RT</span>
          </div>

          <h1
            id="hero-title"
            className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl"
          >
            Bibliothèque Universitaire de l’École
          </h1>

          <p className="max-w-2xl text-base leading-relaxed text-blue-100">
            Consultez le fonds documentaire des cinq filières d’ingénierie et de management,
            empruntez ou réservez un ouvrage en quelques secondes et gérez les retours par code QR.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            {!isLibrarian && (
              <button
                type="button"
                onClick={onOpenQrBorrow}
                className="inline-flex cursor-pointer items-center gap-2.5 whitespace-nowrap shrink-0 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-[#172554] transition-colors duration-150 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <QrCode className="h-4 w-4" aria-hidden="true" />
                Emprunt par QR
              </button>
            )}

            <button
              type="button"
              onClick={onOpenCatalog}
              className={`inline-flex cursor-pointer items-center gap-2.5 whitespace-nowrap shrink-0 rounded-lg px-5 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                isLibrarian
                  ? 'bg-white text-[#172554] hover:bg-blue-50'
                  : 'border border-blue-300/40 bg-[#1e3a8a] text-white hover:bg-blue-800'
              }`}
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              Consulter le fonds documentaire
            </button>
          </div>
        </div>
      </div>

      {/* Synthèse documentaire en grille plane */}
      <div className="grid grid-cols-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Titres catalogués</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {totalBooks}
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Exemplaires disponibles</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {availableCopies} / {totalCopies}
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Durée d’emprunt</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            14 jours
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Pénalité de retard</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            5 DH / jour
          </div>
        </div>
      </div>

      {/* Accès rapide selon l'état de session */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white px-6 py-5 sm:flex-row sm:items-center">
        {currentUser ? (
          <>
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900">
                Session active : {currentUser.fullName}
              </div>
              <div className="text-sm text-slate-600">
                {currentUser.role === 'librarian'
                  ? 'Rôle Bibliothécaire · Gestion des emprunts, catalogue, adhérents, rapports et relances.'
                  : `Rôle Étudiant · Filière ${currentUser.filiere} · CNE ${currentUser.cne}`}
              </div>
            </div>
            <button
              type="button"
              onClick={onNavigateWorkspace}
              className="cursor-pointer whitespace-nowrap shrink-0 rounded-lg bg-[#172554] px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#1e3a8a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
            >
              {currentUser.role === 'librarian'
                ? 'Ouvrir l’espace bibliothécaire'
                : 'Voir mes emprunts'}
            </button>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900">
                Accéder à votre espace personnel
              </div>
              <div className="text-sm text-slate-600">
                Connectez-vous avec Google ou testez immédiatement les rôles Étudiant et Bibliothécaire.
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenAuth}
              className="cursor-pointer whitespace-nowrap shrink-0 rounded-lg bg-[#172554] px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#1e3a8a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
            >
              Se connecter ou essayer la démo
            </button>
          </>
        )}
      </div>
    </section>
  );
};
