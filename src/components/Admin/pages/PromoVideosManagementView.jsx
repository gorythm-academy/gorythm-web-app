import RequiredMark from '../../shared/RequiredMark';
import { QUARANTINE_LABEL, MOVE_TO_QUARANTINE_PHRASE } from '../../../utils/adminListLabels';
import AdminMediaGallery from '../shared/AdminMediaGallery';

export function PromoVideosManagementView({ state }) {
  const {
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
  } = state;

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
          Add Video
        </button>
        ) : null}
      </header>

      {brokenGalleryCount > 0 ? (
        <div className="promo-videos-storage-warn" role="status">
          <i className="fas fa-exclamation-triangle" aria-hidden="true" />
          <div>
            <strong>{brokenGalleryCount} thumbnail file{brokenGalleryCount === 1 ? '' : 's'} missing on disk</strong>
            <p>
              MongoDB still has the image path, but the file returns <strong>404 on the server</strong>{' '}
              (not in <code>uploads/video-thumbnails</code>). Re-upload the thumbnail here and click{' '}
              <strong>Save</strong> on the video. On your VPS, set{' '}
              <code>UPLOAD_ROOT=/var/data/gorythm/uploads</code> so deploys do not wipe uploads.
            </p>
          </div>
        </div>
      ) : null}

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
          <i className="fas fa-archive" aria-hidden /> {QUARANTINE_LABEL}
          {trashCount > 0 ? <span className="admin-list-tab-badge">{trashCount}</span> : null}
        </button>
      </div>

      <div className="promo-videos-stats">
        <div className="promo-videos-stat">
          <div className="promo-videos-stat__icon promo-videos-stat__icon--total">
            <i className="fas fa-film" aria-hidden="true" />
          </div>
          <div>
            <span className="promo-videos-stat__label">In Library</span>
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
            <span className="promo-videos-stat__label">About Page</span>
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
                Thumbnail Library
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
              disabled={libraryUploading}
            >
              <i
                className={`fas ${libraryUploading ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'}`}
                aria-hidden="true"
              />
              {libraryUploading ? 'Uploading…' : 'Upload new image'}
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
          <AdminMediaGallery
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
        <h2 id="promo-placement-heading">Displayed on Site</h2>
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
                <span>No Video Selected</span>
              </div>
            )}
            <div className="promo-videos-placement-card__field">
              <label htmlFor="promo-home-select">Choose Video</label>
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
                <p className="promo-videos-placement-card__title">About Us</p>
                <p className="promo-videos-placement-card__sub">About Page Video Section</p>
              </div>
            </div>
            {selectedAbout ? (
              renderPlacementPreview(selectedAbout)
            ) : (
              <div className="promo-videos-placement-card__preview-empty">
                <i className="fas fa-image" aria-hidden="true" />
                <span>No Video Selected</span>
              </div>
            )}
            <div className="promo-videos-placement-card__field">
              <label htmlFor="promo-about-select">Choose Video</label>
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
          Videos in {QUARANTINE_LABEL} are hidden from the site. Use <strong>Restore</strong> or <strong>Delete forever</strong> below.
        </p>
      )}

      <section className="promo-videos-library" aria-labelledby="promo-library-heading">
        <h2 id="promo-library-heading">{isTrashView ? `${QUARANTINE_LABEL} Videos` : 'Video Library'}</h2>

        {loading ? (
          <div className="promo-videos-loading">
            <i className="fas fa-spinner fa-spin" aria-hidden="true" />
            Loading videos…
          </div>
        ) : videos.length === 0 ? (
          <div className="promo-videos-empty">
            <div className="promo-videos-empty__icon">
              <i className={`fas ${isTrashView ? 'fa-archive' : 'fa-clapperboard'}`} aria-hidden="true" />
            </div>
            <h3>{isTrashView ? `${QUARANTINE_LABEL} is empty` : 'No videos yet'}</h3>
            <p>
              {isTrashView
                ? `Videos you move to ${QUARANTINE_LABEL} will appear here.`
                : 'Add your first promo video with a thumbnail and Vimeo or YouTube link.'}
            </p>
            {!isTrashView ? (
            <button type="button" className="promo-videos-add-btn" onClick={openCreate}>
              <i className="fas fa-plus" aria-hidden="true" />
              Add Video
            </button>
            ) : null}
          </div>
        ) : (
          <div className="promo-videos-grid">
            {videos.map((v) => (
              <article key={v.id} className={`promo-videos-card${isTrashView ? ' promo-videos-card--trash' : ''}`}>
                <div className="promo-videos-card__media">
                  <PromoThumbnail {...promoThumbProps(v)} loading="lazy" showErrorText />
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
                          <i className="fas fa-archive" aria-hidden="true" /> {MOVE_TO_QUARANTINE_PHRASE}
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
              <h2 id="promo-video-form-title">{editingId ? 'Edit Video' : 'Add Video'}</h2>
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
                  <span>Display Name <RequiredMark /></span>
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
                  <span>Vimeo or YouTube URL <RequiredMark /></span>
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
                    }${formUploading ? ' is-uploading' : ''}`}
                    onDragEnter={onThumbDragEnter}
                    onDragLeave={onThumbDragLeave}
                    onDragOver={onThumbDragOver}
                    onDrop={onThumbDrop}
                  >
                    {thumbDragActive ? (
                      <div className="course-image-section__drop-overlay">
                        <i className="fas fa-cloud-upload-alt" aria-hidden="true" />
                        <span>Drop Image Here</span>
                      </div>
                    ) : null}

                    <div className="course-image-section__header">
                      <label htmlFor="promo-video-thumb-field">Thumbnail <RequiredMark /></label>
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
                            {...formVideoMeta}
                          />
                        ) : (
                          <div className="course-image-section__preview-empty">
                            <i className="fas fa-image" aria-hidden="true" />
                            <span>No Thumbnail</span>
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
                          disabled={formUploading}
                        >
                          <i
                            className={`fas ${formUploading ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'}`}
                            aria-hidden="true"
                          />
                          {formUploading
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

                    <AdminMediaGallery
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
                  className="promo-videos-modal__save btn-save"
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
}
