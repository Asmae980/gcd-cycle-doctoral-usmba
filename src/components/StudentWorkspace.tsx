import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { AlertTriangle, Clock, Maximize2, QrCode, X } from 'lucide-react';
import { Adherent, Book, Filiere, Loan, UserProfile } from '../types/library';
import {
  FILIERES,
  formatDateFr,
  formatHourFr,
  getEffectiveLoanStatus,
  getGuichetOpeningStatus,
  getLoanDaysLate,
  getLoanPenalty,
  getStatusLabel,
  getTodayIso,
  GUICHET_OPENING_HOURS,
} from '../utils/libraryUtils';
import { BookCover } from './BookCover';

interface StudentWorkspaceProps {
  student: UserProfile;
  adherent?: Adherent | null;
  books: Book[];
  loans: Loan[];
  onShowTicketQr: (loan: Loan) => void;
  onCancelReservation: (loan: Loan) => void;
  onGoToCatalog: () => void;
  onUpdateProfile: (fullName: string, cne: string, filiere: Filiere) => Promise<void>;
}

export const StudentWorkspace: React.FC<StudentWorkspaceProps> = ({
  student,
  adherent,
  books,
  loans,
  onShowTicketQr,
  onCancelReservation,
  onGoToCatalog,
  onUpdateProfile,
}) => {
  const isSuspended = adherent?.status === 'suspendu';
  const todayIso = getTodayIso();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(student.fullName);
  const [editCne, setEditCne] = useState(student.cne);
  const [editFiliere, setEditFiliere] = useState<Filiere>(
    student.filiere === 'Administration' ? 'GI' : student.filiere
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [photoLoadError, setPhotoLoadError] = useState(false);

  // QR de la carte de lecture (basé sur le CNE)
  const [cneQrUrl, setCneQrUrl] = useState<string>('');
  const [cneQrLargeUrl, setCneQrLargeUrl] = useState<string>('');
  const [isQrEnlarged, setIsQrEnlarged] = useState(false);

  // Horaires du guichet EST en temps réel
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    setPhotoLoadError(false);
  }, [student.photoUrl]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    if (!student.cne) return;

    QRCode.toDataURL(student.cne, {
      width: 144,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setCneQrUrl(url);
      })
      .catch(() => {
        if (active) setCneQrUrl('');
      });

    QRCode.toDataURL(student.cne, {
      width: 320,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setCneQrLargeUrl(url);
      })
      .catch(() => {
        if (active) setCneQrLargeUrl('');
      });

    return () => {
      active = false;
    };
  }, [student.cne]);

  const guichetStatus = getGuichetOpeningStatus(now);

  const booksById = useMemo(
    () => new Map(books.map((book) => [book.id, book])),
    [books]
  );

  const studentLoans = useMemo(() => {
    const cleanUid = student.uid;
    const cleanCne = (student.cne || '').toUpperCase();
    const cleanName = student.fullName.toLowerCase().trim();
    return loans.filter((l) => {
      if (l.studentUid === cleanUid) return true;
      if (cleanCne && l.studentCne && l.studentCne.toUpperCase() === cleanCne) return true;
      if (cleanName && l.studentName && l.studentName.toLowerCase().trim() === cleanName) return true;
      return false;
    });
  }, [loans, student.uid, student.cne, student.fullName]);

  const activeCount = studentLoans.filter((l) => {
    const eff = getEffectiveLoanStatus(l, todayIso);
    return eff === 'en_cours' || eff === 'en_retard';
  }).length;

  const lateCount = studentLoans.filter(
    (l) => getEffectiveLoanStatus(l, todayIso) === 'en_retard'
  ).length;

  const totalPenalty = studentLoans.reduce(
    (sum, l) => sum + getLoanPenalty(l, todayIso),
    0
  );

  const initials = student.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await onUpdateProfile(editName, editCne, editFiliere);
      setIsEditingProfile(false);
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <section aria-labelledby="student-heading" className="space-y-6">
      {isSuspended && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-900"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
          <div>
            <div className="font-semibold">
              Votre dossier adhérent est actuellement suspendu — les nouveaux emprunts sont bloqués.
            </div>
            {adherent?.suspensionReason && (
              <div className="mt-1 text-xs text-red-800">
                Motif : {adherent.suspensionReason}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 id="student-heading" className="font-display text-2xl font-bold text-slate-900">
            Espace Étudiant — Mes emprunts
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span className="font-medium text-slate-900">{student.fullName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">CNE {student.cne}</span>
            <span aria-hidden="true">·</span>
            <span>Filière {student.filiere}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => {
                setEditName(student.fullName);
                setEditCne(student.cne);
                setEditFiliere(
                  student.filiere === 'Administration' ? 'GI' : student.filiere
                );
                setIsEditingProfile((prev) => !prev);
              }}
              className="cursor-pointer font-medium text-blue-800 underline underline-offset-2 hover:text-blue-950"
            >
              {isEditingProfile ? 'Fermer' : 'Modifier CNE / filière'}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onGoToCatalog}
          className="cursor-pointer whitespace-nowrap shrink-0 rounded-lg bg-[#172554] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1e3a8a]"
        >
          Emprunter ou réserver un livre
        </button>
      </div>

      {/* Formulaire de mise à jour CNE / filière pour un compte Google */}
      {isEditingProfile && (
        <form
          onSubmit={handleSaveProfile}
          className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-4 sm:items-end"
        >
          <div>
            <label htmlFor="stu-name" className="block text-xs font-medium text-slate-600">
              Nom complet
            </label>
            <input
              id="stu-name"
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="stu-cne" className="block text-xs font-medium text-slate-600">
              CNE
            </label>
            <input
              id="stu-cne"
              type="text"
              required
              value={editCne}
              onChange={(e) => setEditCne(e.target.value.toUpperCase())}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="stu-filiere" className="block text-xs font-medium text-slate-600">
              Filière
            </label>
            <select
              id="stu-filiere"
              value={editFiliere}
              onChange={(e) => setEditFiliere(e.target.value as Filiere)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
            >
              {FILIERES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="cursor-pointer rounded-lg bg-[#172554] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3a8a] disabled:opacity-60"
          >
            {savingProfile ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </form>
      )}

      {/* Carte de lecture numérique + Horaires du guichet EST */}
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        {/* Carte de lecture numérique */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Carte de lecture numérique
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Année universitaire 2026/2027 · USMBA – EST
              </p>
            </div>
            <span
              className={`text-xs font-semibold ${
                isSuspended ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {isSuspended ? 'Suspendue' : 'Active'}
            </span>
          </div>

          <div className="mt-5 flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              {student.photoUrl && !photoLoadError ? (
                <img
                  src={student.photoUrl}
                  alt={`Photo de ${student.fullName}`}
                  referrerPolicy="no-referrer"
                  onError={() => setPhotoLoadError(true)}
                  className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[#172554] font-display text-lg font-bold text-white"
                >
                  {initials || 'ET'}
                </div>
              )}

              <dl className="space-y-1.5 text-sm">
                <div>
                  <dt className="sr-only">Nom et prénom</dt>
                  <dd className="font-display text-base font-bold text-slate-900">
                    {student.fullName}
                  </dd>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
                  <dt className="text-slate-500">CNE :</dt>
                  <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                    {student.cne}
                  </dd>
                  <span aria-hidden="true">·</span>
                  <dt className="text-slate-500">Filière :</dt>
                  <dd className="font-semibold text-slate-900">{student.filiere}</dd>
                </div>
                <div className="flex items-center gap-x-2 text-xs text-slate-600">
                  <dt className="text-slate-500">Année universitaire :</dt>
                  <dd className="font-mono text-slate-800 tabular-nums">2026/2027</dd>
                </div>
                <div className="flex items-center gap-x-2 text-xs">
                  <dt className="text-slate-500">Statut :</dt>
                  <dd
                    className={`font-semibold ${
                      isSuspended ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    {isSuspended ? 'Suspendue' : 'Active'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* QR Code basé sur le CNE */}
            <div className="flex flex-col items-center gap-2 self-start rounded-lg border border-slate-200 bg-slate-50 p-3 sm:self-auto">
              {cneQrUrl ? (
                <img
                  src={cneQrUrl}
                  alt={`QR Code CNE ${student.cne}`}
                  className="h-24 w-24 rounded bg-white p-1"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded bg-white text-xs text-slate-400">
                  QR...
                </div>
              )}
              <button
                type="button"
                onClick={() => setIsQrEnlarged(true)}
                className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                <Maximize2 className="h-3 w-3" aria-hidden="true" />
                Agrandir le QR
              </button>
            </div>
          </div>
        </div>

        {/* Horaires du guichet EST */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-slate-900">
                Horaires du guichet EST
              </h3>
            </div>
            <span
              className={`text-xs font-semibold whitespace-nowrap ${
                guichetStatus.isOpen ? 'text-emerald-700' : 'text-slate-600'
              }`}
            >
              {guichetStatus.statusLabel}
            </span>
          </div>

          <div className="mt-3 divide-y divide-slate-100 text-xs">
            {GUICHET_OPENING_HOURS.map((day) => {
              const isToday = day.dayIndex === guichetStatus.currentDayIndex;
              return (
                <div
                  key={day.dayIndex}
                  className={`flex items-center justify-between gap-2 py-1.5 ${
                    isToday ? 'font-semibold text-slate-900' : 'text-slate-600'
                  }`}
                >
                  <span>
                    {day.dayName}
                    {isToday ? ' (aujourd’hui)' : ''}
                  </span>
                  <span className="font-mono tabular-nums text-right">
                    {day.slots.length === 0
                      ? 'Fermé'
                      : day.slots
                          .map((s) => `${formatHourFr(s.start)} – ${formatHourFr(s.end)}`)
                          .join(' et ')}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
            {guichetStatus.nextOpeningText}
          </div>
        </div>
      </div>

      {/* Résumé rapide */}
      <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white">
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Emprunts en cours</div>
          <div className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {activeCount}
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">En retard</div>
          <div
            className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
              lateCount > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {lateCount}
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Pénalités cumulées</div>
          <div
            className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
              totalPenalty > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {totalPenalty} DH
          </div>
        </div>
      </div>

      {/* Tableau des emprunts de l'étudiant */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3">Livre</th>
                <th className="px-4 py-3">Date d’emprunt</th>
                <th className="px-4 py-3">Date de retour prévue</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Pénalité</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {studentLoans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                    Vous n’avez aucun emprunt enregistré pour le moment.
                  </td>
                </tr>
              ) : (
                studentLoans.map((loan) => {
                  const effectiveStatus = getEffectiveLoanStatus(loan, todayIso);
                  const daysLate = getLoanDaysLate(loan, todayIso);
                  const penalty = getLoanPenalty(loan, todayIso);

                  const statusClass =
                    effectiveStatus === 'en_retard'
                      ? 'font-semibold text-red-700'
                      : effectiveStatus === 'en_cours'
                      ? 'font-semibold text-emerald-700'
                      : effectiveStatus === 'reserve'
                      ? 'font-semibold text-amber-700'
                      : 'font-medium text-slate-500';

                  const matchedBook = booksById.get(loan.bookId);

                  return (
                    <tr
                      key={loan.id}
                      className="transition-colors duration-150 hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <BookCover
                            title={matchedBook?.title || loan.bookTitle}
                            genre={matchedBook?.genre || matchedBook?.filiere || loan.bookFiliere}
                            coverImage={matchedBook?.coverImage}
                            size="sm"
                          />
                          <div>
                            <div className="font-medium text-slate-900">{matchedBook?.title || loan.bookTitle}</div>
                            <div className="mt-0.5 text-xs text-slate-500">
                              {matchedBook?.author || loan.bookAuthor} · {matchedBook?.genre || matchedBook?.filiere || loan.bookFiliere} ·{' '}
                              <span className="font-mono">{loan.ticketCode}</span>
                            </div>
                          </div>
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
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onShowTicketQr(loan)}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                            Ticket QR
                          </button>
                          {effectiveStatus === 'reserve' && (
                            <button
                              type="button"
                              onClick={() => onCancelReservation(loan)}
                              className="cursor-pointer rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                            >
                              Annuler
                            </button>
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

      {/* Modale QR Code agrandi pour la carte de lecture */}
      {isQrEnlarged && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cne-qr-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="cne-qr-modal-title" className="font-display text-lg font-bold text-slate-900">
                  Carte de lecture numérique
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  À scanner au guichet pour enregistrer un emprunt.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsQrEnlarged(false)}
                aria-label="Fermer le QR agrandi"
                className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 p-6">
              {cneQrLargeUrl && (
                <img
                  src={cneQrLargeUrl}
                  alt={`QR Code agrandi pour CNE ${student.cne}`}
                  className="h-64 w-64 rounded-md bg-white p-2"
                />
              )}
              <div className="mt-3 font-mono text-base font-bold text-slate-900">
                {student.cne}
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {student.fullName} · Filière {student.filiere} · 2026/2027
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
