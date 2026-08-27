import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import ResearchSidebar from './ResearchSidebar';
import { fetchPublishedResearchPosts } from '../../utils/researchPosts';
import {
  buildResearchListQuery,
  formatTagLabel,
  postMatchesSearch,
  postMatchesTag,
} from '../../utils/researchListParams';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useStickyPanel } from './useStickyPanel';
import { API_BASE_URL } from '../../config/constants';
import ResearchPostImage from './ResearchPostImage';
import './ResearchMainPage.scss';

export const ResearchMainPage = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');
  const [commentCounts, setCommentCounts] = useState({});
  const [commentCountsError, setCommentCountsError] = useState(false);
  const [researchPosts, setResearchPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const layoutRef = useRef(null);
  const mainRef = useRef(null);
  const asideRef = useRef(null);
  const stickyRef = useRef(null);
  const activeTagSlug = searchParams.get('tag');
  const queryFromUrl = (searchParams.get('q') || '').trim();
  const activeTag = useMemo(
    () =>
      activeTagSlug
        ? { slug: activeTagSlug.toLowerCase(), name: formatTagLabel(activeTagSlug) }
        : null,
    [activeTagSlug]
  );
  const keywords = (searchQuery || queryFromUrl).trim().toLowerCase().split(/\s+/).filter(Boolean);

  const filteredPosts = researchPosts.filter((post) => {
    const tagMatch = postMatchesTag(post, activeTagSlug);
    const textMatch = postMatchesSearch(post, keywords);
    return tagMatch && textMatch;
  });

  const listMeta = useMemo(() => ({
    title: activeTag || queryFromUrl
      ? 'Research results | Gorythm Academy'
      : 'Research | Gorythm Academy',
    description: activeTag
      ? `Research articles tagged “${activeTag.name}” at Gorythm Academy.`
      : queryFromUrl
        ? `Search results for “${queryFromUrl}” in Gorythm Academy research.`
        : 'Read Gorythm Academy research articles on faith, science, character, and purposeful learning.',
  }), [activeTag, queryFromUrl]);
  usePageMeta(listMeta);

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
    setSearchInputValue(queryFromUrl);
    setSearchQuery(queryFromUrl);
  }, [queryFromUrl]);

  useEffect(() => {
    if (postsLoading) return;
    const raw = parseInt(pageParam || '1', 10);
    if (!pageParam || raw === currentPage) return;
    const params = new URLSearchParams(searchParams);
    if (currentPage === 1) params.delete('page');
    else params.set('page', String(currentPage));
    setSearchParams(params, { replace: true });
  }, [postsLoading, pageParam, currentPage, searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    setPostsLoading(true);
    fetchPublishedResearchPosts().then(({ posts, error }) => {
      if (!cancelled) {
        setResearchPosts(posts);
        setPostsError(error || '');
      }
    }).finally(() => {
      if (!cancelled) setPostsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setCommentCountsError(false);
    axios.get(`${API_BASE_URL}/api/research/counts`).then((res) => {
      if (res.data?.success && res.data.counts) setCommentCounts(res.data.counts);
      else setCommentCountsError(true);
    }).catch(() => setCommentCountsError(true));
  }, []);

  return (
    <div className="research-page scheme_dark">
      <div className="research-page-inner">
        <header className="research-page-header">
          <h1 className="research-page-title">Research</h1>
          <span className="research-page-header-arrow" aria-hidden="true" />
        </header>

        <div ref={layoutRef} className="research-layout">
          <main ref={mainRef} className="research-main">
            {(activeTag || queryFromUrl) && (
              <section className="research-filter-intro">
                <p className="research-filter-kicker">
                  {activeTag && queryFromUrl ? 'Filtered results' : activeTag ? 'Tag' : 'Search'}
                </p>
                <h2 className="research-filter-title">
                  {activeTag && queryFromUrl
                    ? `${activeTag.name} · “${queryFromUrl}”`
                    : activeTag
                      ? activeTag.name
                      : `“${queryFromUrl}”`}
                </h2>
                {(activeTag?.description || queryFromUrl) && (
                  <p className="research-filter-copy">
                    {activeTag?.description || 'Showing articles matching your search phrase.'}
                  </p>
                )}
                <Link
                  to="/research"
                  className="research-filter-clear"
                  onClick={() => {
                    setSearchInputValue('');
                    setSearchQuery('');
                  }}
                >
                  View all articles
                </Link>
              </section>
            )}

            {postsLoading ? (
              <p className="lms-empty">Loading research articles…</p>
            ) : null}

            {!postsLoading && postsError ? (
              <p className="lms-empty" role="alert">{postsError}</p>
            ) : null}

            {!postsLoading && !postsError && paginatedPosts.map((post) => (
              <article key={post.id || post.slug} className="research-post-card">
                <div
                  className="research-post-link"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/research/${post.slug}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/research/${post.slug}`);
                    }
                  }}
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
                  <div className="research-post-meta">
                    <span className="research-post-date">{post.date}</span>
                    <span className="research-post-sep">·</span>
                    <span className="research-post-author">by {post.author}</span>
                    <span className="research-post-sep">·</span>
                    <span className="research-post-category">{post.category}</span>
                    <span className="research-post-sep">·</span>
                    <Link
                      to={`/research/${post.slug}#comments`}
                      className="research-post-comments"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {commentCountsError
                        ? 'Feedback'
                        : `${commentCounts[post.slug] ?? 0} Feedback`}
                    </Link>
                  </div>
                  <h2 className="research-post-title">{post.title}</h2>
                  <p className="research-post-excerpt">{post.excerpt}</p>
                  <span className="research-post-read">Read More</span>
                </div>
              </article>
            ))}

            {!postsLoading && filteredPosts.length > 0 ? (
              <>
                {showPagination && (
                  <nav className="research-pagination" aria-label="Research pagination">
                    <Link
                      to={`/research${setPage(currentPage - 1)}`}
                      className="research-pagination-prev"
                      aria-label="Previous page"
                      style={{ pointerEvents: currentPage <= 1 ? 'none' : undefined, opacity: currentPage <= 1 ? 0.5 : 1 }}
                    >
                      ←
                    </Link>
                    <span className="research-pagination-nums">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                        <Link
                          key={n}
                          to={`/research${setPage(n)}`}
                          className={`research-pagination-num${n === currentPage ? ' active' : ''}`}
                        >
                          {n}
                        </Link>
                      ))}
                    </span>
                    <Link
                      to={`/research${setPage(currentPage + 1)}`}
                      className="research-pagination-next"
                      aria-label="Next page"
                      style={{ pointerEvents: currentPage >= totalPages ? 'none' : undefined, opacity: currentPage >= totalPages ? 0.5 : 1 }}
                    >
                      →
                    </Link>
                  </nav>
                )}
              </>
            ) : null}
            {!postsLoading && !postsError && filteredPosts.length === 0 ? (
              <div className="research-empty-state">
                <h3>No matching articles found</h3>
                <p>Try another tag or search phrase.</p>
                <Link
                  to="/research"
                  onClick={() => {
                    setSearchInputValue('');
                    setSearchQuery('');
                  }}
                >
                  Back to all articles
                </Link>
              </div>
            ) : null}
          </main>

          <ResearchSidebar
            posts={researchPosts}
            searchInputValue={searchInputValue}
            setSearchInputValue={setSearchInputValue}
            activeTagSlug={activeTagSlug || ''}
            onSearchSubmit={() => {
              const q = searchInputValue.trim();
              setSearchQuery(q);
              navigate(`/research${buildResearchListQuery({ q, tag: activeTagSlug })}`);
            }}
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

export default ResearchMainPage;
