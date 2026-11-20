import {
  ActionType,
  Filiere,
  Loan,
  LoanEffectiveStatus,
} from '../types/library';

export const FILIERES: Filiere[] = ['GI', 'GE', 'GIM', 'TM', 'RT'];

export const BOOK_GENRES = [
  'Romans',
  'Histoire',
  'Sciences',
  'Philosophie',
  'Développement personnel',
  'Langues',
  'Art & Culture',
] as const;

export type BookGenre = typeof BOOK_GENRES[number];

export const BOOK_CATEGORIES = BOOK_GENRES;
export type BookCategory = BookGenre;

export const FILIERE_LABELS: Record<Filiere, string> = {
  GI: 'Génie Informatique',
  GE: 'Génie Électrique',
  GIM: 'Génie Industriel et Maintenance',
  TM: 'Techniques de Management',
  RT: 'Réseaux et Télécommunications',
};

export const DAILY_PENALTY_DH = 5;
export const DEFAULT_LOAN_DAYS = 14;
export const EXTENSION_DAYS = 7;

export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export function diffDays(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86400000);
}

export function formatDateFr(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '—';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTimeFr(ms: number): string {
  const dt = new Date(ms);
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = dt.getFullYear();
  const h = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return `${d}/${m}/${y} à ${h}:${min}`;
}

export function getEffectiveLoanStatus(loan: Loan, todayIso: string = getTodayIso()): LoanEffectiveStatus {
  if (loan.status === 'rendu') return 'rendu';
  if (loan.status === 'reserve') return 'reserve';
  if (todayIso > loan.dueDate) return 'en_retard';
  return 'en_cours';
}

export function getLoanDaysLate(loan: Loan, todayIso: string = getTodayIso()): number {
  if (loan.status === 'reserve') return 0;
  if (loan.status === 'rendu') {
    if (loan.returnDate && loan.returnDate > loan.dueDate) {
      return Math.max(0, diffDays(loan.dueDate, loan.returnDate));
    }
    return 0;
  }
  if (todayIso > loan.dueDate) {
    return Math.max(1, diffDays(loan.dueDate, todayIso));
  }
  return 0;
}

export function getLoanPenalty(loan: Loan, todayIso: string = getTodayIso()): number {
  if (loan.status === 'rendu') {
    return loan.finalPenalty;
  }
  return getLoanDaysLate(loan, todayIso) * DAILY_PENALTY_DH;
}

export function getStatusLabel(status: LoanEffectiveStatus): string {
  switch (status) {
    case 'en_cours':
      return 'En cours';
    case 'en_retard':
      return 'En retard';
    case 'rendu':
      return 'Rendu';
    case 'reserve':
      return 'Réservé';
  }
}

export function getActionLabel(actionType: ActionType): string {
  switch (actionType) {
    case 'emprunt':
      return 'Emprunt';
    case 'retour':
      return 'Retour';
    case 'prolongation':
      return 'Prolongation';
    case 'relance':
      return 'Relance';
    case 'reservation':
      return 'Réservation';
    case 'ajout_livre':
      return 'Ajout livre';
    case 'modification_livre':
      return 'Modification';
    case 'suppression_livre':
      return 'Suppression';
    case 'inscription_adherent':
      return 'Inscription';
    case 'renouvellement_adherent':
      return 'Renouvellement';
    case 'suspension_adherent':
      return 'Suspension';
    case 'reactivation_adherent':
      return 'Réactivation';
  }
}

export function generateTicketCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `EMP-${new Date().getFullYear()}-${num}${suffix}`;
}

export function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 9);
  return `${prefix}-${Date.now()}-${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function sanitizeText(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

export function sanitizeCne(value: string): string {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  return cleaned.length >= 4 ? cleaned : 'G130000000';
}

export interface OpeningSlot {
  start: string; // format HH:mm
  end: string;   // format HH:mm
}

export interface DayOpeningSchedule {
  dayIndex: number; // 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
  dayName: string;
  slots: OpeningSlot[];
}

// Horaires d'ouverture du guichet EST (valeurs d'exemple faciles à modifier)
export const GUICHET_OPENING_HOURS: DayOpeningSchedule[] = [
  {
    dayIndex: 1,
    dayName: 'Lundi',
    slots: [
      { start: '08:30', end: '12:30' },
      { start: '14:30', end: '17:30' },
    ],
  },
  {
    dayIndex: 2,
    dayName: 'Mardi',
    slots: [
      { start: '08:30', end: '12:30' },
      { start: '14:30', end: '17:30' },
    ],
  },
  {
    dayIndex: 3,
    dayName: 'Mercredi',
    slots: [
      { start: '08:30', end: '12:30' },
      { start: '14:30', end: '17:30' },
    ],
  },
  {
    dayIndex: 4,
    dayName: 'Jeudi',
    slots: [
      { start: '08:30', end: '12:30' },
      { start: '14:30', end: '17:30' },
    ],
  },
  {
    dayIndex: 5,
    dayName: 'Vendredi',
    slots: [
      { start: '08:30', end: '12:30' },
      { start: '14:30', end: '17:30' },
    ],
  },
  {
    dayIndex: 6,
    dayName: 'Samedi',
    slots: [{ start: '08:30', end: '12:30' }],
  },
  {
    dayIndex: 0,
    dayName: 'Dimanche',
    slots: [],
  },
];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function formatHourFr(hhmm: string): string {
  return hhmm.replace(':', 'h');
}

export interface GuichetStatusInfo {
  isOpen: boolean;
  statusLabel: 'Ouvert maintenant' | 'Fermé';
  nextOpeningText: string;
  currentDayIndex: number;
}

export function getGuichetOpeningStatus(now: Date = new Date()): GuichetStatusInfo {
  const currentDayIndex = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const todaySchedule = GUICHET_OPENING_HOURS.find((d) => d.dayIndex === currentDayIndex);
  const todaySlots = todaySchedule?.slots || [];

  const activeSlot = todaySlots.find((slot) => {
    const startMin = toMinutes(slot.start);
    const endMin = toMinutes(slot.end);
    return currentMinutes >= startMin && currentMinutes < endMin;
  });

  // Chercher la prochaine ouverture (plus tard aujourd'hui ou jours suivants)
  const laterSlotToday = todaySlots.find((slot) => toMinutes(slot.start) > currentMinutes);
  let nextOpeningText = '';

  if (laterSlotToday) {
    nextOpeningText = `Prochaine ouverture : aujourd’hui à ${formatHourFr(laterSlotToday.start)}`;
  } else {
    for (let offset = 1; offset <= 7; offset++) {
      const nextDayIndex = (currentDayIndex + offset) % 7;
      const nextSchedule = GUICHET_OPENING_HOURS.find((d) => d.dayIndex === nextDayIndex);
      if (nextSchedule && nextSchedule.slots.length > 0) {
        const dayPrefix = offset === 1 ? 'demain' : nextSchedule.dayName.toLowerCase();
        nextOpeningText = `Prochaine ouverture : ${dayPrefix} à ${formatHourFr(nextSchedule.slots[0].start)}`;
        break;
      }
    }
  }

  return {
    isOpen: Boolean(activeSlot),
    statusLabel: activeSlot ? 'Ouvert maintenant' : 'Fermé',
    nextOpeningText,
    currentDayIndex,
  };
}

export const FILIERE_COVER_COLORS: Record<Filiere, string> = {
  GI: '#1e3a8a',
  GE: '#b45309',
  GIM: '#0f766e',
  TM: '#6d28d9',
  RT: '#be123c',
};

export function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function generateBookQrCode(filiere: string): string {
  const num = Math.floor(100 + Math.random() * 900);
  const suffix = Math.random().toString(36).substring(2, 4).toUpperCase();
  return `LIVRE-${filiere}-${num}${suffix}`;
}

export async function resizeBookCoverImage(file: File): Promise<string> {
  const lowerName = file.name.toLowerCase();
  const isAllowedType =
    file.type === 'image/jpeg' ||
    file.type === 'image/png' ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png');

  if (!isAllowedType) {
    throw new Error('Format non pris en charge. Sélectionnez une image JPG ou PNG.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Impossible de lire le fichier image.'));
      image.src = objectUrl;
    });

    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
      throw new Error('Dimensions de l’image invalides.');
    }

    const maxWidth = 400;
    const targetWidth = Math.min(maxWidth, img.naturalWidth);
    const targetHeight = Math.max(
      1,
      Math.round((img.naturalHeight * targetWidth) / img.naturalWidth)
    );

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Impossible de traiter l’image sur ce navigateur.');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    let dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    if (dataUrl.length > 220000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.65);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function addYearsIso(isoDate: string, years: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y + years, m - 1, d));
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export function generateCardNumber(): string {
  const num = Math.floor(1000 + Math.random() * 8999);
  return `EST-${new Date().getFullYear()}-${num}`;
}

export interface ParsedStudentCardFields {
  cardNumber?: string;
  fullName?: string;
  cne?: string;
  apogee?: string;
  filiere?: Filiere;
  email?: string;
}

export function parseStudentCardText(rawText: string): ParsedStudentCardFields {
  const result: ParsedStudentCardFields = {};
  const cleaned = rawText.trim();
  if (!cleaned) return result;

  // Format JSON éventuel d'un QR code de carte étudiante
  if (cleaned.startsWith('{')) {
    try {
      const obj = JSON.parse(cleaned) as Record<string, unknown>;
      if (typeof obj.fullName === 'string') result.fullName = obj.fullName.trim();
      if (typeof obj.nom === 'string') result.fullName = obj.nom.trim();
      if (typeof obj.cne === 'string') result.cne = obj.cne.trim().toUpperCase();
      if (typeof obj.apogee === 'string') result.apogee = obj.apogee.trim();
      if (typeof obj.email === 'string') result.email = obj.email.trim();
      if (typeof obj.cardNumber === 'string') result.cardNumber = obj.cardNumber.trim();
      if (
        typeof obj.filiere === 'string' &&
        FILIERES.includes(obj.filiere.trim().toUpperCase() as Filiere)
      ) {
        result.filiere = obj.filiere.trim().toUpperCase() as Filiere;
      }
      return result;
    } catch {
      // Repli sur extraction par motifs
    }
  }

  const emailMatch = cleaned.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) result.email = emailMatch[0].toLowerCase();

  const cneMatch = cleaned.match(/\b([A-Z]\d{8,12})\b/i);
  if (cneMatch) result.cne = cneMatch[1].toUpperCase();

  const apogeeMatch = cleaned.match(/(?:apog[ée]e\s*[:#-]?\s*)?(\b\d{7,10}\b)/i);
  if (apogeeMatch) result.apogee = apogeeMatch[1];

  const cardMatch = cleaned.match(/\b(EST-\d{4}-\d{3,6})\b/i);
  if (cardMatch) result.cardNumber = cardMatch[1].toUpperCase();

  const filiereMatch = cleaned.match(/\b(GIM|GI|GE|TM|RT)\b/i);
  if (filiereMatch) result.filiere = filiereMatch[1].toUpperCase() as Filiere;

  const nomLabelMatch = cleaned.match(/(?:nom(?:\s+complet)?|étudiant)\s*[:\-]\s*([^\n,;]+)/i);
  if (nomLabelMatch) {
    result.fullName = nomLabelMatch[1].trim();
  } else {
    const firstTextLine = cleaned
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(
        (l) =>
          l.length >= 4 &&
          !/^(cne|apog|fili|carte|est-|email|@)/i.test(l) &&
          !/^\d+$/.test(l) &&
          !l.includes('@')
      );
    if (firstTextLine) result.fullName = firstTextLine.slice(0, 120);
  }

  return result;
}
