import { useCallback, useEffect, useState } from 'react';

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Shared admin search state: live input + debounced query for API/client filters.
 * Call flushSearch() on Enter to apply immediately.
 */
export function useAdminSearch(initialValue = '', debounceMs = DEFAULT_DEBOUNCE_MS) {
    const [searchTerm, setSearchTerm] = useState(initialValue);
    const [debouncedSearch, setDebouncedSearch] = useState(() =>
        String(initialValue || '').trim()
    );

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedSearch(searchTerm.trim());
        }, debounceMs);
        return () => window.clearTimeout(timer);
    }, [searchTerm, debounceMs]);

    const flushSearch = useCallback(() => {
        const q = searchTerm.trim();
        setDebouncedSearch(q);
        return q;
    }, [searchTerm]);

    const clearSearch = useCallback(() => {
        setSearchTerm('');
        setDebouncedSearch('');
    }, []);

    return {
        searchTerm,
        setSearchTerm,
        debouncedSearch,
        flushSearch,
        clearSearch,
    };
}

export default useAdminSearch;
