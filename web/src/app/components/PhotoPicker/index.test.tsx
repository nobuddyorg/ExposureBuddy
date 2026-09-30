// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PickedPhoto } from '../../exposure/pickedPhotos';
import { usePickedPhotos } from '../../exposure/usePickedPhotos';
import { I18nProvider } from '../../i18n/I18nProvider';
import PhotoPicker, { type PhotoPickerProps } from './index';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'en');
  // jsdom has no object URLs; the thumbnails only need some src.
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:thumb'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function image(name: string) {
  return new File(['x'], name, { type: 'image/jpeg', lastModified: 1 });
}

const DEVICE = { poolSize: 1, budgetBytes: 256 * 1024 * 1024 };
const PHONE = { width: 4032, height: 3024 };

function picked(names: string[]): PickedPhoto[] {
  return names.map((name) => ({ id: name, file: image(name) }));
}

function renderPicker(overrides: Partial<PhotoPickerProps> = {}) {
  const props: PhotoPickerProps = {
    photos: [],
    notice: null,
    unsupported: false,
    referenceSize: { kind: 'none' },
    device: DEVICE,
    onAdd: vi.fn(),
    onClear: vi.fn(),
    onCombine: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider>
      <PhotoPicker {...props} />
    </I18nProvider>,
  );
  return props;
}

// The picker as the page wires it: the hook decides what is accepted, the component shows it.
function WiredPicker({
  onCombine,
}: {
  onCombine: PhotoPickerProps['onCombine'];
}) {
  const photos = usePickedPhotos();
  return (
    <PhotoPicker
      photos={photos.photos}
      notice={photos.notice}
      unsupported={false}
      referenceSize={{ kind: 'none' }}
      device={DEVICE}
      onAdd={photos.add}
      onClear={photos.clear}
      onCombine={onCombine}
    />
  );
}

function renderWired() {
  const onCombine = vi.fn();
  render(
    <I18nProvider>
      <WiredPicker onCombine={onCombine} />
    </I18nProvider>,
  );
  return { onCombine, input: screen.getByTestId('photo-input') };
}

describe('PhotoPicker, empty', () => {
  it('shows the title, the choose button, the drop hint and the tips', () => {
    renderPicker();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Pick your burst' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Choose photos' })).toBeVisible();
    expect(screen.getByText('or drop them here')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'How to shoot a burst' }),
    ).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByTestId('photo-thumb')).toBeNull();
    expect(screen.queryByTestId('photo-count')).toBeNull();
  });

  it('keeps the tagline as the heading, the app name living in the header', () => {
    renderPicker();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Long exposures from a burst of phone photos',
      }),
    ).toBeVisible();
    expect(screen.queryByText('ExposureBuddy')).toBeNull();
  });

  it('opens the hidden file input from the choose button', async () => {
    const user = userEvent.setup();
    renderPicker();
    const input = screen.getByTestId<HTMLInputElement>('photo-input');
    const click = vi.spyOn(input, 'click');
    await user.click(screen.getByTestId('pick-photos'));
    expect(click).toHaveBeenCalledOnce();
    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input).toHaveAttribute('multiple');
    expect(input).toHaveAccessibleName('Choose photos');
  });

  it('disables combine with the reason while there are too few photos', () => {
    renderPicker();
    const combine = screen.getByTestId('combine');
    expect(combine).toBeDisabled();
    expect(combine).toHaveAccessibleDescription('Add at least 2 photos');
    expect(combine).toHaveTextContent('Combine 0 photos');
  });

  it('shows the unsupported notice and keeps combine disabled', () => {
    renderPicker({ photos: picked(['a.jpg', 'b.jpg']), unsupported: true });
    expect(screen.getByTestId('picker-notice')).toHaveTextContent(
      'This browser cannot run the pipeline',
    );
    expect(screen.getByTestId('combine')).toBeDisabled();
  });

  it('keeps the notice region mounted, but silent, with nothing to say', () => {
    renderPicker();
    const notice = screen.getByRole('status');
    expect(notice).toHaveAttribute('data-testid', 'picker-notice');
    expect(notice).toBeEmptyDOMElement();
  });

  it('lists the refused files by name', () => {
    renderPicker({
      notice: { kind: 'refused', names: ['notes.txt', 'song.mp3'] },
    });
    const notice = screen.getByTestId('picker-notice');
    expect(notice).toHaveTextContent('notes.txt is not an image');
    expect(notice).toHaveTextContent('song.mp3 is not an image');
  });

  it('explains the cap', () => {
    renderPicker({ notice: { kind: 'truncated', limit: 100 } });
    expect(screen.getByTestId('picker-notice')).toHaveTextContent(
      'more than 100 photos',
    );
  });
});

describe('PhotoPicker, with photos', () => {
  it('shows thumbnails, the count, add more and clear', () => {
    renderPicker({ photos: picked(['a.jpg', 'b.jpg', 'c.jpg']) });
    const thumbs = screen.getAllByTestId('photo-thumb');
    expect(thumbs).toHaveLength(3);
    expect(thumbs[0]).toHaveAttribute('alt', 'Photo 1');
    expect(thumbs[2]).toHaveAttribute('alt', 'Photo 3');
    expect(thumbs[0]).toHaveAttribute('src', 'blob:thumb');
    expect(thumbs[0]).toHaveAttribute('loading', 'lazy');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Your photos' }),
    ).toBeVisible();
    expect(screen.getByTestId('photo-count')).toHaveTextContent('3 photos');
    expect(screen.getByRole('button', { name: 'Add more' })).toHaveAttribute(
      'data-testid',
      'pick-photos',
    );
    expect(screen.getByTestId('clear-photos')).toBeVisible();
  });

  it('counts one photo in the singular', () => {
    renderPicker({ photos: picked(['a.jpg']) });
    expect(screen.getByTestId('photo-count')).toHaveTextContent('1 photo');
  });

  it('enables combine from the minimum and passes the chosen quality', async () => {
    const user = userEvent.setup();
    const { onCombine } = renderPicker({ photos: picked(['a.jpg', 'b.jpg']) });
    const combine = screen.getByTestId('combine');
    expect(combine).toBeEnabled();
    expect(combine).toHaveTextContent('Combine 2 photos');
    expect(screen.queryByText('Add at least 2 photos')).toBeNull();

    await user.click(combine);
    expect(onCombine).toHaveBeenLastCalledWith('standard');

    await user.selectOptions(screen.getByTestId('quality-select'), 'high');
    await user.click(combine);
    expect(onCombine).toHaveBeenLastCalledWith('high');
  });

  it('labels the quality select with its three options', () => {
    renderPicker();
    const select = screen.getByRole('combobox', { name: 'Output size' });
    expect(select).toHaveAttribute('data-testid', 'quality-select');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Small, fast', 'Standard', 'Large, slow']);
  });

  it('clears through the clear button', async () => {
    const user = userEvent.setup();
    const { onClear } = renderPicker({ photos: picked(['a.jpg', 'b.jpg']) });
    await user.click(screen.getByTestId('clear-photos'));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

describe('PhotoPicker, wired to the hook', () => {
  it('adds files through the input and shows them', async () => {
    const user = userEvent.setup();
    const { input } = renderWired();
    await user.upload(input, [image('a.jpg'), image('b.jpg')]);
    expect(screen.getAllByTestId('photo-thumb')).toHaveLength(2);
    expect(screen.getByTestId('photo-count')).toHaveTextContent('2 photos');
    expect(screen.getByTestId('combine')).toBeEnabled();
  });

  it('accepts the same files again after a clear', async () => {
    const user = userEvent.setup();
    const { input } = renderWired();
    const files = [image('a.jpg'), image('b.jpg')];
    await user.upload(input, files);
    await user.click(screen.getByTestId('clear-photos'));
    expect(screen.queryByTestId('photo-thumb')).toBeNull();
    await user.upload(input, files);
    expect(screen.getAllByTestId('photo-thumb')).toHaveLength(2);
  });

  it('takes a drop on the dropzone', () => {
    renderWired();
    const dropzone = screen.getByTestId('photo-dropzone');
    fireEvent.dragEnter(dropzone);
    expect(dropzone).toHaveAttribute('data-dragging', 'true');
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [image('a.jpg'), image('b.jpg')] },
    });
    expect(dropzone).toHaveAttribute('data-dragging', 'false');
    expect(screen.getAllByTestId('photo-thumb')).toHaveLength(2);
  });

  it('refuses a text file with a notice and no thumbnail', () => {
    const { input } = renderWired();
    const text = new File(['hello'], 'not-an-image.txt', {
      type: 'text/plain',
    });
    // Straight through the change event: user-event would apply the accept filter itself.
    fireEvent.change(input, { target: { files: [text] } });
    expect(screen.getByTestId('picker-notice')).toHaveTextContent(
      'not-an-image.txt is not an image and was left out.',
    );
    expect(screen.queryByTestId('photo-thumb')).toBeNull();
  });

  it.each([[[]], [null]])(
    'ignores a dismissed chooser (files: %o)',
    (files) => {
      const { input } = renderWired();
      fireEvent.change(input, { target: { files } });
      expect(screen.queryByTestId('photo-thumb')).toBeNull();
      expect(screen.getByTestId('picker-notice')).toBeEmptyDOMElement();
    },
  );
});

describe('PhotoPicker, result size', () => {
  const sizeLine = () => screen.getByTestId('result-size');

  it('says nothing before any photo is picked', () => {
    renderPicker();
    expect(sizeLine()).toHaveTextContent('');
  });

  it('says it is working the size out while the reference photo is read', () => {
    renderPicker({ photos: picked(['a.jpg', 'b.jpg']) });
    expect(sizeLine()).toHaveTextContent('Working out the result size');
  });

  it('says nothing for a reference photo the browser cannot read', () => {
    renderPicker({
      photos: picked(['a.jpg', 'b.jpg']),
      referenceSize: { kind: 'unreadable' },
    });
    expect(sizeLine()).toHaveTextContent('');
  });

  it('shows the size the chosen quality comes out at, and follows the choice', async () => {
    const user = userEvent.setup();
    renderPicker({
      photos: picked(['a.jpg', 'b.jpg', 'c.jpg']),
      referenceSize: { kind: 'known', size: PHONE },
    });
    expect(sizeLine()).toHaveTextContent('Comes out up to 1,600 × 1,200 px');
    expect(sizeLine()).not.toHaveTextContent('Smaller than the size chosen');
    await user.selectOptions(screen.getByTestId('quality-select'), 'low');
    expect(sizeLine()).toHaveTextContent('Comes out up to 1,024 × 768 px');
    expect(screen.getByTestId('quality-select')).toHaveAttribute(
      'aria-describedby',
      sizeLine().id,
    );
  });

  it('says so when this many photos make the result smaller than chosen', () => {
    renderPicker({
      photos: picked(Array.from({ length: 60 }, (_, index) => `${index}.jpg`)),
      referenceSize: { kind: 'known', size: PHONE },
    });
    expect(sizeLine()).toHaveTextContent('Smaller than the size chosen');
  });
});
