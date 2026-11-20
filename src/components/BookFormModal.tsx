import React, { useEffect, useRef, useState } from 'react';
import { Trash2, Upload, X } from 'lucide-react';
import { Book } from '../types/library';
import {
  BOOK_CATEGORIES,
  normalizeIsbn,
  resizeBookCoverImage,
} from '../utils/libraryUtils';
import { BookCover } from './BookCover';

export interface BookFormValues {
  title: string;
  author: string;
  isbn: string;
  filiere: string;
  totalCopies: number;
  coverImage: string;
}

interface BookFormModalProps {
  isOpen: boolean;
  editingBook: Book | null;
  existingBooks: Book[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: BookFormValues) => Promise<void>;
}

interface OnlineBookResult {
  id: string;
  title: string;
  author: string;
  isbn: string;
  year: string;
  coverUrl: string;
  subjectsText: string;
}

function suggestCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/(roman|fiction|novel|recit|poesie|theatre)/.test(lower)) return 'Romans';
  if (/(histoire|historique|guerre|siecle|civilisation)/.test(lower)) return 'Histoire';
  if (/(science|physique|chimie|math|biologie|informatique|technologie)/.test(lower)) return 'Sciences';
  if (/(philosophie|ethique|morale|pensee|logique)/.test(lower)) return 'Philosophie';
  if (/(developpement|succes|leadership|motivation|psychologie|coach)/.test(lower)) return 'Développement personnel';
  if (/(langue|grammaire|anglais|français|espagnol|linguistique|dictionnaire)/.test(lower)) return 'Langues';
  if (/(art|culture|peinture|musique|cinema|architecture|design)/.test(lower)) return 'Art & Culture';
  return 'Romans';
}

async function loadCoverDataUrl(url: string): Promise<string> {
  if (!url) return '';
  const secureUrl = url.replace(/^http:\/\//, 'https://');
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('CORS or load error'));
      image.src = secureUrl;
    });

    const maxWidth = 400;
    const targetWidth = Math.min(maxWidth, img.naturalWidth || 400);
    const targetHeight = Math.max(
      1,
      Math.round((img.naturalHeight * targetWidth) / (img.naturalWidth || targetWidth))
    );

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return secureUrl;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    let dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    if (dataUrl.length > 220000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.65);
    }
    return dataUrl;
  } catch {
    return secureUrl;
  }
}

export const BookFormModal: React.FC<BookFormModalProps> = ({
  isOpen,
  editingBook,
  existingBooks,
  isSubmitting,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [filiere, setFiliere] = useState<string>('Romans');
  const [totalCopiesStr, setTotalCopiesStr] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Online search state
  const [onlineSearchQuery, setOnlineSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<OnlineBookResult[]>([]);
  const [displayLimit, setDisplayLimit] = useState(5);
  const [filiereSuggestionMsg, setFiliereSuggestionMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setOnlineSearchQuery('');
    setIsSearching(false);
    setHasSearched(false);
    setSearchResults([]);
    setDisplayLimit(5);
    setFiliereSuggestionMsg(null);

    if (editingBook) {
      setTitle(editingBook.title);
      setAuthor(editingBook.author);
      setIsbn(editingBook.isbn);
      setFiliere(editingBook.filiere);
      setTotalCopiesStr(String(editingBook.totalCopies));
      setCoverImage(editingBook.coverImage || '');
    } else {
      setTitle('');
      setAuthor('');
      setIsbn('');
      setFiliere('Romans');
      setTotalCopiesStr('1');
      setCoverImage('');
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [isOpen, editingBook]);

  if (!isOpen) return null;

  const handleOnlineSearch = async () => {
    const q = onlineSearchQuery.trim();
    if (!q) return;

    setIsSearching(true);
    setHasSearched(true);
    setSearchResults([]);
    setDisplayLimit(5);
    setFiliereSuggestionMsg(null);

    let results: OnlineBookResult[] = [];

    try {
      // 1. Google Books API with langRestrict=fr
      const gbRes = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&langRestrict=fr&maxResults=10`
      );
      if (gbRes.ok) {
        const gbData = await gbRes.json();
        if (gbData.items && Array.isArray(gbData.items)) {
          results = gbData.items.map((item: any) => {
            const info = item.volumeInfo || {};
            const identifiers = info.industryIdentifiers || [];
            const isbn13 = identifiers.find((id: any) => id.type === 'ISBN_13')?.identifier;
            const isbn10 = identifiers.find((id: any) => id.type === 'ISBN_10')?.identifier;
            const isbn = isbn13 || isbn10 || identifiers[0]?.identifier || '';
            const rawThumb = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '';
            const coverUrl = rawThumb.replace(/^http:\/\//, 'https://').replace('&edge=curl', '');
            const year = info.publishedDate ? info.publishedDate.slice(0, 4) : '';
            const author = info.authors ? info.authors.join(', ') : 'Auteur inconnu';
            const categories = info.categories ? info.categories.join(' ') : '';
            const desc = info.description || '';
            return {
              id: item.id,
              title: info.title || 'Titre inconnu',
              author,
              isbn,
              year,
              coverUrl,
              subjectsText: `${info.title || ''} ${author} ${categories} ${desc}`,
            };
          });
        }
      }
    } catch {
      // Fallback to Open Library
    }

    // 2. Open Library fallback if Google returned nothing
    if (results.length === 0) {
      try {
        const olRes = await fetch(
          `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=10`
        );
        if (olRes.ok) {
          const olData = await olRes.json();
          if (olData.docs && Array.isArray(olData.docs)) {
            results = olData.docs.map((doc: any) => {
              const isbnArr = doc.isbn || [];
              const isbn = isbnArr.find((i: string) => i.length === 13) || isbnArr[0] || '';
              const coverId = doc.cover_i;
              const coverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : '';
              const year = doc.first_publish_year ? String(doc.first_publish_year) : '';
              const author = doc.author_name ? doc.author_name.join(', ') : 'Auteur inconnu';
              const subjects = doc.subject ? doc.subject.join(' ') : '';
              return {
                id: doc.key || Math.random().toString(),
                title: doc.title || 'Titre inconnu',
                author,
                isbn,
                year,
                coverUrl,
                subjectsText: `${doc.title || ''} ${author} ${subjects}`,
              };
            });
          }
        }
      } catch {
        // Network error
      }
    }

    setSearchResults(results);
    setIsSearching(false);
  };

  const handleSelectOnlineBook = async (book: OnlineBookResult) => {
    setTitle(book.title);
    setAuthor(book.author);
    if (book.isbn) {
      setIsbn(book.isbn);
    }
    if (!totalCopiesStr) {
      setTotalCopiesStr('1');
    }

    const suggested = suggestCategory(book.subjectsText);
    setFiliere(suggested);
    setFiliereSuggestionMsg(
      `Suggestion : genre ${suggested} détecté automatiquement (à vérifier).`
    );

    if (book.coverUrl) {
      setIsProcessingImage(true);
      try {
        const resized = await loadCoverDataUrl(book.coverUrl);
        setCoverImage(resized);
      } catch {
        // Keep default cover if download fails
      } finally {
        setIsProcessingImage(false);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setIsProcessingImage(true);
    try {
      const resizedDataUrl = await resizeBookCoverImage(file);
      setCoverImage(resizedDataUrl);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Impossible de traiter l’image sélectionnée.'
      );
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setCoverImage('');
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedTitle = title.trim();
    const trimmedAuthor = author.trim();
    const trimmedIsbn = isbn.trim();
    const trimmedCopies = totalCopiesStr.trim();

    if (!trimmedTitle) {
      setErrorMessage('Le titre est obligatoire.');
      return;
    }
    if (!trimmedAuthor) {
      setErrorMessage('L’auteur est obligatoire.');
      return;
    }
    if (!trimmedIsbn) {
      setErrorMessage('L’ISBN est obligatoire.');
      return;
    }
    if (!/^[0-9Xx\-]+$/.test(trimmedIsbn) || trimmedIsbn.length < 10 || trimmedIsbn.length > 20) {
      setErrorMessage(
        'L’ISBN doit contenir entre 10 et 20 caractères (chiffres, X ou tirets).'
      );
      return;
    }

    const normalizedTarget = normalizeIsbn(trimmedIsbn);
    const duplicate = existingBooks.find(
      (b) => b.id !== editingBook?.id && normalizeIsbn(b.isbn) === normalizedTarget
    );
    if (duplicate) {
      setErrorMessage(
        `Ce livre existe déjà (« ${duplicate.title} »). Vous pouvez ajouter des exemplaires à la place.`
      );
      return;
    }

    if (!trimmedCopies) {
      setErrorMessage('Le nombre d’exemplaires est obligatoire.');
      return;
    }
    const parsedCopies = Number(trimmedCopies);
    if (!Number.isInteger(parsedCopies) || parsedCopies < 1 || parsedCopies > 100) {
      setErrorMessage('Le nombre d’exemplaires doit être un entier compris entre 1 et 100.');
      return;
    }

    if (editingBook) {
      const borrowedCount = Math.max(0, editingBook.totalCopies - editingBook.availableCopies);
      if (parsedCopies < borrowedCount) {
        setErrorMessage(
          `Impossible de fixer moins de ${borrowedCount} exemplaire(s) : ${borrowedCount} exemplaire(s) sont actuellement empruntés ou réservés.`
        );
        return;
      }
    }

    try {
      await onSubmit({
        title: trimmedTitle,
        author: trimmedAuthor,
        isbn: trimmedIsbn,
        filiere,
        totalCopies: parsedCopies,
        coverImage,
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Erreur lors de l’enregistrement du livre.'
      );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-form-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4"
    >
      <div className="my-8 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="book-form-title" className="font-display text-xl font-bold text-slate-900">
              {editingBook ? 'Modifier le livre' : 'Ajouter un livre'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {editingBook
                ? 'Corrigez les informations de l’ouvrage ou mettez à jour sa couverture.'
                : 'Recherchez un ouvrage en ligne ou renseignez ses informations manuellement.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le formulaire"
            className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
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

          {/* Recherche en ligne par titre (uniquement à l'ajout ou optionnel) */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <label htmlFor="online-search-input" className="block text-xs font-semibold text-slate-700">
              Rechercher le livre en ligne
            </label>
            <div className="flex gap-2">
              <input
                id="online-search-input"
                type="text"
                value={onlineSearchQuery}
                onChange={(e) => setOnlineSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleOnlineSearch();
                  }
                }}
                placeholder="Titre, auteur ou ISBN (ex. Les Misérables)..."
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none"
              />
              <button
                type="button"
                disabled={isSearching || !onlineSearchQuery.trim()}
                onClick={() => void handleOnlineSearch()}
                className="cursor-pointer rounded-lg bg-[#172554] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1e3a8a] disabled:opacity-50"
              >
                {isSearching ? 'Recherche...' : 'Rechercher'}
              </button>
            </div>

            {isSearching && (
              <p className="text-xs text-blue-800 animate-pulse font-medium">Recherche en cours...</p>
            )}

            {hasSearched && !isSearching && searchResults.length === 0 && (
              <p className="text-xs text-amber-700">
                Aucun livre trouvé. Vous pouvez remplir le formulaire à la main.
              </p>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-medium text-slate-600">
                  Résultats ({searchResults.length}) — Cliquez sur un livre pour remplir le formulaire :
                </p>
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {searchResults.slice(0, displayLimit).map((book, idx) => (
                    <div
                      key={`${book.id}-${idx}`}
                      onClick={() => void handleSelectOnlineBook(book)}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5 transition-colors hover:border-blue-800 hover:bg-blue-50/40"
                    >
                      <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-slate-100 flex items-center justify-center">
                        {book.coverUrl ? (
                          <img
                            src={book.coverUrl}
                            alt={book.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-400">Livre</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-xs font-semibold text-slate-900">
                          {book.title}
                        </h4>
                        <p className="truncate text-[11px] text-slate-600">
                          {book.author} {book.year ? `(${book.year})` : ''}
                        </p>
                        <p className="font-mono text-[10px] text-slate-400">
                          ISBN: {book.isbn || 'Non spécifié'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {searchResults.length > displayLimit && (
                  <button
                    type="button"
                    onClick={() => setDisplayLimit((prev) => prev + 5)}
                    className="w-full cursor-pointer rounded border border-slate-300 bg-white py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Afficher plus de résultats
                  </button>
                )}
              </div>
            )}

            {filiereSuggestionMsg && (
              <p className="text-xs font-medium text-blue-900 bg-blue-50 p-2 rounded border border-blue-200">
                {filiereSuggestionMsg}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="book-title" className="block text-xs font-medium text-slate-700">
              Titre <span className="text-red-700">*</span>
            </label>
            <input
              id="book-title"
              type="text"
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Les Misérables"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="book-author" className="block text-xs font-medium text-slate-700">
                Auteur <span className="text-red-700">*</span>
              </label>
              <input
                id="book-author"
                type="text"
                maxLength={120}
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Ex. Albert Camus"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="book-isbn" className="block text-xs font-medium text-slate-700">
                ISBN <span className="text-red-700">*</span>
              </label>
              <input
                id="book-isbn"
                type="text"
                maxLength={20}
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="Ex. 978-2-10-081452-7"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="book-category" className="block text-xs font-medium text-slate-700">
                Genre
              </label>
              <select
                id="book-category"
                value={filiere}
                onChange={(e) => setFiliere(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              >
                {BOOK_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="book-copies" className="block text-xs font-medium text-slate-700">
                Nombre d’exemplaires <span className="text-red-700">*</span>
              </label>
              <input
                id="book-copies"
                type="number"
                min={1}
                max={100}
                step={1}
                value={totalCopiesStr}
                onChange={(e) => setTotalCopiesStr(e.target.value)}
                placeholder="Ex. 4"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none"
              />
            </div>
          </div>

          {/* Champ Image de couverture */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <label
              htmlFor="book-cover-input"
              className="block text-xs font-medium text-slate-700"
            >
              Image de couverture (JPG ou PNG, largeur max 400 px)
            </label>

            <div className="mt-3 flex items-start gap-4">
              <BookCover
                title={title.trim() || 'Aperçu'}
                filiere={filiere}
                coverImage={coverImage}
                size="lg"
              />

              <div className="min-w-0 flex-1 space-y-2.5">
                <input
                  ref={fileInputRef}
                  id="book-cover-input"
                  type="file"
                  accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  className="sr-only"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isProcessingImage || isSubmitting}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    {isProcessingImage
                      ? 'Redimensionnement...'
                      : coverImage
                      ? 'Changer l’image'
                      : 'Choisir une image'}
                  </button>

                  {coverImage && (
                    <button
                      type="button"
                      disabled={isProcessingImage || isSubmitting}
                      onClick={handleRemoveImage}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Supprimer l’image
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-500">
                  {coverImage
                    ? 'Image prête et redimensionnée (largeur max 400 px).'
                    : `Sans image importée, la couverture par défaut (${filiere}) est utilisée.`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isProcessingImage}
              className="cursor-pointer rounded-lg bg-[#172554] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1e3a8a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
