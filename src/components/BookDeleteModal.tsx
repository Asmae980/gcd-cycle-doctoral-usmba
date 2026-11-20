import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Book, Loan } from '../types/library';
import { getEffectiveLoanStatus, getTodayIso } from '../utils/libraryUtils';

interface BookDeleteModalProps {
  book: Book | null;
  loans: Loan[];
  isSubmitting: boolean;
  onClose: () => void;
  onConfirmDelete: (book: Book) => Promise<void>;
}

export const BookDeleteModal: React.FC<BookDeleteModalProps> = ({
  book,
  loans,
  isSubmitting,
  onClose,
  onConfirmDelete,
}) => {
  if (!book) return null;

  const todayIso = getTodayIso();
  const activeBorrowedCount = loans.filter((l) => {
    if (l.bookId !== book.id) return false;
    const eff = getEffectiveLoanStatus(l, todayIso);
    return eff === 'en_cours' || eff === 'en_retard' || eff === 'reserve';
  }).length;

  const isBlocked = activeBorrowedCount > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-delete-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                isBlocked ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 id="book-delete-title" className="font-display text-lg font-bold text-slate-900">
                {isBlocked ? 'Suppression impossible' : 'Supprimer le livre'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {book.title} ({book.isbn})
              </p>
            </div>
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

        <div className="mt-5 text-sm text-slate-600">
          {isBlocked ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 text-xs font-semibold">
              Impossible de supprimer : {activeBorrowedCount} exemplaire(s) sont actuellement empruntés ou réservés.
            </p>
          ) : (
            <p>
              Supprimer définitivement ce livre ? Cette action est irréversible.
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {isBlocked ? 'Fermer' : 'Annuler'}
          </button>
          {!isBlocked && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void onConfirmDelete(book)}
              className="cursor-pointer rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            >
              {isSubmitting ? 'Suppression...' : 'Confirmer la suppression'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
