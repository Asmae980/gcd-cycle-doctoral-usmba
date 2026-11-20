import React, { useMemo, useState } from 'react';
import { Pencil, Plus, QrCode, Search, Trash2 } from 'lucide-react';
import { Book, UserProfile } from '../types/library';
import { BOOK_GENRES } from '../utils/libraryUtils';
import { BookCover } from './BookCover';

interface CatalogSectionProps {
  books: Book[];
  currentUser: UserProfile | null;
  busyBookId: string | null;
  onBorrowBook: (book: Book) => void;
  onReserveBook: (book: Book) => void;
  onShowBookQr: (book: Book) => void;
  onAddBook: () => void;
  onEditBook: (book: Book) => void;
  onDeleteBook: (book: Book) => void;
}

type AvailabilityFilter = 'all' | 'available' | 'unavailable';

const PAGE_SIZE = 5;

export const CatalogSection: React.FC<CatalogSectionProps> = ({
  books,
  currentUser,
  busyBookId,
  onBorrowBook,
  onReserveBook,
  onShowBookQr,
  onAddBook,
  onEditBook,
  onDeleteBook,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const isLibrarian = currentUser?.role === 'librarian';
  const canStudentBorrowOrReserve = !currentUser || currentUser.role === 'student';

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setVisibleCount(PAGE_SIZE);
  };

  const handleGenreChange = (genre: string) => {
    setSelectedGenre(genre);
    setVisibleCount(PAGE_SIZE);
  };

  const handleAvailabilityChange = (filter: AvailabilityFilter) => {
    setAvailabilityFilter(filter);
    setVisibleCount(PAGE_SIZE);
  };

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return books.filter((book) => {
      const bookGenre = book.genre || book.filiere;
      if (selectedGenre !== 'ALL' && bookGenre !== selectedGenre) {
        return false;
      }
      if (availabilityFilter === 'available' && book.availableCopies <= 0) {
        return false;
      }
      if (availabilityFilter === 'unavailable' && book.availableCopies > 0) {
        return false;
      }
      if (!q) return true;
      return (
        book.title.toLowerCase().includes(q) ||
        book.author.toLowerCase().includes(q) ||
        book.isbn.toLowerCase().includes(q)
      );
    });
  }, [books, searchQuery, selectedGenre, availabilityFilter]);

  const visibleBooks = useMemo(
    () => filteredBooks.slice(0, visibleCount),
    [filteredBooks, visibleCount]
  );

  const totalFiltered = filteredBooks.length;
  const shownCount = visibleBooks.length;
  const isShowingAll = shownCount >= totalFiltered;

  return (
    <section aria-labelledby="catalog-heading" className="space-y-6">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h2 id="catalog-heading" className="font-display text-2xl font-bold text-slate-900">
            Fonds documentaire
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Catalogue général des ouvrages de la bibliothèque.
          </p>
        </div>
        <div className="font-mono text-sm text-slate-500 tabular-nums">
          {filteredBooks.length} / {books.length} ouvrages
        </div>
      </div>

      {/* Barre de recherche et filtres */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Recherche texte */}
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Rechercher par titre, auteur ou ISBN..."
              aria-label="Rechercher un livre"
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none"
            />
          </div>

          {/* Filtre disponibilité */}
          <div
            role="group"
            aria-label="Filtrer par disponibilité"
            className="flex items-center gap-1 rounded-lg bg-slate-100 p-1"
          >
            {(
              [
                { id: 'all', label: 'Tous' },
                { id: 'available', label: 'Disponibles' },
                { id: 'unavailable', label: 'Indisponibles' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleAvailabilityChange(opt.id)}
                className={`cursor-pointer whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  availabilityFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filtre genre */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Genre :</span>
          <div
            role="group"
            aria-label="Filtrer par genre"
            className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1"
          >
            <button
              type="button"
              onClick={() => handleGenreChange('ALL')}
              className={`cursor-pointer whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                selectedGenre === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Toutes
            </button>
            {BOOK_GENRES.map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => handleGenreChange(genre)}
                className={`cursor-pointer whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  selectedGenre === genre
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bouton Ajouter un livre au-dessus du tableau (Bibliothécaire uniquement) */}
      {isLibrarian && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onAddBook}
            className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap shrink-0 rounded-lg bg-[#172554] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1e3a8a]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ajouter un livre
          </button>
        </div>
      )}

      {/* Tableau du fonds documentaire */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3">Titre</th>
                <th className="px-4 py-3">Auteur</th>
                <th className="px-4 py-3">ISBN</th>
                <th className="px-4 py-3">Genre</th>
                <th className="px-4 py-3 text-right">Exemplaires</th>
                <th className="px-4 py-3 text-right">Disponibles</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleBooks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                    Aucun ouvrage ne correspond aux critères sélectionnés.
                  </td>
                </tr>
              ) : (
                visibleBooks.map((book) => {
                  const isAvailable = book.availableCopies > 0;
                  const isBusy = busyBookId === book.id;

                  return (
                    <tr
                      key={book.id}
                      className="transition-colors duration-150 hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <BookCover
                            title={book.title}
                            genre={book.genre || book.filiere}
                            filiere={book.filiere}
                            coverImage={book.coverImage}
                            size="sm"
                          />
                          <span className="font-medium text-slate-900">{book.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{book.author}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {book.isbn}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-700 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">
                          {book.genre || book.filiere}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                        {book.totalCopies}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                        {isAvailable ? (
                          <span className="font-semibold text-emerald-700">
                            {book.availableCopies} disponible{book.availableCopies > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="font-medium text-red-700">Indisponible</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onShowBookQr(book)}
                            title="Afficher le QR code"
                            aria-label={`QR Code pour ${book.title}`}
                            className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <QrCode className="h-4 w-4" />
                          </button>

                          {isLibrarian ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onEditBook(book)}
                                title="Modifier le livre"
                                aria-label={`Modifier ${book.title}`}
                                className="cursor-pointer rounded-lg p-1.5 text-blue-700 hover:bg-blue-50"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteBook(book)}
                                title="Supprimer le livre"
                                aria-label={`Supprimer ${book.title}`}
                                className="cursor-pointer rounded-lg p-1.5 text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={!isAvailable || isBusy}
                                onClick={() => onBorrowBook(book)}
                                className="cursor-pointer rounded-lg bg-[#172554] px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#1e3a8a] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isBusy ? '...' : 'Emprunter'}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => onReserveBook(book)}
                                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Réserver
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bouton Afficher plus / Pagination */}
        {!isShowingAll && totalFiltered > 0 && (
          <div className="border-t border-slate-200 bg-slate-50/70 p-4 text-center">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              Afficher plus de livres ({totalFiltered - shownCount} restants)
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
