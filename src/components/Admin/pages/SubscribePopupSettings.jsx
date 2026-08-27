import React, { useCallback, useEffect, useRef, useState } from 'react';
import AdminMediaGallery from '../shared/AdminMediaGallery';
import { resolveMediaUrl } from '../../../utils/resolveMediaUrl';
import {
  deleteSubscribePopupGalleryImage,
  fetchSubscribePopupGallery,
  uploadSubscribePopupImage,
} from '../../../utils/subscribePopupAdminApi';
import { AUTH_REALM } from '../../../utils/authStorage';
import popupFallbackVisual from '../../../assets/images/home/subscribe.png';
import './SubscribePopupSettings.scss';

function apiErrorMessage(error, fallback) {
  if (error?.response?.data?.error) return error.response.data.error;
  const status = error?.response?.status;
  if (status === 404) {
    return 'Image API not found — restart the backend server after updating.';
  }
  if (status === 400) {
    return 'The server rejected this request. Restart the backend if the gallery was recently added.';
  }
  return error?.message || fallback;
}

const SubscribePopupSettings = ({
  form,
  setForm,
  loading,
  saving,
  saveMessage,
  loadError = '',
  onSave,
}) => {
  const fileInputRef = useRef(null);
  const uploadLockRef = useRef(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [galleryError, setGalleryError] = useState('');

  const loadGallery = useCallback(async () => {
    setGalleryLoading(true);
    setGalleryError('');
    try {
      const images = await fetchSubscribePopupGallery();
      setGalleryImages(images);
    } catch (err) {
      setGalleryImages([]);
      setGalleryError(apiErrorMessage(err, 'Could not load image gallery.'));
    } finally {
      setGalleryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  const previewSrc = form.subscribePopupImagePath
    ? resolveMediaUrl(form.subscribePopupImagePath)
    : popupFallbackVisual;

  const handleUpload = async (file) => {
    if (!file || uploadLockRef.current) return null;
    uploadLockRef.current = true;
    setUploading(true);
    try {
      const imagePath = await uploadSubscribePopupImage(file, AUTH_REALM.ADMIN);
      setForm((prev) => ({ ...prev, subscribePopupImagePath: imagePath }));
      await loadGallery();
      return imagePath;
    } catch (err) {
      setGalleryError(apiErrorMessage(err, 'Upload failed.'));
      return null;
    } finally {
      uploadLockRef.current = false;
      setUploading(false);
    }
  };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    await handleUpload(file);
  };

  const handleGallerySelect = (imagePath) => {
    setForm((prev) => ({ ...prev, subscribePopupImagePath: imagePath }));
  };

  const handleDeleteImage = async (image, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!image?.path) return;
    const confirmed = window.confirm(
      image.usedBy > 0
        ? 'This image is used by the subscribe popup. Delete it from the server folder anyway? The popup will fall back to the default image until you pick another.'
        : 'Permanently delete this file from uploads/subscribe-popup-images?'
    );
    if (!confirmed) return;
    try {
      await deleteSubscribePopupGalleryImage(image.path, { force: image.usedBy > 0 });
      if (form.subscribePopupImagePath === image.path) {
        setForm((prev) => ({ ...prev, subscribePopupImagePath: '' }));
      }
      await loadGallery();
    } catch (err) {
      setGalleryError(apiErrorMessage(err, 'Delete failed.'));
    }
  };

  const clearSelectedImage = () => {
    setForm((prev) => ({ ...prev, subscribePopupImagePath: '' }));
  };

  if (loading) {
    return (
      <section className="subscribe-popup-admin">
        <div className="subscribe-popup-admin__loading">
          <i className="fas fa-spinner fa-spin" aria-hidden="true" />
          Loading popup settings…
        </div>
      </section>
    );
  }

  return (
    <section className="subscribe-popup-admin" aria-labelledby="subscribe-popup-admin-heading">
      {loadError ? (
        <div className="subscribe-popup-admin__banner subscribe-popup-admin__banner--error" role="alert">
          <i className="fas fa-exclamation-circle" aria-hidden="true" />
          <div>
            <strong>Popup settings could not load</strong>
            <p>{loadError}</p>
            <p className="subscribe-popup-admin__banner-hint">
              Restart the backend: open a terminal in the <code>backend</code> folder and run{' '}
              <code>npm run dev</code> (or redeploy if you are on production).
            </p>
          </div>
        </div>
      ) : null}
      <header className="subscribe-popup-admin__hero">
        <div>
          <h2 id="subscribe-popup-admin-heading">
            <i className="fas fa-bell" aria-hidden="true" />
            Newsletter popup
          </h2>
          <p>
            Control when the popup appears on the public site, what it says, and which image visitors see.
          </p>
        </div>
        <label className="subscribe-popup-admin__toggle">
          <input
            type="checkbox"
            checked={form.subscribePopupEnabled}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, subscribePopupEnabled: e.target.checked }))
            }
          />
          <span className="subscribe-popup-admin__toggle-track" aria-hidden="true" />
          <span className="subscribe-popup-admin__toggle-label">
            {form.subscribePopupEnabled ? 'Enabled on site' : 'Disabled'}
          </span>
        </label>
      </header>

      <div className="subscribe-popup-admin__layout">
        <div className="subscribe-popup-admin__preview-panel">
          <p className="subscribe-popup-admin__panel-kicker">Live preview</p>
          <div className="subscribe-popup-admin__preview-card" aria-hidden="true">
            <div className="subscribe-popup-admin__preview-visual">
              <img src={previewSrc} alt="" />
            </div>
            <div className="subscribe-popup-admin__preview-content">
              <span className="subscribe-popup-admin__preview-close">×</span>
              <h3>{form.subscribePopupHeadline || 'Stay updated with our latest courses.'}</h3>
              <div className="subscribe-popup-admin__preview-input" />
              <div className="subscribe-popup-admin__preview-check">Privacy policy</div>
              <span className="subscribe-popup-admin__preview-btn">
                {form.subscribePopupButtonText || 'Subscribe'}
              </span>
            </div>
          </div>
          <p className="subscribe-popup-admin__preview-note">
            Appears after <strong>{form.subscribePopupDelaySeconds || 0}</strong> seconds on the homepage
            (once per browser session).
          </p>
        </div>

        <div className="subscribe-popup-admin__form-panel">
          <label className="subscribe-popup-admin__field">
            <span>Delay before popup (seconds)</span>
            <input
              type="number"
              min={0}
              max={300}
              value={form.subscribePopupDelaySeconds}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, subscribePopupDelaySeconds: e.target.value }))
              }
            />
          </label>
          <label className="subscribe-popup-admin__field">
            <span>Headline</span>
            <input
              type="text"
              maxLength={200}
              value={form.subscribePopupHeadline}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, subscribePopupHeadline: e.target.value }))
              }
            />
          </label>
          <label className="subscribe-popup-admin__field">
            <span>Button text</span>
            <input
              type="text"
              maxLength={40}
              value={form.subscribePopupButtonText}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, subscribePopupButtonText: e.target.value }))
              }
            />
          </label>

          <div className="subscribe-popup-admin__save-row">
            <button type="button" className="subscribe-popup-admin__save" onClick={onSave} disabled={saving}>
              {saving ? (
                <>
                  <i className="fas fa-spinner fa-spin" aria-hidden="true" /> Saving…
                </>
              ) : (
                <>
                  <i className="fas fa-check" aria-hidden="true" /> Save popup settings
                </>
              )}
            </button>
            {saveMessage ? (
              <span
                className={`subscribe-popup-admin__save-msg${
                  saveMessage.toLowerCase().includes('saved') ? '' : ' subscribe-popup-admin__save-msg--error'
                }`}
                role="status"
              >
                {saveMessage}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="subscribe-popup-admin__gallery">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
          onChange={onFileChange}
          hidden
        />
        <div className="subscribe-popup-admin__gallery-head">
          <div>
            <h3>
              <i className="fas fa-images" aria-hidden="true" />
              Popup image library
            </h3>
            <p>
              Images in <code>uploads/subscribe-popup-images</code> — click to use on the popup, upload new,
              or delete from the server folder.
            </p>
          </div>
          <div className="subscribe-popup-admin__gallery-actions">
            {form.subscribePopupImagePath ? (
              <button type="button" className="subscribe-popup-admin__ghost" onClick={clearSelectedImage}>
                Use default image
              </button>
            ) : null}
            <button
              type="button"
              className="subscribe-popup-admin__upload"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <i className={`fas ${uploading ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'}`} aria-hidden="true" />
              {uploading ? 'Uploading…' : 'Upload new image'}
            </button>
          </div>
        </div>
        <div className="subscribe-popup-admin__gallery-meta">
          {galleryLoading
            ? 'Loading gallery…'
            : `${galleryImages.length} file${galleryImages.length === 1 ? '' : 's'}`}
          {form.subscribePopupImagePath ? (
            <span className="subscribe-popup-admin__selected">
              Selected: {form.subscribePopupImagePath.split('/').pop()}
            </span>
          ) : (
            <span className="subscribe-popup-admin__selected subscribe-popup-admin__selected--default">
              Using built-in default image
            </span>
          )}
        </div>
        {galleryError ? (
          <p className="subscribe-popup-admin__gallery-error" role="alert">
            {galleryError}
          </p>
        ) : null}
        <AdminMediaGallery
          images={galleryImages}
          loading={galleryLoading}
          selectedPath={form.subscribePopupImagePath || ''}
          onSelect={handleGallerySelect}
          onDelete={handleDeleteImage}
          emptyMessage="No images yet. Upload one to use on the subscribe popup."
          gridClassName="subscribe-popup-admin__gallery-grid"
        />
      </div>
    </section>
  );
};

export default SubscribePopupSettings;
