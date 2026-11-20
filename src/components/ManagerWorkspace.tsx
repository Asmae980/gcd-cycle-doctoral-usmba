import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  History,
  RefreshCw,
  ScanLine,
  Search,
  ShieldBan,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Adherent, Book, Loan } from '../types/library';
import { formatDateFr, getEffectiveLoanStatus, getTodayIso } from '../utils/libraryUtils';
import {
  AdherentLoansHistoryModal,
  ReactivateConfirmModal,
  SuspendConfirmModal,
} from './AdherentModals';
import { AdherentRegisterModal, RegisterAdherentInput } from './AdherentRegisterModal';
import { ManagerReportsTab } from './ManagerReportsTab';

interface ManagerWorkspaceProps {
  adherents: Adherent[];
  loans: Loan[];
  books: Book[];
  busyAdherentId: string | null;
  onRegisterAdherent: (values: RegisterAdherentInput) => Promise<void>;
  onRenewAdherent: (adherent: Adherent) => Promise<void>;
  onSuspendAdherent: (adherent: Adherent, reason: string) => Promise<void>;
  onReactivateAdherent: (adherent: Adherent) => Promise<void>;
  onExportToast: (text: string) => void;
}

type ManagerTab = 'adherents' | 'rapports';
type AdherentStatusFilter = 'all' | 'actif' | 'suspendu';

const ADHERENTS_PAGE_SIZE = 6;
const MAX_ACTIVE_LOANS = 5;

export const ManagerWorkspace: React.FC<ManagerWorkspaceProps> = ({
  adherents,
  loans,
  books,
  busyAdherentId,
  onRegisterAdherent,
  onRenewAdherent,
  onSuspendAdherent,
  onReactivateAdherent,
  onExportToast,
}) => {
  const todayIso = getTodayIso();
  const [activeTab, setActiveTab] = useState<ManagerTab>('adherents');

  // État de l'onglet Adhérents & Lecteurs
  const [statusFilter, setStatusFilter] = useState<AdherentStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(ADHERENTS_PAGE_SIZE);

  // Modales Adhérents
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [suspendingTarget, setSuspendingTarget] = useState<Adherent | null>(null);
  const [reactivatingTarget, setReactivatingTarget] = useState<Adherent | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Adherent | null>(null);

  const handleStatusFilterChange = (next: AdherentStatusFilter) => {
    setStatusFilter(next);
    setVisibleCount(ADHERENTS_PAGE_SIZE);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setVisibleCount(ADHERENTS_PAGE_SIZE);
  };

  const counts = useMemo(() => {
    const active = adherents.filter((a) => a.status === 'actif').length;
    const suspended = adherents.filter((a) => a.status === 'suspendu').length;
    return {
      all: adherents.length,
      active,
      suspended,
    };
  }, [adherents]);

  const filteredAdherents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return adherents.filter((adh) => {
      if (statusFilter !== 'all' && adh.status !== statusFilter) return false;
      if (!q) return true;
      return (
        adh.fullName.toLowerCase().includes(q) ||
        adh.email.toLowerCase().includes(q) ||
        adh.cardNumber.toLowerCase().includes(q) ||
        adh.cne.toLowerCase().includes(q) ||
        adh.apogee.toLowerCase().includes(q)
      );
    });
  }, [adherents, statusFilter, searchQuery]);

  const visibleAdherents = useMemo(
    () => filteredAdherents.slice(0, visibleCount),
    [filteredAdherents, visibleCount]
  );

  // Calcul des emprunts actifs et retards non rendus pour chaque adhérent
  const statsByAdherentId = useMemo(() => {
    const map = new Map<string, { activeLoans: number; overdueCount: number }>();
    for (const adh of adherents) {
      const studentLoans = loans.filter(
        (l) =>
          l.studentUid === adh.studentUid ||
          l.studentCne.toUpperCase() === adh.cne.toUpperCase()
      );
      let activeLoans = 0;
      let overdueCount = 0;
      for (const l of studentLoans) {
        const eff = getEffectiveLoanStatus(l, todayIso);
        if (eff === 'en_cours') {
          activeLoans += 1;
        } else if (eff === 'en_retard') {
          activeLoans += 1;
          overdueCount += 1;
        }
      }
      map.set(adh.id, { activeLoans, overdueCount });
    }
    return map;
  }, [adherents, loans, todayIso]);

  const handleRegisterSubmit = async (values: RegisterAdherentInput) => {
    setIsRegistering(true);
    try {
      await onRegisterAdherent(values);
      setIsRegisterOpen(false);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleSuspendSubmit = async (adherent: Adherent, reason: string) => {
    await onSuspendAdherent(adherent, reason);
    setSuspendingTarget(null);
  };

  const handleReactivateSubmit = async (adherent: Adherent) => {
    await onReactivateAdherent(adherent);
    setReactivatingTarget(null);
  };

  return (
    <section aria-labelledby="manager-heading" className="space-y-6">
      {/* En-tête de l'espace Gérant + Switch entre les deux onglets */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <h2 id="manager-heading" className="font-display text-2xl font-bold text-slate-900">
            Espace Gérant — Administration
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Pilotage des adhérents, contrôle des suspensions et rapports statistiques d’activité.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Sections de l’espace Gérant"
          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start sm:self-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'adherents'}
            onClick={() => setActiveTab('adherents')}
            className={`inline-flex cursor-pointer items-center gap-2 whitespace-nowrap shrink-0 rounded-md px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'adherents'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            Adhérents & Lecteurs
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'rapports'}
            onClick={() => setActiveTab('rapports')}
            className={`inline-flex cursor-pointer items-center gap-2 whitespace-nowrap shrink-0 rounded-md px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'rapports'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            Rapports
          </button>
        </div>
      </div>

      {/* ONGLET 1 : ADHÉRENTS & LECTEURS */}
      {activeTab === 'adherents' && (
        <div className="space-y-6">
          {/* Titre, sous-titre et bouton Inscrire un étudiant (Scan Carte OCR) */}
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h3 className="font-display text-xl font-bold text-slate-900">
                Gestion des adhérents & Lecteurs
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Suivi des cartes de bibliothèque, validité des inscriptions, suspensions et emprunts en cours.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsRegisterOpen(true)}
              className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap shrink-0 rounded-lg bg-[#172554] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1e3a8a]"
            >
              <ScanLine className="h-4 w-4" aria-hidden="true" />
              Inscrire un étudiant (Scan Carte OCR)
            </button>
          </div>

          {/* Barre de recherche et onglets Tous / Actifs / Suspendus */}
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Rechercher par nom, e-mail ou n° de carte..."
                aria-label="Rechercher un adhérent"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div
              role="group"
              aria-label="Filtrer les adhérents par statut"
              className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1"
            >
              {(
                [
                  { id: 'all', label: `Tous les adhérents (${counts.all})` },
                  { id: 'actif', label: `Actifs (${counts.active})` },
                  { id: 'suspendu', label: `Suspendus (${counts.suspended})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleStatusFilterChange(tab.id)}
                  className={`cursor-pointer whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Grille des cartes d'adhérents */}
          {visibleAdherents.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
              Aucun adhérent ne correspond à votre recherche.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visibleAdherents.map((adh) => {
                const stats = statsByAdherentId.get(adh.id) || {
                  activeLoans: 0,
                  overdueCount: 0,
                };
                const isSuspended = adh.status === 'suspendu';
                const isBusy = busyAdherentId === adh.id;
                const isExpired = adh.expiryDate < todayIso;

                return (
                  <article
                    key={adh.id}
                    className={`flex flex-col justify-between rounded-xl border bg-white p-5 ${
                      isSuspended ? 'border-red-200 bg-red-50/20' : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Ligne supérieure : N° de carte + Statut */}
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                        <div>
                          <div className="font-mono text-xs font-semibold text-slate-600">
                            {adh.cardNumber}
                          </div>
                          <h4 className="mt-0.5 font-display text-base font-bold text-slate-900">
                            {adh.fullName}
                          </h4>
                        </div>
                        <span
                          className={`shrink-0 text-xs font-semibold ${
                            isSuspended ? 'text-red-700' : 'text-emerald-700'
                          }`}
                        >
                          {isSuspended ? 'Suspendu' : 'Actif'}
                        </span>
                      </div>

                      {/* Coordonnées académiques */}
                      <dl className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-slate-500">CNE / Apogée :</dt>
                          <dd className="font-mono font-medium text-slate-800 tabular-nums">
                            {adh.cne} · {adh.apogee}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-slate-500">Filière :</dt>
                          <dd className="font-mono font-semibold text-slate-900">
                            {adh.filiere}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-slate-500">E-mail :</dt>
                          <dd className="truncate text-slate-700" title={adh.email}>
                            {adh.email}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-slate-500">Fin d’inscription :</dt>
                          <dd
                            className={`font-mono tabular-nums ${
                              isExpired ? 'font-semibold text-amber-700' : 'text-slate-800'
                            }`}
                          >
                            {formatDateFr(adh.expiryDate)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-slate-500">Emprunts en cours :</dt>
                          <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                            {stats.activeLoans}/{MAX_ACTIVE_LOANS}
                          </dd>
                        </div>
                      </dl>

                      {/* Alerte retard non rendu */}
                      {stats.overdueCount > 0 && (
                        <div
                          role="alert"
                          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800"
                        >
                          <AlertTriangle className="h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                          <span>
                            Alerte : {stats.overdueCount} retard
                            {stats.overdueCount > 1 ? 's' : ''} non rendu
                            {stats.overdueCount > 1 ? 's' : ''}
                          </span>
                        </div>
                      )}

                      {/* Motif si suspendu */}
                      {isSuspended && adh.suspensionReason && (
                        <div className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-800">
                          <span className="font-semibold">Motif :</span> {adh.suspensionReason}
                        </div>
                      )}
                    </div>

                    {/* Actions sur la carte */}
                    <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onRenewAdherent(adh)}
                          className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          Renouveler l’inscription
                        </button>

                        {isSuspended ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setReactivatingTarget(adh)}
                            className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            Réactiver
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setSuspendingTarget(adh)}
                            className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                          >
                            <ShieldBan className="h-3.5 w-3.5" aria-hidden="true" />
                            Suspendre
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setHistoryTarget(adh)}
                        className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        <History className="h-3.5 w-3.5" aria-hidden="true" />
                        Voir l’historique des emprunts
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Pagination 6 cartes puis Afficher plus */}
          <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row">
            <div className="font-mono text-xs text-slate-600 tabular-nums">
              {visibleAdherents.length}{' '}
              {visibleAdherents.length > 1 ? 'adhérents affichés' : 'adhérent affiché'} sur{' '}
              {filteredAdherents.length}
            </div>

            {filteredAdherents.length > ADHERENTS_PAGE_SIZE && (
              <div className="flex items-center gap-2">
                {visibleAdherents.length < filteredAdherents.length ? (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + ADHERENTS_PAGE_SIZE)}
                    className="cursor-pointer rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Afficher plus
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setVisibleCount(ADHERENTS_PAGE_SIZE)}
                    className="cursor-pointer rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Réduire
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ONGLET 2 : RAPPORTS */}
      {activeTab === 'rapports' && (
        <ManagerReportsTab
          loans={loans}
          books={books}
          adherents={adherents}
          onExportToast={onExportToast}
        />
      )}

      {/* Modales de gestion des adhérents */}
      <AdherentRegisterModal
        isOpen={isRegisterOpen}
        existingAdherents={adherents}
        isSubmitting={isRegistering}
        onClose={() => setIsRegisterOpen(false)}
        onSubmit={handleRegisterSubmit}
      />

      <SuspendConfirmModal
        adherent={suspendingTarget}
        isSubmitting={Boolean(
          suspendingTarget && busyAdherentId === suspendingTarget.id
        )}
        onClose={() => setSuspendingTarget(null)}
        onConfirmSuspend={handleSuspendSubmit}
      />

      <ReactivateConfirmModal
        adherent={reactivatingTarget}
        isSubmitting={Boolean(
          reactivatingTarget && busyAdherentId === reactivatingTarget.id
        )}
        onClose={() => setReactivatingTarget(null)}
        onConfirmReactivate={handleReactivateSubmit}
      />

      <AdherentLoansHistoryModal
        adherent={historyTarget}
        loans={loans}
        books={books}
        onClose={() => setHistoryTarget(null)}
      />
    </section>
  );
};
