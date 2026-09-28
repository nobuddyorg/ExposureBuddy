// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Dialog from './index';

const TEST_IDS = { dialog: 'probe-dialog', close: 'probe-close' };

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <div id="app-root">
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Probe"
        closeLabel="Close"
        testIds={TEST_IDS}
      >
        <p>Body text</p>
        <button type="button">action</button>
      </Dialog>
    </div>
  );
}

function appRoot() {
  return document.getElementById('app-root') as HTMLElement;
}

async function openDialog() {
  const user = userEvent.setup();
  render(<Host />);
  await user.click(screen.getByRole('button', { name: 'opener' }));
  return user;
}

describe('Dialog', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing while closed', () => {
    render(<Host />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('dialog-backdrop')).toBeNull();
  });

  it('opens as a modal dialog named by its title, outside the app root', async () => {
    await openDialog();
    const dialog = screen.getByRole('dialog', { name: 'Probe' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('data-testid', 'probe-dialog');
    expect(appRoot().contains(dialog)).toBe(false);
    expect(screen.getByText('Body text')).toBeVisible();
  });

  it('starts focus on its first control, the close button', async () => {
    await openDialog();
    expect(screen.getByTestId('probe-close')).toHaveFocus();
  });

  it('keeps Tab inside the dialog', async () => {
    const user = await openDialog();
    await user.tab();
    expect(screen.getByRole('button', { name: 'action' })).toHaveFocus();
    await user.tab();
    expect(screen.getByTestId('probe-close')).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'action' })).toHaveFocus();
  });

  it('makes the page behind inert and locks its scroll while open', async () => {
    await openDialog();
    expect(appRoot().inert).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('closes on Escape and gives focus back to the opener', async () => {
    const user = await openDialog();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(appRoot().inert).toBe(false);
    expect(document.body.style.overflow).toBe('');
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'opener' })).toHaveFocus(),
    );
  });

  it('closes from its close button, named by the label it is given', async () => {
    const user = await openDialog();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on a click on the backdrop', async () => {
    const user = await openDialog();
    await user.click(screen.getByTestId('dialog-backdrop'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays open on a click inside the panel', async () => {
    const user = await openDialog();
    await user.click(screen.getByText('Body text'));
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});
