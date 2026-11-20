import { jsPDF } from 'jspdf';
import { Adherent, Book, Filiere, Loan } from '../types/library';
import {
  addDaysIso,
  FILIERES,
  formatDateFr,
  formatDateTimeFr,
  getEffectiveLoanStatus,
  getLoanDaysLate,
  getLoanPenalty,
  getTodayIso,
} from './libraryUtils';

export type ReportPeriodPreset = '7d' | '30d' | 'semester' | 'academic_year' | 'custom';

export interface TimeBucketPoint {
  label: string;
  count: number;
}

export interface FiliereCountPoint {
  filiere: Filiere;
  count: number;
}

export interface TopBookReportRow {
  bookId: string;
  title: string;
  author: string;
  filiere: string;
  borrowCount: number;
}

export interface StudentDelayReportRow {
  studentKey: string;
  studentName: string;
  studentCne: string;
  studentFiliere: Filiere;
  lateLoansCount: number;
  totalLateDays: number;
  totalPenaltyEur: number;
}

export interface ActiveOverdueReportRow {
  loanId: string;
  ticketCode: string;
  bookTitle: string;
  studentName: string;
  studentCne: string;
  studentFiliere: Filiere;
  dueDate: string;
  daysLate: number;
  penaltyEur: number;
}

export interface LibraryReportData {
  periodLabel: string;
  startIso: string;
  endIso: string;
  filiereLabel: string;
  generatedAtMs: number;
  granularity: 'jour' | 'semaine';
  summary: {
    borrowsCount: number;
    returnsCount: number;
    activeLoansCount: number;
    overdueLoansCount: number;
    totalPenaltiesEur: number;
    newAdherentsCount: number;
    activeAdherentsCount: number;
    suspendedAdherentsCount: number;
  };
  timeSeries: TimeBucketPoint[];
  byFiliere: FiliereCountPoint[];
  punctuality: {
    onTimeCount: number;
    lateCount: number;
  };
  topBooks: TopBookReportRow[];
  studentsMostDelays: StudentDelayReportRow[];
  activeOverdueLoans: ActiveOverdueReportRow[];
}

export function resolveReportPeriod(
  preset: ReportPeriodPreset,
  customStart: string,
  customEnd: string,
  todayIso: string = getTodayIso()
): { startIso: string; endIso: string; label: string } {
  const year = Number(todayIso.slice(0, 4));
  const month = Number(todayIso.slice(5, 7));
  const academicStartYear = month >= 9 ? year : year - 1;

  switch (preset) {
    case '7d':
      return {
        startIso: addDaysIso(todayIso, -6),
        endIso: todayIso,
        label: '7 derniers jours',
      };
    case '30d':
      return {
        startIso: addDaysIso(todayIso, -29),
        endIso: todayIso,
        label: '30 derniers jours',
      };
    case 'semester':
      return {
        startIso: addDaysIso(todayIso, -179),
        endIso: todayIso,
        label: 'Semestre en cours',
      };
    case 'academic_year':
      return {
        startIso: `${academicStartYear}-09-01`,
        endIso: todayIso,
        label: `Année universitaire ${academicStartYear}/${academicStartYear + 1}`,
      };
    case 'custom': {
      const safeStart = customStart && customStart <= (customEnd || todayIso) ? customStart : addDaysIso(todayIso, -29);
      const safeEnd = customEnd && customEnd >= safeStart ? customEnd : todayIso;
      return {
        startIso: safeStart,
        endIso: safeEnd,
        label: `Du ${formatDateFr(safeStart)} au ${formatDateFr(safeEnd)}`,
      };
    }
  }
}

function enumerateDays(startIso: string, endIso: string): string[] {
  const days: string[] = [];
  let cursor = startIso;
  let guard = 0;
  while (cursor <= endIso && guard < 400) {
    days.push(cursor);
    cursor = addDaysIso(cursor, 1);
    guard += 1;
  }
  return days;
}

export function computeLibraryReport(params: {
  loans: Loan[];
  books: Book[];
  adherents: Adherent[];
  preset: ReportPeriodPreset;
  customStart: string;
  customEnd: string;
  selectedFiliere: 'ALL' | Filiere;
  todayIso?: string;
}): LibraryReportData {
  const {
    loans,
    books,
    adherents,
    preset,
    customStart,
    customEnd,
    selectedFiliere,
    todayIso = getTodayIso(),
  } = params;

  const { startIso, endIso, label } = resolveReportPeriod(
    preset,
    customStart,
    customEnd,
    todayIso
  );

  const booksById = new Map(books.map((b) => [b.id, b]));

  const loansMatchingFiliere = loans.filter(
    (l) => selectedFiliere === 'ALL' || l.bookFiliere === selectedFiliere
  );

  const borrowsInPeriod = loansMatchingFiliere.filter(
    (l) => l.borrowDate >= startIso && l.borrowDate <= endIso
  );

  const returnsInPeriod = loansMatchingFiliere.filter(
    (l) => l.status === 'rendu' && l.returnDate >= startIso && l.returnDate <= endIso
  );

  const activeInScope = loansMatchingFiliere.filter((l) => {
    const eff = getEffectiveLoanStatus(l, todayIso);
    if (eff !== 'en_cours' && eff !== 'en_retard') return false;
    return l.borrowDate <= endIso && (l.borrowDate >= startIso || l.dueDate >= startIso || eff === 'en_retard');
  });

  const overdueInScope = activeInScope.filter(
    (l) => getEffectiveLoanStatus(l, todayIso) === 'en_retard'
  );

  // Pénalités cumulées pour les retours de la période et les retards actifs dans le périmètre
  const penaltyLoanIds = new Set<string>();
  let totalPenaltiesEur = 0;
  for (const loan of [...returnsInPeriod, ...overdueInScope]) {
    if (penaltyLoanIds.has(loan.id)) continue;
    penaltyLoanIds.add(loan.id);
    totalPenaltiesEur += getLoanPenalty(loan, todayIso);
  }

  const adherentsInFiliere = adherents.filter(
    (a) => selectedFiliere === 'ALL' || a.filiere === selectedFiliere
  );

  const newAdherentsCount = adherentsInFiliere.filter(
    (a) => a.registrationDate >= startIso && a.registrationDate <= endIso
  ).length;
  const activeAdherentsCount = adherentsInFiliere.filter((a) => a.status === 'actif').length;
  const suspendedAdherentsCount = adherentsInFiliere.filter((a) => a.status === 'suspendu').length;

  // Série temporelle (par jour si <= 31 jours, sinon par semaine)
  const dayList = enumerateDays(startIso, endIso);
  const granularity: 'jour' | 'semaine' = dayList.length <= 31 ? 'jour' : 'semaine';
  const timeSeries: TimeBucketPoint[] = [];

  if (granularity === 'jour') {
    const countsByDay = new Map<string, number>();
    for (const loan of borrowsInPeriod) {
      countsByDay.set(loan.borrowDate, (countsByDay.get(loan.borrowDate) || 0) + 1);
    }
    for (const dayIso of dayList) {
      timeSeries.push({
        label: `${dayIso.slice(8, 10)}/${dayIso.slice(5, 7)}`,
        count: countsByDay.get(dayIso) || 0,
      });
    }
  } else {
    for (let i = 0; i < dayList.length; i += 7) {
      const slice = dayList.slice(i, i + 7);
      const wStart = slice[0];
      const wEnd = slice[slice.length - 1];
      const count = borrowsInPeriod.filter(
        (l) => l.borrowDate >= wStart && l.borrowDate <= wEnd
      ).length;
      timeSeries.push({
        label: `${wStart.slice(8, 10)}/${wStart.slice(5, 7)}`,
        count,
      });
    }
  }

  // Répartition par filière (pour la période sélectionnée)
  const loansForFiliereChart = loans.filter(
    (l) =>
      (selectedFiliere === 'ALL' || l.bookFiliere === selectedFiliere) &&
      l.borrowDate >= startIso &&
      l.borrowDate <= endIso
  );
  const byFiliere: FiliereCountPoint[] = FILIERES.map((f) => ({
    filiere: f,
    count: loansForFiliereChart.filter((l) => l.bookFiliere === f).length,
  }));

  // Répartition à l'heure / en retard sur les emprunts de la période + retards actifs en cours
  const punctualityLoansMap = new Map<string, Loan>();
  for (const loan of [...borrowsInPeriod, ...returnsInPeriod, ...overdueInScope]) {
    punctualityLoansMap.set(loan.id, loan);
  }
  let onTimeCount = 0;
  let lateCount = 0;
  for (const loan of punctualityLoansMap.values()) {
    const eff = getEffectiveLoanStatus(loan, todayIso);
    const daysLate = getLoanDaysLate(loan, todayIso);
    if (eff === 'en_retard' || daysLate > 0) {
      lateCount += 1;
    } else {
      onTimeCount += 1;
    }
  }

  // Top 10 livres les plus empruntés
  const bookCounts = new Map<string, TopBookReportRow>();
  for (const loan of borrowsInPeriod) {
    const meta = booksById.get(loan.bookId);
    const prev = bookCounts.get(loan.bookId);
    if (prev) {
      prev.borrowCount += 1;
    } else {
      bookCounts.set(loan.bookId, {
        bookId: loan.bookId,
        title: meta?.title || loan.bookTitle,
        author: meta?.author || loan.bookAuthor,
        filiere: meta?.filiere || loan.bookFiliere,
        borrowCount: 1,
      });
    }
  }
  const topBooks = Array.from(bookCounts.values())
    .sort((a, b) => b.borrowCount - a.borrowCount || a.title.localeCompare(b.title))
    .slice(0, 10);

  // Étudiants avec le plus de retards
  const studentDelaysMap = new Map<string, StudentDelayReportRow>();
  for (const loan of punctualityLoansMap.values()) {
    const daysLate = getLoanDaysLate(loan, todayIso);
    if (daysLate <= 0) continue;
    const key = loan.studentCne || loan.studentUid;
    const penalty = getLoanPenalty(loan, todayIso);
    const existing = studentDelaysMap.get(key);
    if (existing) {
      existing.lateLoansCount += 1;
      existing.totalLateDays += daysLate;
      existing.totalPenaltyEur += penalty;
    } else {
      studentDelaysMap.set(key, {
        studentKey: key,
        studentName: loan.studentName,
        studentCne: loan.studentCne,
        studentFiliere: loan.studentFiliere,
        lateLoansCount: 1,
        totalLateDays: daysLate,
        totalPenaltyEur: penalty,
      });
    }
  }
  const studentsMostDelays = Array.from(studentDelaysMap.values()).sort(
    (a, b) =>
      b.lateLoansCount - a.lateLoansCount ||
      b.totalLateDays - a.totalLateDays ||
      a.studentName.localeCompare(b.studentName)
  );

  // Retards en cours
  const activeOverdueLoans: ActiveOverdueReportRow[] = overdueInScope
    .map((loan) => ({
      loanId: loan.id,
      ticketCode: loan.ticketCode,
      bookTitle: loan.bookTitle,
      studentName: loan.studentName,
      studentCne: loan.studentCne,
      studentFiliere: loan.studentFiliere,
      dueDate: loan.dueDate,
      daysLate: getLoanDaysLate(loan, todayIso),
      penaltyEur: getLoanPenalty(loan, todayIso),
    }))
    .sort((a, b) => b.daysLate - a.daysLate || a.studentName.localeCompare(b.studentName));

  return {
    periodLabel: label,
    startIso,
    endIso,
    filiereLabel: selectedFiliere === 'ALL' ? 'Toutes les filières' : `Filière ${selectedFiliere}`,
    generatedAtMs: Date.now(),
    granularity,
    summary: {
      borrowsCount: borrowsInPeriod.length,
      returnsCount: returnsInPeriod.length,
      activeLoansCount: activeInScope.length,
      overdueLoansCount: overdueInScope.length,
      totalPenaltiesEur,
      newAdherentsCount,
      activeAdherentsCount,
      suspendedAdherentsCount,
    },
    timeSeries,
    byFiliere,
    punctuality: {
      onTimeCount,
      lateCount,
    },
    topBooks,
    studentsMostDelays,
    activeOverdueLoans,
  };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[;"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportReportToCsv(report: LibraryReportData): void {
  const generatedStr = formatDateTimeFr(report.generatedAtMs);
  const rows: (string | number)[][] = [
    ['Rapport d’activité — Bibliothèque Universitaire'],
    ['Période', `${report.periodLabel} (${formatDateFr(report.startIso)} - ${formatDateFr(report.endIso)})`],
    ['Filtre filière', report.filiereLabel],
    ['Date de génération', generatedStr],
    [],
    ['SYNTHÈSE', 'Valeur'],
    ['Nombre d’emprunts', report.summary.borrowsCount],
    ['Retours enregistrés', report.summary.returnsCount],
    ['Emprunts en cours', report.summary.activeLoansCount],
    ['Emprunts en retard', report.summary.overdueLoansCount],
    ['Pénalités totales (€)', report.summary.totalPenaltiesEur],
    ['Nouveaux adhérents', report.summary.newAdherentsCount],
    ['Adhérents actifs', report.summary.activeAdherentsCount],
    ['Adhérents suspendus', report.summary.suspendedAdherentsCount],
    [],
    ['EMPRUNTS PAR FILIÈRE', 'Nombre d’emprunts'],
    ...report.byFiliere.map((f) => [f.filiere, f.count]),
    [],
    ['PONCTUALITÉ', 'Nombre'],
    ['À l’heure', report.punctuality.onTimeCount],
    ['En retard', report.punctuality.lateCount],
    [],
    ['LIVRES LES PLUS EMPRUNTÉS (TOP 10)', 'Auteur', 'Filière', 'Emprunts'],
    ...report.topBooks.map((b) => [b.title, b.author, b.filiere, b.borrowCount]),
    [],
    ['ÉTUDIANTS AVEC LE PLUS DE RETARDS', 'CNE', 'Filière', 'Retards', 'Jours cumulés', 'Pénalités (€)'],
    ...report.studentsMostDelays.map((s) => [
      s.studentName,
      s.studentCne,
      s.studentFiliere,
      s.lateLoansCount,
      s.totalLateDays,
      s.totalPenaltyEur,
    ]),
    [],
    ['RETARDS EN COURS', 'Étudiant', 'CNE', 'Filière', 'Retour prévu', 'Jours de retard', 'Pénalité (€)'],
    ...report.activeOverdueLoans.map((o) => [
      o.bookTitle,
      o.studentName,
      o.studentCne,
      o.studentFiliere,
      formatDateFr(o.dueDate),
      o.daysLate,
      o.penaltyEur,
    ]),
  ];

  const csvBody = rows.map((r) => r.map(escapeCsvCell).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8;' });
  triggerFileDownload(blob, `rapport-bibliotheque-${getTodayIso()}.csv`);
}

function toPdfSafe(text: string): string {
  return text
    .replace(/€/g, 'EUR')
    .replace(/[’‘]/g, "'")
    .replace(/[«»]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/→/g, '->');
}

export function exportReportToPdf(report: LibraryReportData): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const maxWidth = pageWidth - margin * 2;
  let y = 18;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 16) {
      doc.addPage();
      y = 18;
    }
  };

  const writeHeading = (title: string) => {
    ensureSpace(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(23, 37, 84);
    doc.text(toPdfSafe(title), margin, y);
    y += 2;
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  };

  const writeLine = (line: string, bold = false) => {
    ensureSpace(7);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    const wrapped = doc.splitTextToSize(toPdfSafe(line), maxWidth) as string[];
    doc.text(wrapped, margin, y);
    y += wrapped.length * 4.8 + 1;
  };

  // En-tête du document
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(23, 37, 84);
  doc.text(toPdfSafe("Rapport d'activité - Bibliothèque Universitaire"), margin, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(
    toPdfSafe(
      `Période : ${report.periodLabel} (${formatDateFr(report.startIso)} au ${formatDateFr(report.endIso)})`
    ),
    margin,
    y
  );
  y += 5;
  doc.text(toPdfSafe(`Filière : ${report.filiereLabel}`), margin, y);
  y += 5;
  doc.text(toPdfSafe(`Généré le : ${formatDateTimeFr(report.generatedAtMs)}`), margin, y);
  y += 9;

  writeHeading('Synthèse des indicateurs');
  writeLine(`- Emprunts sur la période : ${report.summary.borrowsCount}`);
  writeLine(`- Retours enregistrés : ${report.summary.returnsCount}`);
  writeLine(`- Emprunts en cours : ${report.summary.activeLoansCount}`);
  writeLine(`- Emprunts en retard : ${report.summary.overdueLoansCount}`);
  writeLine(`- Pénalités totales : ${report.summary.totalPenaltiesEur} EUR`);
  writeLine(`- Nouveaux adhérents : ${report.summary.newAdherentsCount}`);
  writeLine(`- Adhérents actifs : ${report.summary.activeAdherentsCount}`);
  writeLine(`- Adhérents suspendus : ${report.summary.suspendedAdherentsCount}`);
  y += 3;

  writeHeading('Répartition par filière et ponctualité');
  writeLine(
    `Emprunts par filière : ${report.byFiliere.map((f) => `${f.filiere} (${f.count})`).join(' · ')}`
  );
  writeLine(
    `Ponctualité : ${report.punctuality.onTimeCount} à l'heure / ${report.punctuality.lateCount} en retard`
  );
  y += 3;

  writeHeading('Livres les plus empruntés (Top 10)');
  if (report.topBooks.length === 0) {
    writeLine('Aucun emprunt sur la période sélectionnée.');
  } else {
    report.topBooks.forEach((book, idx) => {
      writeLine(
        `${idx + 1}. ${book.title} (${book.author} - ${book.filiere}) : ${book.borrowCount} emprunt(s)`
      );
    });
  }
  y += 3;

  writeHeading('Étudiants avec le plus de retards');
  if (report.studentsMostDelays.length === 0) {
    writeLine('Aucun retard enregistré dans ce périmètre.');
  } else {
    report.studentsMostDelays.forEach((stu) => {
      writeLine(
        `- ${stu.studentName} (${stu.studentCne} - ${stu.studentFiliere}) : ${stu.lateLoansCount} retard(s), ${stu.totalLateDays} jour(s), ${stu.totalPenaltyEur} EUR`
      );
    });
  }
  y += 3;

  writeHeading('Retards en cours');
  if (report.activeOverdueLoans.length === 0) {
    writeLine('Aucun retard en cours actuellement.');
  } else {
    report.activeOverdueLoans.forEach((item) => {
      writeLine(
        `- ${item.bookTitle} | ${item.studentName} (${item.studentCne}) | Prévu le ${formatDateFr(item.dueDate)} | ${item.daysLate} j (${item.penaltyEur} EUR)`
      );
    });
  }

  const pdfBlob = doc.output('blob');
  triggerFileDownload(pdfBlob, `rapport-bibliotheque-${getTodayIso()}.pdf`);
}
