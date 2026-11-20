import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { Filiere, Loan } from '../types/library';
import {
  getEffectiveLoanStatus,
  getLoanDaysLate,
  getLoanPenalty,
  getTodayIso,
} from '../utils/libraryUtils';

interface StudentOverdueGroup {
  studentUid: string;
  studentName: string;
  studentCne: string;
  studentFiliere: Filiere;
  loans: Loan[];
  totalPenalty: number;
  maxDaysLate: number;
  alreadyRemindedToday: boolean;
}

interface BulkReminderSummary {
  sentMessages: {
    studentName: string;
    studentCne: string;
    studentFiliere: Filiere;
    booksCount: number;
    bookTitles: string[];
    totalPenalty: number;
  }[];
  skippedAlreadyTodayCount: number;
}

interface BulkReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  loans: Loan[];
  onSendBulkReminders: (selectedLoans: Loan[]) => Promise<void>;
}

export const BulkReminderModal: React.FC<BulkReminderModalProps> = ({
  isOpen,
  onClose,
  loans,
  onSendBulkReminders,
}) => {
  const todayIso = getTodayIso();
  const [selectedStudentUids, setSelectedStudentUids] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [summary, setSummary] = useState<BulkReminderSummary | null>(null);

  const studentGroups = useMemo<StudentOverdueGroup[]>(() => {
    const overdue = loans.filter(
      (l) => getEffectiveLoanStatus(l, todayIso) === 'en_retard'
    );
    const map = new Map<string, StudentOverdueGroup>();

    for (const loan of overdue) {
      const existing = map.get(loan.studentUid);
      const penalty = getLoanPenalty(loan, todayIso);
      const daysLate = getLoanDaysLate(loan, todayIso);
      const remindedToday = loan.lastReminderDate === todayIso;

      if (!existing) {
        map.set(loan.studentUid, {
          studentUid: loan.studentUid,
          studentName: loan.studentName,
          studentCne: loan.studentCne,
          studentFiliere: loan.studentFiliere,
          loans: [loan],
          totalPenalty: penalty,
          maxDaysLate: daysLate,
          alreadyRemindedToday: remindedToday,
        });
      } else {
        existing.loans.push(loan);
        existing.totalPenalty += penalty;
        existing.maxDaysLate = Math.max(existing.maxDaysLate, daysLate);
        existing.alreadyRemindedToday = existing.alreadyRemindedToday || remindedToday;
      }
    }

    return Array.from(map.values());
  }, [loans, todayIso]);

  useEffect(() => {
    if (isOpen) {
      setSummary(null);
      setIsSending(false);
      setSelectedStudentUids(
        studentGroups
          .filter((g) => !g.alreadyRemindedToday)
          .map((g) => g.studentUid)
      );
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleStudent = (uid: string) => {
    setSelectedStudentUids((prev) =>
      prev.includes(uid) ? prev.filter((item) => item !== uid) : [...prev, uid]
    );
  };

  const handleConfirmSend = async () => {
    const chosenGroups = studentGroups.filter(
      (g) => !g.alreadyRemindedToday && selectedStudentUids.includes(g.studentUid)
    );
    if (chosenGroups.length === 0) return;

    setIsSending(true);
    try {
      const loansToRemind = chosenGroups.flatMap((g) => g.loans);
      await onSendBulkReminders(loansToRemind);

      setSummary({
        sentMessages: chosenGroups.map((g) => ({
          studentName: g.studentName,
          studentCne: g.studentCne,
          studentFiliere: g.studentFiliere,
          booksCount: g.loans.length,
          bookTitles: g.loans.map((l) => l.bookTitle),
          totalPenalty: g.totalPenalty,
        })),
        skippedAlreadyTodayCount: studentGroups.filter((g) => g.alreadyRemindedToday)
          .length,
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-reminder-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="bulk-reminder-title" className="font-display text-xl font-bold text-slate-900">
              {summary
                ? 'Résumé de l’envoi groupé'
                : 'Relancer tous les étudiants en retard'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {summary
                ? 'Un message unique a été simulé pour chaque étudiant sélectionné.'
                : 'Un seul message regroupant l’ensemble de ses ouvrages en retard est envoyé par étudiant (maximum une relance par jour).'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre de relance"
            className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {summary ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
              <div>
                <span className="font-semibold">
                  {summary.sentMessages.length} message{summary.sentMessages.length > 1 ? 's' : ''} envoyé
                  {summary.sentMessages.length > 1 ? 's' : ''}
                </span>
                {summary.skippedAlreadyTodayCount > 0 && (
                  <span className="text-emerald-800">
                    {' '}
                    · {summary.skippedAlreadyTodayCount} étudiant
                    {summary.skippedAlreadyTodayCount > 1 ? 's' : ''} ignoré
                    {summary.skippedAlreadyTodayCount > 1 ? 's' : ''} (déjà relancé
                    {summary.skippedAlreadyTodayCount > 1 ? 's' : ''} aujourd’hui)
                  </span>
                )}
              </div>
            </div>

            <div className="max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200">
              {summary.sentMessages.map((msg) => (
                <div key={msg.studentCne} className="p-3.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {msg.studentName} · <span className="font-mono text-xs">{msg.studentCne}</span> ({msg.studentFiliere})
                    </span>
                    <span className="font-mono text-xs font-semibold text-red-700 tabular-nums">
                      Pénalité : {msg.totalPenalty} DH
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    Message simulé : « Rappel de retour ({msg.booksCount} ouvrage
                    {msg.booksCount > 1 ? 's' : ''}) : {msg.bookTitles.join(', ')} ».
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-lg bg-[#172554] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1e3a8a]"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="max-h-80 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200">
              {studentGroups.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Aucun étudiant en retard actuellement.
                </div>
              ) : (
                studentGroups.map((group) => {
                  const isChecked = selectedStudentUids.includes(group.studentUid);
                  return (
                    <label
                      key={group.studentUid}
                      className={`flex items-start gap-3.5 p-4 ${
                        group.alreadyRemindedToday
                          ? 'cursor-not-allowed bg-slate-50 opacity-70'
                          : 'cursor-pointer hover:bg-slate-50/70'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={group.alreadyRemindedToday}
                        checked={isChecked}
                        onChange={() => toggleStudent(group.studentUid)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-[#172554] focus:ring-blue-800"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900">
                            {group.studentName}{' '}
                            <span className="font-mono text-xs font-normal text-slate-500">
                              · {group.studentCne} · {group.studentFiliere}
                            </span>
                          </div>
                          <div className="font-mono text-xs font-semibold text-red-700 tabular-nums">
                            {group.maxDaysLate} j de retard · {group.totalPenalty} DH
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          {group.loans.length} ouvrage{group.loans.length > 1 ? 's' : ''} :{' '}
                          {group.loans.map((l) => l.bookTitle).join(' ; ')}
                        </div>
                        {group.alreadyRemindedToday && (
                          <div className="mt-1 text-xs font-medium text-amber-700">
                            Déjà relancé aujourd’hui (envoi bloqué pour éviter le doublon).
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="text-xs text-slate-500 tabular-nums">
                {selectedStudentUids.length} étudiant
                {selectedStudentUids.length > 1 ? 's' : ''} sélectionné
                {selectedStudentUids.length > 1 ? 's' : ''}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={selectedStudentUids.length === 0 || isSending}
                  onClick={handleConfirmSend}
                  className="cursor-pointer rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {isSending
                    ? 'Envoi en cours...'
                    : `Envoyer les relances (${selectedStudentUids.length})`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
