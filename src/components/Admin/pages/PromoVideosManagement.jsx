import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import {
  cleanupPromoVideoThumbnail,
  uploadPromoVideoThumbnail,
  fetchPromoThumbnailGallery,
  deletePromoThumbnailGalleryImage,
} from '../../../utils/fileUploadApi';
import { parseVideoUrl } from '../../../utils/videoEmbed';
import { resolveMediaUrl } from '../../../utils/resolveMediaUrl';
import { useAdminDialog } from '../AdminDialogContext';
import '../Admin.scss';
import './PromoVideosManagement.scss';

const idKey = (id) => String(id);

const ACCEPTED_THUMB_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
]);

function isAcceptedThumbFile(file) {
  if (!file) return false;
  if (ACCEPTED_THUMB_TYPES.has(file.type)) return true;
  const ext = (file.name || '').split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(ext);
}

const emptyForm = () => ({
  name: '',
  videoUrl: '',
  thumbnailPath: '',
  localThumbUrl: '',
});

function PromoThumbnail({ path, localUrl = '', alt = '', className = '', loading, showErrorText = false }) {
  const [failed, setFailed] = useState(false);
  const src = localUrl || (path ? resolveMediaUrl(path) : '');

  useEffect(() => {
    setFailed(false);
  }, [path, localUrl, src]);

  if (!src) {
    return null;
  }

  if (failed) {
    return (
      <div
        className={`promo-videos-thumb-placeholder promo-videos-thumb-placeholder--error${
          className ? ` ${className}` : ''
        }`}
      >
        <i className="fas fa-exclamation-triangle" aria-hidden="true" />
        {showErrorText ? <span>Image missing — upload again</span> : null}
      </div>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={loading}
      onError={() => setFailed(true)}
    />
  );
}

function ThumbnailGalleryGrid({
  images,
  loading,
  selectedPath = '',
  onSelect,
  onDelete,
  emptyMessage = 'No thumbnails in uploads/video-thumbnails yet.',
}) {
  if (loading && images.length === 0) {
    return (
      <div className="promo-thumb-gallery__loading">
        <i className="fas fa-spinner fa-spin" aria-hidden="true" />
        Loading thumbnails…
      </div>
    );
  }

  if (images.length === 0) {
    return <p className="course-image-section__gallery-empty">{emptyMessage}</p>;
  }

  return (
    <div className="promo-thumb-gallery__grid course-image-section__gallery">
      {images.map((img) => {
        const isSelected = selectedPath && selectedPath === img.path;
        return (
          <div
            key={img.path}
            className={`course-image-section__tile${isSelected ? ' is-selected' : ''}`}
          >
            <button
              type="button"
              className="course-image-section__tile-select"
              onClick={() => onSelect?.(img.path)}
              title={img.usedByTitles?.join(', ') || img.filename || 'Select thumbnail'}
            >
              <img src={resolveMediaUrl(img.path)} alt="" loading="lazy" />
              {isSelected ? (
                <span className="course-image-section__tile-badge">
                  <i className="fas fa-check" aria-hidden="true" />
                </span>
              ) : null}
              {img.usedBy > 0 ? (
                <span className="course-image-section__tile-used">{img.usedBy} in use</span>
              ) : null}
            </button>
            <button
              type="button"
              className="course-image-section__tile-delete"
              onClick={(e) => onDelete?.(img, e)}
              title="Delete from server folder"
            >
              <i className="fas fa-trash-alt" aria-hidden="true" />
            </button>
            <span className="promo-thumb-gallery__filename" title={img.filename}>
              {img.filename}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const PromoVideosManagement = () => {
  const { showAlert, showConfirm } = useAdminDialog();
  const [videos, setVideos] = useState([]);
  const [activeVideos, setActiveVideos] = useState([]);
  const [trashCount, setTrashCount] = useState(0);
  const [listTab, setListTab] = useState('active');
  const [selection, setSelection] = useState({ homepageVideoId: '', aboutVideoId: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [thumbDragActive, setThumbDragActive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const savedThumbOnEditRef = useRef('');
  const thumbUploadLockRef = useRef(false);
  const thumbInputRef = useRef(null);
  const libraryThumbInputRef = useRef(null);
  const thumbDragCounterRef = useRef(0);

  const authHeaders = useCallback(() => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/admin/promo-videos`, {
        headers: authHeaders(),
        params: listTab === 'trash' ? { trash: '1' } : {},
      });
      setVideos(res.data?.videos || []);
      setActiveVideos(res.data?.activeVideos || res.data?.videos || []);
      if (typeof res.data?.trashCount === 'number') setTrashCount(res.data.trashCount);
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
  }, [authHeaders, listTab, showAlert]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const fetchGalleryImages = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    setGalleryLoading(true);
    try {
      const images = await fetchPromoThumbnailGallery();
      setGalleryImages(images);
    } catch {
      setGalleryImages([]);
    } finally {
      setGalleryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGalleryImages();
  }, [fetchGalleryImages]);

  const hasThumbSelection = Boolean(form.thumbnailPath || form.localThumbUrl);

  const videoOptions = useMemo(
    () => [{ id: '', label: '— None —' }, ...activeVideos.map((v) => ({ id: v.id, label: v.name }))],
    [activeVideos]
  );

  const selectedHome = useMemo(
    () => activeVideos.find((v) => idKey(v.id) === idKey(selection.homepageVideoId)),
    [activeVideos, selection.homepageVideoId]
  );

  const selectedAbout = useMemo(
    () => activeVideos.find((v) => idKey(v.id) === idKey(selection.aboutVideoId)),
    [activeVideos, selection.aboutVideoId]
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

  const revokeLocalThumb = useCallback((url) => {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }, []);

  const openCreate = () => {
    setEditingId(null);
    savedThumbOnEditRef.current = '';
    setForm((prev) => {
      revokeLocalThumb(prev.localThumbUrl);
      return emptyForm();
    });
    setFormOpen(true);
  };

  const openEdit = (video) => {
    setEditingId(video.id);
    savedThumbOnEditRef.current = video.thumbnailPath || '';
    setForm((prev) => {
      revokeLocalThumb(prev.localThumbUrl);
      return {
        name: video.name,
        videoUrl: video.videoUrl,
        thumbnailPath: video.thumbnailPath || '',
        localThumbUrl: '',
      };
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving || uploadingThumb || thumbUploadLockRef.current) return;

    const pendingThumb = form.thumbnailPath;
    const savedThumb = savedThumbOnEditRef.current;
    revokeLocalThumb(form.localThumbUrl);
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    savedThumbOnEditRef.current = '';
    // Discard any upload that was never committed — both on create and on edit (replaced but not saved).
    if (pendingThumb && pendingThumb !== savedThumb) {
      cleanupPromoVideoThumbnail(pendingThumb);
    }
  };

  const onThumbFile = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    await processThumbFile(file);
  };

  const processThumbFile = async (file, { assignToForm = true, replacePath } = {}) => {
    if (!file || thumbUploadLockRef.current) return null;
    if (!isAcceptedThumbFile(file)) {
      await showAlert({
        type: 'warning',
        title: 'Invalid file',
        message: 'Please use JPEG, PNG, WebP, or AVIF (max 8 MB).',
      });
      return null;
    }

    thumbUploadLockRef.current = true;
    const replace = replacePath !== undefined ? replacePath : form.thumbnailPath;
    let blobUrl = '';
    if (assignToForm) {
      blobUrl = URL.createObjectURL(file);
      setForm((f) => {
        revokeLocalThumb(f.localThumbUrl);
        return { ...f, localThumbUrl: blobUrl };
      });
    }
    setUploadingThumb(true);
    try {
      const path = await uploadPromoVideoThumbnail(file, replace);
      if (assignToForm) {
        setForm((f) => ({
          ...f,
          thumbnailPath: path,
        }));
      }
      await fetchGalleryImages();
      return path;
    } catch (err) {
      if (assignToForm) {
        setForm((f) => {
          revokeLocalThumb(f.localThumbUrl);
          return { ...f, localThumbUrl: '' };
        });
      }
      await showAlert({
        type: 'error',
        title: 'Upload failed',
        message: err.response?.data?.error || err.message || 'Could not upload thumbnail',
      });
      return null;
    } finally {
      setUploadingThumb(false);
      thumbUploadLockRef.current = false;
    }
  };

  const onThumbDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploadingThumb) return;
    thumbDragCounterRef.current += 1;
    setThumbDragActive(true);
  };

  const onThumbDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    thumbDragCounterRef.current -= 1;
    if (thumbDragCounterRef.current <= 0) {
      thumbDragCounterRef.current = 0;
      setThumbDragActive(false);
    }
  };

  const onThumbDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onThumbDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    thumbDragCounterRef.current = 0;
    setThumbDragActive(false);
    if (uploadingThumb) return;
    const file = e.dataTransfer?.files?.[0];
    processThumbFile(file);
  };

  const clearThumbSelection = () => {
    const pending = form.thumbnailPath;
    const saved = savedThumbOnEditRef.current;
    revokeLocalThumb(form.localThumbUrl);
    setForm((f) => ({ ...f, thumbnailPath: '', localThumbUrl: '' }));
    if (pending && pending !== saved) {
      cleanupPromoVideoThumbnail(pending);
    }
  };

  const selectGalleryImage = (imagePath) => {
    const pending = form.thumbnailPath;
    const saved = savedThumbOnEditRef.current;
    if (pending && pending !== saved && pending !== imagePath) {
      cleanupPromoVideoThumbnail(pending);
    }
    revokeLocalThumb(form.localThumbUrl);
    setForm((f) => ({ ...f, thumbnailPath: imagePath, localThumbUrl: '' }));
  };

  const handleGallerySelect = (imagePath) => {
    if (formOpen) {
      selectGalleryImage(imagePath);
      return;
    }
    setEditingId(null);
    savedThumbOnEditRef.current = '';
    revokeLocalThumb(form.localThumbUrl);
    setForm({
      ...emptyForm(),
      thumbnailPath: imagePath,
    });
    setFormOpen(true);
  };

  const onLibraryThumbFile = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    const path = await processThumbFile(file, { assignToForm: false, replacePath: '' });
    if (path) {
      await showAlert({
        type: 'success',
        title: 'Uploaded',
        message: 'Thumbnail saved to video-thumbnails folder.',
      });
    }
  };

  const pickLibraryThumbnail = () => {
    if (uploadingThumb || thumbUploadLockRef.current) return;
    libraryThumbInputRef.current?.click();
  };

  const handleDeleteGalleryImage = async (image, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!image?.path) return;

    const names = image.usedByTitles?.filter(Boolean).join(', ');
    const message =
      image.usedBy > 0
        ? names
          ? `Used by: ${names}. The file will be deleted from uploads/video-thumbnails and those videos will need a new thumbnail.`
          : `Used by ${image.usedBy} video(s). The file will be deleted from the server folder.`
        : 'This will permanently remove the file from uploads/video-thumbnails.';

    const confirmed = await showConfirm({
      title: 'Delete thumbnail file?',
      message,
      confirmLabel: 'Delete from folder',
    });
    if (!confirmed) return;

    try {
      await deletePromoThumbnailGalleryImage(image.path, { force: image.usedBy > 0 });
      if (form.thumbnailPath === image.path) {
        clearThumbSelection();
      }
      await Promise.all([fetchGalleryImages(), fetchList()]);
      await showAlert({
        type: 'success',
        title: 'Deleted',
        message: 'Thumbnail removed from video-thumbnails folder.',
      });
    } catch (err) {
      await showAlert({
        type: 'error',
        title: 'Delete failed',
        message: err.message || 'Could not delete thumbnail',
      });
    }
  };

  const pickThumbnail = () => {
    if (uploadingThumb || thumbUploadLockRef.current) return;
    thumbInputRef.current?.click();
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
    if (uploadingThumb || thumbUploadLockRef.current) {
      await showAlert({
        type: 'warning',
        title: 'Upload in progress',
        message: 'Wait for the thumbnail upload to finish, then save.',
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
      revokeLocalThumb(form.localThumbUrl);
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

  const handleMoveToTrash = async (video) => {
    const ok = await showConfirm({
      type: 'warning',
      title: 'Move to trash?',
      message: `"${video.name}" will be hidden from the library and removed from homepage/about selection. Restore it from the Trash tab.`,
      confirmLabel: 'Move to trash',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;

    try {
      const res = await axios.delete(`${API_BASE_URL}/api/admin/promo-videos/${video.id}`, {
        headers: authHeaders(),
      });
      if (res.data?.selection) setSelection(res.data.selection);
      await fetchList();
      await showAlert({ type: 'success', title: 'Moved to trash', message: 'You can restore or delete it permanently from Trash.' });
    } catch (err) {
      await showAlert({
        type: 'error',
        title: 'Could not move to trash',
        message: err.response?.data?.error || err.message,
      });
    }
  };

  const handleRestore = async (video) => {
    try {
      await axios.patch(`${API_BASE_URL}/api/admin/promo-videos/${video.id}/restore`, null, {
        headers: authHeaders(),
      });
      await fetchList();
      await showAlert({ type: 'success', title: 'Restored', message: `"${video.name}" is back in the library.` });
    } catch (err) {
      await showAlert({
        type: 'error',
        title: 'Restore failed',
        message: err.response?.data?.error || err.message,
      });
    }
  };

  const handlePermanentDelete = async (video) => {
    const ok = await showConfirm({
      type: 'error',
      title: 'Delete forever?',
      message: `"${video.name}" and its thumbnail will be removed permanently. This cannot be undone.`,
      confirmLabel: 'Delete forever',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;

    try {
      const res = await axios.delete(`${API_BASE_URL}/api/admin/promo-videos/${video.id}/permanent`, {
        headers: authHeaders(),
      });
      if (res.data?.selection) setSelection(res.data.selection);
      await fetchList();
      await showAlert({ type: 'success', title: 'Deleted permanently', message: 'The video record has been removed.' });
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
  const isTrashView = listTab === 'trash';

  const renderPlacementPreview = (video) => {
    if (!video?.thumbnailPath) return null;
    return (
      <div className="promo-videos-placement-card__preview">
        <PromoThumbnail path={video.thumbnailPath} />
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
        {!isTrashView ? (
        <button type="button" className="promo-videos-add-btn" onClick={openCreate}>
          <i className="fas fa-plus" aria-hidden="true" />
          Add video
        </button>
        ) : null}
      </header>

      <div className="students-list-tabs promo-videos-list-tabs">
        <button
          type="button"
          className={`students-list-tab ${listTab === 'active' ? 'active' : ''}`}
          onClick={() => setListTab('active')}
        >
          <i className="fas fa-film" aria-hidden /> Active library
        </button>
        <button
          type="button"
          className={`students-list-tab students-list-tab--trash ${listTab === 'trash' ? 'active' : ''}`}
          onClick={() => setListTab('trash')}
        >
          <i className="fas fa-trash-alt" aria-hidden /> Trash
          {trashCount > 0 ? <span className="admin-list-tab-badge">{trashCount}</span> : null}
        </button>
      </div>

      <div className="promo-videos-stats">
        <div className="promo-videos-stat">
          <div className="promo-videos-stat__icon promo-videos-stat__icon--total">
            <i className="fas fa-film" aria-hidden="true" />
          </div>
          <div>
            <span className="promo-videos-stat__label">In library</span>
            <strong>{loading ? '—' : activeVideos.length}</strong>
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

      {!isTrashView ? (
        <section className="promo-videos-thumb-library" aria-labelledby="promo-thumb-library-heading">
          <input
            ref={libraryThumbInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
            onChange={onLibraryThumbFile}
            hidden
          />
          <div className="promo-videos-thumb-library__head">
            <div>
              <h2 id="promo-thumb-library-heading">
                <i className="fas fa-images" aria-hidden="true" />
                Thumbnail library
              </h2>
              <p>
                All images in <code>uploads/video-thumbnails</code> — click to use on a video, upload
                new, or delete from the server folder.
              </p>
            </div>
            <button
              type="button"
              className="promo-videos-thumb-library__upload"
              onClick={pickLibraryThumbnail}
              disabled={uploadingThumb}
            >
              <i
                className={`fas ${uploadingThumb ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'}`}
                aria-hidden="true"
              />
              {uploadingThumb ? 'Uploading…' : 'Upload new image'}
            </button>
          </div>
          <div className="promo-videos-thumb-library__meta">
            <span>
              {galleryLoading ? 'Loading…' : `${galleryImages.length} file${galleryImages.length === 1 ? '' : 's'}`}
            </span>
            {galleryLoading ? (
              <span className="promo-videos-thumb-library__meta-loading">
                <i className="fas fa-spinner fa-spin" aria-hidden="true" />
              </span>
            ) : null}
          </div>
          <ThumbnailGalleryGrid
            images={galleryImages}
            loading={galleryLoading}
            selectedPath=""
            onSelect={handleGallerySelect}
            onDelete={handleDeleteGalleryImage}
            emptyMessage="No images in uploads/video-thumbnails yet. Upload one above."
          />
        </section>
      ) : null}

      {!isTrashView ? (
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
                disabled={loading || activeVideos.length === 0}
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
                disabled={loading || activeVideos.length === 0}
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
      ) : (
        <p className="promo-videos-trash-hint">
          <i className="fas fa-info-circle" aria-hidden />
          Trashed videos are hidden from the site. Use <strong>Restore</strong> or <strong>Delete forever</strong> below.
        </p>
      )}

      <section className="promo-videos-library" aria-labelledby="promo-library-heading">
        <h2 id="promo-library-heading">{isTrashView ? 'Trashed videos' : 'Video library'}</h2>

        {loading ? (
          <div className="promo-videos-loading">
            <i className="fas fa-spinner fa-spin" aria-hidden="true" />
            Loading videos…
          </div>
        ) : videos.length === 0 ? (
          <div className="promo-videos-empty">
            <div className="promo-videos-empty__icon">
              <i className={`fas ${isTrashView ? 'fa-trash-alt' : 'fa-clapperboard'}`} aria-hidden="true" />
            </div>
            <h3>{isTrashView ? 'Trash is empty' : 'No videos yet'}</h3>
            <p>
              {isTrashView
                ? 'Videos you move to trash will appear here.'
                : 'Add your first promo video with a thumbnail and Vimeo or YouTube link.'}
            </p>
            {!isTrashView ? (
            <button type="button" className="promo-videos-add-btn" onClick={openCreate}>
              <i className="fas fa-plus" aria-hidden="true" />
              Add video
            </button>
            ) : null}
          </div>
        ) : (
          <div className="promo-videos-grid">
            {videos.map((v) => (
              <article key={v.id} className={`promo-videos-card${isTrashView ? ' promo-videos-card--trash' : ''}`}>
                <div className="promo-videos-card__media">
                  <PromoThumbnail path={v.thumbnailPath} loading="lazy" showErrorText />
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
                    {isTrashView ? (
                      <>
                        <button
                          type="button"
                          className="promo-videos-card__restore"
                          onClick={() => handleRestore(v)}
                        >
                          <i className="fas fa-undo" aria-hidden="true" /> Restore
                        </button>
                        <button
                          type="button"
                          className="promo-videos-card__delete"
                          onClick={() => handlePermanentDelete(v)}
                        >
                          <i className="fas fa-trash-alt" aria-hidden="true" /> Delete forever
                        </button>
                      </>
                    ) : (
                      <>
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
                          onClick={() => handleMoveToTrash(v)}
                        >
                          <i className="fas fa-trash-alt" aria-hidden="true" /> Move to trash
                        </button>
                      </>
                    )}
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
                <div className="promo-videos-modal__field promo-videos-thumb-section">
                  <div
                    className={`course-image-section course-image-section__dropzone${
                      thumbDragActive ? ' is-dragging' : ''
                    }${uploadingThumb ? ' is-uploading' : ''}`}
                    onDragEnter={onThumbDragEnter}
                    onDragLeave={onThumbDragLeave}
                    onDragOver={onThumbDragOver}
                    onDrop={onThumbDrop}
                  >
                    {thumbDragActive ? (
                      <div className="course-image-section__drop-overlay">
                        <i className="fas fa-cloud-upload-alt" aria-hidden="true" />
                        <span>Drop image here</span>
                      </div>
                    ) : null}

                    <div className="course-image-section__header">
                      <label htmlFor="promo-video-thumb-field">Thumbnail</label>
                      <span className="course-image-section__hint">
                        16:9 recommended · upload, drag &amp; drop, or pick from gallery
                      </span>
                    </div>

                    <div className="course-image-section__preview-row">
                      <div className="course-image-section__preview">
                        {hasThumbSelection ? (
                          <PromoThumbnail
                            path={form.thumbnailPath}
                            localUrl={form.localThumbUrl}
                            alt="Thumbnail preview"
                            showErrorText
                          />
                        ) : (
                          <div className="course-image-section__preview-empty">
                            <i className="fas fa-image" aria-hidden="true" />
                            <span>No thumbnail</span>
                          </div>
                        )}
                        {hasThumbSelection ? (
                          <button
                            type="button"
                            className="course-image-section__clear"
                            onClick={clearThumbSelection}
                            title="Clear selection"
                          >
                            <i className="fas fa-times" aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                      <div className="course-image-section__upload">
                        <input
                          ref={thumbInputRef}
                          id="promo-video-thumb-field"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
                          onChange={onThumbFile}
                          hidden
                        />
                        <button
                          type="button"
                          className="course-image-section__upload-btn"
                          onClick={pickThumbnail}
                          disabled={uploadingThumb}
                        >
                          <i
                            className={`fas ${uploadingThumb ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'}`}
                            aria-hidden="true"
                          />
                          {uploadingThumb
                            ? 'Uploading…'
                            : hasThumbSelection
                              ? 'Replace image'
                              : 'Upload image'}
                        </button>
                        <span className="course-image-section__upload-note">
                          JPEG, PNG, WebP, or AVIF · max 8 MB
                        </span>
                      </div>
                    </div>

                    <div className="course-image-section__gallery-head">
                      <span>
                        Pick from folder
                        {galleryImages.length > 0 ? (
                          <span className="course-image-section__gallery-count">
                            {' '}
                            ({galleryImages.length} in uploads/video-thumbnails)
                          </span>
                        ) : null}
                      </span>
                      {galleryLoading ? (
                        <span className="course-image-section__gallery-loading">
                          <i className="fas fa-spinner fa-spin" aria-hidden="true" /> Loading…
                        </span>
                      ) : null}
                    </div>

                    <ThumbnailGalleryGrid
                      images={galleryImages}
                      loading={galleryLoading}
                      selectedPath={form.thumbnailPath}
                      onSelect={selectGalleryImage}
                      onDelete={handleDeleteGalleryImage}
                      emptyMessage="No images in uploads/video-thumbnails yet. Upload one above."
                    />
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
                  disabled={saving}
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
