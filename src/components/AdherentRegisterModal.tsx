import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { ScanLine, Upload, X } from 'lucide-react';
import { Adherent, Filiere } from '../types/library';
import {
  addYearsIso,
  FILIERE_LABELS,
  FILIERES,
  generateCardNumber,
  getTodayIso,
  parseStudentCardText,
  sanitizeCne,
} from '../utils/libraryUtils';

export interface RegisterAdherentInput {
  cardNumber: string;
  fullName: string;
  cne: string;
  apogee: string;
  filiere: Filiere;
  email: string;
  expiryDate: string;
}

interface AdherentRegisterModalProps {
  isOpen: boolean;
  existingAdherents: Adherent[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: RegisterAdherentInput) => Promise<void>;
}

const SAMPLE_OCR_TEXT = [
  'CARTE ÉTUDIANT USMBA — EST',
  'Nom : Yassine Benjelloun',
  'CNE : G145820911',
  'Apogée : 23004192',
  'Filière : GI',
  'E-mail : yassine.benjelloun@usmba.ac.ma',
].join('\n');

export const AdherentRegisterModal: React.FC<AdherentRegisterModalProps> = ({
  isOpen,
  existingAdherents,
  isSubmitting,
  onClose,
  onSubmit,
}) => {
  const [ocrText, setOcrText] = useState('');
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [cne, setCne] = useState('');
  const [apogee, setApogee] = useState('');
  const [filiere, setFiliere] = useState<Filiere>('GI');
  const [email, setEmail] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setOcrText('');
    setOcrStatus(null);
    setCardNumber(generateCardNumber());
    setFullName('');
    setCne('');
    setApogee('');
    setFiliere('GI');
    setEmail('');
    setExpiryDate(addYearsIso(getTodayIso(), 1));
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [isOpen]);

  if (!isOpen) return null;

  const applyParsedFields = (raw: string, sourceLabel: string) => {
    const parsed = parseStudentCardText(raw);
    if (parsed.cardNumber) setCardNumber(parsed.cardNumber);
    if (parsed.fullName) setFullName(parsed.fullName);
    if (parsed.cne) setCne(parsed.cne);
    if (parsed.apogee) setApogee(parsed.apogee);
    if (parsed.filiere) setFiliere(parsed.filiere);
    if (parsed.email) setEmail(parsed.email);

    const detectedCount = Object.keys(parsed).length;
    if (detectedCount > 0) {
      setOcrStatus(`${sourceLabel} : ${detectedCount} champ(s) extrait(s) automatiquement.`);
    } else {
      setOcrStatus(
        `${sourceLabel} analysé. Complétez ou vérifiez manuellement les champs ci-dessous.`
      );
    }
  };

  const handleCardFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Image illisible.'));
        image.src = objectUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decodedQr = jsQR(imgData.data, imgData.width, imgData.height);
        if (decodedQr && decodedQr.data) {
          setOcrText(decodedQr.data);
          applyParsedFields(decodedQr.data, 'QR / Carte détectée');
          return;
        }
      }

      // Extraction à partir du nom de fichier si pas de QR intégré
      const fromFilename = parseStudentCardText(file.name.replace(/[_-]+/g, ' '));
      if (Object.keys(fromFilename).length > 0) {
        applyParsedFields(file.name.replace(/[_-]+/g, ' '), 'Image importée');
      } else {
        setOcrStatus(
          `Image « ${file.name} » chargée. Collez le texte OCR ou vérifiez les champs ci-dessous.`
        );
      }
    } catch {
      setErrorMessage('Impossible de lire le fichier image sélectionné.');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleSimulateOcrScan = () => {
    setOcrText(SAMPLE_OCR_TEXT);
    applyParsedFields(SAMPLE_OCR_TEXT, 'Scan OCR simulé');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanCard = cardNumber.trim().toUpperCase();
    const cleanName = fullName.trim();
    const cleanCne = sanitizeCne(cne.trim());
    const cleanApogee = apogee.replace(/[^0-9]/g, '').trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanCard || !/^[A-Z0-9_-]{4,40}$/.test(cleanCard)) {
      setErrorMessage('Le n° de carte est obligatoire (4 à 40 caractères alphanumériques).');
      return;
    }
    if (!cleanName) {
      setErrorMessage('Le nom complet de l’étudiant est obligatoire.');
      return;
    }
    if (!cne.trim() || cne.trim().length < 4) {
      setErrorMessage('Le CNE est obligatoire (minimum 4 caractères).');
      return;
    }
    if (!cleanApogee || cleanApogee.length < 4) {
      setErrorMessage('Le code Apogée est obligatoire (chiffres uniquement, min 4).');
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMessage('Une adresse e-mail valide est obligatoire.');
      return;
    }
    if (!expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      setErrorMessage('La date de fin d’inscription est obligatoire.');
      return;
    }

    const dupCard = existingAdherents.find(
      (a) => a.cardNumber.toUpperCase() === cleanCard
    );
    if (dupCard) {
      setErrorMessage(`Le n° de carte ${cleanCard} est déjà attribué à ${dupCard.fullName}.`);
      return;
    }

    const dupCne = existingAdherents.find((a) => a.cne.toUpperCase() === cleanCne);
    if (dupCne) {
      setErrorMessage(`Un adhérent possède déjà le CNE ${cleanCne} (${dupCne.fullName}).`);
      return;
    }

    const dupEmail = existingAdherents.find((a) => a.email.toLowerCase() === cleanEmail);
    if (dupEmail) {
      setErrorMessage(`L’adresse ${cleanEmail} est déjà inscrite (${dupEmail.fullName}).`);
      return;
    }

    try {
      await onSubmit({
        cardNumber: cleanCard,
        fullName: cleanName,
        cne: cleanCne,
        apogee: cleanApogee,
        filiere,
        email: cleanEmail,
        expiryDate,
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Erreur lors de l’inscription de l’adhérent.'
      );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="adherent-register-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4"
    >
      <div className="my-8 w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="adherent-register-title"
              className="font-display text-xl font-bold text-slate-900"
            >
              Inscrire un étudiant (Scan Carte OCR)
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Importez une image de carte étudiant, extrayez le texte OCR ou saisissez les informations du lecteur.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer l’inscription"
            className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Zone Scan Carte OCR */}
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">
              Lecture de carte étudiant (OCR / QR)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                onChange={handleCardFileUpload}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Importer carte (JPG/PNG)
              </button>
              <button
                type="button"
                onClick={handleSimulateOcrScan}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-900 hover:bg-blue-100"
              >
                <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
                Exemple de scan OCR
              </button>
            </div>
          </div>

          <textarea
            rows={3}
            value={ocrText}
            onChange={(e) => setOcrText(e.target.value)}
            placeholder="Collez ici le texte lu sur la carte (Nom, CNE, Apogée, Filière, E-mail) puis cliquez sur Extraire..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-500">
              {ocrStatus || 'Les champs détectés remplissent automatiquement le formulaire.'}
            </span>
            <button
              type="button"
              disabled={!ocrText.trim()}
              onClick={() => applyParsedFields(ocrText, 'Texte OCR')}
              className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Extraire les champs
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
            >
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="adh-card" className="block text-xs font-medium text-slate-700">
                N° de carte <span className="text-red-700">*</span>
              </label>
              <input
                id="adh-card"
                type="text"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="adh-name" className="block text-xs font-medium text-slate-700">
                Nom complet <span className="text-red-700">*</span>
              </label>
              <input
                id="adh-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex. Yassine Benjelloun"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="adh-cne" className="block text-xs font-medium text-slate-700">
                CNE <span className="text-red-700">*</span>
              </label>
              <input
                id="adh-cne"
                type="text"
                value={cne}
                onChange={(e) => setCne(e.target.value.toUpperCase())}
                placeholder="Ex. G145820911"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="adh-apogee" className="block text-xs font-medium text-slate-700">
                Apogée <span className="text-red-700">*</span>
              </label>
              <input
                id="adh-apogee"
                type="text"
                value={apogee}
                onChange={(e) => setApogee(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Ex. 23004192"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="adh-filiere" className="block text-xs font-medium text-slate-700">
                Filière
              </label>
              <select
                id="adh-filiere"
                value={filiere}
                onChange={(e) => setFiliere(e.target.value as Filiere)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              >
                {FILIERES.map((f) => (
                  <option key={f} value={f}>
                    {f} — {FILIERE_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="adh-email" className="block text-xs font-medium text-slate-700">
                E-mail <span className="text-red-700">*</span>
              </label>
              <input
                id="adh-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@usmba.ac.ma"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="adh-expiry" className="block text-xs font-medium text-slate-700">
                Fin d’inscription <span className="text-red-700">*</span>
              </label>
              <input
                id="adh-expiry"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="cursor-pointer rounded-lg bg-[#172554] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e3a8a] disabled:opacity-60"
            >
              {isSubmitting ? 'Inscription...' : 'Enregistrer l’adhérent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
