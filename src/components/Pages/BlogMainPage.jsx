import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import BlogSidebar from './BlogSidebar';
import { blogPosts, categoryFromSlug, tagFromSlug } from './BlogData';
import { useStickyPanel } from './useStickyPanel';
import { API_BASE_URL } from '../../config/constants';
import './BlogMainPage.scss';

export const BlogMainPage = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');
  const [commentCounts, setCommentCounts] = useState({});
  const [searchParams] = useSearchParams();
  const layoutRef = useRef(null);
  const mainRef = useRef(null);
  const asideRef = useRef(null);
  const stickyRef = useRef(null);
  const activeCategorySlug = searchParams.get('category');
  const activeTagSlug = searchParams.get('tag');
  const activeCategory = activeCategorySlug ? categoryFromSlug(activeCategorySlug) : null;
  const activeTag = activeTagSlug ? tagFromSlug(activeTagSlug) : null;
  const keywords = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const filteredPosts = blogPosts.filter((post) => {
    const categorySlug = post.category.toLowerCase().replace(/\s+/g, '-');
    const categoryMatch = activeCategorySlug ? categorySlug === activeCategorySlug : true;
    const tagMatch = activeTagSlug ? (post.tags || []).includes(activeTagSlug) : true;
    const text = `${post.title} ${post.excerpt} ${post.category}`.toLowerCase();
    const textMatch = keywords.length === 0 || keywords.every((kw) => text.includes(kw));
    return categoryMatch && tagMatch && textMatch;
  });

  const POSTS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / POSTS_PER_PAGE));
  const pageParam = searchParams.get('page');
  const currentPage = Math.min(Math.max(1, parseInt(pageParam || '1', 10)), totalPages);
  const paginatedPosts = filteredPosts.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE
  );
  const showPagination = filteredPosts.length > POSTS_PER_PAGE;

  const setPage = (n) => {
    const next = Math.max(1, Math.min(n, totalPages));
    const params = new URLSearchParams(searchParams);
    if (next === 1) params.delete('page');
    else params.set('page', String(next));
    return params.toString() ? `?${params.toString()}` : '';
  };

  const { stickyMode, stickyStyle, asideStyle } = useStickyPanel({
    layoutRef,
    boundaryRef: mainRef,
    asideRef,
    stickyRef,
    deps: [],
  });

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/blog/counts`).then((res) => {
      if (res.data?.success && res.data.counts) setCommentCounts(res.data.counts);
    }).catch(() => {});
  }, []);

  return (
    <div className="blog-page scheme_dark">
      <div className="blog-page-inner">
        <header className="blog-page-header">
          <h1 className="blog-page-title">Blog</h1>
          <span className="blog-page-header-arrow" aria-hidden="true" />
        </header>

        <div ref={layoutRef} className="blog-layout">
          <main ref={mainRef} className="blog-main">
            {(activeCategory || activeTag) && (
              <section className="blog-filter-intro">
                <p className="blog-filter-kicker">
                  {activeCategory ? 'Category' : 'Tag'}
                </p>
                <h2 className="blog-filter-title">
                  {activeCategory ? activeCategory.name : activeTag.name}
                </h2>
                <p className="blog-filter-copy">
                  {activeCategory ? activeCategory.description : activeTag.description}
                </p>
                <Link to="/blog" className="blog-filter-clear">View all posts</Link>
              </section>
            )}

            {paginatedPosts.map((post) => (
              <article key={post.id} className="blog-post-card">
                <div
                  className="blog-post-link"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/blog/${post.slug}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/blog/${post.slug}`)}
                >
                  <div className="blog-post-image-wrap">
                    <img src={post.image} alt={post.title || 'Blog post'} loading="lazy" width={400} height={250} sizes="(min-width: 768px) 400px, 100vw" />
                  </div>
                  <div className="blog-post-meta">
                    <span className="blog-post-date">{post.date}</span>
                    <span className="blog-post-sep">·</span>
                    <span className="blog-post-author">by {post.author}</span>
                    <span className="blog-post-sep">·</span>
                    <span className="blog-post-category">{post.category}</span>
                    <span className="blog-post-sep">·</span>
                    <Link
                      to={`/blog/${post.slug}#comments`}
                      className="blog-post-comments"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(commentCounts[post.slug] ?? 0)} Comment{(commentCounts[post.slug] ?? 0) !== 1 ? 's' : ''}
                    </Link>
                  </div>
                  <h2 className="blog-post-title">{post.title}</h2>
                  <p className="blog-post-excerpt">{post.excerpt}</p>
                  <span className="blog-post-read">Read More</span>
                </div>
              </article>
            ))}

            {filteredPosts.length > 0 ? (
              <>
                {showPagination && (
                  <nav className="blog-pagination" aria-label="Blog pagination">
                    <Link
                      to={`/blog${setPage(currentPage - 1)}`}
                      className="blog-pagination-prev"
                      aria-label="Previous page"
                      style={{ pointerEvents: currentPage <= 1 ? 'none' : undefined, opacity: currentPage <= 1 ? 0.5 : 1 }}
                    >
                      ←
                    </Link>
                    <span className="blog-pagination-nums">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                        <Link
                          key={n}
                          to={`/blog${setPage(n)}`}
                          className={`blog-pagination-num${n === currentPage ? ' active' : ''}`}
                        >
                          {n}
                        </Link>
                      ))}
                    </span>
                    <Link
                      to={`/blog${setPage(currentPage + 1)}`}
                      className="blog-pagination-next"
                      aria-label="Next page"
                      style={{ pointerEvents: currentPage >= totalPages ? 'none' : undefined, opacity: currentPage >= totalPages ? 0.5 : 1 }}
                    >
                      →
                    </Link>
                  </nav>
                )}
              </>
            ) : null}
            {filteredPosts.length === 0 ? (
              <div className="blog-empty-state">
                <h3>No matching posts found</h3>
                <p>Try another category, tag, or search phrase.</p>
                <Link to="/blog">Back to all posts</Link>
              </div>
            ) : null}
          </main>

          <BlogSidebar
            searchInputValue={searchInputValue}
            setSearchInputValue={setSearchInputValue}
            onSearchSubmit={() => setSearchQuery(searchInputValue)}
            asideRef={asideRef}
            stickyRef={stickyRef}
            stickyMode={stickyMode}
            stickyStyle={stickyStyle}
            asideStyle={asideStyle}
          />
        </div>
      </div>
    </div>
  );
};

export default BlogMainPage;
