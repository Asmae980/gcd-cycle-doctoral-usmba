import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { auth, googleProvider, isUsmbaEmail } from './firebase';
import {
  createInitialDemoAdherents,
  createInitialDemoLoans,
  createInitialDemoLogs,
  DEMO_LIBRARIAN_PROFILE,
  DEMO_STUDENT_PROFILE,
  SEED_BOOKS,
} from './data/seedData';
import {
  addBookFirebase,
  cancelReservationFirebase,
  createLoanFirebase,
  deleteBookFirebase,
  ensureUserProfile,
  extendLoanFirebase,
  reactivateAdherentFirebase,
  registerAdherentFirebase,
  remindLoansFirebase,
  renewAdherentFirebase,
  returnLoanFirebase,
  seedAdherentsIfLibrarian,
  seedCatalogIfLibrarian,
  subscribeAdherents,
  subscribeAuditLogs,
  subscribeBooks,
  subscribeLoans,
  suspendAdherentFirebase,
  updateBookFirebase,
  updateStudentProfileFirebase,
  validateReservationPickupFirebase,
} from './services/firestoreLibrary';
import {
  Adherent,
  AppSection,
  AuditLogEntry,
  Book,
  Filiere,
  Loan,
  UserProfile,
  UserRole,
} from './types/library';
import {
  addDaysIso,
  addYearsIso,
  DEFAULT_LOAN_DAYS,
  EXTENSION_DAYS,
  generateBookQrCode,
  generateCardNumber,
  generateSafeId,
  generateTicketCode,
  getEffectiveLoanStatus,
  getLoanPenalty,
  getTodayIso,
  normalizeIsbn,
  sanitizeCne,
  sanitizeText,
} from './utils/libraryUtils';
import { Header } from './components/Header';
import { HomeBanner } from './components/HomeBanner';
import { CatalogSection } from './components/CatalogSection';
import { AuthModal } from './components/AuthModal';
import { StudentWorkspace } from './components/StudentWorkspace';
import { LibrarianWorkspace } from './components/LibrarianWorkspace';
import { RegisterAdherentInput } from './components/AdherentRegisterModal';
import { JournalSection } from './components/JournalSection';
import { QrTicketModal } from './components/QrTicketModal';
import { QrScannerModal } from './components/QrScannerModal';
import { BulkReminderModal } from './components/BulkReminderModal';
import { BookFormModal, BookFormValues } from './components/BookFormModal';
import { BookDeleteModal } from './components/BookDeleteModal';

const DEMO_STORAGE_KEY = 'biblio_demo_state_v2';
const DEMO_ROLE_KEY = 'biblio_demo_role_v1';
const DEMO_STUDENT_PROFILE_KEY = 'biblio_demo_student_profile_v1';
const USMBA_ONLY_ERROR =
  "Accès réservé aux étudiants de l'USMBA (adresse @usmba.ac.ma).";

interface DemoStoreState {
  books: Book[];
  loans: Loan[];
  logs: AuditLogEntry[];
  adherents: Adherent[];
}

interface ToastMessage {
  id: string;
  type: 'success' | 'error';
  text: string;
  ticketLoan?: Loan;
}

function loadDemoState(): DemoStoreState {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DemoStoreState>;
      const isNewCatalog =
        Array.isArray(parsed.books) &&
        parsed.books.length >= 20 &&
        parsed.books.some((b) => b.genre === 'Romans' || b.filiere === 'Romans');
      const isNewLoans =
        Array.isArray(parsed.loans) &&
        parsed.loans.length > 0 &&
        !parsed.loans.some(
          (l) =>
            l.bookId.includes('book-gi') ||
            l.bookId.includes('book-ge') ||
            l.bookTitle.includes('Algorithmique')
        );
      if (
        isNewCatalog &&
        isNewLoans &&
        Array.isArray(parsed.logs)
      ) {
        return {
          books: parsed.books!,
          loans: parsed.loans!,
          logs: parsed.logs,
          adherents:
            Array.isArray(parsed.adherents) && parsed.adherents.length > 0
              ? parsed.adherents
              : createInitialDemoAdherents(),
        };
      }
    }
  } catch {
    // Repli sur l'état initial
  }
  return {
    books: SEED_BOOKS,
    loans: createInitialDemoLoans(),
    logs: createInitialDemoLogs(),
    adherents: createInitialDemoAdherents(),
  };
}

export default function App() {
  const [activeSection, setActiveSection] = useState<AppSection>('accueil');

  // État Firebase Auth
  const [firebaseProfile, setFirebaseProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // État Démo (localStorage)
  const [demoRole, setDemoRole] = useState<UserRole | null>(() => {
    try {
      const saved = localStorage.getItem(DEMO_ROLE_KEY);
      return saved === 'student' || saved === 'librarian' ? saved : null;
    } catch {
      return null;
    }
  });
  const [demoState, setDemoState] = useState<DemoStoreState>(() => loadDemoState());
  const [demoStudentProfile, setDemoStudentProfile] = useState<UserProfile>(() => {
    try {
      const raw = localStorage.getItem(DEMO_STUDENT_PROFILE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<UserProfile>;
        if (parsed && parsed.uid && parsed.fullName && parsed.cne && parsed.filiere) {
          return {
            ...DEMO_STUDENT_PROFILE,
            fullName: parsed.fullName,
            cne: parsed.cne,
            filiere: parsed.filiere,
          };
        }
      }
    } catch {
      // Repli sur le profil démo initial
    }
    return DEMO_STUDENT_PROFILE;
  });

  // Données Firestore en temps réel
  const [fsBooks, setFsBooks] = useState<Book[]>([]);
  const [fsLoans, setFsLoans] = useState<Loan[]>([]);
  const [fsLogs, setFsLogs] = useState<AuditLogEntry[]>([]);
  const [fsAdherents, setFsAdherents] = useState<Adherent[]>([]);

  // Modales et notifications
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isBulkReminderOpen, setIsBulkReminderOpen] = useState(false);
  const [ticketLoan, setTicketLoan] = useState<Loan | null>(null);
  const [ticketBook, setTicketBook] = useState<Book | null>(null);
  const [busyBookId, setBusyBookId] = useState<string | null>(null);
  const [busyLoanId, setBusyLoanId] = useState<string | null>(null);
  const [busyAdherentId, setBusyAdherentId] = useState<string | null>(null);
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [isSavingBook, setIsSavingBook] = useState(false);
  const [isDeletingBook, setIsDeletingBook] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback(
    (type: 'success' | 'error', text: string, relatedLoan?: Loan) => {
      setToast({
        id: String(Date.now()),
        type,
        text,
        ticketLoan: relatedLoan,
      });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Persistance Démo
  useEffect(() => {
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoState));
    } catch {
      // Ignorer quota localStorage éventuel
    }
  }, [demoState]);

  useEffect(() => {
    try {
      if (demoRole) {
        localStorage.setItem(DEMO_ROLE_KEY, demoRole);
      } else {
        localStorage.removeItem(DEMO_ROLE_KEY);
      }
    } catch {
      // Ignorer
    }
  }, [demoRole]);

  useEffect(() => {
    try {
      localStorage.setItem(DEMO_STUDENT_PROFILE_KEY, JSON.stringify(demoStudentProfile));
    } catch {
      // Ignorer
    }
  }, [demoStudentProfile]);

  // Écouteur Firebase Authentication
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFirebaseProfile(null);
        setFsBooks([]);
        setFsLoans([]);
        setFsLogs([]);
        setFsAdherents([]);
        setAuthReady(true);
        return;
      }

      if (!isUsmbaEmail(user.email)) {
        await signOut(auth);
        setFirebaseProfile(null);
        setFsBooks([]);
        setFsLoans([]);
        setFsLogs([]);
        setFsAdherents([]);
        setAuthError(USMBA_ONLY_ERROR);
        setIsAuthModalOpen(true);
        setAuthReady(true);
        return;
      }

      try {
        const profile = await ensureUserProfile(user);
        setFirebaseProfile(profile);
        setDemoRole(null);
        if (profile.role === 'librarian') {
          await seedCatalogIfLibrarian(profile);
          await seedAdherentsIfLibrarian(profile);
        }
      } catch (err) {
        console.error(err);
        showToast(
          'error',
          'Erreur lors du chargement du profil Firebase. Vous pouvez utiliser l’accès rapide démo.'
        );
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, [showToast]);

  // Abonnements Firestore
  useEffect(() => {
    if (!authReady || !firebaseProfile) return;

    const unsubBooks = subscribeBooks(setFsBooks);
    const unsubLoans = subscribeLoans(firebaseProfile, setFsLoans);
    const unsubAdherents = subscribeAdherents(firebaseProfile, setFsAdherents);
    const unsubLogs =
      firebaseProfile.role === 'librarian'
        ? subscribeAuditLogs(firebaseProfile, setFsLogs)
        : () => {};

    if (firebaseProfile.role !== 'librarian') {
      setFsLogs([]);
    }

    return () => {
      unsubBooks();
      unsubLoans();
      unsubAdherents();
      unsubLogs();
    };
  }, [authReady, firebaseProfile]);

  const currentUser: UserProfile | null = useMemo(() => {
    if (firebaseProfile) return firebaseProfile;
    if (demoRole === 'student') return demoStudentProfile;
    if (demoRole === 'librarian') return DEMO_LIBRARIAN_PROFILE;
    return null;
  }, [firebaseProfile, demoRole, demoStudentProfile]);

  const isFirebaseActive = Boolean(firebaseProfile);

  const books = useMemo(() => {
    if (isFirebaseActive && fsBooks.length > 0) {
      const isNew = fsBooks.some((b) => b.genre === 'Romans' || b.filiere === 'Romans');
      if (isNew) return fsBooks;
    }
    if (isFirebaseActive) return SEED_BOOKS;
    return demoState.books;
  }, [isFirebaseActive, fsBooks, demoState.books]);

  const loans = useMemo(() => {
    return isFirebaseActive ? fsLoans : demoState.loans;
  }, [isFirebaseActive, fsLoans, demoState.loans]);

  const logs = useMemo(() => {
    return isFirebaseActive ? fsLogs : demoState.logs;
  }, [isFirebaseActive, fsLogs, demoState.logs]);

  const adherents = useMemo(() => {
    return isFirebaseActive ? fsAdherents : demoState.adherents;
  }, [isFirebaseActive, fsAdherents, demoState.adherents]);

  const currentStudentAdherent = useMemo(() => {
    if (!currentUser || currentUser.role !== 'student') return null;
    const cleanCne = (currentUser.cne || '').toUpperCase();
    const cleanEmail = (currentUser.email || '').toLowerCase();
    const cleanName = (currentUser.fullName || '').toLowerCase().trim();
    return (
      adherents.find(
        (a) =>
          a.studentUid === currentUser.uid ||
          (cleanCne && a.cne.toUpperCase() === cleanCne) ||
          (cleanEmail && a.email.toLowerCase() === cleanEmail) ||
          (cleanName && a.fullName.toLowerCase().trim() === cleanName)
      ) || null
    );
  }, [currentUser, adherents]);

  const totals = useMemo(() => {
    const totalCopies = books.reduce((sum, b) => sum + b.totalCopies, 0);
    const availableCopies = books.reduce((sum, b) => sum + b.availableCopies, 0);
    return {
      totalBooks: books.length,
      totalCopies,
      availableCopies,
    };
  }, [books]);

  const handleNavigate = (section: AppSection) => {
    if (section === 'etudiant' && currentUser?.role !== 'student') return;
    if (section === 'bibliothecaire' && currentUser?.role !== 'librarian') return;
    if (section === 'journal' && currentUser?.role !== 'librarian') return;
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (
      (activeSection === 'etudiant' && currentUser?.role !== 'student') ||
      (activeSection === 'bibliothecaire' && currentUser?.role !== 'librarian') ||
      (activeSection === 'journal' && currentUser?.role !== 'librarian')
    ) {
      setActiveSection('accueil');
    }
  }, [activeSection, currentUser]);

  // Connexion Google
  const handleGoogleLogin = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    googleProvider.setCustomParameters({
      hd: 'usmba.ac.ma',
      prompt: 'select_account',
    });

    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (!isUsmbaEmail(cred.user.email)) {
        await signOut(auth);
        setFirebaseProfile(null);
        setAuthError(USMBA_ONLY_ERROR);
        setIsAuthModalOpen(true);
        return;
      }

      const profile = await ensureUserProfile(cred.user);
      setFirebaseProfile(profile);
      setDemoRole(null);
      if (profile.role === 'librarian') {
        await seedCatalogIfLibrarian(profile);
        await seedAdherentsIfLibrarian(profile);
      }
      setIsAuthModalOpen(false);
      showToast('success', `Connecté avec Google en tant que ${profile.fullName}.`);
      setActiveSection(profile.role === 'librarian' ? 'bibliothecaire' : 'etudiant');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('La fenêtre de connexion Google a été fermée.');
      } else if (msg.includes('popup-blocked')) {
        setAuthError(
          'La fenêtre contextuelle a été bloquée par le navigateur. Autorisez les popups ou utilisez l’accès démo.'
        );
      } else {
        setAuthError(
          'Connexion Google impossible pour le moment. Vous pouvez utiliser l’accès rapide démo ci-dessous.'
        );
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // Connexion Démo
  const handleDemoLogin = (role: UserRole) => {
    setAuthError(null);
    setDemoRole(role);
    setIsAuthModalOpen(false);
    showToast(
      'success',
      role === 'librarian'
        ? 'Mode démo activé : Bibliothécaire (Karim El Idrissi).'
        : 'Mode démo activé : Étudiant (Salma Benali · GI).'
    );
    setActiveSection(role === 'librarian' ? 'bibliothecaire' : 'etudiant');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // Ignorer
    }
    setFirebaseProfile(null);
    setDemoRole(null);
    setActiveSection('accueil');
    showToast('success', 'Vous êtes déconnecté.');
  };

  const handleUpdateStudentProfile = async (
    fullName: string,
    cne: string,
    filiere: Filiere
  ) => {
    const cleanName = sanitizeText(fullName, 120);
    const cleanCne = sanitizeCne(cne);

    if (firebaseProfile) {
      await updateStudentProfileFirebase(firebaseProfile.uid, fullName, cne, filiere);
      setFirebaseProfile((prev) =>
        prev
          ? {
              ...prev,
              fullName: cleanName || prev.fullName,
              cne: cleanCne || prev.cne,
              filiere,
            }
          : null
      );
      showToast('success', 'Profil étudiant mis à jour.');
      return;
    }

    if (demoRole === 'student') {
      const updatedName = cleanName || demoStudentProfile.fullName;
      const updatedCne = cleanCne || demoStudentProfile.cne;
      setDemoStudentProfile((prev) => ({
        ...prev,
        fullName: updatedName,
        cne: updatedCne,
        filiere,
      }));
      setDemoState((prev) => ({
        ...prev,
        adherents: prev.adherents.map((a) =>
          a.studentUid === demoStudentProfile.uid
            ? { ...a, fullName: updatedName, cne: updatedCne, filiere }
            : a
        ),
        loans: prev.loans.map((l) =>
          l.studentUid === demoStudentProfile.uid
            ? { ...l, studentName: updatedName, studentCne: updatedCne, studentFiliere: filiere }
            : l
        ),
      }));
      showToast('success', 'Profil étudiant mis à jour.');
    }
  };

  const executeBorrowOrReservation = async (
    book: Book,
    mode: 'emprunt' | 'reservation',
    borrower: { uid: string; fullName: string; cne: string; filiere: Filiere },
    viaQr = false
  ) => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }

    const borrowerCneUpper = sanitizeCne(borrower.cne);
    const suspendedAdherent = adherents.find(
      (a) =>
        a.status === 'suspendu' &&
        (a.studentUid === borrower.uid || a.cne.toUpperCase() === borrowerCneUpper)
    );
    if (suspendedAdherent) {
      const msg = `Emprunt bloqué : l’adhérent ${suspendedAdherent.fullName} est suspendu (${suspendedAdherent.suspensionReason}).`;
      showToast('error', msg);
      throw new Error(msg);
    }

    if (book.availableCopies <= 0) {
      const msg = `Le livre « ${book.title} » n’a plus d’exemplaires disponibles.`;
      showToast('error', msg);
      throw new Error(msg);
    }

    if (isFirebaseActive) {
      const createdLoan = await createLoanFirebase({
        book,
        actor: currentUser,
        borrower,
        mode,
        viaQr,
      });
      showToast(
        'success',
        mode === 'emprunt'
          ? `Emprunt enregistré pour ${borrower.fullName}.`
          : `Réservation enregistrée pour ${borrower.fullName}.`,
        createdLoan
      );
      return;
    }

    const ticketCode = generateTicketCode();
    const borrowDate = getTodayIso();
    const dueDate =
      mode === 'reservation' ? addDaysIso(borrowDate, 2) : addDaysIso(borrowDate, DEFAULT_LOAN_DAYS);
    const loanId = generateSafeId('loan');
    const status = mode === 'reservation' ? 'reserve' : 'en_cours';

    const newLoan: Loan = {
      id: loanId,
      ticketCode,
      bookId: book.id,
      bookTitle: book.title,
      bookAuthor: book.author,
      bookIsbn: book.isbn,
      bookFiliere: book.genre || book.filiere,
      studentUid: borrower.uid,
      studentName: borrower.fullName,
      studentCne: borrower.cne,
      studentFiliere: borrower.filiere,
      borrowDate,
      dueDate,
      returnDate: '',
      status,
      finalPenalty: 0,
      reminderCount: 0,
      lastReminderDate: '',
    };

    const newLog: AuditLogEntry = {
      id: generateSafeId('log'),
      actorUid: currentUser.uid,
      actorName: `${currentUser.fullName} (${currentUser.role === 'librarian' ? 'Bibliothécaire' : 'Étudiant'})`,
      actorRole: currentUser.role,
      actionType: mode,
      description: `${mode === 'emprunt' ? 'Emprunt' : 'Réservation'} de « ${book.title} » (${ticketCode}) par ${borrower.fullName}`,
      targetId: loanId,
      createdAtMs: Date.now(),
    };

    setDemoState((prev) => ({
      ...prev,
      books: prev.books.map((b) =>
        b.id === book.id
          ? {
              ...b,
              availableCopies: Math.max(0, b.availableCopies - 1),
              lastLoanId: loanId,
            }
          : b
      ),
      loans: [newLoan, ...prev.loans],
      logs: [newLog, ...prev.logs],
    }));

    showToast(
      'success',
      mode === 'emprunt' ? 'Emprunt validé avec succès.' : 'Réservation enregistrée.',
      newLoan
    );
  };

  const handleCatalogAction = async (book: Book, mode: 'emprunt' | 'reservation') => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }

    if (currentUser.role === 'librarian') {
      const borrower = {
        uid: currentUser.uid,
        fullName: currentUser.fullName,
        cne: currentUser.cne,
        filiere: currentUser.filiere === 'Administration' ? 'GI' : currentUser.filiere,
      };
      await executeBorrowOrReservation(book, mode, borrower);
      return;
    }

    if (currentUser.role === 'student') {
      if (!currentStudentAdherent || currentStudentAdherent.status === 'suspendu') {
        showToast(
          'error',
          'Impossible d’emprunter : votre compte étudiant n’a pas d’adhésion active ou est suspendu.'
        );
        return;
      }
      const borrower = {
        uid: currentUser.uid,
        fullName: currentUser.fullName,
        cne: currentUser.cne,
        filiere: currentUser.filiere as Filiere,
      };
      await executeBorrowOrReservation(book, mode, borrower);
      return;
    }
  };

  const handleCancelReservation = async (loan: Loan) => {
    setBusyLoanId(loan.id);
    try {
      if (isFirebaseActive) {
        const book = books.find((b) => b.id === loan.bookId);
        if (book && currentUser) {
          await cancelReservationFirebase(loan, book, currentUser);
        }
      } else {
        const newLog: AuditLogEntry = {
          id: generateSafeId('log'),
          actorUid: currentUser?.uid || loan.studentUid,
          actorName: currentUser?.fullName || loan.studentName,
          actorRole: currentUser?.role || 'student',
          actionType: 'reservation',
          description: `Annulation de réservation pour « ${loan.bookTitle} » (${loan.ticketCode})`,
          targetId: loan.id,
          createdAtMs: Date.now(),
        };

        setDemoState((prev) => ({
          ...prev,
          books: prev.books.map((b) =>
            b.id === loan.bookId
              ? { ...b, availableCopies: Math.min(b.totalCopies, b.availableCopies + 1) }
              : b
          ),
          loans: prev.loans.filter((l) => l.id !== loan.id),
          logs: [newLog, ...prev.logs],
        }));
      }
      showToast('success', 'Réservation annulée.');
    } finally {
      setBusyLoanId(null);
    }
  };

  const handleExtendLoan = async (loan: Loan) => {
    if (currentUser?.role !== 'librarian') return;
    setBusyLoanId(loan.id);
    try {
      if (isFirebaseActive) {
        await extendLoanFirebase(loan, currentUser);
      } else {
        const newDueDate = addDaysIso(loan.dueDate, EXTENSION_DAYS);
        const newLog: AuditLogEntry = {
          id: generateSafeId('log'),
          actorUid: currentUser.uid,
          actorName: `${currentUser.fullName} (Bibliothécaire)`,
          actorRole: 'librarian',
          actionType: 'prolongation',
          description: `Prolongation de prêt pour ${loan.studentName} (« ${loan.bookTitle} » jusqu’au ${newDueDate})`,
          targetId: loan.id,
          createdAtMs: Date.now(),
        };

        setDemoState((prev) => ({
          ...prev,
          loans: prev.loans.map((l) => (l.id === loan.id ? { ...l, dueDate: newDueDate } : l)),
          logs: [newLog, ...prev.logs],
        }));
      }
      showToast('success', 'Prêt prolongé de 7 jours.');
    } finally {
      setBusyLoanId(null);
    }
  };

  const handleReturnLoan = async (loan: Loan, viaQr = false) => {
    if (currentUser?.role !== 'librarian') return;
    setBusyLoanId(loan.id);
    try {
      const todayIso = getTodayIso();
      const penalty = getLoanPenalty(loan, todayIso);

      if (isFirebaseActive) {
        const book = books.find((b) => b.id === loan.bookId);
        if (book && currentUser) {
          await returnLoanFirebase({
            loan,
            book,
            actor: currentUser,
            finalPenalty: penalty,
            viaQr,
          });
        }
      } else {
        const newLog: AuditLogEntry = {
          id: generateSafeId('log'),
          actorUid: currentUser.uid,
          actorName: `${currentUser.fullName} (Bibliothécaire)`,
          actorRole: 'librarian',
          actionType: 'retour',
          description: `Retour enregistré pour « ${loan.bookTitle} » (${loan.studentName} · ${loan.ticketCode})${penalty > 0 ? ` · Pénalité: ${penalty} DH` : ''}`,
          targetId: loan.id,
          createdAtMs: Date.now(),
        };

        setDemoState((prev) => ({
          ...prev,
          books: prev.books.map((b) =>
            b.id === loan.bookId
              ? { ...b, availableCopies: Math.min(b.totalCopies, b.availableCopies + 1) }
              : b
          ),
          loans: prev.loans.map((l) =>
            l.id === loan.id
              ? { ...l, status: 'rendu', returnDate: todayIso, finalPenalty: penalty }
              : l
          ),
          logs: [newLog, ...prev.logs],
        }));
      }

      showToast(
        'success',
        viaQr
          ? `Retour validé par QR pour ${loan.studentName} (${loan.bookTitle})${penalty > 0 ? ` — Pénalité: ${penalty} DH` : ''}`
          : `Retour enregistré (${loan.bookTitle})${penalty > 0 ? ` — Pénalité: ${penalty} DH` : ''}`
      );
    } finally {
      setBusyLoanId(null);
    }
  };

  const handleRemindSingleLoan = async (loan: Loan) => {
    if (currentUser?.role !== 'librarian') return;
    setBusyLoanId(loan.id);
    try {
      const todayIso = getTodayIso();
      if (isFirebaseActive && currentUser) {
        await remindLoansFirebase({
          loans: [loan],
          librarian: currentUser,
          todayIso,
          isBulk: false,
        });
      } else {
        const newLog: AuditLogEntry = {
          id: generateSafeId('log'),
          actorUid: currentUser.uid,
          actorName: `${currentUser.fullName} (Bibliothécaire)`,
          actorRole: 'librarian',
          actionType: 'relance',
          description: `Relance envoyée à ${loan.studentName} (${loan.studentCne}) pour « ${loan.bookTitle} »`,
          targetId: loan.id,
          createdAtMs: Date.now(),
        };

        setDemoState((prev) => ({
          ...prev,
          loans: prev.loans.map((l) =>
            l.id === loan.id
              ? { ...l, reminderCount: l.reminderCount + 1, lastReminderDate: todayIso }
              : l
          ),
          logs: [newLog, ...prev.logs],
        }));
      }
      showToast('success', `Rappel de retard envoyé à ${loan.studentName}.`);
    } finally {
      setBusyLoanId(null);
    }
  };

  const handleValidatePickup = async (loan: Loan) => {
    if (currentUser?.role !== 'librarian') return;
    setBusyLoanId(loan.id);
    try {
      const todayIso = getTodayIso();
      const dueDate = addDaysIso(todayIso, DEFAULT_LOAN_DAYS);
      if (isFirebaseActive && currentUser) {
        await validateReservationPickupFirebase(loan, currentUser);
      } else {
        const newLog: AuditLogEntry = {
          id: generateSafeId('log'),
          actorUid: currentUser.uid,
          actorName: `${currentUser.fullName} (Bibliothécaire)`,
          actorRole: 'librarian',
          actionType: 'emprunt',
          description: `Validation du retrait de réservation pour ${loan.studentName} (« ${loan.bookTitle} »)`,
          targetId: loan.id,
          createdAtMs: Date.now(),
        };

        setDemoState((prev) => ({
          ...prev,
          loans: prev.loans.map((l) =>
            l.id === loan.id
              ? { ...l, status: 'en_cours', borrowDate: todayIso, dueDate }
              : l
          ),
          logs: [newLog, ...prev.logs],
        }));
      }
      showToast('success', `Retrait de la réservation validé pour ${loan.studentName}.`);
    } finally {
      setBusyLoanId(null);
    }
  };

  const handleBulkReminders = async () => {
    if (currentUser?.role !== 'librarian') return;
    const todayIso = getTodayIso();
    const activeOverdue = loans.filter(
      (l) => getEffectiveLoanStatus(l, todayIso) === 'en_retard'
    );
    if (activeOverdue.length === 0) return;

    try {
      if (isFirebaseActive && currentUser) {
        await remindLoansFirebase({
          loans: activeOverdue,
          librarian: currentUser,
          todayIso,
          isBulk: true,
        });
      } else {
        const newLogs: AuditLogEntry[] = activeOverdue.map((loan) => ({
          id: generateSafeId('log'),
          actorUid: currentUser.uid,
          actorName: `${currentUser.fullName} (Bibliothécaire)`,
          actorRole: 'librarian',
          actionType: 'relance',
          description: `Relance groupée envoyée à ${loan.studentName} (${loan.studentCne}) pour « ${loan.bookTitle} »`,
          targetId: loan.id,
          createdAtMs: Date.now(),
        }));

        setDemoState((prev) => ({
          ...prev,
          loans: prev.loans.map((l) =>
            activeOverdue.some((o) => o.id === l.id)
              ? { ...l, reminderCount: l.reminderCount + 1, lastReminderDate: todayIso }
              : l
          ),
          logs: [...newLogs, ...prev.logs],
        }));
      }
      showToast('success', `Relances envoyées pour ${activeOverdue.length} retard(s).`);
    } finally {
      setIsBulkReminderOpen(false);
    }
  };

  const handleSaveBook = async (values: BookFormValues) => {
    if (!currentUser || currentUser.role !== 'librarian') return;
    setIsSavingBook(true);

    try {
      if (isFirebaseActive) {
        if (editingBook) {
          await updateBookFirebase({
            existingBook: editingBook,
            ...values,
            librarian: currentUser,
          });
          showToast('success', 'Livre modifié avec succès');
        } else {
          await addBookFirebase({
            ...values,
            librarian: currentUser,
          });
          showToast('success', 'Livre ajouté');
        }
      } else {
        if (editingBook) {
          const cleanTitle = sanitizeText(values.title, 200);
          const cleanAuthor = sanitizeText(values.author, 120);
          const cleanIsbn = sanitizeText(values.isbn, 20);
          const borrowedCount = Math.max(0, editingBook.totalCopies - editingBook.availableCopies);
          const availableCopies = Math.max(0, values.totalCopies - borrowedCount);

          const updatedBook: Book = {
            ...editingBook,
            title: cleanTitle,
            author: cleanAuthor,
            isbn: cleanIsbn,
            filiere: values.filiere,
            totalCopies: values.totalCopies,
            availableCopies,
            coverImage: values.coverImage || '',
          };

          const newLog: AuditLogEntry = {
            id: generateSafeId('log'),
            actorUid: currentUser.uid,
            actorName: `${currentUser.fullName} (Bibliothécaire)`,
            actorRole: 'librarian',
            actionType: 'modification_livre',
            description: `Modification de « ${cleanTitle} » (${cleanIsbn} · ${values.filiere} · ${values.totalCopies} ex.)`,
            targetId: editingBook.id,
            createdAtMs: Date.now(),
          };

          setDemoState((prev) => ({
            ...prev,
            books: prev.books.map((b) => (b.id === editingBook.id ? updatedBook : b)),
            logs: [newLog, ...prev.logs],
          }));
          showToast('success', 'Livre modifié avec succès');
        } else {
          const newBookId = generateSafeId('livre');
          const cleanTitle = sanitizeText(values.title, 200);
          const cleanAuthor = sanitizeText(values.author, 120);
          const cleanIsbn = sanitizeText(values.isbn, 20);
          const qrCode = generateBookQrCode(values.filiere);

          const newBook: Book = {
            id: newBookId,
            title: cleanTitle,
            author: cleanAuthor,
            isbn: cleanIsbn,
            filiere: values.filiere,
            totalCopies: values.totalCopies,
            availableCopies: values.totalCopies,
            qrCode,
            lastLoanId: 'init',
            coverImage: values.coverImage || '',
          };

          const newLog: AuditLogEntry = {
            id: generateSafeId('log'),
            actorUid: currentUser.uid,
            actorName: `${currentUser.fullName} (Bibliothécaire)`,
            actorRole: 'librarian',
            actionType: 'ajout_livre',
            description: `Ajout de « ${cleanTitle} » (${cleanIsbn} · ${values.filiere} · ${values.totalCopies} ex.)`,
            targetId: newBookId,
            createdAtMs: Date.now(),
          };

          setDemoState((prev) => ({
            ...prev,
            books: [newBook, ...prev.books],
            logs: [newLog, ...prev.logs],
          }));
          showToast('success', 'Livre ajouté');
        }
      }

      setIsBookModalOpen(false);
      setEditingBook(null);
    } finally {
      setIsSavingBook(false);
    }
  };

  const handleInitiateDeleteBook = (book: Book) => {
    if (currentUser?.role !== 'librarian') return;
    setBookToDelete(book);
  };

  const handleConfirmDeleteBook = async (book: Book) => {
    if (!currentUser || currentUser.role !== 'librarian') return;
    setIsDeletingBook(true);
    try {
      if (isFirebaseActive) {
        await deleteBookFirebase(book, currentUser);
      } else {
        const newLog: AuditLogEntry = {
          id: generateSafeId('log'),
          actorUid: currentUser.uid,
          actorName: `${currentUser.fullName} (Bibliothécaire)`,
          actorRole: 'librarian',
          actionType: 'suppression_livre',
          description: `Suppression du livre « ${book.title} » (${book.isbn})`,
          targetId: book.id,
          createdAtMs: Date.now(),
        };

        setDemoState((prev) => ({
          ...prev,
          books: prev.books.filter((b) => b.id !== book.id),
          logs: [newLog, ...prev.logs],
        }));
      }
      showToast('success', `Livre « ${book.title} » supprimé.`);
      setBookToDelete(null);
    } catch (err) {
      showToast('error', 'Erreur lors de la suppression du livre.');
    } finally {
      setIsDeletingBook(false);
    }
  };

  const handleRegisterAdherent = async (values: RegisterAdherentInput) => {
    if (!currentUser || currentUser.role !== 'librarian') return;

    if (isFirebaseActive) {
      const created = await registerAdherentFirebase({
        ...values,
        librarian: currentUser,
      });
      showToast('success', `Adhérent ${created.fullName} inscrit (${created.cardNumber}).`);
      return;
    }

    const adherentId = generateSafeId('adh');
    const studentUid = generateSafeId('etu');
    const cleanCard = sanitizeText(values.cardNumber || generateCardNumber(), 40).toUpperCase();
    const cleanName = sanitizeText(values.fullName, 120);
    const cleanCne = sanitizeCne(values.cne);
    const cleanApogee = values.apogee.replace(/[^0-9]/g, '').slice(0, 20);
    const cleanEmail = sanitizeText(values.email, 150).toLowerCase();
    const registrationDate = getTodayIso();

    const newAdherent: Adherent = {
      id: adherentId,
      cardNumber: cleanCard,
      studentUid,
      fullName: cleanName,
      cne: cleanCne,
      apogee: cleanApogee,
      filiere: values.filiere,
      email: cleanEmail,
      registrationDate,
      expiryDate: values.expiryDate,
      status: 'actif',
      suspensionReason: '',
    };

    const newLog: AuditLogEntry = {
      id: generateSafeId('log'),
      actorUid: currentUser.uid,
      actorName: `${currentUser.fullName} (Bibliothécaire)`,
      actorRole: 'librarian',
      actionType: 'inscription_adherent',
      description: `Inscription de l’adhérent ${cleanName} (${cleanCard} · CNE ${cleanCne} · ${values.filiere})`,
      targetId: adherentId,
      createdAtMs: Date.now(),
    };

    setDemoState((prev) => ({
      ...prev,
      adherents: [newAdherent, ...prev.adherents],
      logs: [newLog, ...prev.logs],
    }));
    showToast('success', `Adhérent ${cleanName} inscrit (${cleanCard}).`);
  };

  const handleRenewAdherent = async (adherent: Adherent) => {
    if (!currentUser || currentUser.role !== 'librarian') return;
    setBusyAdherentId(adherent.id);
    try {
      if (isFirebaseActive) {
        const newExpiry = await renewAdherentFirebase(adherent, currentUser);
        showToast(
          'success',
          `Inscription renouvelée pour ${adherent.fullName} jusqu’au ${newExpiry}.`
        );
      } else {
        const todayIso = getTodayIso();
        const baseDate = adherent.expiryDate > todayIso ? adherent.expiryDate : todayIso;
        const newExpiryDate = addYearsIso(baseDate, 1);

        const newLog: AuditLogEntry = {
          id: generateSafeId('log'),
          actorUid: currentUser.uid,
          actorName: `${currentUser.fullName} (Bibliothécaire)`,
          actorRole: 'librarian',
          actionType: 'renouvellement_adherent',
          description: `Renouvellement de l’inscription de ${adherent.fullName} (${adherent.cardNumber}) jusqu’au ${newExpiryDate}`,
          targetId: adherent.id,
          createdAtMs: Date.now(),
        };

        setDemoState((prev) => ({
          ...prev,
          adherents: prev.adherents.map((a) =>
            a.id === adherent.id ? { ...a, expiryDate: newExpiryDate } : a
          ),
          logs: [newLog, ...prev.logs],
        }));
        showToast('success', `Inscription de ${adherent.fullName} renouvelée (+1 an).`);
      }
    } finally {
      setBusyAdherentId(null);
    }
  };

  const handleSuspendAdherent = async (adherent: Adherent, reason: string) => {
    if (!currentUser || currentUser.role !== 'librarian') return;
    const cleanReason = sanitizeText(reason, 240);
    setBusyAdherentId(adherent.id);
    try {
      if (isFirebaseActive) {
        await suspendAdherentFirebase(adherent, cleanReason, currentUser);
      } else {
        const newLog: AuditLogEntry = {
          id: generateSafeId('log'),
          actorUid: currentUser.uid,
          actorName: `${currentUser.fullName} (Bibliothécaire)`,
          actorRole: 'librarian',
          actionType: 'suspension_adherent',
          description: `Suspension de ${adherent.fullName} (${adherent.cardNumber}) — Motif : ${cleanReason}`,
          targetId: adherent.id,
          createdAtMs: Date.now(),
        };

        setDemoState((prev) => ({
          ...prev,
          adherents: prev.adherents.map((a) =>
            a.id === adherent.id
              ? { ...a, status: 'suspendu', suspensionReason: cleanReason }
              : a
          ),
          logs: [newLog, ...prev.logs],
        }));
      }
      showToast('success', `${adherent.fullName} a été suspendu.`);
    } finally {
      setBusyAdherentId(null);
    }
  };

  const handleReactivateAdherent = async (adherent: Adherent) => {
    if (!currentUser || currentUser.role !== 'librarian') return;
    setBusyAdherentId(adherent.id);
    try {
      if (isFirebaseActive) {
        await reactivateAdherentFirebase(adherent, currentUser);
      } else {
        const newLog: AuditLogEntry = {
          id: generateSafeId('log'),
          actorUid: currentUser.uid,
          actorName: `${currentUser.fullName} (Bibliothécaire)`,
          actorRole: 'librarian',
          actionType: 'reactivation_adherent',
          description: `Réactivation de l’adhérent ${adherent.fullName} (${adherent.cardNumber})`,
          targetId: adherent.id,
          createdAtMs: Date.now(),
        };

        setDemoState((prev) => ({
          ...prev,
          adherents: prev.adherents.map((a) =>
            a.id === adherent.id
              ? { ...a, status: 'actif', suspensionReason: '' }
              : a
          ),
          logs: [newLog, ...prev.logs],
        }));
      }
      showToast('success', `${adherent.fullName} a été réactivé.`);
    } finally {
      setBusyAdherentId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header
        activeSection={activeSection}
        onNavigate={handleNavigate}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {activeSection === 'accueil' && (
          <HomeBanner
            totalBooks={totals.totalBooks}
            totalCopies={totals.totalCopies}
            availableCopies={totals.availableCopies}
            currentUser={currentUser}
            onOpenQrBorrow={() => setIsQrScannerOpen(true)}
            onOpenCatalog={() => handleNavigate('catalogue')}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onNavigateWorkspace={() =>
              handleNavigate(
                currentUser?.role === 'librarian' ? 'bibliothecaire' : 'etudiant'
              )
            }
          />
        )}

        {activeSection === 'catalogue' && (
          <CatalogSection
            books={books}
            currentUser={currentUser}
            busyBookId={busyBookId}
            onBorrowBook={(book) => handleCatalogAction(book, 'emprunt')}
            onReserveBook={(book) => handleCatalogAction(book, 'reservation')}
            onShowBookQr={(book) => {
              setTicketLoan(null);
              setTicketBook(book);
            }}
            onAddBook={() => {
              if (currentUser?.role !== 'librarian') return;
              setEditingBook(null);
              setIsBookModalOpen(true);
            }}
            onEditBook={(book) => {
              if (currentUser?.role !== 'librarian') return;
              setEditingBook(book);
              setIsBookModalOpen(true);
            }}
            onDeleteBook={handleInitiateDeleteBook}
          />
        )}

        {activeSection === 'etudiant' && currentUser?.role === 'student' && (
          <StudentWorkspace
            student={currentUser}
            adherent={currentStudentAdherent}
            books={books}
            loans={loans}
            onShowTicketQr={(loan) => {
              setTicketBook(null);
              setTicketLoan(loan);
            }}
            onCancelReservation={handleCancelReservation}
            onGoToCatalog={() => handleNavigate('catalogue')}
            onUpdateProfile={handleUpdateStudentProfile}
          />
        )}

        {activeSection === 'bibliothecaire' && currentUser?.role === 'librarian' && (
          <LibrarianWorkspace
            currentUser={currentUser}
            loans={loans}
            books={books}
            adherents={adherents}
            busyLoanId={busyLoanId}
            busyBookId={busyBookId}
            busyAdherentId={busyAdherentId}
            onExtendLoan={handleExtendLoan}
            onReturnLoan={(loan) => handleReturnLoan(loan, false)}
            onRemindLoan={handleRemindSingleLoan}
            onValidatePickup={handleValidatePickup}
            onOpenQrScanner={() => setIsQrScannerOpen(true)}
            onOpenBulkReminder={() => setIsBulkReminderOpen(true)}
            onShowTicketQr={(loan) => {
              setTicketBook(null);
              setTicketLoan(loan);
            }}
            onBorrowBook={(book) => handleCatalogAction(book, 'emprunt')}
            onReserveBook={(book) => handleCatalogAction(book, 'reservation')}
            onShowBookQr={(book) => {
              setTicketLoan(null);
              setTicketBook(book);
            }}
            onAddBook={() => {
              setEditingBook(null);
              setIsBookModalOpen(true);
            }}
            onEditBook={(book) => {
              setEditingBook(book);
              setIsBookModalOpen(true);
            }}
            onDeleteBook={handleInitiateDeleteBook}
            onRegisterAdherent={handleRegisterAdherent}
            onRenewAdherent={handleRenewAdherent}
            onSuspendAdherent={handleSuspendAdherent}
            onReactivateAdherent={handleReactivateAdherent}
            onExportToast={(text) => showToast('success', text)}
          />
        )}

        {activeSection === 'journal' && currentUser?.role === 'librarian' && (
          <JournalSection
            logs={logs}
            isSignedIn={Boolean(currentUser)}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />
        )}
      </main>

      {/* Modales */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          setAuthError(null);
        }}
        onGoogleLogin={handleGoogleLogin}
        onDemoLogin={handleDemoLogin}
        isSigningIn={isSigningIn}
        errorMessage={authError}
      />

      <QrTicketModal
        loan={ticketLoan}
        book={ticketBook}
        books={books}
        onClose={() => {
          setTicketLoan(null);
          setTicketBook(null);
        }}
      />

      <BookFormModal
        isOpen={isBookModalOpen}
        editingBook={editingBook}
        existingBooks={books}
        isSubmitting={isSavingBook}
        onClose={() => {
          setIsBookModalOpen(false);
          setEditingBook(null);
        }}
        onSubmit={handleSaveBook}
      />

      <BookDeleteModal
        book={bookToDelete}
        loans={loans}
        isSubmitting={isDeletingBook}
        onClose={() => setBookToDelete(null)}
        onConfirmDelete={handleConfirmDeleteBook}
      />

      <QrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        books={books}
        loans={loans}
        adherents={adherents}
        currentUser={currentUser}
        onRequireAuth={() => {
          setIsQrScannerOpen(false);
          setIsAuthModalOpen(true);
        }}
        onConfirmBorrowByQr={(book, borrower) =>
          executeBorrowOrReservation(book, 'emprunt', borrower, true)
        }
        onConfirmReturnByQr={(loan) => handleReturnLoan(loan, true)}
        onConfirmPickupByQr={(loan) => handleValidatePickup(loan)}
      />

      <BulkReminderModal
        isOpen={isBulkReminderOpen}
        onClose={() => setIsBulkReminderOpen(false)}
        loans={loans}
        onSendBulkReminders={handleBulkReminders}
      />

      {/* Notification toast discrète */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed right-4 bottom-4 z-50 flex max-w-md items-start gap-3 rounded-lg border bg-white p-4 shadow-lg ${
            toast.type === 'error' ? 'border-red-300' : 'border-slate-200'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
          ) : (
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0 flex-1 text-sm text-slate-800">
            <p>{toast.text}</p>
            {toast.ticketLoan && (
              <button
                type="button"
                onClick={() => {
                  setTicketBook(null);
                  setTicketLoan(toast.ticketLoan!);
                  setToast(null);
                }}
                className="mt-1.5 cursor-pointer text-xs font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950"
              >
                Afficher le ticket QR
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Fermer la notification"
            className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
