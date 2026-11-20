/**
 * Suite de vérification des invariants de sécurité Firestore (« Dirty Dozen »).
 * Exécutable avec l'émulateur Firestore (@firebase/rules-unit-testing) dans un pipeline CI.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  actorUid: string | null;
  actorEmailVerified: boolean;
  payload: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Usurpation studentUid à la création d’emprunt',
    collection: 'loans/loan-spoof-1',
    operation: 'create',
    actorUid: 'student-a',
    actorEmailVerified: true,
    payload: {
      studentUid: 'student-b',
      bookId: 'book-gi-01',
      status: 'en_cours',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Auto-attribution du rôle bibliothécaire à la création',
    collection: 'users/student-a',
    operation: 'create',
    actorUid: 'student-a',
    actorEmailVerified: true,
    payload: {
      uid: 'student-a',
      role: 'librarian',
      email: 'attacker@example.com',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Élévation de privilèges via mise à jour du profil',
    collection: 'users/student-a',
    operation: 'update',
    actorUid: 'student-a',
    actorEmailVerified: true,
    payload: {
      role: 'librarian',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow Update (champ fantôme) sur un livre',
    collection: 'books/book-gi-01',
    operation: 'update',
    actorUid: 'student-a',
    actorEmailVerified: true,
    payload: {
      availableCopies: 2,
      ghostField: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Création d’emprunt sans décrémentation atomique du stock',
    collection: 'loans/loan-no-atomic',
    operation: 'create',
    actorUid: 'student-a',
    actorEmailVerified: true,
    payload: {
      studentUid: 'student-a',
      bookId: 'book-gi-01',
      status: 'en_cours',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Modification d’un emprunt déjà au statut terminal rendu',
    collection: 'loans/loan-returned-1',
    operation: 'update',
    actorUid: 'librarian-1',
    actorEmailVerified: true,
    payload: {
      status: 'en_cours',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Référence vers un bookId inexistant',
    collection: 'loans/loan-orphan',
    operation: 'create',
    actorUid: 'student-a',
    actorEmailVerified: true,
    payload: {
      studentUid: 'student-a',
      bookId: 'non-existent-book',
      status: 'en_cours',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Horodatage falsifié dans auditLogs',
    collection: 'auditLogs/log-forged-time',
    operation: 'create',
    actorUid: 'student-a',
    actorEmailVerified: true,
    payload: {
      actorUid: 'student-a',
      actionType: 'emprunt',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Empoisonnement d’ID document avec caractères invalides',
    collection: 'books/invalid$$id',
    operation: 'create',
    actorUid: 'librarian-1',
    actorEmailVerified: true,
    payload: {
      title: 'Test',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Lecture PII du profil d’un autre étudiant',
    collection: 'users/student-b',
    operation: 'get',
    actorUid: 'student-a',
    actorEmailVerified: true,
    payload: {},
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Requête list non filtrée sur loans par un étudiant',
    collection: 'loans',
    operation: 'list',
    actorUid: 'student-a',
    actorEmailVerified: true,
    payload: {},
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Deuxième relance le même jour sur le même emprunt',
    collection: 'loans/loan-overdue-1',
    operation: 'update',
    actorUid: 'librarian-1',
    actorEmailVerified: true,
    payload: {
      reminderCount: 2,
      lastReminderDate: '2026-11-10',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
