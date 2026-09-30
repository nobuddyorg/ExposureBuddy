'use client';

import { useId, useRef, type ChangeEvent } from 'react';

import type { PickedPhoto, PickerNotice } from '../../exposure/pickedPhotos';
import { useI18n } from '../../i18n/useI18n';
import type { OutputQuality } from '../../vision/pipeline/budget';
import { buttonClasses } from '../ui/buttonClasses';
import { cardClasses } from '../ui/cardClasses';
import { CombineControls } from './CombineControls';
import { PhotoGrid } from './PhotoGrid';
import { PickerNotice as NoticeRegion } from './PickerNotice';
import { Tips } from './Tips';
import { useDropzone } from './useDropzone';

export interface PhotoPickerProps {
  photos: readonly PickedPhoto[];
  notice: PickerNotice | null;
  /** The browser lacks what the pipeline needs; picking still works, combining does not. */
  unsupported: boolean;
  onAdd: (files: File[]) => void;
  onClear: () => void;
  onCombine: (quality: OutputQuality) => void;
}

// A stack of three frames, drawn like ui/Icon's set: 24px grid, stroked in the current colour.
function BurstIllustration() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="h-8 w-8"
    >
      <path d="M7 8h11a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <path d="M4 15V6a1 1 0 0 1 1-1h10" />
      <path d="M6 16l3.5-3.5 2.5 2.5 2-2 5 5" />
      <path d="M14.5 11.5h.01" />
    </svg>
  );
}

/** The first screen: the burst is picked here, checked over, and the pipeline started. */
export default function PhotoPicker({
  photos,
  notice,
  unsupported,
  onAdd,
  onClear,
  onCombine,
}: PhotoPickerProps) {
  const { t, tCount } = useI18n();
  const titleId = useId();
  const input = useRef<HTMLInputElement>(null);
  const { dragging, handlers } = useDropzone(onAdd);
  const hasPhotos = photos.length > 0;

  const openChooser = () => input.current?.click();
  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Cleared so picking the same files again, after a clear, fires change again.
    event.target.value = '';
    if (files.length > 0) onAdd(files);
  };

  return (
    <div className="fade-up mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-4xl">
        {t('app.tagline')}
      </h1>

      <section
        data-testid="photo-dropzone"
        data-dragging={dragging}
        aria-labelledby={titleId}
        {...handlers}
        className={cardClasses(
          `transition-[box-shadow,background-color] ${
            dragging ? 'bg-muted ring-2 ring-accent' : ''
          }`,
        )}
      >
        <input
          ref={input}
          type="file"
          multiple
          accept="image/*"
          data-testid="photo-input"
          aria-label={t('picker.choose')}
          tabIndex={-1}
          onChange={onInputChange}
          className="sr-only"
        />
        {hasPhotos ? (
          <div className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div>
                <h2 id={titleId} className="font-display text-lg font-semibold">
                  {t('picker.title_selected')}
                </h2>
                <p
                  data-testid="photo-count"
                  className="text-sm text-muted-foreground"
                >
                  {tCount('picker.count', photos.length)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="pick-photos"
                  onClick={openChooser}
                  className={buttonClasses({ variant: 'secondary' })}
                >
                  {t('picker.add_more')}
                </button>
                <button
                  type="button"
                  data-testid="clear-photos"
                  onClick={onClear}
                  className={buttonClasses({ variant: 'ghost' })}
                >
                  {t('picker.clear')}
                </button>
              </div>
            </div>
            <PhotoGrid photos={photos} />
            <p className="hidden text-center text-xs text-muted-foreground sm:block">
              {t('picker.drop_hint')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 px-5 py-10 text-center sm:py-14">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-muted text-accent">
              <BurstIllustration />
            </div>
            <div className="space-y-2">
              <h2
                id={titleId}
                className="font-display text-xl font-semibold sm:text-2xl"
              >
                {t('picker.title')}
              </h2>
              <p className="mx-auto max-w-md text-sm text-muted-foreground sm:text-base">
                {t('picker.subtitle')}
              </p>
            </div>
            <button
              type="button"
              data-testid="pick-photos"
              onClick={openChooser}
              className={buttonClasses({ className: 'w-full sm:w-auto' })}
            >
              {t('picker.choose')}
            </button>
            <p className="hidden text-xs text-muted-foreground sm:block">
              {t('picker.drop_hint')}
            </p>
          </div>
        )}
      </section>

      <NoticeRegion notice={notice} unsupported={unsupported} />

      <CombineControls
        count={photos.length}
        unsupported={unsupported}
        onCombine={onCombine}
      />

      <Tips />
    </div>
  );
}
