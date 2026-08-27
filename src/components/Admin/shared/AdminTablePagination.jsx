import React from 'react';
import { getPaginationPageItems } from '../../../utils/adminPagination';

const AdminTablePagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const items = getPaginationPageItems(currentPage, totalPages);

  return (
    <div className="contact-pagination">
      <button
        type="button"
        className="page-btn"
        disabled={currentPage === 1}
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
      >
        Prev
      </button>
      {items.map((item, index) =>
        item === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} className="page-btn page-btn--ellipsis" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            type="button"
            key={item}
            className={`page-btn ${currentPage === item ? 'active' : ''}`}
            onClick={() => onPageChange(item)}
            aria-current={currentPage === item ? 'page' : undefined}
          >
            {item}
          </button>
        )
      )}
      <button
        type="button"
        className="page-btn"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
      >
        Next
      </button>
    </div>
  );
};

export default AdminTablePagination;
