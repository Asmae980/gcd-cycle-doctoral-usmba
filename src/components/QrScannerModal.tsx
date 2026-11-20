import React, { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, Keyboard, X } from 'lucide-react';
import { DEMO_STUDENTS_DIRECTORY } from '../data/seedData';
import { Adherent, Book, Filiere, Loan, UserProfile } from '../types/library';
import {
  formatDateFr,
  getEffectiveLoanStatus,
  getLoanPenalty,
  getStatusLabel,
  getTodayIso,
} from '../utils/libraryUtils';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  books: Book[];
  loans: Loan[];
  adherents?: Adherent[];
  currentUser: UserProfile | null;
  onRequireAuth: () => void;
  onConfirmBorrowByQr: (
    book: Book,
    borrower: { uid: string; fullName: string; cne: string; filiere: Filiere }
  ) => Promise<void>;
  onConfirmReturnByQr: (loan: Loan) => Promise<void>;
  onConfirmPickupByQr: (loan: Loan) => Promise<void>;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  books,
  loans,
  adherents = [],
  currentUser,
  onRequireAuth,
  onConfirmBorrowByQr,
  onConfirmReturnByQr,
  onConfirmPickupByQr,
}) => {
  const [inputMode, setInputMode] = useState<'manual' | 'camera'>('manual');
  const [codeInput, setCodeInput] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Pour un bibliothécaire qui enregistre un emprunt par QR pour un étudiant
  const [selectedStudentUid, setSelectedStudentUid] = useState(
    DEMO_STUDENTS_DIRECTORY[0].uid
  );
  const [selectedBookIdForCard, setSelectedBookIdForCard] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const todayIso = getTodayIso();
  const isLibrarian = currentUser?.role === 'librarian';

  const borrowerDirectory = useMemo(() => {
    const byCne = new Map<
      string,
      { uid: string; fullName: string; cne: string; filiere: Filiere }
    >();
    for (const stu of DEMO_STUDENTS_DIRECTORY) {
      byCne.set(stu.cne.toUpperCase(), {
        uid: stu.uid,
        fullName: stu.fullName,
        cne: stu.cne,
        filiere: stu.filiere,
      });
    }
    for (const adh of adherents) {
      byCne.set(adh.cne.toUpperCase(), {
        uid: adh.studentUid,
        fullName: adh.fullName,
        cne: adh.cne,
        filiere: adh.filiere,
      });
    }
    return Array.from(byCne.values());
  }, [adherents]);

  const findSuspendedAdherent = (uid: string, cne: string): Adherent | null => {
    const cleanCne = cne.trim().toUpperCase();
    return (
      adherents.find(
        (a) =>
          a.status === 'suspendu' &&
          (a.studentUid === uid || a.cne.toUpperCase() === cleanCne)
      ) || null
    );
  };

  // Arrêt propre du flux caméra
  useEffect(() => {
    if (!isOpen || inputMode !== 'camera') {
      return;
    }

    let stream: MediaStream | null = null;
    let rafId = 0;
    let cancelled = false;

    const startCamera = async () => {
      setCameraError(null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'La caméra n’est pas disponible sur ce navigateur. Utilisez la saisie manuelle du code.'
        );
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const scanFrame = () => {
          if (cancelled) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const decoded = jsQR(imgData.data, imgData.width, imgData.height);
              if (decoded && decoded.data) {
                setCodeInput(decoded.data.trim());
                setInputMode('manual');
                return;
              }
            }
          }
          rafId = requestAnimationFrame(scanFrame);
        };
        rafId = requestAnimationFrame(scanFrame);
      } catch {
        if (!cancelled) {
          setCameraError(
            'Accès caméra refusé ou indisponible. Saisissez le code QR manuellement ci-dessous.'
          );
        }
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isOpen, inputMode]);

  useEffect(() => {
    if (!isOpen) {
      setCodeInput('');
      setFeedback(null);
      setCameraError(null);
      setInputMode('manual');
    } else {
      const firstAvail = books.find((b) => b.availableCopies > 0);
      setSelectedBookIdForCard(firstAvail?.id || '');
    }
  }, [isOpen, books]);

  const normalizedCode = codeInput.trim().toUpperCase();

  const matchedLoan = useMemo(() => {
    if (!normalizedCode) return null;
    return (
      loans.find(
        (l) =>
          l.ticketCode.toUpperCase() === normalizedCode ||
          l.id.toUpperCase() === normalizedCode
      ) || null
    );
  }, [loans, normalizedCode]);

  const matchedBook = useMemo(() => {
    if (!normalizedCode || matchedLoan) return null;
    return (
      books.find(
        (b) =>
          b.qrCode.toUpperCase() === normalizedCode ||
          b.isbn.toUpperCase() === normalizedCode ||
          b.id.toUpperCase() === normalizedCode
      ) || null
    );
  }, [books, normalizedCode, matchedLoan]);

  const matchedStudentCard = useMemo(() => {
    if (!normalizedCode || matchedLoan || matchedBook) return null;
    if (
      currentUser?.role === 'student' &&
      currentUser.cne.toUpperCase() === normalizedCode
    ) {
      return {
        uid: currentUser.uid,
        fullName: currentUser.fullName,
        cne: currentUser.cne,
        filiere:
          currentUser.filiere === 'Administration' ? ('GI' as Filiere) : currentUser.filiere,
      };
    }
    const dirStudent = borrowerDirectory.find(
      (s) => s.cne.toUpperCase() === normalizedCode
    );
    if (dirStudent) {
      return dirStudent;
    }
    const loanStudent = loans.find(
      (l) => l.studentCne.toUpperCase() === normalizedCode
    );
    if (loanStudent) {
      return {
        uid: loanStudent.studentUid,
        fullName: loanStudent.studentName,
        cne: loanStudent.studentCne,
        filiere: loanStudent.studentFiliere,
      };
    }
    return null;
  }, [normalizedCode, matchedLoan, matchedBook, currentUser, loans, borrowerDirectory]);

  const availableBooks = useMemo(
    () => books.filter((b) => b.availableCopies > 0),
    [books]
  );

  const quickExamples = useMemo(() => {
    const sampleBook = books.find((b) => b.availableCopies > 0) || books[0];
    const sampleLoan = loans.find((l) => l.status !== 'rendu') || null;
    const sampleCne =
      currentUser?.role === 'student'
        ? currentUser.cne
        : DEMO_STUDENTS_DIRECTORY[0].cne;
    return { sampleBook, sampleLoan, sampleCne };
  }, [books, loans, currentUser]);

  if (!isOpen) return null;

  const targetBorrowerForMatchedBook =
    currentUser?.role === 'student'
      ? {
          uid: currentUser.uid,
          fullName: currentUser.fullName,
          cne: currentUser.cne,
          filiere:
            currentUser.filiere === 'Administration'
              ? ('GI' as Filiere)
              : currentUser.filiere,
        }
      : borrowerDirectory.find((s) => s.uid === selectedStudentUid) ||
        borrowerDirectory[0];

  const suspendedForBook =
    currentUser && !isLibrarian
      ? findSuspendedAdherent(
          targetBorrowerForMatchedBook.uid,
          targetBorrowerForMatchedBook.cne
        )
      : null;

  const suspendedForCard = matchedStudentCard
    ? findSuspendedAdherent(matchedStudentCard.uid, matchedStudentCard.cne)
    : null;

  const handleBorrowWithCardAction = async () => {
    if (!matchedStudentCard || isLibrarian) return;
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    const chosenBook = books.find((b) => b.id === selectedBookIdForCard);
    if (!chosenBook || chosenBook.availableCopies <= 0) return;

    setIsProcessing(true);
    setFeedback(null);
    try {
      await onConfirmBorrowByQr(chosenBook, matchedStudentCard);
      setFeedback(
        `Emprunt enregistré pour ${matchedStudentCard.fullName} (« ${chosenBook.title} »).`
      );
      setCodeInput('');
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Impossible d’enregistrer cet emprunt.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBorrowAction = async () => {
    if (!matchedBook || isLibrarian) return;
    if (!currentUser) {
      onRequireAuth();
      return;
    }

    setIsProcessing(true);
    setFeedback(null);
    try {
      await onConfirmBorrowByQr(matchedBook, targetBorrowerForMatchedBook);
      setFeedback(`Emprunt enregistré pour « ${matchedBook.title} ».`);
      setCodeInput('');
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Impossible d’enregistrer cet emprunt.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReturnAction = async () => {
    if (!matchedLoan || isLibrarian) return;
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    setIsProcessing(true);
    setFeedback(null);
    try {
      await onConfirmReturnByQr(matchedLoan);
      setFeedback(`Retour enregistré pour « ${matchedLoan.bookTitle} ».`);
      setCodeInput('');
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Impossible d’enregistrer ce retour.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePickupAction = async () => {
    if (!matchedLoan || isLibrarian) return;
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    setIsProcessing(true);
    setFeedback(null);
    try {
      await onConfirmPickupByQr(matchedLoan);
      setFeedback(`Retrait validé pour « ${matchedLoan.bookTitle} ».`);
      setCodeInput('');
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Impossible de valider le retrait.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="qr-scanner-title" className="font-display text-xl font-bold text-slate-900">
              Emprunt ou retour par QR
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Scannez avec la caméra ou saisissez un code QR de livre (<span className="font-mono">LIVRE-...</span>), de ticket (<span className="font-mono">EMP-...</span>) ou de carte étudiant (CNE).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le scanner QR"
            className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sélecteur Caméra / Saisie */}
        <div className="mt-5 flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setInputMode('manual')}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              inputMode === 'manual'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Keyboard className="h-4 w-4" aria-hidden="true" />
            Saisie du code
          </button>
          <button
            type="button"
            onClick={() => setInputMode('camera')}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              inputMode === 'camera'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            Scanner par caméra
          </button>
        </div>

        {inputMode === 'camera' && (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
            {cameraError ? (
              <div className="p-6 text-center text-sm text-slate-200">{cameraError}</div>
            ) : (
              <div className="relative aspect-video w-full">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
              </div>
            )}
          </div>
        )}

        {/* Saisie manuelle du code */}
        <div className="mt-4 space-y-2">
          <label htmlFor="qr-code-input" className="block text-xs font-medium text-slate-700">
            Code QR ou ISBN
          </label>
          <input
            id="qr-code-input"
            type="text"
            value={codeInput}
            onChange={(e) => {
              setCodeInput(e.target.value);
              setFeedback(null);
            }}
            placeholder="Ex. LIVRE-GI-01 ou EMP-2026-1001"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none"
          />

          {/* Raccourcis de test discrets */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500">
            <span>Exemples :</span>
            {quickExamples.sampleBook && (
              <button
                type="button"
                onClick={() => setCodeInput(quickExamples.sampleBook.qrCode)}
                className="cursor-pointer font-mono text-blue-800 underline underline-offset-2 hover:text-blue-950"
              >
                {quickExamples.sampleBook.qrCode} (Emprunt)
              </button>
            )}
            {quickExamples.sampleLoan && (
              <button
                type="button"
                onClick={() => setCodeInput(quickExamples.sampleLoan!.ticketCode)}
                className="cursor-pointer font-mono text-blue-800 underline underline-offset-2 hover:text-blue-950"
              >
                {quickExamples.sampleLoan.ticketCode} (Ticket)
              </button>
            )}
            {quickExamples.sampleCne && (
              <button
                type="button"
                onClick={() => setCodeInput(quickExamples.sampleCne)}
                className="cursor-pointer font-mono text-blue-800 underline underline-offset-2 hover:text-blue-950"
              >
                {quickExamples.sampleCne} (Carte CNE)
              </button>
            )}
          </div>
        </div>

        {feedback && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900">
            {feedback}
          </div>
        )}

        {/* Résultat : Livre trouvé -> Emprunt */}
        {matchedBook && (
          <div className="mt-5 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div>
              <div className="text-xs font-medium text-slate-500">
                Ouvrage identifié · {matchedBook.filiere}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-slate-900">
                {matchedBook.title}
              </div>
              <div className="mt-1 font-mono text-xs text-slate-600 tabular-nums">
                ISBN {matchedBook.isbn} · Disponibles : {matchedBook.availableCopies} /{' '}
                {matchedBook.totalCopies}
              </div>
            </div>

            {currentUser?.role === 'librarian' && matchedBook.availableCopies > 0 && (
              <div>
                <label
                  htmlFor="qr-borrower-select"
                  className="block text-xs font-medium text-slate-700"
                >
                  Étudiant emprunteur
                </label>
                <select
                  id="qr-borrower-select"
                  value={selectedStudentUid}
                  onChange={(e) => setSelectedStudentUid(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
                >
                  {borrowerDirectory.map((stu) => (
                    <option key={stu.uid} value={stu.uid}>
                      {stu.fullName} ({stu.cne} · {stu.filiere})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {suspendedForBook && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
              >
                Dossier adhérent suspendu ({suspendedForBook.suspensionReason}) : emprunt bloqué.
              </div>
            )}

            {isLibrarian ? (
              <div className="text-xs text-slate-600">
                Le rôle Gérant ne permet pas d’effectuer ou d’enregistrer un emprunt.
              </div>
            ) : (
              <button
                type="button"
                disabled={
                  matchedBook.availableCopies <= 0 || isProcessing || Boolean(suspendedForBook)
                }
                onClick={handleBorrowAction}
                className="w-full cursor-pointer rounded-lg bg-[#172554] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1e3a8a] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {!currentUser
                  ? 'Se connecter pour emprunter ce livre'
                  : suspendedForBook
                  ? 'Emprunt bloqué (adhérent suspendu)'
                  : matchedBook.availableCopies <= 0
                  ? 'Aucun exemplaire disponible'
                  : isProcessing
                  ? 'Validation...'
                  : 'Confirmer l’emprunt (14 jours)'}
              </button>
            )}
          </div>
        )}

        {/* Résultat : Ticket d'emprunt trouvé -> Retour ou Validation */}
        {matchedLoan && (
          <div className="mt-5 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500">
                Ticket {matchedLoan.ticketCode} ·{' '}
                {getStatusLabel(getEffectiveLoanStatus(matchedLoan, todayIso))}
              </div>
              <div className="text-sm font-semibold text-slate-900">
                {matchedLoan.bookTitle}
              </div>
              <div className="text-xs text-slate-600">
                Étudiant : {matchedLoan.studentName} ({matchedLoan.studentCne} ·{' '}
                {matchedLoan.studentFiliere})
              </div>
              <div className="font-mono text-xs text-slate-600 tabular-nums">
                Retour prévu : {formatDateFr(matchedLoan.dueDate)} · Pénalité :{' '}
                {getLoanPenalty(matchedLoan, todayIso)} DH
              </div>
            </div>

            {matchedLoan.status === 'rendu' ? (
              <div className="text-xs font-medium text-slate-600">
                Cet emprunt a déjà été restitué le {formatDateFr(matchedLoan.returnDate)}.
              </div>
            ) : currentUser?.role !== 'librarian' ? (
              <div className="text-xs text-slate-600">
                Connectez-vous en tant que Bibliothécaire pour enregistrer le retour ou valider ce ticket.
              </div>
            ) : matchedLoan.status === 'reserve' ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handlePickupAction}
                  className="flex-1 cursor-pointer rounded-lg bg-[#172554] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1e3a8a] disabled:opacity-60"
                >
                  Valider le retrait (Emprunt)
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleReturnAction}
                  className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  Annuler / Retour
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleReturnAction}
                className="w-full cursor-pointer rounded-lg bg-[#172554] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1e3a8a] disabled:opacity-60"
              >
                {isProcessing ? 'Enregistrement...' : 'Enregistrer le retour du livre'}
              </button>
            )}
          </div>
        )}

        {/* Résultat : Carte de lecture CNE identifiée -> Nouvel emprunt */}
        {matchedStudentCard && (
          <div className="mt-5 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div>
              <div className="text-xs font-medium text-slate-500">
                Carte de lecture identifiée · {matchedStudentCard.filiere}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-slate-900">
                {matchedStudentCard.fullName}
              </div>
              <div className="mt-1 font-mono text-xs text-slate-600">
                CNE {matchedStudentCard.cne}
              </div>
            </div>

            {suspendedForCard && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
              >
                Adhérent suspendu ({suspendedForCard.suspensionReason}) : aucun emprunt autorisé.
              </div>
            )}

            {!currentUser ? (
              <button
                type="button"
                onClick={onRequireAuth}
                className="w-full cursor-pointer rounded-lg bg-[#172554] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1e3a8a]"
              >
                Se connecter pour emprunter avec cette carte
              </button>
            ) : isLibrarian ? (
              <div className="text-xs text-slate-600">
                Le rôle Gérant ne permet pas d’enregistrer un emprunt.
              </div>
            ) : currentUser.role === 'student' && currentUser.uid !== matchedStudentCard.uid ? (
              <div className="text-xs text-slate-600">
                Connectez-vous en tant que Bibliothécaire pour enregistrer un emprunt avec la carte d’un autre étudiant.
              </div>
            ) : availableBooks.length === 0 ? (
              <div className="text-xs font-medium text-slate-600">
                Aucun exemplaire disponible actuellement dans le fonds documentaire.
              </div>
            ) : (
              <>
                <div>
                  <label
                    htmlFor="qr-card-book-select"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Ouvrage à emprunter
                  </label>
                  <select
                    id="qr-card-book-select"
                    value={selectedBookIdForCard}
                    onChange={(e) => setSelectedBookIdForCard(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
                  >
                    {availableBooks.map((book) => (
                      <option key={book.id} value={book.id}>
                        {book.title} ({book.filiere} · {book.availableCopies} disp.)
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  disabled={!selectedBookIdForCard || isProcessing || Boolean(suspendedForCard)}
                  onClick={handleBorrowWithCardAction}
                  className="w-full cursor-pointer rounded-lg bg-[#172554] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1e3a8a] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {suspendedForCard
                    ? 'Emprunt bloqué (adhérent suspendu)'
                    : isProcessing
                    ? 'Validation...'
                    : 'Confirmer l’emprunt (14 jours)'}
                </button>
              </>
            )}
          </div>
        )}

        {normalizedCode && !matchedBook && !matchedLoan && !matchedStudentCard && !feedback && (
          <p className="mt-4 text-xs text-slate-500">
            Aucun ouvrage, ticket d’emprunt ou carte CNE trouvé pour le code <span className="font-mono">{normalizedCode}</span>.
          </p>
        )}
      </div>
    </div>
  );
};
