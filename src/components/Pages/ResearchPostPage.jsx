import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ResearchSidebar from './ResearchSidebar';
import {
  fetchPublishedResearchPosts,
  fetchResearchPostBySlug,
  formatResearchContentHtml,
  getResearchPostImage,
} from '../../utils/researchPosts';
import ResearchPostImage from './ResearchPostImage';
import ResearchSeriesView from './ResearchSeriesView';
import { buildResearchListQuery, formatTagLabel } from '../../utils/researchListParams';
import { buildArticleJsonLd, usePageMeta } from '../../hooks/usePageMeta';
import { API_BASE_URL, SITE_URL } from '../../config/constants';
import './ResearchMainPage.scss';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ResearchCommentSection = ({ postSlug }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    axios.get(`${API_BASE_URL}/api/research/${postSlug}/comments`).then((res) => {
      if (!cancelled && res.data?.success) setComments(res.data.comments || []);
      else if (!cancelled) setLoadError('Could not load feedback.');
    }).catch(() => {
      if (!cancelled) {
        setComments([]);
        setLoadError('Could not load feedback.');
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [postSlug]);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const name = authorName.trim();
      const email = authorEmail.trim();
      const text = message.trim();
      if (!name || !text || !email || submitting) {
        setSubmitError('Name, email, and feedback are required.');
        return;
      }
      if (!EMAIL_REGEX.test(email)) {
        setSubmitError('Enter a full email address (e.g. abc@email.com).');
        return;
      }
      setSubmitting(true);
      setSubmitError('');
      setSubmitSuccess('');
      axios.post(`${API_BASE_URL}/api/research/${postSlug}/comments`, {
        authorName: name,
        authorEmail: email,
        text,
      }).then((res) => {
        if (res.data?.success) {
          setAuthorName('');
          setAuthorEmail('');
          setMessage('');
          setSubmitSuccess(res.data.message || 'Thank you — your feedback will appear after review.');
        }
      }).catch((err) => {
        const msg = err.response?.data?.error || 'Failed to send feedback. Use a full email address (e.g. abc@email.com).';
        setSubmitError(msg);
      }).finally(() => setSubmitting(false));
    },
    [authorName, authorEmail, message, postSlug, submitting]
  );

  const formatDate = (date) => {
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
    } catch {
      return '';
    }
  };

  return (
    <section id="comments" className="research-comments" aria-label="Send Us Feedback">
      <h2 className="research-comments-title">
        {loading
          ? 'Send Us Feedback'
          : comments.length === 0
            ? 'Send Us Feedback'
            : `Send Us Feedback (${comments.length})`}
      </h2>
      <form className="research-comment-form" onSubmit={handleSubmit}>
        <div className="research-comment-form-row">
          <label>
            Name <span aria-hidden="true">*</span>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Your name"
              required
            />
          </label>
          <label>
            Email <span aria-hidden="true">*</span>
            <input
              type="email"
              value={authorEmail}
              onChange={(e) => setAuthorEmail(e.target.value)}
              placeholder="abc@email.com"
              pattern="[^\s@]+@[^\s@]+\.[^\s@]{2,}"
              required
              title="Enter a full email address (e.g. abc@email.com)."
            />
          </label>
        </div>
        <label>
          Your feedback <span aria-hidden="true">*</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Share your query or feedback..."
            required
          />
        </label>
        {submitError && <p className="research-comment-error" role="alert">{submitError}</p>}
        {submitSuccess && <p className="research-comment-success" role="status">{submitSuccess}</p>}
        <button type="submit" className="research-comment-submit" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send feedback'}
        </button>
      </form>
      {loading ? (
        <p className="research-comments-empty">Loading feedback…</p>
      ) : loadError ? (
        <p className="research-comments-empty" role="alert">{loadError}</p>
      ) : comments.length > 0 ? (
        <ul className="research-comments-list">
          {comments.map((c) => (
            <li key={c.id} className="research-comment-item">
              <p className="research-comment-meta">
                <span className="research-comment-author">{c.authorName}</span>
                <span className="research-comment-date">{formatDate(c.date)}</span>
              </p>
              <p className="research-comment-text">{c.text}</p>
              {c.adminReply ? (
                <div className="research-comment-reply">
                  <p className="research-comment-reply-label">Response from Gorythm</p>
                  <p className="research-comment-text">{c.adminReply}</p>
                  {c.repliedAt ? (
                    <p className="research-comment-date">{formatDate(c.repliedAt)}</p>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="research-comments-empty">No published feedback yet. Be the first to share your thoughts.</p>
      )}
    </section>
  );
};

const ArticlePageLayout = ({
  post,
  sidebarPosts,
  children,
  isSeries,
  searchInputValue,
  setSearchInputValue,
  onSearchSubmit,
  showEmptyBody,
}) => (
    <article className="news-article-page scheme_dark">
    <div className="news-article-inner">
      <div className="news-article-hero">
        <div className="research-image-canvas research-image-canvas--article">
          <ResearchPostImage
            post={post}
            loading="eager"
            width={1680}
            height={1050}
            sizes="(min-width: 1680px) 1680px, (min-width: 1280px) 1440px, 100vw"
          />
        </div>
      </div>

      <div className="news-article-layout">
        <main className="news-article-main">
          <header className="news-article-header">
            <span className="news-article-meta">Research</span>
            <h1 className="news-article-title">{post.title}</h1>
            <p className="news-article-byline">
              By {post.author} · {post.date}
            </p>
            {post.tags?.length > 0 ? (
              <div className="research-article-tags" aria-label="Article tags">
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/research${buildResearchListQuery({ tag })}`}
                    className="research-tag"
                  >
                    {formatTagLabel(tag)}
                  </Link>
                ))}
              </div>
            ) : null}
          </header>

          {children ? (
            <section className="news-article-paper" aria-label={isSeries ? 'Research series' : 'Research paper'}>
              <p className="news-article-paper-label">
                {isSeries ? 'Research series' : 'Research paper'}
              </p>
              <div className={`news-article-body${isSeries ? ' news-article-body--series' : ''}`}>
                {children}
        </div>
      </section>
          ) : showEmptyBody ? (
            <p className="lms-empty">This article has no published body content yet.</p>
          ) : null}
            <ResearchCommentSection postSlug={post.slug} />
            <div className="news-article-back">
            <Link to="/research" className="news-article-back-link">
              <span className="news-article-back-arrow">←</span> Back to Research
              </Link>
            </div>
          </main>

        <ResearchSidebar
          posts={sidebarPosts}
          searchInputValue={searchInputValue}
          setSearchInputValue={setSearchInputValue}
          onSearchSubmit={onSearchSubmit}
        />
      </div>
      </div>
    </article>
);

export const ResearchPostPage = () => {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [sidebarPosts, setSidebarPosts] = useState([]);
  const [searchInputValue, setSearchInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setPost(null);
    Promise.all([
      fetchResearchPostBySlug(slug),
      fetchPublishedResearchPosts(),
    ]).then(([found, result]) => {
      if (!cancelled) {
        setPost(found);
        setNotFound(!found);
        setSidebarPosts(result.posts || []);
      }
    }).catch(() => {
      if (!cancelled) {
        setPost(null);
        setNotFound(true);
        setSidebarPosts([]);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (location.hash === '#comments') {
      const el = document.getElementById('comments');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash, slug]);

  const pageMeta = useMemo(() => {
    if (loading) {
      return { title: 'Loading… | Research | Gorythm Academy', description: 'Loading research article…' };
    }
    if (notFound || !post) {
      return {
        title: 'Article not found | Research | Gorythm Academy',
        description: 'This research article could not be found at Gorythm Academy.',
      };
    }
    const base = SITE_URL.replace(/\/$/, '');
    const pageUrl = `${base}/research/${post.slug}`;
    const imageAsset = getResearchPostImage(post);
    const image =
      imageAsset?.type === 'single'
        ? imageAsset.url
        : imageAsset?.webp || imageAsset?.png || imageAsset?.avif || undefined;
    return {
      title: `${post.title} | Research | Gorythm Academy`,
      description: post.excerpt || `${post.title} — Gorythm Academy research.`,
      image,
      type: 'article',
      url: pageUrl,
      jsonLd: buildArticleJsonLd({
        title: post.title,
        description: post.excerpt || post.title,
        url: pageUrl,
        image,
        datePublished: post.publishedAt,
        author: post.author,
      }),
    };
  }, [loading, notFound, post]);

  usePageMeta(pageMeta, { enabled: !loading });

  if (loading) {
    return (
      <div className="research-page scheme_dark">
        <div className="research-page-inner">
          <p className="lms-empty">Loading article…</p>
        </div>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="research-page scheme_dark">
        <div className="research-page-inner">
          <header className="research-page-header">
            <h1 className="research-page-title">Article not found</h1>
          </header>
          <p className="lms-empty">This research article may have been removed or the link is incorrect.</p>
          <Link to="/research" className="news-article-back-link">
            <span className="news-article-back-arrow">←</span> Back to Research
          </Link>
        </div>
      </div>
    );
  }

  const isSeries = post.contentFormat === 'series-table' && post.seriesData?.topics?.length;
  const bodyHtml = !isSeries ? formatResearchContentHtml(post.content) : '';
  const body = isSeries ? (
    <ResearchSeriesView seriesData={post.seriesData} />
  ) : bodyHtml ? (
    <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
  ) : null;

  return (
    <ArticlePageLayout
      post={post}
      sidebarPosts={sidebarPosts}
      isSeries={Boolean(isSeries)}
      searchInputValue={searchInputValue}
      setSearchInputValue={setSearchInputValue}
      onSearchSubmit={() => {
        const q = searchInputValue.trim();
        navigate(`/research${buildResearchListQuery({ q })}`);
      }}
      showEmptyBody={!isSeries && !body}
    >
      {body}
    </ArticlePageLayout>
  );
};

export default ResearchPostPage;
