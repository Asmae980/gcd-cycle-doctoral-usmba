import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, X } from 'lucide-react';
import { Book, Loan } from '../types/library';
import {
  formatDateFr,
  getEffectiveLoanStatus,
  getLoanPenalty,
  getStatusLabel,
  getTodayIso,
} from '../utils/libraryUtils';
import { BookCover } from './BookCover';

interface QrTicketModalProps {
  loan: Loan | null;
  book: Book | null;
  books?: Book[];
  onClose: () => void;
}

export const QrTicketModal: React.FC<QrTicketModalProps> = ({ loan, book, books, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const codeValue = loan ? loan.ticketCode : book ? book.qrCode : '';

  useEffect(() => {
    let active = true;
    if (!codeValue) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(codeValue, {
      width: 240,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [codeValue]);

  if (!loan && !book) return null;

  const resolvedBook =
    book || (loan && books ? books.find((b) => b.id === loan.bookId) : undefined);

  const todayIso = getTodayIso();
  const effectiveStatus = loan ? getEffectiveLoanStatus(loan, todayIso) : null;
  const penalty = loan ? getLoanPenalty(loan, todayIso) : 0;

  const handleCopy = async () => {
    if (!codeValue) return;
    try {
      await navigator.clipboard.writeText(codeValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback silencieux si le presse-papier est restreint
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-ticket-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="qr-ticket-title" className="font-display text-lg font-bold text-slate-900">
              {loan ? 'Ticket QR d’emprunt' : 'Code QR de l’ouvrage'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {loan
                ? 'À présenter au bibliothécaire lors du retrait ou du retour.'
                : 'À scanner pour enregistrer un emprunt rapide.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le ticket QR"
            className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Image QR générée */}
        <div className="mt-5 flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 p-5">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`Code QR ${codeValue}`}
              className="h-44 w-44 rounded-md bg-white p-2"
            />
          ) : (
            <div className="flex h-44 w-44 items-center justify-center rounded-md bg-white text-xs text-slate-400">
              Génération du QR...
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-900">{codeValue}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex cursor-pointer items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-700" />
                  Copié
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copier
                </>
              )}
            </button>
          </div>
        </div>

        {/* Informations détaillées avec vignette de couverture */}
        {loan ? (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-3">
              <BookCover
                title={resolvedBook?.title || loan.bookTitle}
                genre={resolvedBook?.genre || resolvedBook?.filiere || loan.bookFiliere}
                coverImage={resolvedBook?.coverImage}
                size="md"
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900">{resolvedBook?.title || loan.bookTitle}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {resolvedBook?.author || loan.bookAuthor} · {resolvedBook?.genre || resolvedBook?.filiere || loan.bookFiliere}
                </div>
              </div>
            </div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Étudiant</dt>
                <dd className="text-right font-medium text-slate-900">
                  {loan.studentName} · <span className="font-mono">{loan.studentCne}</span>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Emprunt / Retour prévu</dt>
                <dd className="font-mono text-slate-700 tabular-nums">
                  {formatDateFr(loan.borrowDate)} → {formatDateFr(loan.dueDate)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Statut</dt>
                <dd className="font-semibold text-slate-900">
                  {effectiveStatus ? getStatusLabel(effectiveStatus) : ''}
                  {penalty > 0 ? ` · Pénalité : ${penalty} DH` : ''}
                </dd>
              </div>
            </dl>
          </div>
        ) : book ? (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-3">
              <BookCover
                title={book.title}
                filiere={book.filiere}
                coverImage={book.coverImage}
                size="md"
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900">{book.title}</div>
                <div className="mt-0.5 text-xs text-slate-500">{book.author}</div>
              </div>
            </div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">ISBN / Filière</dt>
                <dd className="font-mono text-slate-700">
                  {book.isbn} · {book.filiere}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Disponibilité</dt>
                <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                  {book.availableCopies} / {book.totalCopies}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
};
