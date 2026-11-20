import React, { useMemo, useState } from 'react';
import { ActionType, AuditLogEntry } from '../types/library';
import { formatDateTimeFr, getActionLabel } from '../utils/libraryUtils';

interface JournalSectionProps {
  logs: AuditLogEntry[];
  isSignedIn: boolean;
  onOpenAuth: () => void;
}

type LogFilter = 'all' | ActionType;

export const JournalSection: React.FC<JournalSectionProps> = ({
  logs,
  isSignedIn,
  onOpenAuth,
}) => {
  const [filterType, setFilterType] = useState<LogFilter>('all');

  const filteredLogs = useMemo(() => {
    if (filterType === 'all') return logs;
    return logs.filter((log) => log.actionType === filterType);
  }, [logs, filterType]);

  return (
    <section aria-labelledby="journal-heading" className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 id="journal-heading" className="font-display text-2xl font-bold text-slate-900">
            Journal d’activité
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Historique chronologique des actions : qui, quoi et quand (emprunt, retour, prolongation, relance, adhérents).
          </p>
        </div>

        <div
          role="group"
          aria-label="Filtrer par type d’action"
          className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1"
        >
          {(
            [
              { id: 'all', label: 'Toutes' },
              { id: 'emprunt', label: 'Emprunt' },
              { id: 'reservation', label: 'Réservation' },
              { id: 'retour', label: 'Retour' },
              { id: 'prolongation', label: 'Prolongation' },
              { id: 'relance', label: 'Relance' },
              { id: 'ajout_livre', label: 'Ajout livre' },
              { id: 'modification_livre', label: 'Modification' },
              { id: 'inscription_adherent', label: 'Inscription' },
              { id: 'renouvellement_adherent', label: 'Renouvellement' },
              { id: 'suspension_adherent', label: 'Suspension' },
              { id: 'reactivation_adherent', label: 'Réactivation' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilterType(item.id)}
              className={`cursor-pointer whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                filterType === item.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {!isSignedIn ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">
            Connectez-vous ou activez un accès rapide démo pour consulter et alimenter le journal des actions.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="mt-4 cursor-pointer rounded-lg bg-[#172554] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3a8a]"
          >
            Connexion / Accès démo
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Quand</th>
                  <th className="px-4 py-3">Qui</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Quoi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-500">
                      Aucune action enregistrée dans le journal pour ce filtre.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((entry) => {
                    const typeColor =
                      entry.actionType === 'suspension_adherent'
                        ? 'text-red-700'
                        : entry.actionType === 'relance'
                        ? 'text-amber-700'
                        : entry.actionType === 'retour' ||
                          entry.actionType === 'ajout_livre' ||
                          entry.actionType === 'inscription_adherent' ||
                          entry.actionType === 'reactivation_adherent'
                        ? 'text-emerald-700'
                        : entry.actionType === 'prolongation' ||
                          entry.actionType === 'modification_livre' ||
                          entry.actionType === 'renouvellement_adherent'
                        ? 'text-blue-800'
                        : 'text-slate-900';

                    return (
                      <tr
                        key={entry.id}
                        className="transition-colors duration-150 hover:bg-slate-50/70"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {formatDateTimeFr(entry.createdAtMs)}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                          {entry.actorName}
                        </td>
                        <td className={`px-4 py-3 text-xs font-semibold whitespace-nowrap ${typeColor}`}>
                          {getActionLabel(entry.actionType)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{entry.description}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
