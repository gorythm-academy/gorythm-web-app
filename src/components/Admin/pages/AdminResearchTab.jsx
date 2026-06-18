import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import {
  cleanupResearchImage,
  deleteResearchGalleryImage,
  renameResearchImage,
  uploadResearchImage,
} from '../../../utils/fileUploadApi';
import { resolveMediaUrl } from '../../../utils/resolveMediaUrl';
import { slugifyResearchTitle } from '../../../utils/researchPosts';
import { useAdminDialog } from '../AdminDialogContext';
import LmsTrashTabs from '../shared/LmsTrashTabs';
import LmsCollapsibleFormPanel from '../shared/LmsCollapsibleFormPanel';

const baseNameFromImagePath = (imagePath) => {
  if (!imagePath) return '';
  const filename = imagePath.split('/').pop() || '';
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
};

const extFromFileName = (name) => {
  const match = String(name || '').match(/(\.[a-z0-9]+)$/i);
  const ext = match?.[1]?.toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(ext) ? ext : '.webp';
};

const isAcceptedImageFile = (file) => {
  if (!file) return false;
  const ext = extFromFileName(file.name);
  const mime = String(file.type || '').toLowerCase();
  return (
    mime.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(ext)
  );
};

const EMPTY_FORM = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  imagePath: '',
  tags: '',
  author: 'Gorythm Team',
  publishedAt: new Date().toISOString().slice(0, 10),
  isPublished: true,
};

const AdminResearchTab = () => {
  const { showAlert, showConfirm } = useAdminDialog();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [imageFileName, setImageFileName] = useState('');
  const [pendingImageExt, setPendingImageExt] = useState('.webp');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [listMode, setListMode] = useState('active');
  const [trashCount, setTrashCount] = useState(0);
  const [formExpanded, setFormExpanded] = useState(true);
  const savedImageRef = useRef('');
  const imageUploadLockRef = useRef(false);
  const imageDragCounterRef = useRef(0);
  const imageInputRef = useRef(null);
  const slugTouchedRef = useRef(false);

  const authHeaders = useCallback(() => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const trashQ = listMode === 'trash' ? '?trash=1' : '';
      const res = await axios.get(`${API_BASE_URL}/api/admin/research${trashQ}`, { headers: authHeaders() });
      setPosts(res.data?.posts || []);
      if (typeof res.data?.trashCount === 'number') setTrashCount(res.data.trashCount);
    } catch (err) {
      showAlert(err.response?.data?.error || err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, showAlert, listMode]);

  const fetchGalleryImages = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    setGalleryLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/admin/research-images`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGalleryImages(res.data?.images || []);
    } catch {
      setGalleryImages([]);
    } finally {
      setGalleryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
    fetchGalleryImages();
  }, [loadPosts, fetchGalleryImages]);

  const resetForm = () => {
    const pending = form.imagePath;
    const saved = savedImageRef.current;
    setForm(EMPTY_FORM);
    setEditingId(null);
    setImageFileName('');
    setPendingImageExt('.webp');
    savedImageRef.current = '';
    slugTouchedRef.current = false;
    if (pending && pending !== saved) {
      cleanupResearchImage(pending);
    }
  };

  const startEdit = (post) => {
    setFormExpanded(true);
    savedImageRef.current = post.imagePath || '';
    slugTouchedRef.current = true;
    setEditingId(post.id);
    setForm({
      title: post.title || '',
      slug: post.slug || '',
      excerpt: post.excerpt || '',
      content: post.content || '',
      imagePath: post.imagePath || '',
      tags: (post.tags || []).join(', '),
      author: post.author || 'Gorythm Team',
      publishedAt: post.publishedAt
        ? new Date(post.publishedAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      isPublished: post.isPublished !== false,
    });
    if (post.imagePath) {
      const filename = post.imagePath.split('/').pop() || '';
      setImageFileName(baseNameFromImagePath(post.imagePath));
      setPendingImageExt(extFromFileName(filename));
    } else {
      setImageFileName('');
      setPendingImageExt('.webp');
    }
  };

  const onTitleChange = (title) => {
    setForm((f) => ({
      ...f,
      title,
      slug: slugTouchedRef.current ? f.slug : slugifyResearchTitle(title),
    }));
  };

  const processResearchImageFile = async (file) => {
    if (!file || imageUploadLockRef.current) return;
    if (!isAcceptedImageFile(file)) {
      showAlert('Please use JPEG, PNG, WebP, or AVIF (max 8 MB).', 'warning');
      return;
    }

    const ext = extFromFileName(file.name);
    const originalName = (file.name || '').replace(/^.*[\\/]/, '');
    const filenameForUpload = imageFileName.trim() || originalName;

    setPendingImageExt(ext);
    if (!imageFileName.trim()) {
      setImageFileName(baseNameFromImagePath(originalName));
    }

    imageUploadLockRef.current = true;
    const replacePath = form.imagePath;
    setUploadingImage(true);
    try {
      const path = await uploadResearchImage(file, replacePath, filenameForUpload);
      setForm((f) => ({ ...f, imagePath: path }));
      setImageFileName(baseNameFromImagePath(path));
      setPendingImageExt(extFromFileName(path.split('/').pop()));
      await fetchGalleryImages();
    } catch (err) {
      showAlert(err.message || 'Could not upload image', 'error');
    } finally {
      setUploadingImage(false);
      imageUploadLockRef.current = false;
    }
  };

  const onImageFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    processResearchImageFile(file);
  };

  const onImageDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploadingImage) return;
    imageDragCounterRef.current += 1;
    setImageDragActive(true);
  };

  const onImageDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    imageDragCounterRef.current -= 1;
    if (imageDragCounterRef.current <= 0) {
      imageDragCounterRef.current = 0;
      setImageDragActive(false);
    }
  };

  const onImageDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onImageDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    imageDragCounterRef.current = 0;
    setImageDragActive(false);
    if (uploadingImage) return;
    const file = e.dataTransfer?.files?.[0];
    processResearchImageFile(file);
  };

  const selectGalleryImage = (imagePath) => {
    setForm((f) => ({ ...f, imagePath }));
    const filename = imagePath.split('/').pop() || '';
    setImageFileName(baseNameFromImagePath(imagePath));
    setPendingImageExt(extFromFileName(filename));
  };

  const handleDeleteGalleryImage = async (image, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!image?.path) return;
    if (image.usedBy > 0) {
      const names = image.usedByTitles?.filter(Boolean).join(', ');
      showAlert(
        names
          ? `Used by: ${names}. Edit those articles, clear the image, save, then delete.`
          : `This image is used by ${image.usedBy} article(s). Clear it from those articles first.`,
        'warning'
      );
      return;
    }
    const confirmed = await showConfirm({
      title: 'Delete image?',
      message: 'This will permanently remove the file from the server.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    try {
      await deleteResearchGalleryImage(image.path);
      if (form.imagePath === image.path) {
        setForm((f) => ({ ...f, imagePath: '' }));
        setImageFileName('');
      }
      await fetchGalleryImages();
      showAlert('Image deleted.', 'success');
    } catch (err) {
      showAlert(err.message || 'Could not delete image', 'error');
    }
  };

  const savePost = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.title.trim()) {
      showAlert('Title is required.', 'error');
      return;
    }

    let imagePath = (form.imagePath || '').trim();
    if (imagePath && imageFileName.trim()) {
      const currentFilename = imagePath.split('/').pop() || '';
      const ext = extFromFileName(currentFilename);
      const nameInput = imageFileName.trim();
      const desiredFilename = nameInput.includes('.')
        ? nameInput
        : `${nameInput}${ext}`;
      if (desiredFilename.toLowerCase() !== currentFilename.toLowerCase()) {
        try {
          imagePath = await renameResearchImage(imagePath, desiredFilename);
        } catch (err) {
          showAlert(err.message || 'Could not rename image file', 'error');
          return;
        }
      }
    }

    setSaving(true);
    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim() || slugifyResearchTitle(form.title),
      excerpt: form.excerpt.trim(),
      content: form.content,
      imagePath,
      tags: form.tags,
      author: form.author.trim() || 'Gorythm Team',
      publishedAt: form.publishedAt,
      isPublished: form.isPublished,
    };
    try {
      if (editingId) {
        await axios.patch(`${API_BASE_URL}/api/admin/research/${editingId}`, payload, {
          headers: authHeaders(),
        });
        showAlert('Research article updated.', 'success');
      } else {
        await axios.post(`${API_BASE_URL}/api/admin/research`, payload, { headers: authHeaders() });
        showAlert('Research article published.', 'success');
      }
      savedImageRef.current = imagePath;
      resetForm();
      await Promise.all([loadPosts(), fetchGalleryImages()]);
    } catch (err) {
      showAlert(err.response?.data?.error || err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const ids = posts.map((p) => p.id);
    const all = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    setSelectedIds(all ? new Set() : new Set(ids));
  };

  const handlePosts = async (action, ids, confirmText) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm(confirmText);
    if (!ok) return;
    setDeleting(true);
    try {
      const headers = authHeaders();
      let res;
      if (action === 'trash') {
        res =
          idList.length === 1
            ? await axios.delete(`${API_BASE_URL}/api/admin/research/${idList[0]}`, { headers })
            : await axios.post(`${API_BASE_URL}/api/admin/research/bulk-delete`, { ids: idList }, { headers });
      } else if (action === 'restore') {
        res =
          idList.length === 1
            ? await axios.patch(`${API_BASE_URL}/api/admin/research/${idList[0]}/restore`, {}, { headers })
            : await axios.post(`${API_BASE_URL}/api/admin/research/bulk-restore`, { ids: idList }, { headers });
      } else {
        res =
          idList.length === 1
            ? await axios.delete(`${API_BASE_URL}/api/admin/research/${idList[0]}/permanent`, { headers })
            : await axios.post(`${API_BASE_URL}/api/admin/research/bulk-permanent-delete`, { ids: idList }, { headers });
      }
      const data = res.data || {};
      const n = data.deletedCount ?? data.restoredCount ?? idList.length;
      const verb = action === 'trash' ? 'moved to trash' : action === 'restore' ? 'restored' : 'deleted forever';
      showAlert(`${n} article${n !== 1 ? 's' : ''} ${verb}.`, 'success');
      setSelectedIds(new Set());
      if (editingId && idList.includes(editingId)) resetForm();
      await Promise.all([loadPosts(), fetchGalleryImages()]);
    } catch (err) {
      showAlert(err.response?.data?.error || err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const isTrashView = listMode === 'trash';

  return (
    <div className="lms-panel">
      <LmsCollapsibleFormPanel
        title={editingId ? 'Edit research article' : 'Add Research Article'}
        subtitle={editingId ? 'Update article content and cover' : 'Publish to the public Research section'}
        icon="fa-newspaper"
        tone="violet"
        expanded={formExpanded}
        onToggle={() => setFormExpanded((v) => !v)}
      >
      <form className="lms-form-grid portal-form-card" onSubmit={savePost} autoComplete="off">

        <label className="lms-field-label">
          <span>Title</span>
          <input
            value={form.title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Article title"
            required
            autoComplete="off"
          />
        </label>

        <label className="lms-field-label">
          <span>URL slug</span>
          <input
            value={form.slug}
            onChange={(e) => {
              slugTouchedRef.current = true;
              setForm({ ...form, slug: e.target.value });
            }}
            placeholder="url-friendly-slug"
            autoComplete="off"
          />
        </label>

        <label className="lms-field-label">
          <span>Author</span>
          <input
            value={form.author}
            onChange={(e) => setForm({ ...form, author: e.target.value })}
            placeholder="Author name"
            autoComplete="off"
          />
        </label>

        <label className="lms-field-label">
          <span>Published date</span>
          <input
            type="date"
            value={form.publishedAt}
            onChange={(e) => setForm({ ...form, publishedAt: e.target.value })}
          />
        </label>

        <label className="lms-field-label">
          <span>Tags (comma-separated)</span>
          <input
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="e.g. quran, education, faith"
            autoComplete="off"
          />
        </label>

        <label className="lms-field-label" style={{ gridColumn: '1 / -1' }}>
          <span>Excerpt</span>
          <textarea
            value={form.excerpt}
            onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
            placeholder="Short summary shown on listing cards"
            rows={3}
          />
        </label>

        <div className="research-image-upload">
          <span className="research-image-upload__label">Cover image</span>
          <div
            className={`research-image-upload__dropzone${imageDragActive ? ' is-dragging' : ''}${
              uploadingImage ? ' is-uploading' : ''
            }`}
            onDragEnter={onImageDragEnter}
            onDragLeave={onImageDragLeave}
            onDragOver={onImageDragOver}
            onDrop={onImageDrop}
          >
            <div className="research-image-upload__row">
              <div className="research-image-upload__preview">
                {form.imagePath ? (
                  <img src={resolveMediaUrl(form.imagePath)} alt="Cover preview" />
                ) : (
                  <div className="research-image-upload__preview-empty">
                    <i className="fas fa-image" aria-hidden />
                    <span>No image</span>
                  </div>
                )}
                {form.imagePath ? (
                  <button
                    type="button"
                    className="research-image-upload__clear"
                    onClick={() => {
                      setForm((f) => ({ ...f, imagePath: '' }));
                      setImageFileName('');
                    }}
                    title="Clear"
                  >
                    <i className="fas fa-times" aria-hidden />
                  </button>
                ) : null}
              </div>
              <div className="research-image-upload__actions">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
                  onChange={onImageFile}
                  hidden
                />
                <button
                  type="button"
                  className="research-image-upload__pick"
                  disabled={uploadingImage}
                  onClick={() => imageInputRef.current?.click()}
                >
                  <i className={`fas ${uploadingImage ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'}`} aria-hidden />
                  {uploadingImage ? 'Uploading…' : form.imagePath ? 'Replace image' : 'Upload image'}
                </button>
                <p className="research-image-upload__hint">JPEG, PNG, WebP or AVIF · large images are auto-compressed · drag &amp; drop supported</p>
              </div>
            </div>
            {galleryImages.length > 0 ? (
              <div className="research-image-upload__gallery">
                {galleryImages.map((img) => {
                  const isSelected = form.imagePath === img.path;
                  return (
                    <div
                      key={img.path}
                      className={`course-image-section__tile${isSelected ? ' is-selected' : ''}`}
                      style={{ margin: 0 }}
                    >
                      <button
                        type="button"
                        className="course-image-section__tile-select"
                        onClick={() => selectGalleryImage(img.path)}
                        title={img.usedByTitles?.join(', ') || 'Select image'}
                      >
                        <img src={resolveMediaUrl(img.path)} alt="" loading="lazy" />
                        {isSelected ? (
                          <span className="course-image-section__tile-badge">
                            <i className="fas fa-check" aria-hidden />
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className="course-image-section__tile-delete"
                        onClick={(e) => handleDeleteGalleryImage(img, e)}
                        title="Delete image"
                      >
                        <i className="fas fa-trash-alt" aria-hidden />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        {editingId && posts.find((p) => p.id === editingId)?.contentFormat === 'series-table' ? (
          <p className="lms-field-hint" style={{ gridColumn: '1 / -1' }}>
            This research uses the <strong>series table</strong> layout (accordion + table). Edit the title, cover image, tags, and publish status here. To update table rows, use the seed script or contact your developer.
          </p>
        ) : (
          <label className="lms-field-label" style={{ gridColumn: '1 / -1' }}>
            <span>Article body</span>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Write the full article. Use blank lines between paragraphs, or basic HTML."
              rows={12}
            />
          </label>
        )}

        <label className="lms-field-label lms-field-label--checkbox">
          <input
            type="checkbox"
            checked={form.isPublished}
            onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
          />
          <span>Published (visible on website)</span>
        </label>

        <div className="lms-form-actions" style={{ gridColumn: '1 / -1' }}>
          <button type="submit" disabled={saving || uploadingImage}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Publish article'}
          </button>
          {editingId ? (
            <button type="button" className="lms-btn-secondary" onClick={resetForm}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>
      </LmsCollapsibleFormPanel>

      <div className="lms-resources-library">
        <div className="lms-list-toolbar">
          <h3>Research articles (uploaded)</h3>
        </div>

        <LmsTrashTabs
          mode={listMode}
          trashCount={trashCount}
          onChange={(mode) => {
            setListMode(mode);
            setSelectedIds(new Set());
          }}
        />

        {loading ? <p className="lms-empty">Loading…</p> : null}

        {!loading && selectedIds.size > 0 ? (
          <div className="lms-resources-bulk-bar">
            <span>{selectedIds.size} selected</span>
            <div className="lms-form-actions">
              <button type="button" className="lms-btn-secondary" onClick={() => setSelectedIds(new Set())}>
                Clear
              </button>
              {isTrashView ? (
                <>
                  <button
                    type="button"
                    className="lms-btn-restore"
                    onClick={() => handlePosts('restore', [...selectedIds], `Restore ${selectedIds.size} article(s)?`)}
                    disabled={deleting}
                  >
                    <i className="fas fa-undo" aria-hidden /> Restore selected
                  </button>
                  <button
                    type="button"
                    className="lms-btn-delete-forever"
                    onClick={() =>
                      handlePosts('permanent', [...selectedIds], `Permanently delete ${selectedIds.size} article(s)?`)
                    }
                    disabled={deleting}
                  >
                    <i className="fas fa-trash-alt" aria-hidden /> Delete forever
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="lms-btn-trash"
                  onClick={() => handlePosts('trash', [...selectedIds], `Move ${selectedIds.size} article(s) to trash?`)}
                  disabled={deleting}
                >
                  <i className="fas fa-trash" aria-hidden /> Move to trash
                </button>
              )}
            </div>
          </div>
        ) : null}

        {!loading ? (
          <div className="lms-table-wrap">
            <table className="lms-table lms-table--resources">
              <thead>
                <tr>
                  <th className="lms-table-check-col">
                    <input
                      type="checkbox"
                      checked={posts.length > 0 && posts.every((p) => selectedIds.has(p.id))}
                      onChange={toggleAll}
                      aria-label="Select all articles"
                    />
                  </th>
                  <th>Title</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id} className={selectedIds.has(post.id) ? 'lms-table-row--selected' : ''}>
                    <td className="lms-table-check-col">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(post.id)}
                        onChange={() => toggleSelect(post.id)}
                        aria-label={`Select ${post.title}`}
                      />
                    </td>
                    <td>{post.title}</td>
                    <td>{post.date || '—'}</td>
                    <td>
                      <span className="lms-resource-type-pill">
                        {post.contentFormat === 'series-table' ? 'Series table' : 'Article'}
                      </span>
                      {' '}
                      <span className="lms-resource-type-pill">
                        {post.isPublished !== false ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="lms-table-actions">
                      {isTrashView ? (
                        <>
                          <button
                            type="button"
                            className="lms-btn-restore"
                            onClick={() => handlePosts('restore', [post.id], 'Restore this article?')}
                            disabled={deleting}
                          >
                            <i className="fas fa-undo" aria-hidden /> Restore
                          </button>
                          <button
                            type="button"
                            className="lms-btn-delete-forever"
                            onClick={() => handlePosts('permanent', [post.id], 'Permanently delete this article?')}
                            disabled={deleting}
                          >
                            <i className="fas fa-trash-alt" aria-hidden /> Delete forever
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="lms-btn-secondary" onClick={() => startEdit(post)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="lms-btn-trash"
                            onClick={() => handlePosts('trash', [post.id], 'Move this article to trash?')}
                            disabled={deleting}
                          >
                            <i className="fas fa-trash" aria-hidden /> Trash
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!posts.length ? (
              <p className="lms-empty">
                {isTrashView
                  ? 'Trash is empty.'
                  : 'No uploaded articles yet. Built-in research posts remain on the site until you add new ones here.'}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default AdminResearchTab;
