import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Adherent, Book, Loan } from '../types/library';
import {
  formatDateFr,
  getEffectiveLoanStatus,
  getLoanDaysLate,
  getLoanPenalty,
  getStatusLabel,
  getTodayIso,
} from '../utils/libraryUtils';
import { BookCover } from './BookCover';

interface SuspendConfirmModalProps {
  adherent: Adherent | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirmSuspend: (adherent: Adherent, reason: string) => Promise<void>;
}

const SUGGESTED_REASONS = [
  'Retard prolongé non régularisé',
  'Pénalités de retard impayées',
  'Ouvrage détérioré ou non restitué',
];

export const SuspendConfirmModal: React.FC<SuspendConfirmModalProps> = ({
  adherent,
  isSubmitting,
  onClose,
  onConfirmSuspend,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (adherent) {
      setReason('');
      setError(null);
    }
  }, [adherent]);

  if (!adherent) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = reason.trim();
    if (!clean) {
      setError('Veuillez indiquer le motif de la suspension.');
      return;
    }
    setError(null);
    await onConfirmSuspend(adherent, clean);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="suspend-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="suspend-modal-title" className="font-display text-lg font-bold text-slate-900">
              Suspendre l’adhérent
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {adherent.fullName} ({adherent.cardNumber}) ne pourra plus effectuer de nouveaux emprunts tant que son compte reste suspendu.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="suspend-reason" className="block text-xs font-medium text-slate-700">
              Motif de suspension <span className="text-red-700">*</span>
            </label>
            <textarea
              id="suspend-reason"
              rows={3}
              maxLength={240}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Indiquez la raison de la suspension..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-red-700 focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTED_REASONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setReason(item)}
                  className="cursor-pointer rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="cursor-pointer rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            >
              {isSubmitting ? 'Suspension...' : 'Confirmer la suspension'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ReactivateConfirmModalProps {
  adherent: Adherent | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirmReactivate: (adherent: Adherent) => Promise<void>;
}

export const ReactivateConfirmModal: React.FC<ReactivateConfirmModalProps> = ({
  adherent,
  isSubmitting,
  onClose,
  onConfirmReactivate,
}) => {
  if (!adherent) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reactivate-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="reactivate-modal-title"
              className="font-display text-lg font-bold text-slate-900"
            >
              Réactiver l’adhérent
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Confirmez la réactivation du dossier de{' '}
              <span className="font-semibold text-slate-900">{adherent.fullName}</span> (
              <span className="font-mono">{adherent.cardNumber}</span>) pour rétablir ses droits d’emprunt.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {adherent.suspensionReason && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
            <span className="font-semibold">Motif initial :</span> {adherent.suspensionReason}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onConfirmReactivate(adherent)}
            className="cursor-pointer rounded-lg bg-[#172554] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e3a8a] disabled:opacity-60"
          >
            {isSubmitting ? 'Réactivation...' : 'Confirmer la réactivation'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface AdherentLoansHistoryModalProps {
  adherent: Adherent | null;
  loans: Loan[];
  books: Book[];
  onClose: () => void;
}

export const AdherentLoansHistoryModal: React.FC<AdherentLoansHistoryModalProps> = ({
  adherent,
  loans,
  books,
  onClose,
}) => {
  if (!adherent) return null;

  const todayIso = getTodayIso();
  const booksById = new Map(books.map((b) => [b.id, b]));
  const matchingLoans = loans.filter(
    (l) =>
      l.studentUid === adherent.studentUid ||
      l.studentCne.toUpperCase() === adherent.cne.toUpperCase()
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="adherent-history-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4"
    >
      <div className="my-8 w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2
              id="adherent-history-title"
              className="font-display text-lg font-bold text-slate-900"
            >
              Historique des emprunts — {adherent.fullName}
            </h2>
            <p className="mt-1 font-mono text-xs text-slate-500">
              {adherent.cardNumber} · CNE {adherent.cne} · Apogée {adherent.apogee} ·{' '}
              {adherent.filiere}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer l’historique"
            className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-2.5">Livre</th>
                  <th className="px-4 py-2.5">Emprunt</th>
                  <th className="px-4 py-2.5">Retour prévu</th>
                  <th className="px-4 py-2.5">Retour effectif</th>
                  <th className="px-4 py-2.5">Statut</th>
                  <th className="px-4 py-2.5 text-right">Pénalité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matchingLoans.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                      Aucun emprunt enregistré pour cet adhérent.
                    </td>
                  </tr>
                ) : (
                  matchingLoans.map((loan) => {
                    const effective = getEffectiveLoanStatus(loan, todayIso);
                    const daysLate = getLoanDaysLate(loan, todayIso);
                    const penalty = getLoanPenalty(loan, todayIso);
                    const bookMeta = booksById.get(loan.bookId);

                    const statusColor =
                      effective === 'en_retard'
                        ? 'font-semibold text-red-700'
                        : effective === 'en_cours'
                        ? 'font-semibold text-emerald-700'
                        : effective === 'reserve'
                        ? 'font-semibold text-amber-700'
                        : 'text-slate-500';

                    return (
                      <tr key={loan.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <BookCover
                              title={bookMeta?.title || loan.bookTitle}
                              genre={bookMeta?.genre || bookMeta?.filiere || loan.bookFiliere}
                              coverImage={bookMeta?.coverImage}
                              size="sm"
                            />
                            <div>
                              <div className="font-medium text-slate-900">{bookMeta?.title || loan.bookTitle}</div>
                              <div className="font-mono text-xs text-slate-500">
                                {loan.ticketCode}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          {formatDateFr(loan.borrowDate)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          {formatDateFr(loan.dueDate)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          {formatDateFr(loan.returnDate)}
                        </td>
                        <td className={`px-4 py-2.5 text-xs whitespace-nowrap ${statusColor}`}>
                          {getStatusLabel(effective)}
                          {effective === 'en_retard' && ` (${daysLate} j)`}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                          {penalty > 0 ? (
                            <span className="font-semibold text-red-700">{penalty} €</span>
                          ) : (
                            <span className="text-slate-500">0 €</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg bg-[#172554] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3a8a]"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
