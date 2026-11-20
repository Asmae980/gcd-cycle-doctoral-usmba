import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';

interface BookCoverProps {
  title: string;
  filiere?: string;
  genre?: string;
  coverImage?: string;
  size?: 'sm' | 'md' | 'lg';
}

const CATEGORY_COVER_BG: Record<string, string> = {
  Romans: 'bg-[#1e3a8a]',
  Histoire: 'bg-[#b45309]',
  Sciences: 'bg-[#0f766e]',
  Philosophie: 'bg-[#6d28d9]',
  'Développement personnel': 'bg-[#1e293b]',
  Langues: 'bg-[#be123c]',
  'Art & Culture': 'bg-[#7c2d12]',
};

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-14 w-10 rounded',
  md: 'h-20 w-14 rounded-md',
  lg: 'h-36 w-28 rounded-lg',
};

export const BookCover: React.FC<BookCoverProps> = ({
  title,
  filiere,
  genre,
  coverImage,
  size = 'sm',
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [coverImage]);

  const dimensions = SIZE_CLASSES[size];

  if (coverImage && !hasError) {
    return (
      <img
        src={coverImage}
        alt={`Couverture de ${title}`}
        title={title}
        onError={() => setHasError(true)}
        className={`${dimensions} shrink-0 border border-slate-200 bg-slate-100 object-cover`}
      />
    );
  }

  const genreKey = genre || filiere || '';
  const bgClass = CATEGORY_COVER_BG[genreKey] || 'bg-[#172554]';

  return (
    <div
      title={title}
      aria-label={`Couverture par défaut : ${title}`}
      className={`${dimensions} ${bgClass} flex shrink-0 flex-col items-center justify-between overflow-hidden px-1 py-1.5 text-center text-white select-none`}
    >
      <BookOpen
        aria-hidden="true"
        className={
          size === 'lg'
            ? 'mt-2 h-6 w-6 shrink-0 opacity-90'
            : size === 'md'
            ? 'mt-1 h-4 w-4 shrink-0 opacity-90'
            : 'h-3.5 w-3.5 shrink-0 opacity-90'
        }
      />
      <span
        className={
          size === 'lg'
            ? 'line-clamp-4 px-1 text-[11px] leading-tight font-semibold text-white'
            : size === 'md'
            ? 'line-clamp-3 text-[8px] leading-tight font-medium text-white'
            : 'line-clamp-2 text-[6.5px] leading-[1.15] font-medium text-white/95'
        }
      >
        {title || filiere}
      </span>
    </div>
  );
};
