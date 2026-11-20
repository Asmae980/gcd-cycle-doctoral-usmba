import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  BellRing,
  BookOpen,
  QrCode,
  Search,
  Users,
} from 'lucide-react';
import { Adherent, Book, Loan, LoanEffectiveStatus, UserProfile } from '../types/library';
import {
  formatDateFr,
  getEffectiveLoanStatus,
  getLoanDaysLate,
  getLoanPenalty,
  getStatusLabel,
  getTodayIso,
} from '../utils/libraryUtils';
import { CatalogSection } from './CatalogSection';
import { ManagerWorkspace } from './ManagerWorkspace';
import { ManagerReportsTab } from './ManagerReportsTab';
import { RegisterAdherentInput } from './AdherentRegisterModal';

interface LibrarianWorkspaceProps {
  currentUser: UserProfile | null;
  loans: Loan[];
  books: Book[];
  adherents: Adherent[];
  busyLoanId: string | null;
  busyBookId: string | null;
  busyAdherentId: string | null;
  onExtendLoan: (loan: Loan) => void;
  onReturnLoan: (loan: Loan) => void;
  onRemindLoan: (loan: Loan) => void;
  onValidatePickup: (loan: Loan) => void;
  onOpenQrScanner: () => void;
  onOpenBulkReminder: () => void;
  onShowTicketQr: (loan: Loan) => void;
  onBorrowBook: (book: Book) => void;
  onReserveBook: (book: Book) => void;
  onShowBookQr: (book: Book) => void;
  onAddBook: () => void;
  onEditBook: (book: Book) => void;
  onDeleteBook: (book: Book) => void;
  onRegisterAdherent: (values: RegisterAdherentInput) => Promise<void>;
  onRenewAdherent: (adherent: Adherent) => Promise<void>;
  onSuspendAdherent: (adherent: Adherent, reason: string) => Promise<void>;
  onReactivateAdherent: (adherent: Adherent) => Promise<void>;
  onExportToast: (text: string) => void;
}

type LibrarianTab = 'emprunts' | 'catalogue' | 'adherents' | 'rapports';
type StatusFilter = 'all' | LoanEffectiveStatus;

export const LibrarianWorkspace: React.FC<LibrarianWorkspaceProps> = ({
  currentUser,
  loans,
  books,
  adherents,
  busyLoanId,
  busyBookId,
  busyAdherentId,
  onExtendLoan,
  onReturnLoan,
  onRemindLoan,
  onValidatePickup,
  onOpenQrScanner,
  onOpenBulkReminder,
  onShowTicketQr,
  onBorrowBook,
  onReserveBook,
  onShowBookQr,
  onAddBook,
  onEditBook,
  onDeleteBook,
  onRegisterAdherent,
  onRenewAdherent,
  onSuspendAdherent,
  onReactivateAdherent,
  onExportToast,
}) => {
  const todayIso = getTodayIso();
  const [activeTab, setActiveTab] = useState<LibrarianTab>('emprunts');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const overdueLoans = useMemo(
    () => loans.filter((l) => getEffectiveLoanStatus(l, todayIso) === 'en_retard'),
    [loans, todayIso]
  );

  const filteredLoans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return loans.filter((loan) => {
      const effective = getEffectiveLoanStatus(loan, todayIso);
      if (statusFilter !== 'all' && effective !== statusFilter) return false;
      if (!q) return true;
      return (
        loan.bookTitle.toLowerCase().includes(q) ||
        loan.studentName.toLowerCase().includes(q) ||
        loan.studentCne.toLowerCase().includes(q) ||
        loan.ticketCode.toLowerCase().includes(q)
      );
    });
  }, [loans, searchQuery, statusFilter, todayIso]);

  return (
    <section aria-labelledby="librarian-heading" className="space-y-6">
      {/* En-tête et onglets du Bibliothécaire */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end">
        <div>
          <h2 id="librarian-heading" className="font-display text-2xl font-bold text-slate-900">
            Espace Bibliothécaire — Gestion globale
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Pilotage des emprunts, catalogue documentaire, adhérents et rapports statistiques.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Onglets de l'espace Bibliothécaire"
          className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 self-start lg:self-auto"
        >
          {(
            [
              { id: 'emprunts', label: 'Emprunts', icon: QrCode },
              { id: 'catalogue', label: 'Fonds documentaire', icon: BookOpen },
              { id: 'adherents', label: 'Adhérents & Lecteurs', icon: Users },
              { id: 'rapports', label: 'Rapports', icon: BarChart3 },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex cursor-pointer items-center gap-2 whitespace-nowrap shrink-0 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ONGLET 1 : EMPRUNTS */}
      {activeTab === 'emprunts' && (
        <div className="space-y-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-display text-xl font-bold text-slate-900">
                Suivi des prêts & Retours
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Prolongations, retours par QR, calcul des pénalités (5 DH/jour) et relances.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onOpenQrScanner}
                className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap shrink-0 rounded-lg bg-[#172554] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1e3a8a]"
              >
                <QrCode className="h-4 w-4" aria-hidden="true" />
                Scanner / Saisir un QR
              </button>

              <button
                type="button"
                disabled={overdueLoans.length === 0}
                onClick={onOpenBulkReminder}
                className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap shrink-0 rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              >
                <BellRing className="h-4 w-4" aria-hidden="true" />
                Relancer tous les retards ({overdueLoans.length})
              </button>
            </div>
          </div>

          {/* Filtres du tableau des emprunts */}
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par livre, étudiant, CNE ou ticket..."
                aria-label="Rechercher dans les emprunts"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div
              role="group"
              aria-label="Filtrer les emprunts par statut"
              className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1"
            >
              {(
                [
                  { id: 'all', label: 'Tous' },
                  { id: 'en_cours', label: 'En cours' },
                  { id: 'en_retard', label: 'En retard' },
                  { id: 'reserve', label: 'Réservé' },
                  { id: 'rendu', label: 'Rendu' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
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

          {/* Tableau des emprunts */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-4 py-3">Livre</th>
                    <th className="px-4 py-3">Étudiant</th>
                    <th className="px-4 py-3">Emprunt</th>
                    <th className="px-4 py-3">Retour prévu</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3 text-right">Pénalité</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLoans.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                        Aucun emprunt ne correspond aux filtres sélectionnés.
                      </td>
                    </tr>
                  ) : (
                    filteredLoans.map((loan) => {
                      const effectiveStatus = getEffectiveLoanStatus(loan, todayIso);
                      const daysLate = getLoanDaysLate(loan, todayIso);
                      const penalty = getLoanPenalty(loan, todayIso);
                      const isBusy = busyLoanId === loan.id;
                      const alreadyRemindedToday = loan.lastReminderDate === todayIso;
                      const isReturned = effectiveStatus === 'rendu';
                      const isReservation = effectiveStatus === 'reserve';

                      const statusClass =
                        effectiveStatus === 'en_retard'
                          ? 'font-semibold text-red-700'
                          : effectiveStatus === 'en_cours'
                          ? 'font-semibold text-emerald-700'
                          : effectiveStatus === 'reserve'
                          ? 'font-semibold text-amber-700'
                          : 'font-medium text-slate-500';

                      return (
                        <tr
                          key={loan.id}
                          className="transition-colors duration-150 hover:bg-slate-50/70"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{loan.bookTitle}</div>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                              <button
                                type="button"
                                onClick={() => onShowTicketQr(loan)}
                                className="cursor-pointer font-mono text-blue-800 underline underline-offset-2 hover:text-blue-950"
                              >
                                {loan.ticketCode}
                              </button>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">{loan.bookIsbn}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{loan.studentName}</div>
                            <div className="mt-0.5 font-mono text-xs text-slate-500">
                              {loan.studentCne} · {loan.studentFiliere}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                            {formatDateFr(loan.borrowDate)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                            {formatDateFr(loan.dueDate)}
                          </td>
                          <td className={`px-4 py-3 text-xs whitespace-nowrap ${statusClass}`}>
                            {getStatusLabel(effectiveStatus)}
                            {effectiveStatus === 'en_retard' && ` (${daysLate} j)`}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                            {penalty > 0 ? (
                              <span className="font-semibold text-red-700">{penalty} DH</span>
                            ) : (
                              <span className="text-slate-500">0 DH</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {isReservation ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => onValidatePickup(loan)}
                                    className="cursor-pointer rounded-md bg-[#172554] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#1e3a8a] disabled:opacity-50"
                                  >
                                    Valider retrait
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => onReturnLoan(loan)}
                                    className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    Retour
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    disabled={isReturned || isBusy}
                                    onClick={() => onExtendLoan(loan)}
                                    className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                                  >
                                    Prolonger
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isReturned || isBusy}
                                    onClick={() => onReturnLoan(loan)}
                                    className="cursor-pointer rounded-md bg-[#172554] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#1e3a8a] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                  >
                                    Retour
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isReturned || isBusy}
                                    title={
                                      alreadyRemindedToday
                                        ? 'Déjà relancé aujourd’hui'
                                        : 'Envoyer une relance'
                                    }
                                    onClick={() => onRemindLoan(loan)}
                                    className="cursor-pointer rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                                  >
                                    Relancer ({loan.reminderCount})
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ONGLET 2 : FONDS DOCUMENTAIRE */}
      {activeTab === 'catalogue' && (
        <CatalogSection
          books={books}
          currentUser={currentUser}
          busyBookId={busyBookId}
          onBorrowBook={onBorrowBook}
          onReserveBook={onReserveBook}
          onShowBookQr={onShowBookQr}
          onAddBook={onAddBook}
          onEditBook={onEditBook}
          onDeleteBook={onDeleteBook}
        />
      )}

      {/* ONGLET 3 : ADHÉRENTS & LECTEURS */}
      {activeTab === 'adherents' && (
        <ManagerWorkspace
          adherents={adherents}
          loans={loans}
          books={books}
          busyAdherentId={busyAdherentId}
          onRegisterAdherent={onRegisterAdherent}
          onRenewAdherent={onRenewAdherent}
          onSuspendAdherent={onSuspendAdherent}
          onReactivateAdherent={onReactivateAdherent}
          onExportToast={onExportToast}
        />
      )}

      {/* ONGLET 4 : RAPPORTS */}
      {activeTab === 'rapports' && (
        <ManagerReportsTab
          loans={loans}
          books={books}
          adherents={adherents}
          onExportToast={onExportToast}
        />
      )}
    </section>
  );
};
