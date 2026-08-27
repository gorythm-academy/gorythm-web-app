import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import ResearchPostImage from './ResearchPostImage';
import { buildResearchListQuery, formatTagLabel } from '../../utils/researchListParams';

const ResearchSidebar = ({
  posts = [],
  searchInputValue,
  setSearchInputValue,
  onSearchSubmit,
  activeTagSlug = '',
  asideRef,
  stickyRef,
  stickyMode = 'static',
  stickyStyle,
  asideStyle,
}) => {
  const isControlled = typeof setSearchInputValue === 'function' && typeof onSearchSubmit === 'function';

  const tagEntries = useMemo(() => {
    const counts = {};
    posts.forEach((post) => {
      (post.tags || []).forEach((tag) => {
        const key = String(tag).toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([slug, count]) => ({ slug, name: formatTagLabel(slug), count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [posts]);

  return (
    <aside ref={asideRef} className="research-sidebar" style={asideStyle}>
      <div
        ref={stickyRef}
        className={`research-sidebar-sticky research-sidebar-sticky--${stickyMode}`}
        style={stickyStyle}
      >
        <div className="research-widget research-widget-search">
          <h3 className="research-widget-title">Search</h3>
          <div className="research-search-wrap">
            <form
              className="research-search-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (isControlled) onSearchSubmit();
              }}
              role="search"
              aria-label="Research search"
            >
              <input
                type="search"
                placeholder="Search by keywords..."
                className="research-search-input"
                value={isControlled ? searchInputValue : undefined}
                onChange={isControlled ? (e) => setSearchInputValue(e.target.value) : undefined}
                aria-label="Search research"
              />
              <button type="submit" className="research-search-submit" aria-label="Search">
                ⌕
              </button>
            </form>
          </div>
        </div>

        <div className="research-widget research-widget-recent">
          <h3 className="research-widget-title">Recent Articles</h3>
          <ul className="research-recent-list">
            {posts.slice(0, 3).map((post) => (
              <li key={post.id || post.slug}>
                <Link to={`/research/${post.slug}`} className="research-recent-item">
                  <span className="research-recent-thumb research-image-canvas research-image-canvas--thumb">
                    <ResearchPostImage
                      post={post}
                      loading="lazy"
                      width={280}
                      height={175}
                      sizes="280px"
                    />
                  </span>
                  <span className="research-recent-text">
                    <span className="research-recent-title">{post.title}</span>
                    <span className="research-recent-date">{post.date}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {tagEntries.length > 0 ? (
          <div className="research-widget research-widget-tags">
            <h3 className="research-widget-title">Tags</h3>
            <div className="research-tags-wrap">
              {tagEntries.map((tag) => (
                <Link
                  key={tag.slug}
                  to={`/research${buildResearchListQuery({ tag: tag.slug })}`}
                  className={`research-tag${activeTagSlug === tag.slug ? ' research-tag--active' : ''}`}
                  aria-current={activeTagSlug === tag.slug ? 'true' : undefined}
                >
                  {tag.name} ({tag.count})
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
};

export default ResearchSidebar;
