import { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  createInitialDemoAdherents,
  createInitialDemoLoans,
  SEED_BOOKS,
} from '../data/seedData';
import { db, handleFirestoreError, isUsmbaEmail, OperationType } from '../firebase';
import {
  ActionType,
  Adherent,
  AuditLogEntry,
  Book,
  Filiere,
  Loan,
  UserProfile,
} from '../types/library';
import {
  addDaysIso,
  addYearsIso,
  DEFAULT_LOAN_DAYS,
  EXTENSION_DAYS,
  generateBookQrCode,
  generateCardNumber,
  generateSafeId,
  generateTicketCode,
  getTodayIso,
  sanitizeCne,
  sanitizeText,
} from '../utils/libraryUtils';

const SEED_BOOK_ORDER = new Map(SEED_BOOKS.map((book, idx) => [book.id, idx]));

const BOOTSTRAPPED_LIBRARIAN_EMAIL = 'amalhmamou701@gmail.com';

export async function ensureUserProfile(firebaseUser: User): Promise<UserProfile> {
  if (!isUsmbaEmail(firebaseUser.email)) {
    throw new Error("Accès réservé aux étudiants de l'USMBA (adresse @usmba.ac.ma).");
  }

  const userPath = `users/${firebaseUser.uid}`;
  const photoUrl = firebaseUser.photoURL || undefined;

  try {
    const userRef = doc(db, 'users', firebaseUser.uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const data = snap.data();
      return {
        uid: String(data.uid),
        fullName: String(data.fullName),
        email: String(data.email),
        role: data.role === 'librarian' ? 'librarian' : 'student',
        cne: String(data.cne),
        filiere: data.filiere as Filiere | 'Administration',
        photoUrl,
      };
    }

    const isLibrarian =
      firebaseUser.emailVerified &&
      firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_LIBRARIAN_EMAIL;

    const fullName = sanitizeText(
      firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Utilisateur',
      120
    );
    const email = sanitizeText(firebaseUser.email || 'etudiant@usmba.ac.ma', 150);
    const defaultCne = isLibrarian
      ? 'BIB001'
      : `G${Math.floor(130000000 + Math.random() * 89999999)}`;
    const defaultFiliere: Filiere | 'Administration' = isLibrarian ? 'Administration' : 'GI';

    const profileData = {
      uid: firebaseUser.uid,
      fullName,
      email,
      role: isLibrarian ? 'librarian' : 'student',
      cne: defaultCne,
      filiere: defaultFiliere,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(userRef, profileData);

    return {
      uid: firebaseUser.uid,
      fullName,
      email,
      role: isLibrarian ? 'librarian' : 'student',
      cne: defaultCne,
      filiere: defaultFiliere,
      photoUrl,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function updateStudentProfileFirebase(
  uid: string,
  fullName: string,
  cne: string,
  filiere: Filiere
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      fullName: sanitizeText(fullName, 120) || 'Étudiant',
      cne: sanitizeCne(cne),
      filiere,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function seedCatalogIfLibrarian(profile: UserProfile): Promise<void> {
  if (profile.role !== 'librarian') return;

  try {
    const existingBooks = await getDocs(
      query(collection(db, 'books'), where('totalCopies', '>=', 1), limit(1))
    );
    if (!existingBooks.empty) return;

    const todayIso = getTodayIso();
    const initialLoans = createInitialDemoLoans(todayIso).filter(
      (loan) => loan.status !== 'rendu'
    );

    // Batch 1: créer les 40 livres avec availableCopies = totalCopies
    const batch1 = writeBatch(db);
    for (const book of SEED_BOOKS) {
      batch1.set(doc(db, 'books', book.id), {
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        filiere: book.filiere,
        totalCopies: book.totalCopies,
        availableCopies: book.totalCopies,
        qrCode: book.qrCode,
        lastLoanId: 'init',
        coverImage: book.coverImage || '',
        updatedAt: serverTimestamp(),
      });
    }
    await batch1.commit();

    // Batch 2: créer les emprunts initiaux actifs/en retard/réservés sur des livres distincts
    const batch2 = writeBatch(db);
    const usedBookIds = new Set<string>();
    for (const loan of initialLoans) {
      if (usedBookIds.has(loan.bookId)) continue;
      usedBookIds.add(loan.bookId);

      const bookMeta = SEED_BOOKS.find((b) => b.id === loan.bookId);
      if (!bookMeta || bookMeta.totalCopies < 1) continue;

      const loanRef = doc(db, 'loans', loan.id);
      batch2.set(loanRef, {
        ticketCode: loan.ticketCode,
        bookId: loan.bookId,
        bookTitle: loan.bookTitle,
        bookAuthor: loan.bookAuthor,
        bookIsbn: loan.bookIsbn,
        bookFiliere: loan.bookFiliere,
        studentUid: loan.studentUid,
        studentName: loan.studentName,
        studentCne: loan.studentCne,
        studentFiliere: loan.studentFiliere,
        borrowDate: loan.borrowDate,
        dueDate: loan.dueDate,
        returnDate: '',
        status: loan.status,
        finalPenalty: 0,
        reminderCount: 0,
        lastReminderDate: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch2.update(doc(db, 'books', loan.bookId), {
        availableCopies: bookMeta.totalCopies - 1,
        lastLoanId: loan.id,
        updatedAt: serverTimestamp(),
      });
    }

    const seedLogId = generateSafeId('log');
    batch2.set(doc(db, 'auditLogs', seedLogId), {
      actorUid: profile.uid,
      actorName: `${profile.fullName} (Bibliothécaire)`,
      actorRole: 'librarian',
      actionType: 'emprunt',
      description: 'Initialisation du fonds documentaire (40 ouvrages) et des emprunts de démonstration',
      targetId: 'catalogue',
      createdAt: serverTimestamp(),
    });

    await batch2.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'books');
  }
}

export function subscribeBooks(
  onData: (books: Book[]) => void
): () => void {
  const q = query(
    collection(db, 'books'),
    where('totalCopies', '>=', 1)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Book[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: String(data.title),
          author: String(data.author),
          isbn: String(data.isbn),
          filiere: String(data.filiere || data.genre || 'Romans'),
          genre: String(data.genre || data.filiere || 'Romans'),
          totalCopies: Number(data.totalCopies),
          availableCopies: Number(data.availableCopies),
          qrCode: String(data.qrCode),
          lastLoanId: String(data.lastLoanId || 'init'),
          coverImage: typeof data.coverImage === 'string' ? data.coverImage : '',
        };
      });
      list.sort((a, b) => {
        const aIsCustom = a.id.startsWith('livre-');
        const bIsCustom = b.id.startsWith('livre-');
        if (aIsCustom !== bIsCustom) return aIsCustom ? -1 : 1;
        if (aIsCustom && bIsCustom) return b.id.localeCompare(a.id);
        const idxA = SEED_BOOK_ORDER.get(a.id);
        const idxB = SEED_BOOK_ORDER.get(b.id);
        if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
        if (idxA !== undefined) return -1;
        if (idxB !== undefined) return 1;
        return a.id.localeCompare(b.id);
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'books');
    }
  );
}

export function subscribeLoans(
  profile: UserProfile,
  onData: (loans: Loan[]) => void
): () => void {
  const q =
    profile.role === 'librarian'
      ? query(collection(db, 'loans'), orderBy('borrowDate', 'desc'))
      : query(
          collection(db, 'loans'),
          where('studentUid', '==', profile.uid)
        );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Loan[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ticketCode: String(data.ticketCode),
          bookId: String(data.bookId),
          bookTitle: String(data.bookTitle),
          bookAuthor: String(data.bookAuthor),
          bookIsbn: String(data.bookIsbn),
          bookFiliere: data.bookFiliere as Filiere,
          studentUid: String(data.studentUid),
          studentName: String(data.studentName),
          studentCne: String(data.studentCne),
          studentFiliere: data.studentFiliere as Filiere,
          borrowDate: String(data.borrowDate),
          dueDate: String(data.dueDate),
          returnDate: String(data.returnDate || ''),
          status: data.status as 'reserve' | 'en_cours' | 'rendu',
          finalPenalty: Number(data.finalPenalty || 0),
          reminderCount: Number(data.reminderCount || 0),
          lastReminderDate: String(data.lastReminderDate || ''),
        };
      });
      list.sort((a, b) => b.borrowDate.localeCompare(a.borrowDate));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'loans');
    }
  );
}

export function subscribeAuditLogs(
  profile: UserProfile,
  onData: (logs: AuditLogEntry[]) => void
): () => void {
  const q =
    profile.role === 'librarian'
      ? query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(150))
      : query(
          collection(db, 'auditLogs'),
          where('actorUid', '==', profile.uid)
        );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: AuditLogEntry[] = snapshot.docs.map((d) => {
        const data = d.data();
        const ts = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now();
        return {
          id: d.id,
          actorUid: String(data.actorUid),
          actorName: String(data.actorName),
          actorRole: data.actorRole === 'librarian' ? 'librarian' : 'student',
          actionType: data.actionType as ActionType,
          description: String(data.description),
          targetId: String(data.targetId),
          createdAtMs: ts,
        };
      });
      list.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'auditLogs');
    }
  );
}

export async function createLoanFirebase(params: {
  book: Book;
  actor: UserProfile;
  borrower: {
    uid: string;
    fullName: string;
    cne: string;
    filiere: Filiere;
  };
  mode: 'emprunt' | 'reservation';
  viaQr?: boolean;
}): Promise<Loan> {
  const { book, actor, borrower, mode, viaQr } = params;
  const loanId = generateSafeId('loan');
  const ticketCode = generateTicketCode();
  const todayIso = getTodayIso();
  const dueDate =
    mode === 'reservation' ? addDaysIso(todayIso, 2) : addDaysIso(todayIso, DEFAULT_LOAN_DAYS);
  const status = mode === 'reservation' ? 'reserve' : 'en_cours';

  const batch = writeBatch(db);
  const loanRef = doc(db, 'loans', loanId);
  const bookRef = doc(db, 'books', book.id);
  const logRef = doc(db, 'auditLogs', generateSafeId('log'));

  batch.set(loanRef, {
    ticketCode,
    bookId: book.id,
    bookTitle: sanitizeText(book.title, 200),
    bookAuthor: sanitizeText(book.author, 120),
    bookIsbn: book.isbn,
    bookFiliere: book.genre || book.filiere,
    studentUid: borrower.uid,
    studentName: sanitizeText(borrower.fullName, 120),
    studentCne: sanitizeCne(borrower.cne),
    studentFiliere: borrower.filiere,
    borrowDate: todayIso,
    dueDate,
    returnDate: '',
    status,
    finalPenalty: 0,
    reminderCount: 0,
    lastReminderDate: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(bookRef, {
    availableCopies: book.availableCopies - 1,
    lastLoanId: loanId,
    updatedAt: serverTimestamp(),
  });

  const actionLabel =
    mode === 'reservation'
      ? `Réservation de « ${book.title} » (${ticketCode})`
      : `${viaQr ? 'Emprunt par QR' : 'Emprunt'} de « ${book.title} » pour ${borrower.fullName} (${ticketCode})`;

  batch.set(logRef, {
    actorUid: actor.uid,
    actorName: sanitizeText(
      actor.role === 'librarian'
        ? `${actor.fullName} (Bibliothécaire)`
        : `${actor.fullName} (${actor.filiere} · ${actor.cne})`,
      120
    ),
    actorRole: actor.role,
    actionType: mode === 'reservation' ? 'reservation' : 'emprunt',
    description: sanitizeText(actionLabel, 300),
    targetId: loanId,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return {
      id: loanId,
      ticketCode,
      bookId: book.id,
      bookTitle: book.title,
      bookAuthor: book.author,
      bookIsbn: book.isbn,
      bookFiliere: book.genre || book.filiere,
      studentUid: borrower.uid,
      studentName: borrower.fullName,
      studentCne: sanitizeCne(borrower.cne),
      studentFiliere: borrower.filiere,
      borrowDate: todayIso,
      dueDate,
      returnDate: '',
      status,
      finalPenalty: 0,
      reminderCount: 0,
      lastReminderDate: '',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `loans/${loanId}`);
  }
}

export async function extendLoanFirebase(
  loan: Loan,
  librarian: UserProfile
): Promise<string> {
  const newDueDate = addDaysIso(loan.dueDate, EXTENSION_DAYS);
  const batch = writeBatch(db);
  batch.update(doc(db, 'loans', loan.id), {
    dueDate: newDueDate,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'auditLogs', generateSafeId('log')), {
    actorUid: librarian.uid,
    actorName: sanitizeText(`${librarian.fullName} (Bibliothécaire)`, 120),
    actorRole: 'librarian',
    actionType: 'prolongation',
    description: sanitizeText(
      `Prolongation (+7 j) de « ${loan.bookTitle} » pour ${loan.studentName} (${loan.ticketCode})`,
      300
    ),
    targetId: loan.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return newDueDate;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `loans/${loan.id}`);
  }
}

export async function validateReservationPickupFirebase(
  loan: Loan,
  librarian: UserProfile
): Promise<void> {
  const todayIso = getTodayIso();
  const newDueDate = addDaysIso(todayIso, DEFAULT_LOAN_DAYS);
  const batch = writeBatch(db);
  batch.update(doc(db, 'loans', loan.id), {
    status: 'en_cours',
    borrowDate: todayIso,
    dueDate: newDueDate,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'auditLogs', generateSafeId('log')), {
    actorUid: librarian.uid,
    actorName: sanitizeText(`${librarian.fullName} (Bibliothécaire)`, 120),
    actorRole: 'librarian',
    actionType: 'emprunt',
    description: sanitizeText(
      `Retrait validé pour la réservation de « ${loan.bookTitle} » (${loan.studentName} · ${loan.ticketCode})`,
      300
    ),
    targetId: loan.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `loans/${loan.id}`);
  }
}

export async function returnLoanFirebase(params: {
  loan: Loan;
  book: Book;
  actor: UserProfile;
  finalPenalty: number;
  viaQr?: boolean;
}): Promise<void> {
  const { loan, book, actor, finalPenalty, viaQr } = params;
  const todayIso = getTodayIso();
  const batch = writeBatch(db);

  batch.update(doc(db, 'loans', loan.id), {
    status: 'rendu',
    returnDate: todayIso,
    finalPenalty,
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'books', book.id), {
    availableCopies: Math.min(book.totalCopies, book.availableCopies + 1),
    lastLoanId: loan.id,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'auditLogs', generateSafeId('log')), {
    actorUid: actor.uid,
    actorName: sanitizeText(
      actor.role === 'librarian'
        ? `${actor.fullName} (Bibliothécaire)`
        : `${actor.fullName} (${actor.filiere} · ${actor.cne})`,
      120
    ),
    actorRole: actor.role,
    actionType: 'retour',
    description: sanitizeText(
      `${viaQr ? 'Retour par QR' : 'Retour'} de « ${loan.bookTitle} » (${loan.studentName} · ${loan.ticketCode})`,
      300
    ),
    targetId: loan.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `loans/${loan.id}`);
  }
}

export async function cancelReservationFirebase(
  loan: Loan,
  book: Book,
  student: UserProfile
): Promise<void> {
  const todayIso = getTodayIso();
  const batch = writeBatch(db);

  batch.update(doc(db, 'loans', loan.id), {
    status: 'rendu',
    returnDate: todayIso,
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'books', book.id), {
    availableCopies: Math.min(book.totalCopies, book.availableCopies + 1),
    lastLoanId: loan.id,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'auditLogs', generateSafeId('log')), {
    actorUid: student.uid,
    actorName: sanitizeText(`${student.fullName} (${student.filiere} · ${student.cne})`, 120),
    actorRole: 'student',
    actionType: 'retour',
    description: sanitizeText(
      `Annulation de la réservation de « ${loan.bookTitle} » (${loan.ticketCode})`,
      300
    ),
    targetId: loan.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `loans/${loan.id}`);
  }
}

export async function remindLoansFirebase(params: {
  loans: Loan[];
  librarian: UserProfile;
  todayIso: string;
  isBulk: boolean;
}): Promise<void> {
  const { loans, librarian, todayIso, isBulk } = params;
  if (loans.length === 0) return;

  const batch = writeBatch(db);
  const loggedStudents = new Set<string>();

  for (const loan of loans) {
    if (loan.lastReminderDate === todayIso) continue;
    batch.update(doc(db, 'loans', loan.id), {
      reminderCount: loan.reminderCount + 1,
      lastReminderDate: todayIso,
      updatedAt: serverTimestamp(),
    });

    if (!loggedStudents.has(loan.studentUid)) {
      loggedStudents.add(loan.studentUid);
      const studentBookTitles = loans
        .filter((l) => l.studentUid === loan.studentUid)
        .map((l) => `« ${l.bookTitle} »`)
        .join(', ');

      batch.set(doc(db, 'auditLogs', generateSafeId('log')), {
        actorUid: librarian.uid,
        actorName: sanitizeText(`${librarian.fullName} (Bibliothécaire)`, 120),
        actorRole: 'librarian',
        actionType: 'relance',
        description: sanitizeText(
          `${isBulk ? 'Relance groupée' : 'Relance'} envoyée à ${loan.studentName} (${loan.studentCne}) pour ${studentBookTitles}`,
          300
        ),
        targetId: loan.id,
        createdAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'loans');
  }
}

export async function addBookFirebase(params: {
  title: string;
  author: string;
  isbn: string;
  filiere: string;
  totalCopies: number;
  coverImage: string;
  librarian: UserProfile;
}): Promise<Book> {
  const { title, author, isbn, filiere, totalCopies, coverImage, librarian } = params;
  const bookId = generateSafeId('livre');
  const qrCode = generateBookQrCode(filiere);
  const cleanTitle = sanitizeText(title, 200);
  const cleanAuthor = sanitizeText(author, 120);
  const cleanIsbn = sanitizeText(isbn, 20);

  const batch = writeBatch(db);
  batch.set(doc(db, 'books', bookId), {
    title: cleanTitle,
    author: cleanAuthor,
    isbn: cleanIsbn,
    filiere,
    totalCopies,
    availableCopies: totalCopies,
    qrCode,
    lastLoanId: 'init',
    coverImage: coverImage || '',
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'auditLogs', generateSafeId('log')), {
    actorUid: librarian.uid,
    actorName: sanitizeText(`${librarian.fullName} (Bibliothécaire)`, 120),
    actorRole: 'librarian',
    actionType: 'ajout_livre',
    description: sanitizeText(
      `Ajout de « ${cleanTitle} » (${cleanIsbn} · ${filiere} · ${totalCopies} ex.)`,
      300
    ),
    targetId: bookId,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return {
      id: bookId,
      title: cleanTitle,
      author: cleanAuthor,
      isbn: cleanIsbn,
      filiere,
      totalCopies,
      availableCopies: totalCopies,
      qrCode,
      lastLoanId: 'init',
      coverImage: coverImage || '',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `books/${bookId}`);
  }
}

export async function updateBookFirebase(params: {
  existingBook: Book;
  title: string;
  author: string;
  isbn: string;
  filiere: string;
  totalCopies: number;
  coverImage: string;
  librarian: UserProfile;
}): Promise<Book> {
  const { existingBook, title, author, isbn, filiere, totalCopies, coverImage, librarian } =
    params;
  const borrowedCount = Math.max(0, existingBook.totalCopies - existingBook.availableCopies);
  const availableCopies = Math.max(0, totalCopies - borrowedCount);
  const cleanTitle = sanitizeText(title, 200);
  const cleanAuthor = sanitizeText(author, 120);
  const cleanIsbn = sanitizeText(isbn, 20);

  const batch = writeBatch(db);
  batch.update(doc(db, 'books', existingBook.id), {
    title: cleanTitle,
    author: cleanAuthor,
    isbn: cleanIsbn,
    filiere,
    totalCopies,
    availableCopies,
    coverImage: coverImage || '',
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'auditLogs', generateSafeId('log')), {
    actorUid: librarian.uid,
    actorName: sanitizeText(`${librarian.fullName} (Bibliothécaire)`, 120),
    actorRole: 'librarian',
    actionType: 'modification_livre',
    description: sanitizeText(
      `Modification de « ${cleanTitle} » (${cleanIsbn} · ${filiere} · ${totalCopies} ex.)`,
      300
    ),
    targetId: existingBook.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return {
      ...existingBook,
      title: cleanTitle,
      author: cleanAuthor,
      isbn: cleanIsbn,
      filiere,
      totalCopies,
      availableCopies,
      coverImage: coverImage || '',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `books/${existingBook.id}`);
  }
}

export async function deleteBookFirebase(book: Book, librarian: UserProfile): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'books', book.id));
  batch.set(doc(db, 'auditLogs', generateSafeId('log')), {
    actorUid: librarian.uid,
    actorName: sanitizeText(`${librarian.fullName} (Bibliothécaire)`, 120),
    actorRole: 'librarian',
    actionType: 'suppression_livre',
    description: sanitizeText(
      `Suppression du livre « ${book.title} » (${book.isbn})`,
      300
    ),
    targetId: book.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `books/${book.id}`);
  }
}

export async function seedAdherentsIfLibrarian(profile: UserProfile): Promise<void> {
  if (profile.role !== 'librarian') return;
  try {
    const existing = await getDocs(query(collection(db, 'adherents'), limit(1)));
    if (!existing.empty) return;

    const batch = writeBatch(db);
    for (const adh of createInitialDemoAdherents()) {
      batch.set(doc(db, 'adherents', adh.id), {
        cardNumber: adh.cardNumber,
        studentUid: adh.studentUid,
        fullName: adh.fullName,
        cne: adh.cne,
        apogee: adh.apogee,
        filiere: adh.filiere,
        email: adh.email,
        registrationDate: adh.registrationDate,
        expiryDate: adh.expiryDate,
        status: adh.status,
        suspensionReason: adh.suspensionReason,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'adherents');
  }
}

export function subscribeAdherents(
  profile: UserProfile,
  onData: (adherents: Adherent[]) => void
): () => void {
  const q =
    profile.role === 'librarian'
      ? query(collection(db, 'adherents'), orderBy('registrationDate', 'desc'))
      : query(
          collection(db, 'adherents'),
          where('studentUid', '==', profile.uid)
        );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Adherent[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          cardNumber: String(data.cardNumber),
          studentUid: String(data.studentUid),
          fullName: String(data.fullName),
          cne: String(data.cne),
          apogee: String(data.apogee),
          filiere: data.filiere as Filiere,
          email: String(data.email),
          registrationDate: String(data.registrationDate),
          expiryDate: String(data.expiryDate),
          status: data.status === 'suspendu' ? 'suspendu' : 'actif',
          suspensionReason: String(data.suspensionReason || ''),
        };
      });
      list.sort((a, b) => b.registrationDate.localeCompare(a.registrationDate));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'adherents');
    }
  );
}

export async function registerAdherentFirebase(params: {
  cardNumber?: string;
  fullName: string;
  cne: string;
  apogee: string;
  filiere: Filiere;
  email: string;
  expiryDate: string;
  librarian: UserProfile;
}): Promise<Adherent> {
  const { cardNumber, fullName, cne, apogee, filiere, email, expiryDate, librarian } = params;
  const adherentId = generateSafeId('adh');
  const studentUid = generateSafeId('etu');
  const cleanCard = sanitizeText(cardNumber || generateCardNumber(), 40).toUpperCase();
  const cleanName = sanitizeText(fullName, 120);
  const cleanCne = sanitizeCne(cne);
  const cleanApogee = apogee.replace(/[^0-9]/g, '').slice(0, 20);
  const cleanEmail = sanitizeText(email, 150).toLowerCase();
  const registrationDate = getTodayIso();

  const batch = writeBatch(db);
  batch.set(doc(db, 'adherents', adherentId), {
    cardNumber: cleanCard,
    studentUid,
    fullName: cleanName,
    cne: cleanCne,
    apogee: cleanApogee,
    filiere,
    email: cleanEmail,
    registrationDate,
    expiryDate,
    status: 'actif',
    suspensionReason: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'auditLogs', generateSafeId('log')), {
    actorUid: librarian.uid,
    actorName: sanitizeText(`${librarian.fullName} (Bibliothécaire)`, 120),
    actorRole: 'librarian',
    actionType: 'inscription_adherent',
    description: sanitizeText(
      `Inscription de l’adhérent ${cleanName} (${cleanCard} · CNE ${cleanCne} · ${filiere})`,
      300
    ),
    targetId: adherentId,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return {
      id: adherentId,
      cardNumber: cleanCard,
      studentUid,
      fullName: cleanName,
      cne: cleanCne,
      apogee: cleanApogee,
      filiere,
      email: cleanEmail,
      registrationDate,
      expiryDate,
      status: 'actif',
      suspensionReason: '',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `adherents/${adherentId}`);
  }
}

export async function renewAdherentFirebase(
  adherent: Adherent,
  librarian: UserProfile
): Promise<string> {
  const todayIso = getTodayIso();
  const baseDate = adherent.expiryDate > todayIso ? adherent.expiryDate : todayIso;
  const newExpiryDate = addYearsIso(baseDate, 1);

  const batch = writeBatch(db);
  batch.update(doc(db, 'adherents', adherent.id), {
    expiryDate: newExpiryDate,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'auditLogs', generateSafeId('log')), {
    actorUid: librarian.uid,
    actorName: sanitizeText(`${librarian.fullName} (Bibliothécaire)`, 120),
    actorRole: 'librarian',
    actionType: 'renouvellement_adherent',
    description: sanitizeText(
      `Renouvellement de l’inscription de ${adherent.fullName} (${adherent.cardNumber}) jusqu’au ${newExpiryDate}`,
      300
    ),
    targetId: adherent.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return newExpiryDate;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `adherents/${adherent.id}`);
  }
}

export async function suspendAdherentFirebase(
  adherent: Adherent,
  reason: string,
  librarian: UserProfile
): Promise<void> {
  const cleanReason = sanitizeText(reason, 240);
  const batch = writeBatch(db);
  batch.update(doc(db, 'adherents', adherent.id), {
    status: 'suspendu',
    suspensionReason: cleanReason,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'auditLogs', generateSafeId('log')), {
    actorUid: librarian.uid,
    actorName: sanitizeText(`${librarian.fullName} (Bibliothécaire)`, 120),
    actorRole: 'librarian',
    actionType: 'suspension_adherent',
    description: sanitizeText(
      `Suspension de ${adherent.fullName} (${adherent.cardNumber}) — Motif : ${cleanReason}`,
      300
    ),
    targetId: adherent.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `adherents/${adherent.id}`);
  }
}

export async function reactivateAdherentFirebase(
  adherent: Adherent,
  librarian: UserProfile
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'adherents', adherent.id), {
    status: 'actif',
    suspensionReason: '',
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'auditLogs', generateSafeId('log')), {
    actorUid: librarian.uid,
    actorName: sanitizeText(`${librarian.fullName} (Bibliothécaire)`, 120),
    actorRole: 'librarian',
    actionType: 'reactivation_adherent',
    description: sanitizeText(
      `Réactivation de l’adhérent ${adherent.fullName} (${adherent.cardNumber})`,
      300
    ),
    targetId: adherent.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `adherents/${adherent.id}`);
  }
}
