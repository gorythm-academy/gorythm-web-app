import React from 'react';

/**
 * Standard admin keyword search input (matches .search-box in admin pages).
 */
const AdminSearchBox = ({
    value,
    onChange,
    onEnter,
    placeholder = 'Search…',
    disabled = false,
    className = '',
    inputProps = {},
}) => (
    <div className={`search-box ${className}`.trim()}>
        <i className="fas fa-search" aria-hidden="true" />
        <input
            type="search"
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            disabled={disabled}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && onEnter) {
                    e.preventDefault();
                    onEnter();
                }
            }}
            {...inputProps}
        />
    </div>
);

export default AdminSearchBox;
