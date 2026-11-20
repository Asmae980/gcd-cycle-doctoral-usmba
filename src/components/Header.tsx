import React from 'react';
import { AppSection, UserProfile } from '../types/library';

interface HeaderProps {
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
  currentUser: UserProfile | null;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeSection,
  onNavigate,
  currentUser,
  onOpenAuth,
  onLogout,
}) => {
  const navItems: { id: AppSection; label: string }[] = [
    { id: 'accueil', label: 'Accueil' },
    { id: 'catalogue', label: 'Fonds documentaire' },
  ];

  if (currentUser?.role === 'student') {
    navItems.push({ id: 'etudiant', label: 'Mes emprunts' });
  } else if (currentUser?.role === 'librarian') {
    navItems.push({ id: 'bibliothecaire', label: 'Espace Bibliothécaire' });
    navItems.push({ id: 'journal', label: 'Journal' });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
        {/* Zone 1 : Titre unique */}
        <button
          type="button"
          onClick={() => onNavigate('accueil')}
          className="cursor-pointer whitespace-nowrap shrink-0 font-display text-lg font-bold tracking-tight text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
        >
          Bibliothèque Universitaire
        </button>

        {/* Zone 2 : Liens de navigation concis sur une ligne */}
        <nav
          aria-label="Navigation principale"
          className="hidden items-center gap-6 md:flex"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`cursor-pointer whitespace-nowrap shrink-0 border-b-2 py-1 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-800 ${
                  isActive
                    ? 'border-blue-800 text-blue-900'
                    : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3 : Action principale unique */}
        <div className="flex items-center gap-3 shrink-0">
          {currentUser ? (
            <div className="flex items-center gap-3">
              <span className="hidden max-w-[180px] truncate text-sm text-slate-700 sm:inline">
                {currentUser.fullName}
              </span>
              <button
                type="button"
                onClick={onLogout}
                className="cursor-pointer whitespace-nowrap shrink-0 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
              >
                Déconnexion
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="cursor-pointer whitespace-nowrap shrink-0 rounded-md bg-[#172554] px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#1e3a8a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
            >
              Connexion
            </button>
          )}
        </div>
      </div>

      {/* Navigation mobile compacte */}
      <nav
        aria-label="Navigation mobile"
        className="flex items-center gap-4 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden"
      >
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`cursor-pointer whitespace-nowrap shrink-0 border-b-2 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? 'border-blue-800 text-blue-900'
                  : 'border-transparent text-slate-600'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
