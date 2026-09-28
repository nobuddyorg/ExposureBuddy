// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDropzone } from './useDropzone';

function Zone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const { dragging, handlers } = useDropzone(onFiles);
  return (
    <div data-testid="zone" data-dragging={dragging} {...handlers}>
      <span data-testid="child">inner</span>
    </div>
  );
}

function renderZone() {
  const onFiles = vi.fn();
  render(<Zone onFiles={onFiles} />);
  return { onFiles, zone: screen.getByTestId('zone') };
}

const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });

describe('useDropzone', () => {
  it('is not dragging at rest', () => {
    const { zone } = renderZone();
    expect(zone).toHaveAttribute('data-dragging', 'false');
  });

  it('highlights while something is dragged over it and stops when it leaves', () => {
    const { zone } = renderZone();
    fireEvent.dragEnter(zone);
    expect(zone).toHaveAttribute('data-dragging', 'true');
    fireEvent.dragLeave(zone);
    expect(zone).toHaveAttribute('data-dragging', 'false');
  });

  it('keeps the highlight while the drag crosses a child', () => {
    const { zone } = renderZone();
    const child = screen.getByTestId('child');
    fireEvent.dragEnter(zone);
    fireEvent.dragEnter(child);
    fireEvent.dragLeave(child);
    expect(zone).toHaveAttribute('data-dragging', 'true');
    fireEvent.dragLeave(zone);
    expect(zone).toHaveAttribute('data-dragging', 'false');
  });

  it('never goes below zero on a stray leave', () => {
    const { zone } = renderZone();
    fireEvent.dragLeave(zone);
    fireEvent.dragEnter(zone);
    expect(zone).toHaveAttribute('data-dragging', 'true');
  });

  it('allows the drop by preventing the default of dragover', () => {
    const { zone } = renderZone();
    const event = new Event('dragover', { bubbles: true, cancelable: true });
    zone.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('hands the dropped files over and clears the highlight', () => {
    const { onFiles, zone } = renderZone();
    fireEvent.dragEnter(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(zone).toHaveAttribute('data-dragging', 'false');
  });
});
