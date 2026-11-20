import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Adherent, Book, Filiere, Loan } from '../types/library';
import { FILIERES, formatDateFr, formatDateTimeFr, getTodayIso } from '../utils/libraryUtils';
import {
  computeLibraryReport,
  exportReportToCsv,
  exportReportToPdf,
  ReportPeriodPreset,
} from '../utils/reportExport';

interface ManagerReportsTabProps {
  loans: Loan[];
  books: Book[];
  adherents: Adherent[];
  onExportToast: (text: string) => void;
}

const PERIOD_OPTIONS: { id: ReportPeriodPreset; label: string }[] = [
  { id: '7d', label: '7 jours' },
  { id: '30d', label: '30 jours' },
  { id: 'semester', label: 'Semestre' },
  { id: 'academic_year', label: 'Année universitaire' },
  { id: 'custom', label: 'Dates personnalisées' },
];

export const ManagerReportsTab: React.FC<ManagerReportsTabProps> = ({
  loans,
  books,
  adherents,
  onExportToast,
}) => {
  const todayIso = getTodayIso();
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodPreset>('30d');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(todayIso);
  const [selectedFiliere, setSelectedFiliere] = useState<'ALL' | Filiere>('ALL');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isExportMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExportMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isExportMenuOpen]);

  const report = useMemo(
    () =>
      computeLibraryReport({
        loans,
        books,
        adherents,
        preset: periodPreset,
        customStart,
        customEnd,
        selectedFiliere,
        todayIso,
      }),
    [loans, books, adherents, periodPreset, customStart, customEnd, selectedFiliere, todayIso]
  );

  const handleExportPdf = () => {
    setIsExportMenuOpen(false);
    exportReportToPdf(report);
    onExportToast('Rapport PDF téléchargé.');
  };

  const handleExportCsv = () => {
    setIsExportMenuOpen(false);
    exportReportToCsv(report);
    onExportToast('Rapport CSV téléchargé.');
  };

  // Données calculées pour les 3 graphiques SVG
  const timeChart = useMemo(() => {
    const width = 520;
    const height = 190;
    const padLeft = 32;
    const padRight = 16;
    const padTop = 18;
    const padBottom = 30;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const points = report.timeSeries;
    const maxVal = Math.max(1, ...points.map((p) => p.count));
    const step = points.length > 1 ? plotW / (points.length - 1) : 0;

    const coords = points.map((p, idx) => {
      const x = points.length === 1 ? padLeft + plotW / 2 : padLeft + idx * step;
      const y = padTop + plotH - (p.count / maxVal) * plotH;
      return { ...p, x, y };
    });

    const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const areaPath =
      coords.length > 0
        ? `M ${coords[0].x.toFixed(1)},${(padTop + plotH).toFixed(1)} ` +
          coords.map((c) => `L ${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ') +
          ` L ${coords[coords.length - 1].x.toFixed(1)},${(padTop + plotH).toFixed(1)} Z`
        : '';

    const labelStep = points.length <= 8 ? 1 : Math.ceil(points.length / 6);

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotH,
      maxVal,
      coords,
      polyline,
      areaPath,
      labelStep,
    };
  }, [report.timeSeries]);

  const maxFiliereCount = Math.max(1, ...report.byFiliere.map((f) => f.count));
  const punctualityTotal = report.punctuality.onTimeCount + report.punctuality.lateCount;
  const onTimePct =
    punctualityTotal > 0 ? Math.round((report.punctuality.onTimeCount / punctualityTotal) * 100) : 0;
  const latePct = punctualityTotal > 0 ? 100 - onTimePct : 0;

  return (
    <div className="space-y-6">
      {/* En-tête + bouton Exporter */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h3 className="font-display text-xl font-bold text-slate-900">
            Rapports d’activité & Indicateurs
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Période : {report.periodLabel} ({formatDateFr(report.startIso)} –{' '}
            {formatDateFr(report.endIso)}) · {report.filiereLabel} · Mis à jour le{' '}
            {formatDateTimeFr(report.generatedAtMs)}
          </p>
        </div>

        {/* Bouton Exporter (PDF & CSV) */}
        <div className="relative" ref={exportMenuRef}>
          <button
            type="button"
            aria-expanded={isExportMenuOpen}
            aria-haspopup="menu"
            onClick={() => setIsExportMenuOpen((prev) => !prev)}
            className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap shrink-0 rounded-lg bg-[#172554] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1e3a8a]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exporter
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>

          {isExportMenuOpen && (
            <div
              role="menu"
              aria-label="Formats d'exportation"
              className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleExportPdf}
                className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                <FileText className="h-4 w-4 text-red-700" aria-hidden="true" />
                Télécharger en PDF
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleExportCsv}
                className="flex w-full cursor-pointer items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                Télécharger en CSV
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filtres Période & Filière */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Période :</span>
            <div
              role="group"
              aria-label="Filtrer par période"
              className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPeriodPreset(opt.id)}
                  className={`cursor-pointer whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                    periodPreset === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Filière :</span>
            <div
              role="group"
              aria-label="Filtrer le rapport par filière"
              className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1"
            >
              <button
                type="button"
                onClick={() => setSelectedFiliere('ALL')}
                className={`cursor-pointer whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  selectedFiliere === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Toutes
              </button>
              {FILIERES.map((fil) => (
                <button
                  key={fil}
                  type="button"
                  onClick={() => setSelectedFiliere(fil)}
                  className={`cursor-pointer whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                    selectedFiliere === fil
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {fil}
                </button>
              ))}
            </div>
          </div>
        </div>

        {periodPreset === 'custom' && (
          <div className="flex flex-wrap items-end gap-4 border-t border-slate-100 pt-3">
            <div>
              <label htmlFor="report-start-date" className="block text-xs font-medium text-slate-600">
                Date de début
              </label>
              <input
                id="report-start-date"
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => setCustomStart(e.target.value)}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="report-end-date" className="block text-xs font-medium text-slate-600">
                Date de fin
              </label>
              <input
                id="report-end-date"
                type="date"
                value={customEnd}
                min={customStart}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* 8 Cartes de synthèse */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Emprunts</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {report.summary.borrowsCount}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Retours</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {report.summary.returnsCount}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Emprunts en cours</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {report.summary.activeLoansCount}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Emprunts en retard</div>
          <div
            className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
              report.summary.overdueLoansCount > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {report.summary.overdueLoansCount}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Pénalités totales (€)</div>
          <div
            className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
              report.summary.totalPenaltiesEur > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {report.summary.totalPenaltiesEur} €
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Nouveaux adhérents</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-blue-900 tabular-nums">
            {report.summary.newAdherentsCount}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Adhérents actifs</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {report.summary.activeAdherentsCount}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Adhérents suspendus</div>
          <div
            className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
              report.summary.suspendedAdherentsCount > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {report.summary.suspendedAdherentsCount}
          </div>
        </div>
      </div>

      {/* 3 Graphiques simples (SVG pur sans dépendance tierce) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Graphique 1 : Emprunts par jour ou par semaine */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="font-display text-sm font-bold text-slate-900">
              Évolution des emprunts
            </h4>
            <span className="text-xs text-slate-500">
              Par {report.granularity === 'jour' ? 'jour' : 'semaine'}
            </span>
          </div>

          <div className="mt-4">
            {timeChart.coords.length === 0 ? (
              <div className="flex h-44 items-center justify-center text-xs text-slate-500">
                Aucune donnée sur la période.
              </div>
            ) : (
              <svg
                viewBox={`0 0 ${timeChart.width} ${timeChart.height}`}
                role="img"
                aria-label="Graphique de l'évolution des emprunts"
                className="h-48 w-full"
              >
                {[0, 0.5, 1].map((ratio) => {
                  const yPos = timeChart.padTop + timeChart.plotH * (1 - ratio);
                  const val = Math.round(timeChart.maxVal * ratio);
                  return (
                    <g key={ratio}>
                      <line
                        x1={timeChart.padLeft}
                        y1={yPos}
                        x2={timeChart.width - timeChart.padRight}
                        y2={yPos}
                        stroke="#e2e8f0"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={timeChart.padLeft - 6}
                        y={yPos + 3}
                        textAnchor="end"
                        fill="#64748b"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}

                {timeChart.areaPath && (
                  <path d={timeChart.areaPath} fill="#1e3a8a" fillOpacity="0.1" />
                )}

                {timeChart.coords.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#172554"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={timeChart.polyline}
                  />
                )}

                {timeChart.coords.map((pt, idx) => (
                  <g key={`${pt.label}-${idx}`}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={timeChart.coords.length <= 16 ? 3.5 : 2.5}
                      fill="#172554"
                    >
                      <title>{`${pt.label} : ${pt.count} emprunt(s)`}</title>
                    </circle>
                    {idx % timeChart.labelStep === 0 && (
                      <text
                        x={pt.x}
                        y={timeChart.height - 8}
                        textAnchor="middle"
                        fill="#64748b"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        {pt.label}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            )}
          </div>
        </div>

        {/* Graphique 2 : Emprunts par filière */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="font-display text-sm font-bold text-slate-900">
              Emprunts par filière
            </h4>
            <span className="text-xs text-slate-500">GI · GE · GIM · TM · RT</span>
          </div>

          <div className="mt-4">
            <svg
              viewBox="0 0 360 190"
              role="img"
              aria-label="Graphique des emprunts par filière"
              className="h-48 w-full"
            >
              {[0, 0.5, 1].map((ratio) => {
                const y = 22 + 130 * (1 - ratio);
                return (
                  <line
                    key={ratio}
                    x1={24}
                    y1={y}
                    x2={346}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray="3 3"
                  />
                );
              })}

              {report.byFiliere.map((item, idx) => {
                const barW = 36;
                const slot = 64;
                const x = 34 + idx * slot;
                const barH = item.count === 0 ? 2 : Math.max(6, (item.count / maxFiliereCount) * 124);
                const y = 152 - barH;
                const isSelected = selectedFiliere === 'ALL' || selectedFiliere === item.filiere;
                return (
                  <g key={item.filiere}>
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={barH}
                      rx={4}
                      fill={isSelected ? '#172554' : '#cbd5e1'}
                    >
                      <title>{`${item.filiere} : ${item.count} emprunt(s)`}</title>
                    </rect>
                    <text
                      x={x + barW / 2}
                      y={y - 6}
                      textAnchor="middle"
                      fill="#0f172a"
                      fontSize="11"
                      fontWeight="600"
                      fontFamily="monospace"
                    >
                      {item.count}
                    </text>
                    <text
                      x={x + barW / 2}
                      y={174}
                      textAnchor="middle"
                      fill="#475569"
                      fontSize="11"
                      fontWeight="600"
                    >
                      {item.filiere}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Graphique 3 : Répartition à l'heure / en retard */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 lg:col-span-3">
          <div>
            <h4 className="font-display text-sm font-bold text-slate-900">
              Ponctualité des prêts
            </h4>
            <p className="mt-0.5 text-xs text-slate-500">À l’heure vs En retard</p>
          </div>

          <div className="my-3 flex items-center justify-center">
            {(() => {
              const r = 46;
              const circ = 2 * Math.PI * r;
              const onTimeLen = punctualityTotal > 0 ? (report.punctuality.onTimeCount / punctualityTotal) * circ : 0;
              const lateLen = punctualityTotal > 0 ? (report.punctuality.lateCount / punctualityTotal) * circ : 0;
              return (
                <svg
                  viewBox="0 0 130 130"
                  role="img"
                  aria-label="Répartition des emprunts à l'heure et en retard"
                  className="h-32 w-32"
                >
                  <circle
                    cx="65"
                    cy="65"
                    r={r}
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="16"
                  />
                  {punctualityTotal > 0 && (
                    <>
                      <circle
                        cx="65"
                        cy="65"
                        r={r}
                        fill="none"
                        stroke="#059669"
                        strokeWidth="16"
                        strokeDasharray={`${onTimeLen} ${circ}`}
                        transform="rotate(-90 65 65)"
                      />
                      <circle
                        cx="65"
                        cy="65"
                        r={r}
                        fill="none"
                        stroke="#b91c1c"
                        strokeWidth="16"
                        strokeDasharray={`${lateLen} ${circ}`}
                        strokeDashoffset={-onTimeLen}
                        transform="rotate(-90 65 65)"
                      />
                    </>
                  )}
                  <text
                    x="65"
                    y="62"
                    textAnchor="middle"
                    fill="#0f172a"
                    fontSize="16"
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    {punctualityTotal}
                  </text>
                  <text
                    x="65"
                    y="77"
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize="9"
                  >
                    prêts
                  </text>
                </svg>
              );
            })()}
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" aria-hidden="true" />
                À l’heure
              </span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {report.punctuality.onTimeCount} ({onTimePct}%)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="h-2.5 w-2.5 rounded-xs bg-red-700" aria-hidden="true" />
                En retard
              </span>
              <span className="font-mono font-semibold text-red-700 tabular-nums">
                {report.punctuality.lateCount} ({latePct}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Tableaux détaillés */}
      <div className="space-y-6">
        {/* Tableau 1 : Livres les plus empruntés (Top 10) */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <h4 className="font-display text-sm font-bold text-slate-900">
              Livres les plus empruntés (Top 10)
            </h4>
            <span className="font-mono text-xs text-slate-500">
              {report.topBooks.length} titre{report.topBooks.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Titre</th>
                  <th className="px-4 py-2.5">Auteur</th>
                  <th className="px-4 py-2.5">Filière</th>
                  <th className="px-4 py-2.5 text-right">Emprunts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.topBooks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">
                      Aucun emprunt enregistré sur cette période.
                    </td>
                  </tr>
                ) : (
                  report.topBooks.map((item, idx) => (
                    <tr key={item.bookId} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{item.title}</td>
                      <td className="px-4 py-2.5 text-slate-600">{item.author}</td>
                      <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-700">
                        {item.filiere}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-[#172554] tabular-nums">
                        {item.borrowCount}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Tableau 2 : Étudiants avec le plus de retards */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h4 className="font-display text-sm font-bold text-slate-900">
                Étudiants avec le plus de retards
              </h4>
              <span className="font-mono text-xs text-slate-500">
                {report.studentsMostDelays.length} étudiant
                {report.studentsMostDelays.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-4 py-2.5">Étudiant</th>
                    <th className="px-4 py-2.5">Filière</th>
                    <th className="px-4 py-2.5 text-right">Retards</th>
                    <th className="px-4 py-2.5 text-right">Jours cumulés</th>
                    <th className="px-4 py-2.5 text-right">Pénalités</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.studentsMostDelays.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">
                        Aucun retard enregistré dans ce périmètre.
                      </td>
                    </tr>
                  ) : (
                    report.studentsMostDelays.map((stu) => (
                      <tr key={stu.studentKey} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{stu.studentName}</div>
                          <div className="font-mono text-xs text-slate-500">{stu.studentCne}</div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                          {stu.studentFiliere}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-red-700 tabular-nums">
                          {stu.lateLoansCount}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700 tabular-nums">
                          {stu.totalLateDays} j
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-red-700 tabular-nums whitespace-nowrap">
                          {stu.totalPenaltyEur} €
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tableau 3 : Retards en cours */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h4 className="font-display text-sm font-bold text-slate-900">
                Retards en cours
              </h4>
              <span className="font-mono text-xs text-red-700">
                {report.activeOverdueLoans.length} dossier
                {report.activeOverdueLoans.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-4 py-2.5">Livre / Ticket</th>
                    <th className="px-4 py-2.5">Étudiant</th>
                    <th className="px-4 py-2.5">Prévu le</th>
                    <th className="px-4 py-2.5 text-right">Retard</th>
                    <th className="px-4 py-2.5 text-right">Pénalité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.activeOverdueLoans.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">
                        Aucun emprunt en retard actuellement.
                      </td>
                    </tr>
                  ) : (
                    report.activeOverdueLoans.map((item) => (
                      <tr key={item.loanId} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{item.bookTitle}</div>
                          <div className="font-mono text-xs text-slate-500">
                            {item.ticketCode}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{item.studentName}</div>
                          <div className="font-mono text-xs text-slate-500">
                            {item.studentCne} · {item.studentFiliere}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          {formatDateFr(item.dueDate)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-red-700 tabular-nums whitespace-nowrap">
                          {item.daysLate} j
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-red-700 tabular-nums whitespace-nowrap">
                          {item.penaltyEur} €
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
