export type Filiere = 'GI' | 'GE' | 'GIM' | 'TM' | 'RT';

export type UserRole = 'student' | 'librarian';

export type LoanRawStatus = 'reserve' | 'en_cours' | 'rendu';

export type LoanEffectiveStatus = 'reserve' | 'en_cours' | 'en_retard' | 'rendu';

export type ActionType =
  | 'emprunt'
  | 'retour'
  | 'prolongation'
  | 'relance'
  | 'reservation'
  | 'ajout_livre'
  | 'modification_livre'
  | 'suppression_livre'
  | 'inscription_adherent'
  | 'renouvellement_adherent'
  | 'suspension_adherent'
  | 'reactivation_adherent';

export type AdherentStatus = 'actif' | 'suspendu';

export interface Adherent {
  id: string;
  cardNumber: string;
  studentUid: string;
  fullName: string;
  cne: string;
  apogee: string;
  filiere: Filiere;
  email: string;
  registrationDate: string;
  expiryDate: string;
  status: AdherentStatus;
  suspensionReason: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  filiere: string;
  genre?: string;
  totalCopies: number;
  availableCopies: number;
  qrCode: string;
  lastLoanId: string;
  coverImage?: string;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  role: UserRole;
  cne: string;
  filiere: Filiere | 'Administration';
  photoUrl?: string;
  isDemo?: boolean;
}

export interface Loan {
  id: string;
  ticketCode: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  bookIsbn: string;
  bookFiliere: string;
  studentUid: string;
  studentName: string;
  studentCne: string;
  studentFiliere: Filiere;
  borrowDate: string;
  dueDate: string;
  returnDate: string;
  status: LoanRawStatus;
  finalPenalty: number;
  reminderCount: number;
  lastReminderDate: string;
}

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorName: string;
  actorRole: UserRole;
  actionType: ActionType;
  description: string;
  targetId: string;
  createdAtMs: number;
}

export interface DemoStudentSummary {
  uid: string;
  fullName: string;
  cne: string;
  filiere: Filiere;
  email: string;
}

export type AppSection =
  | 'accueil'
  | 'catalogue'
  | 'etudiant'
  | 'bibliothecaire'
  | 'journal';
