import { useEffect } from 'react';

/**
 * Esc closes; Enter triggers onConfirm only when confirmEnabled (confirm dialogs).
 * Multi-field forms should omit onConfirm / confirmEnabled.
 */
export function useDialogKeyboard({
    isOpen,
    onClose,
    onConfirm,
    confirmEnabled = false,
    blockEscape = false,
}) {
    useEffect(() => {
        if (!isOpen) return undefined;

        const onKey = (event) => {
            if (event.key === 'Escape' && !blockEscape) {
                event.preventDefault();
                onClose?.();
                return;
            }

            if (event.key !== 'Enter' || !onConfirm || !confirmEnabled) return;

            const tag = (event.target?.tagName || '').toLowerCase();
            if (tag === 'textarea') return;
            if (event.target?.isContentEditable) return;
            if (event.target?.closest('button[type="submit"]')) return;

            event.preventDefault();
            onConfirm();
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose, onConfirm, confirmEnabled, blockEscape]);
}
