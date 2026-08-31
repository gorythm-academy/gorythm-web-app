import React from 'react';

const StudentsPagination = ({ page, setPage, loading, total, totalPages }) => (
    <nav className="pagination-controls" aria-label="Students pagination">
        <button
            type="button"
            className="pagination-controls__nav"
            disabled={page <= 1 || loading || total === 0}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            aria-label="Previous page"
        >
            <i className="fas fa-chevron-left" aria-hidden />
            <span>Prev</span>
        </button>

        <div className="pagination-controls__center">
            <div className="pagination-controls__pages" aria-live="polite">
                <span className="pagination-controls__current">
                    {total === 0 ? 0 : page}
                </span>
                <span className="pagination-controls__divider" aria-hidden>/</span>
                <span className="pagination-controls__total-pages">
                    {total === 0 ? 0 : totalPages}
                </span>
            </div>
            <span className="pagination-controls__count">
                {total} student{total === 1 ? '' : 's'}
            </span>
        </div>

        <button
            type="button"
            className="pagination-controls__nav"
            disabled={page >= totalPages || loading || total === 0}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            aria-label="Next page"
        >
            <span>Next</span>
            <i className="fas fa-chevron-right" aria-hidden />
        </button>
    </nav>
);

export default StudentsPagination;
