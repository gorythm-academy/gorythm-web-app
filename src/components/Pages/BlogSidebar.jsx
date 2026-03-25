import React from 'react';
import { Link } from 'react-router-dom';
import { blogCategories, blogPosts, blogTags } from './BlogData';

const BlogSidebar = ({
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

  const categoryCounts = blogPosts.reduce((acc, post) => {
    const key = post.category.toLowerCase().replace(/\s+/g, '-');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const tagCounts = blogPosts.reduce((acc, post) => {
    (post.tags || []).forEach((tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
    });
    return acc;
  }, {});

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
              aria-label="Blog search"
            >
              <input
                type="search"
                placeholder="Search by keywords..."
                className="blog-search-input"
                value={isControlled ? searchInputValue : undefined}
                onChange={isControlled ? (e) => setSearchInputValue(e.target.value) : undefined}
                aria-label="Search blog (press Enter to search)"
              />
              <span className="blog-search-icon" aria-hidden="true">
                ⌕
              </span>
            </form>
          </div>
        </div>

        <div className="blog-widget blog-widget-categories">
          <h3 className="blog-widget-title">Categories</h3>
          <ul className="blog-categories-list">
            {blogCategories.map((cat) => (
              <li key={cat.slug}>
                <Link to={`/blog/category/${cat.slug}`}>{cat.name}</Link>
                <span className="blog-cat-count">({categoryCounts[cat.slug] || 0})</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="blog-widget blog-widget-recent">
          <h3 className="blog-widget-title">Recent Posts</h3>
          <ul className="blog-recent-list">
            {blogPosts.slice(0, 3).map((post) => (
              <li key={post.id}>
                <Link to={`/blog/${post.slug}`} className="blog-recent-item">
                  <span className="blog-recent-thumb">
                    <img src={post.image} alt={post.title || 'Blog post'} loading="lazy" width={280} height={175} sizes="280px" />
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

        <div className="blog-widget blog-widget-tags">
          <h3 className="blog-widget-title">Tags</h3>
          <div className="blog-tags-wrap">
            {blogTags.map((tag) => (
              <Link key={tag.slug} to={`/blog?tag=${tag.slug}`} className="blog-tag">
                {tag.name} ({tagCounts[tag.slug] || 0})
              </Link>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default BlogSidebar;
