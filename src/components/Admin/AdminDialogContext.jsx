import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const AdminDialogContext = createContext(null);

const getIconClass = (type) => {
  if (type === 'success') return 'fas fa-check';
  if (type === 'error') return 'fas fa-exclamation-triangle';
  if (type === 'warning') return 'fas fa-trash-alt';
  return 'fas fa-info-circle';
};

export const AdminDialogProvider = ({ children }) => {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const closeDialog = useCallback((value) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    if (resolver) resolver(value);
  }, []);

  const showDialog = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialog({
        type: options.type || 'info',
        title: options.title || 'Notice',
        message: options.message || '',
        confirmLabel: options.confirmLabel || 'OK',
        cancelLabel: options.cancelLabel || '',
        showCancel: Boolean(options.cancelLabel),
        choices: options.choices || null,
      });
    });
  }, []);

  const showAlert = useCallback(
    (optionsOrMessage, type = 'info') => {
      const options =
        typeof optionsOrMessage === 'string'
          ? { message: optionsOrMessage, type }
          : optionsOrMessage || {};

      return showDialog({
        type: options.type || type,
        title:
          options.title ||
          (options.type === 'success'
            ? 'Success'
            : options.type === 'error'
              ? 'Error'
              : options.type === 'warning'
                ? 'Warning'
                : 'Notice'),
        message: options.message || '',
        confirmLabel: options.confirmLabel || 'OK',
      });
    },
    [showDialog]
  );

  const showConfirm = useCallback(
    (optionsOrMessage) => {
      const options =
        typeof optionsOrMessage === 'string'
          ? { message: optionsOrMessage }
          : optionsOrMessage || {};

      return showDialog({
        type: options.type || 'warning',
        title: options.title || 'Are you sure?',
        message: options.message || '',
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
      });
    },
    [showDialog]
  );

  const showChoice = useCallback(
    (options = {}) => {
      return showDialog({
        type: options.type || 'info',
        title: options.title || 'Choose an option',
        message: options.message || '',
        cancelLabel: options.cancelLabel || 'Cancel',
        choices: options.choices || [],
      });
    },
    [showDialog]
  );

  return (
    <AdminDialogContext.Provider value={{ showAlert, showConfirm, showChoice }}>
      {children}
      {dialog && (
        <div className="admin-dialog-overlay" role="presentation">
          <div
            className={`admin-dialog admin-dialog--${dialog.type}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-dialog-title"
          >
            <div className="admin-dialog__icon">
              <i className={getIconClass(dialog.type)}></i>
            </div>
            <div className="admin-dialog__content">
              <h2 id="admin-dialog-title">{dialog.title}</h2>
              <p>{dialog.message}</p>
            </div>
            <div className="admin-dialog__actions">
              {dialog.showCancel && (
                <button
                  type="button"
                  className="admin-dialog__btn admin-dialog__btn--secondary"
                  onClick={() => closeDialog(false)}
                >
                  {dialog.cancelLabel}
                </button>
              )}
              {dialog.choices?.length ? (
                dialog.choices.map((choice) => (
                  <button
                    type="button"
                    key={choice.value}
                    className="admin-dialog__btn admin-dialog__btn--primary"
                    onClick={() => closeDialog(choice.value)}
                  >
                    {choice.label}
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  className="admin-dialog__btn admin-dialog__btn--primary"
                  onClick={() => closeDialog(true)}
                >
                  {dialog.confirmLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminDialogContext.Provider>
  );
};

export const useAdminDialog = () => {
  const context = useContext(AdminDialogContext);
  if (!context) {
    return {
      showAlert: (message) => {
        window.alert(typeof message === 'string' ? message : message?.message || '');
        return Promise.resolve(true);
      },
      showConfirm: (message) => {
        const text = typeof message === 'string' ? message : message?.message || '';
        return Promise.resolve(window.confirm(text));
      },
      showChoice: (options = {}) => {
        const labels = (options.choices || []).map((choice) => choice.value).join('/');
        const value = window.prompt(options.message || `Choose: ${labels}`, options.choices?.[0]?.value || '');
        return Promise.resolve(value);
      },
    };
  }
  return context;
};
