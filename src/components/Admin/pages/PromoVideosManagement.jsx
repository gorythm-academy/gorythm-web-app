import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import {
  cleanupPromoVideoThumbnail,
  uploadPromoVideoThumbnail,
} from '../../../utils/fileUploadApi';
import { parseVideoUrl } from '../../../utils/videoEmbed';
import { resolveMediaUrl } from '../../../utils/resolveMediaUrl';
import { useAdminDialog } from '../AdminDialogContext';
import '../Admin.scss';
import './PromoVideosManagement.scss';

const idKey = (id) => String(id);

const emptyForm = () => ({
  name: '',
  videoUrl: '',
  thumbnailPath: '',
  thumbnailPreview: '',
});

const PromoVideosManagement = () => {
  const { showAlert, showConfirm } = useAdminDialog();
  const [videos, setVideos] = useState([]);
  const [selection, setSelection] = useState({ homepageVideoId: '', aboutVideoId: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const savedThumbOnEditRef = useRef('');
  const thumbUploadLockRef = useRef(false);

  const authHeaders = useCallback(() => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/admin/promo-videos`, {
        headers: authHeaders(),
      });
      setVideos(res.data?.videos || []);
      setSelection(res.data?.selection || { homepageVideoId: '', aboutVideoId: '' });
    } catch (err) {
      await showAlert({
        type: 'error',
        title: 'Could not load videos',
        message: err.response?.data?.error || err.message || 'Request failed',
      });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, showAlert]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const videoOptions = useMemo(
    () => [{ id: '', label: '— None —' }, ...videos.map((v) => ({ id: v.id, label: v.name }))],
    [videos]
  );

  const selectedHome = useMemo(
    () => videos.find((v) => idKey(v.id) === idKey(selection.homepageVideoId)),
    [videos, selection.homepageVideoId]
  );

  const selectedAbout = useMemo(
    () => videos.find((v) => idKey(v.id) === idKey(selection.aboutVideoId)),
    [videos, selection.aboutVideoId]
  );

  const updateSelection = async (patch) => {
    try {
      const res = await axios.patch(`${API_BASE_URL}/api/admin/promo-videos/selection`, patch, {
        headers: authHeaders(),
      });
      setSelection(res.data?.selection || selection);
    } catch (err) {
      await showAlert({
        type: 'error',
        title: 'Selection not saved',
        message: err.response?.data?.error || err.message,
      });
    }
  };

  const openCreate = () => {
    setEditingId(null);
    savedThumbOnEditRef.current = '';
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (video) => {
    setEditingId(video.id);
    savedThumbOnEditRef.current = video.thumbnailPath || '';
    setForm({
      name: video.name,
      videoUrl: video.videoUrl,
      thumbnailPath: video.thumbnailPath,
      thumbnailPreview: resolveMediaUrl(video.thumbnailPath),
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    const pendingThumb = form.thumbnailPath;
    const savedThumb = savedThumbOnEditRef.current;
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    savedThumbOnEditRef.current = '';
    if (pendingThumb && pendingThumb !== savedThumb) {
      cleanupPromoVideoThumbnail(pendingThumb);
    }
  };

  const onThumbFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || thumbUploadLockRef.current) return;

    thumbUploadLockRef.current = true;
    const replacePath = form.thumbnailPath;
    setUploadingThumb(true);
    try {
      const path = await uploadPromoVideoThumbnail(file, replacePath);
      setForm((f) => ({
        ...f,
        thumbnailPath: path,
        thumbnailPreview: resolveMediaUrl(path),
      }));
    } catch (err) {
      await showAlert({
        type: 'error',
        title: 'Upload failed',
        message: err.response?.data?.error || err.message || 'Could not upload thumbnail',
      });
    } finally {
      setUploadingThumb(false);
      thumbUploadLockRef.current = false;
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const videoUrl = form.videoUrl.trim();
    if (!name) {
      await showAlert({ type: 'warning', title: 'Name required', message: 'Enter a label for this video.' });
      return;
    }
    const parsed = parseVideoUrl(videoUrl);
    if (parsed.error) {
      await showAlert({ type: 'warning', title: 'Invalid URL', message: parsed.error });
      return;
    }
    if (!form.thumbnailPath) {
      await showAlert({
        type: 'warning',
        title: 'Thumbnail required',
        message: 'Upload a thumbnail image (JPEG, PNG, WebP, or AVIF).',
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        videoUrl,
        thumbnailPath: form.thumbnailPath,
      };
      if (editingId) {
        await axios.put(`${API_BASE_URL}/api/admin/promo-videos/${editingId}`, payload, {
          headers: authHeaders(),
        });
      } else {
        await axios.post(`${API_BASE_URL}/api/admin/promo-videos`, payload, {
          headers: authHeaders(),
        });
      }
      savedThumbOnEditRef.current = form.thumbnailPath;
      setFormOpen(false);
      setEditingId(null);
      setForm(emptyForm());
      await fetchList();
      await showAlert({ type: 'success', title: 'Saved', message: 'Video saved successfully.' });
    } catch (err) {
      await showAlert({
        type: 'error',
        title: 'Save failed',
        message: err.response?.data?.error || err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (video) => {
    const ok = await showConfirm({
      type: 'warning',
      title: 'Delete video?',
      message: `"${video.name}" will be removed from the library and its thumbnail deleted from the server.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;

    try {
      const res = await axios.delete(`${API_BASE_URL}/api/admin/promo-videos/${video.id}`, {
        headers: authHeaders(),
      });
      if (res.data?.selection) setSelection(res.data.selection);
      await fetchList();
    } catch (err) {
      await showAlert({
        type: 'error',
        title: 'Delete failed',
        message: err.response?.data?.error || err.message,
      });
    }
  };

  const isHome = (id) => idKey(selection.homepageVideoId) === idKey(id);
  const isAbout = (id) => idKey(selection.aboutVideoId) === idKey(id);

  const renderPlacementPreview = (video) => {
    if (!video?.thumbnailPath) return null;
    return (
      <div className="promo-videos-placement-card__preview">
        <img src={resolveMediaUrl(video.thumbnailPath)} alt="" />
      </div>
    );
  };

  return (
    <div className="settings-page promo-videos-page">
      <header className="promo-videos-header">
        <div>
          <h1>
            <i className="fas fa-video" aria-hidden="true" />
            Video controls
          </h1>
          <p>
            Manage Vimeo and YouTube promos, upload thumbnails, and choose what plays on the homepage
            and About page.
          </p>
        </div>
        <button type="button" className="promo-videos-add-btn" onClick={openCreate}>
          <i className="fas fa-plus" aria-hidden="true" />
          Add video
        </button>
      </header>

      <div className="promo-videos-stats">
        <div className="promo-videos-stat">
          <div className="promo-videos-stat__icon promo-videos-stat__icon--total">
            <i className="fas fa-film" aria-hidden="true" />
          </div>
          <div>
            <span className="promo-videos-stat__label">In library</span>
            <strong>{loading ? '—' : videos.length}</strong>
          </div>
        </div>
        <div className="promo-videos-stat">
          <div className="promo-videos-stat__icon promo-videos-stat__icon--home">
            <i className="fas fa-home" aria-hidden="true" />
          </div>
          <div>
            <span className="promo-videos-stat__label">Homepage</span>
            <strong>{selectedHome ? 'Live' : 'None'}</strong>
          </div>
        </div>
        <div className="promo-videos-stat">
          <div className="promo-videos-stat__icon promo-videos-stat__icon--about">
            <i className="fas fa-info-circle" aria-hidden="true" />
          </div>
          <div>
            <span className="promo-videos-stat__label">About page</span>
            <strong>{selectedAbout ? 'Live' : 'None'}</strong>
          </div>
        </div>
      </div>

      <section className="promo-videos-placement" aria-labelledby="promo-placement-heading">
        <h2 id="promo-placement-heading">Displayed on site</h2>
        <div className="promo-videos-placement__grid">
          <article className="promo-videos-placement-card">
            <div className="promo-videos-placement-card__head promo-videos-placement-card__head--home">
              <i className="fas fa-home" aria-hidden="true" />
              <div>
                <p className="promo-videos-placement-card__title">Homepage</p>
                <p className="promo-videos-placement-card__sub">Main site video section</p>
              </div>
            </div>
            {selectedHome ? (
              renderPlacementPreview(selectedHome)
            ) : (
              <div className="promo-videos-placement-card__preview-empty">
                <i className="fas fa-image" aria-hidden="true" />
                <span>No video selected</span>
              </div>
            )}
            <div className="promo-videos-placement-card__field">
              <label htmlFor="promo-home-select">Choose video</label>
              <select
                id="promo-home-select"
                value={selection.homepageVideoId || ''}
                onChange={(e) => updateSelection({ homepageVideoId: e.target.value || null })}
                disabled={loading || videos.length === 0}
              >
                {videoOptions.map((o) => (
                  <option key={`home-${o.id}`} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </article>

          <article className="promo-videos-placement-card">
            <div className="promo-videos-placement-card__head promo-videos-placement-card__head--about">
              <i className="fas fa-book-open" aria-hidden="true" />
              <div>
                <p className="promo-videos-placement-card__title">About us</p>
                <p className="promo-videos-placement-card__sub">About page video section</p>
              </div>
            </div>
            {selectedAbout ? (
              renderPlacementPreview(selectedAbout)
            ) : (
              <div className="promo-videos-placement-card__preview-empty">
                <i className="fas fa-image" aria-hidden="true" />
                <span>No video selected</span>
              </div>
            )}
            <div className="promo-videos-placement-card__field">
              <label htmlFor="promo-about-select">Choose video</label>
              <select
                id="promo-about-select"
                value={selection.aboutVideoId || ''}
                onChange={(e) => updateSelection({ aboutVideoId: e.target.value || null })}
                disabled={loading || videos.length === 0}
              >
                {videoOptions.map((o) => (
                  <option key={`about-${o.id}`} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </article>
        </div>
      </section>

      <section className="promo-videos-library" aria-labelledby="promo-library-heading">
        <h2 id="promo-library-heading">Video library</h2>

        {loading ? (
          <div className="promo-videos-loading">
            <i className="fas fa-spinner fa-spin" aria-hidden="true" />
            Loading videos…
          </div>
        ) : videos.length === 0 ? (
          <div className="promo-videos-empty">
            <div className="promo-videos-empty__icon">
              <i className="fas fa-clapperboard" aria-hidden="true" />
            </div>
            <h3>No videos yet</h3>
            <p>Add your first promo video with a thumbnail and Vimeo or YouTube link.</p>
            <button type="button" className="promo-videos-add-btn" onClick={openCreate}>
              <i className="fas fa-plus" aria-hidden="true" />
              Add video
            </button>
          </div>
        ) : (
          <div className="promo-videos-grid">
            {videos.map((v) => (
              <article key={v.id} className="promo-videos-card">
                <div className="promo-videos-card__media">
                  <img src={resolveMediaUrl(v.thumbnailPath)} alt="" loading="lazy" />
                  <span className={`promo-videos-card__provider promo-videos-card__provider--${v.provider}`}>
                    <i className={`fab fa-${v.provider === 'youtube' ? 'youtube' : 'vimeo-v'}`} aria-hidden="true" />
                    {v.provider}
                  </span>
                </div>
                <div className="promo-videos-card__body">
                  <h3 className="promo-videos-card__name">{v.name}</h3>
                  <div className="promo-videos-card__tags">
                    {isHome(v.id) && (
                      <span className="promo-videos-badge promo-videos-badge--home">
                        <i className="fas fa-home" aria-hidden="true" /> Homepage
                      </span>
                    )}
                    {isAbout(v.id) && (
                      <span className="promo-videos-badge promo-videos-badge--about">
                        <i className="fas fa-book-open" aria-hidden="true" /> About
                      </span>
                    )}
                    {!isHome(v.id) && !isAbout(v.id) && (
                      <span className="promo-videos-muted" style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                        Not assigned
                      </span>
                    )}
                  </div>
                  <div className="promo-videos-card__actions">
                    <button
                      type="button"
                      className="promo-videos-card__edit"
                      onClick={() => openEdit(v)}
                    >
                      <i className="fas fa-pen" aria-hidden="true" /> Edit
                    </button>
                    <button
                      type="button"
                      className="promo-videos-card__delete"
                      onClick={() => handleDelete(v)}
                    >
                      <i className="fas fa-trash-alt" aria-hidden="true" /> Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {formOpen && (
        <div className="promo-videos-modal-overlay" role="presentation" onClick={closeForm}>
          <div
            className="promo-videos-modal"
            role="dialog"
            aria-labelledby="promo-video-form-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="promo-videos-modal__header">
              <h2 id="promo-video-form-title">{editingId ? 'Edit video' : 'Add video'}</h2>
              <button
                type="button"
                className="promo-videos-modal__close"
                onClick={closeForm}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="promo-videos-modal__body">
                <label className="promo-videos-modal__field">
                  <span>Display name</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    maxLength={120}
                    required
                    placeholder="e.g. Welcome video"
                  />
                </label>
                <label className="promo-videos-modal__field">
                  <span>Vimeo or YouTube URL</span>
                  <input
                    type="url"
                    value={form.videoUrl}
                    onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
                    placeholder="https://vimeo.com/… or https://youtube.com/watch?v=…"
                    required
                  />
                </label>
                <div className="promo-videos-modal__field">
                  <span>Thumbnail (16:9 recommended)</span>
                  <div className="promo-videos-modal__upload">
                    {form.thumbnailPreview ? (
                      <img src={form.thumbnailPreview} alt="Thumbnail preview" />
                    ) : (
                      <i
                        className="fas fa-cloud-upload-alt"
                        style={{ fontSize: '2rem', color: '#94a3b8', marginBottom: '0.5rem' }}
                        aria-hidden="true"
                      />
                    )}
                    <label>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
                        onChange={onThumbFile}
                        disabled={uploadingThumb}
                      />
                      {uploadingThumb ? 'Uploading…' : form.thumbnailPreview ? 'Replace image' : 'Choose image'}
                    </label>
                    <span className="promo-videos-modal__upload-hint">JPEG, PNG, WebP, or AVIF · max 8 MB</span>
                  </div>
                </div>
              </div>
              <div className="promo-videos-modal__footer">
                <button
                  type="button"
                  className="promo-videos-modal__cancel"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="promo-videos-modal__save"
                  disabled={saving || uploadingThumb}
                >
                  {saving ? 'Saving…' : 'Save video'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromoVideosManagement;
