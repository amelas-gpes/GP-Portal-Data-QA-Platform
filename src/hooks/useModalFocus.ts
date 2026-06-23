import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

const focusableSelector = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useModalFocus<T extends HTMLElement>({
  active = true,
  closeOnEscape = true,
  initialFocusRef,
  onClose,
}: {
  active?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const modalRef = useRef<T | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => {
      const preferredTarget = initialFocusRef?.current;
      const firstFocusable = getFocusableElements(modalRef.current)[0];
      (preferredTarget ?? firstFocusable ?? modalRef.current)?.focus();
    });

    return () => {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [active, initialFocusRef]);

  const handleModalKeyDown = (event: KeyboardEvent<T>) => {
    if (event.key === 'Escape' && closeOnEscape) {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(modalRef.current);
    if (!focusable.length) {
      event.preventDefault();
      modalRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { modalRef, handleModalKeyDown };
}

function getFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter((node) => {
    if (node.hasAttribute('disabled') || node.getAttribute('aria-hidden') === 'true') return false;
    return node.offsetParent !== null || node === document.activeElement;
  });
}
