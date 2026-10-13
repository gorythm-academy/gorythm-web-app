import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { buildAuthHeaders, AUTH_REALM } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import {
  cleanupPromoVideoThumbnail,
  uploadPromoVideoThumbnail,
  fetchPromoThumbnailGallery,
  deletePromoThumbnailGalleryImage,
} from '../../../utils/fileUploadApi';
import { parseVideoUrl, providerThumbnailUrl, fetchVimeoThumbnailUrl } from '../../../utils/videoEmbed';
import { resolveMediaUrl } from '../../../utils/resolveMediaUrl';
import { useAdminDialog } from '../AdminDialogContext';
import { QUARANTINE_LABEL, FAILED_MOVE_TO_QUARANTINE_PHRASE } from '../../../utils/adminListLabels';
import '../Admin.scss';
import './PromoVideosManagement.scss';
import { PromoVideosManagementView } from './PromoVideosManagementView';

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

function promoThumbProps(video) {
  if (!video) return {};
  return {
    path: video.thumbnailPath || '',
    provider: video.provider || '',
    videoId: video.videoId || '',
    videoUrl: video.videoUrl || '',
  };
}

function PromoThumbnail({
  path,
  localUrl = '',
  alt = '',
  className = '',
  loading,
  showErrorText = false,
  provider = '',
  videoId = '',
  videoUrl = '',
}) {
  const [customFailed, setCustomFailed] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState('');
  const [fallbackFailed, setFallbackFailed] = useState(false);

  const customSrc = localUrl || (path ? resolveMediaUrl(path) : '');
  const instantFallback = providerThumbnailUrl({ provider, videoId });

  useEffect(() => {
    setCustomFailed(false);
    setFallbackUrl('');
    setFallbackFailed(false);
  }, [path, localUrl, customSrc, provider, videoId, videoUrl]);

  useEffect(() => {
    if (!customFailed || fallbackUrl || instantFallback) return undefined;
    if (provider !== 'vimeo' || !videoUrl) return undefined;
    let cancelled = false;
    fetchVimeoThumbnailUrl(videoUrl).then((url) => {
      if (!cancelled && url) setFallbackUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [customFailed, fallbackUrl, instantFallback, provider, videoUrl]);

  useEffect(() => {
    if (customFailed || fallbackUrl || instantFallback || provider !== 'vimeo' || !videoUrl) {
      return undefined;
    }
    if (customSrc) return undefined;
    let cancelled = false;
    fetchVimeoThumbnailUrl(videoUrl).then((url) => {
      if (!cancelled && url) setFallbackUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [customFailed, customSrc, fallbackUrl, instantFallback, provider, videoUrl]);

  const customThumbActive = Boolean(customSrc && !customFailed);
  const src = customThumbActive ? customSrc : fallbackUrl || instantFallback || '';
  const usingFallback = Boolean(src && !customThumbActive);

  if (!src) {
    if (showErrorText) {
      return (
        <div
          className={`promo-videos-thumb-placeholder promo-videos-thumb-placeholder--error${
            className ? ` ${className}` : ''
          }`}
        >
          <i className="fas fa-exclamation-triangle" aria-hidden="true" />
          <span>Upload a thumbnail</span>
        </div>
      );
    }
    return null;
  }

  if (fallbackFailed) {
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
    <>
      <img
        className={className}
        src={src}
        alt={alt}
        loading={loading}
        onError={() => {
          if (!customFailed && customSrc) {
            setCustomFailed(true);
            return;
          }
          setFallbackFailed(true);
        }}
      />
      {usingFallback && showErrorText ? (
        <span className="promo-videos-thumb-fallback-note">Custom image missing on server</span>
      ) : null}
    </>
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
  const [libraryUploading, setLibraryUploading] = useState(false);
  const [formUploading, setFormUploading] = useState(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [thumbDragActive, setThumbDragActive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const savedThumbOnEditRef = useRef('');
  const libraryUploadLockRef = useRef(false);
  const formUploadLockRef = useRef(false);
  const thumbInputRef = useRef(null);
  const libraryThumbInputRef = useRef(null);
  const thumbDragCounterRef = useRef(0);
  /** Paths created by upload in this modal session only (safe to orphan-cleanup on cancel). */
  const sessionUploadedPathsRef = useRef(new Set());

  const authHeaders = useCallback(() => buildAuthHeaders(AUTH_REALM.ADMIN), []);

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

  const formVideoMeta = useMemo(() => {
    if (!form.videoUrl?.trim()) return {};
    const parsed = parseVideoUrl(form.videoUrl);
    if (parsed.error) return {};
    return {
      provider: parsed.provider,
      videoId: parsed.videoId,
      videoUrl: parsed.videoUrl,
    };
  }, [form.videoUrl]);

  const hasThumbSelection = Boolean(form.thumbnailPath || form.localThumbUrl);

  const brokenGalleryCount = useMemo(
    () => galleryImages.filter((img) => img.onDisk === false).length,
    [galleryImages]
  );

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
    sessionUploadedPathsRef.current = new Set();
    setForm((prev) => {
      revokeLocalThumb(prev.localThumbUrl);
      return emptyForm();
    });
    setFormOpen(true);
  };

  const openEdit = (video) => {
    setEditingId(video.id);
    savedThumbOnEditRef.current = video.thumbnailPath || '';
    sessionUploadedPathsRef.current = new Set();
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
    if (saving || formUploading || formUploadLockRef.current) return;

    const pendingThumb = form.thumbnailPath;
    const savedThumb = savedThumbOnEditRef.current;
    const sessionUploads = sessionUploadedPathsRef.current;
    revokeLocalThumb(form.localThumbUrl);
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    savedThumbOnEditRef.current = '';
    sessionUploadedPathsRef.current = new Set();
    // Only remove brand-new files uploaded this session that were never saved to a video.
    if (
      pendingThumb &&
      pendingThumb !== savedThumb &&
      sessionUploads.has(pendingThumb)
    ) {
      cleanupPromoVideoThumbnail(pendingThumb);
    }
  };

  const onThumbFile = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    await processThumbFile(file);
  };

  const processThumbFile = async (file, { assignToForm = true } = {}) => {
    const lockRef = assignToForm ? formUploadLockRef : libraryUploadLockRef;
    const setUploading = assignToForm ? setFormUploading : setLibraryUploading;

    if (!file || lockRef.current) return null;
    if (!isAcceptedThumbFile(file)) {
      await showAlert({
        type: 'warning',
        title: 'Invalid file',
        message: 'Please use JPEG, PNG, WebP, or AVIF (max 8 MB).',
      });
      return null;
    }

    lockRef.current = true;
    let blobUrl = '';
    if (assignToForm) {
      blobUrl = URL.createObjectURL(file);
      setForm((f) => {
        revokeLocalThumb(f.localThumbUrl);
        return { ...f, localThumbUrl: blobUrl };
      });
    }
    setUploading(true);
    try {
      const path = await uploadPromoVideoThumbnail(file, '');
      sessionUploadedPathsRef.current.add(path);
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
      setUploading(false);
      lockRef.current = false;
    }
  };

  const onThumbDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (formUploading) return;
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
    if (formUploading) return;
    const file = e.dataTransfer?.files?.[0];
    processThumbFile(file);
  };

  const clearThumbSelection = () => {
    revokeLocalThumb(form.localThumbUrl);
    setForm((f) => ({ ...f, thumbnailPath: '', localThumbUrl: '' }));
  };

  const selectGalleryImage = (imagePath) => {
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
    if (libraryUploading || libraryUploadLockRef.current) return;
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
    if (formUploading || formUploadLockRef.current) return;
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
    if (formUploading || formUploadLockRef.current) {
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
      sessionUploadedPathsRef.current = new Set();
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
      title: `Move to ${QUARANTINE_LABEL}?`,
      message: `"${video.name}" will be hidden from the library and removed from homepage/about selection. Restore it from the ${QUARANTINE_LABEL} tab.`,
      confirmLabel: `Move to ${QUARANTINE_LABEL}`,
      cancelLabel: 'Cancel',
    });
    if (!ok) return;

    try {
      const res = await axios.delete(`${API_BASE_URL}/api/admin/promo-videos/${video.id}`, {
        headers: authHeaders(),
      });
      if (res.data?.selection) setSelection(res.data.selection);
      await fetchList();
      await showAlert({ type: 'success', title: `Moved to ${QUARANTINE_LABEL}`, message: `You can restore or delete it permanently from ${QUARANTINE_LABEL}.` });
    } catch (err) {
      await showAlert({
        type: 'error',
        title: FAILED_MOVE_TO_QUARANTINE_PHRASE,
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
    if (!video) return null;
    return (
      <div className="promo-videos-placement-card__preview">
        <PromoThumbnail {...promoThumbProps(video)} showErrorText />
      </div>
    );
  };

  return (
        <PromoVideosManagementView
            state={{
                isTrashView,
                openCreate,
                brokenGalleryCount,
                listTab,
                setListTab,
                trashCount,
                loading,
                activeVideos,
                selectedHome,
                selectedAbout,
                libraryThumbInputRef,
                onLibraryThumbFile,
                pickLibraryThumbnail,
                libraryUploading,
                galleryLoading,
                galleryImages,
                handleGallerySelect,
                handleDeleteGalleryImage,
                renderPlacementPreview,
                selection,
                updateSelection,
                videoOptions,
                videos,
                isHome,
                isAbout,
                handleRestore,
                handlePermanentDelete,
                openEdit,
                handleMoveToTrash,
                formOpen,
                closeForm,
                editingId,
                handleSave,
                form,
                setForm,
                thumbDragActive,
                formUploading,
                onThumbDragEnter,
                onThumbDragLeave,
                onThumbDragOver,
                onThumbDrop,
                hasThumbSelection,
                formVideoMeta,
                clearThumbSelection,
                thumbInputRef,
                onThumbFile,
                pickThumbnail,
                selectGalleryImage,
                saving,
                PromoThumbnail,
                promoThumbProps,
            }}
        />
    );
};

export default PromoVideosManagement;
