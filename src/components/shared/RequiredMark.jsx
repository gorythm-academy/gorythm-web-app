import React from 'react';

/** Red asterisk shown on required form field labels. */
export default function RequiredMark() {
    return (
        <span className="required-asterisk" aria-hidden="true">
            *
        </span>
    );
}
