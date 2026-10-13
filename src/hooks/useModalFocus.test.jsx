import { vi } from 'vitest';
import React, { useRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useModalFocus } from './useModalFocus';

function Harness({ onClose }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useModalFocus(ref, open, {
    onEscape: () => {
      onClose();
      setOpen(false);
    },
  });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      {open ? (
        <div ref={ref} role="dialog" aria-label="test dialog">
          <button type="button">first</button>
          <button type="button">last</button>
        </div>
      ) : null}
    </div>
  );
}

test('modal focus moves in, wraps with Tab, closes on Escape and returns', () => {
  const onClose = vi.fn();
  render(<Harness onClose={onClose} />);
  const opener = screen.getByText('opener');
  opener.focus();
  fireEvent.click(opener);

  const first = screen.getByText('first');
  const last = screen.getByText('last');
  expect(document.activeElement).toBe(first);

  last.focus();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(document.activeElement).toBe(first);

  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(last);

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(opener);
});
