import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import ResearchPostImage from './ResearchPostImage';

const ResearchSidebar = ({
  posts = [],
  searchInputValue,
  setSearchInputValue,
  onSearchSubmit,
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
      .map(([slug, count]) => ({ slug, name: slug, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [posts]);

  return (
    <aside ref={asideRef} className="blog-sidebar" style={asideStyle}>
      <div
        ref={stickyRef}
        className={`blog-sidebar-sticky blog-sidebar-sticky--${stickyMode}`}
        style={stickyStyle}
      >
        <div className="blog-widget blog-widget-search">
          <h3 className="blog-widget-title">Search</h3>
          <div className="blog-search-wrap">
            <form
              className="blog-search-form"
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
                className="blog-search-input"
                value={isControlled ? searchInputValue : undefined}
                onChange={isControlled ? (e) => setSearchInputValue(e.target.value) : undefined}
                aria-label="Search research (press Enter to search)"
              />
              <span className="blog-search-icon" aria-hidden="true">
                ⌕
              </span>
            </form>
          </div>
        </div>

        <div className="blog-widget blog-widget-recent">
          <h3 className="blog-widget-title">Recent Articles</h3>
          <ul className="blog-recent-list">
            {posts.slice(0, 3).map((post) => (
              <li key={post.id || post.slug}>
                <Link to={`/research/${post.slug}`} className="blog-recent-item">
                  <span className="blog-recent-thumb research-image-canvas research-image-canvas--thumb">
                    <ResearchPostImage
                      post={post}
                      loading="lazy"
                      width={280}
                      height={175}
                      sizes="280px"
                    />
                  </span>
                  <span className="blog-recent-text">
                    <span className="blog-recent-title">{post.title}</span>
                    <span className="blog-recent-date">{post.date}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {tagEntries.length > 0 ? (
          <div className="blog-widget blog-widget-tags">
            <h3 className="blog-widget-title">Tags</h3>
            <div className="blog-tags-wrap">
              {tagEntries.map((tag) => (
                <Link key={tag.slug} to={`/research?tag=${tag.slug}`} className="blog-tag">
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
