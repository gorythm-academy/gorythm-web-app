import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import ResearchSidebar from './ResearchSidebar';
import { fetchPublishedResearchPosts, researchCategoryFromSlug } from '../../utils/researchPosts';
import { useStickyPanel } from './useStickyPanel';
import { API_BASE_URL } from '../../config/constants';
import ResearchPostImage from './ResearchPostImage';
import './ResearchMainPage.scss';

export const ResearchCategoryPage = () => {
  const { categorySlug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');
  const [commentCounts, setCommentCounts] = useState({});
  const [researchPosts, setResearchPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const layoutRef = useRef(null);
  const mainRef = useRef(null);
  const asideRef = useRef(null);
  const stickyRef = useRef(null);
  const activeCategory = categorySlug ? researchCategoryFromSlug(categorySlug, researchPosts) : null;
  const keywords = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const filteredPosts = researchPosts.filter((post) => {
    const postCategorySlug = post.category.toLowerCase().replace(/\s+/g, '-');
    const categoryMatch = categorySlug ? postCategorySlug === categorySlug : true;
    const text = `${post.title} ${post.excerpt} ${post.category}`.toLowerCase();
    const textMatch = keywords.length === 0 || keywords.every((kw) => text.includes(kw));
    return categoryMatch && textMatch;
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
    let cancelled = false;
    setPostsLoading(true);
    fetchPublishedResearchPosts().then((posts) => {
      if (!cancelled) setResearchPosts(posts);
    }).finally(() => {
      if (!cancelled) setPostsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/research/counts`).then((res) => {
      if (res.data?.success && res.data.counts) setCommentCounts(res.data.counts);
    }).catch(() => {});
  }, []);

  if (!categorySlug || !activeCategory) {
    return (
      <div className="blog-page scheme_dark">
        <div className="blog-page-inner">
          <div className="blog-empty-state">
            <h3>Category not found</h3>
            <Link to="/research">Back to all articles</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="blog-page scheme_dark">
      <div className="blog-page-inner">
        <header className="blog-page-header">
          <h1 className="blog-page-title">Research</h1>
        </header>

        <div ref={layoutRef} className="blog-layout">
          <main ref={mainRef} className="blog-main">
            <section className="blog-filter-intro">
              <p className="blog-filter-kicker">Category</p>
              <h2 className="blog-filter-title">{activeCategory.name}</h2>
              <p className="blog-filter-copy">{activeCategory.description}</p>
              <Link to="/research" className="blog-filter-clear">View all articles</Link>
            </section>

            {postsLoading ? <p className="lms-empty">Loading research articles…</p> : null}

            {!postsLoading && paginatedPosts.map((post) => (
              <article key={post.id || post.slug} className="blog-post-card">
                <div
                  className="blog-post-link"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/research/${post.slug}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/research/${post.slug}`)}
                >
                  <div className="research-image-canvas research-image-canvas--card">
                    <ResearchPostImage
                      post={post}
                      loading="lazy"
                      width={800}
                      height={500}
                      sizes="(min-width: 768px) 800px, 100vw"
                    />
                  </div>
                  <div className="blog-post-meta">
                    <span className="blog-post-date">{post.date}</span>
                    <span className="blog-post-sep">·</span>
                    <span className="blog-post-author">by {post.author}</span>
                    <span className="blog-post-sep">·</span>
                    <span className="blog-post-category">{post.category}</span>
                    <span className="blog-post-sep">·</span>
                    <Link
                      to={`/research/${post.slug}#comments`}
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

            {!postsLoading && filteredPosts.length > 0 && showPagination && (
              <nav className="blog-pagination" aria-label="Research pagination">
                <Link
                  to={`/research/category/${categorySlug}${setPage(currentPage - 1)}`}
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
                      to={`/research/category/${categorySlug}${setPage(n)}`}
                      className={`blog-pagination-num${n === currentPage ? ' active' : ''}`}
                    >
                      {n}
                    </Link>
                  ))}
                </span>
                <Link
                  to={`/research/category/${categorySlug}${setPage(currentPage + 1)}`}
                  className="blog-pagination-next"
                  aria-label="Next page"
                  style={{ pointerEvents: currentPage >= totalPages ? 'none' : undefined, opacity: currentPage >= totalPages ? 0.5 : 1 }}
                >
                  →
                </Link>
              </nav>
            )}
            {!postsLoading && filteredPosts.length === 0 ? (
              <div className="blog-empty-state">
                <h3>No articles in this category</h3>
                <Link to="/research">Back to all articles</Link>
              </div>
            ) : null}
          </main>

          <ResearchSidebar
            posts={researchPosts}
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

export default ResearchCategoryPage;
