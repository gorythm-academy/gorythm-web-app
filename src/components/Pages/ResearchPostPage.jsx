import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import axios from 'axios';
import ResearchSidebar from './ResearchSidebar';
import {
  fetchPublishedResearchPosts,
  fetchResearchPostBySlug,
  formatResearchContentHtml,
} from '../../utils/researchPosts';
import ResearchPostImage from './ResearchPostImage';
import ResearchSeriesView from './ResearchSeriesView';
import { API_BASE_URL } from '../../config/constants';
import './ResearchMainPage.scss';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const BlogCommentSection = ({ postSlug }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axios.get(`${API_BASE_URL}/api/research/${postSlug}/comments`).then((res) => {
      if (!cancelled && res.data?.success) setComments(res.data.comments || []);
    }).catch(() => {
      if (!cancelled) setComments([]);
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
      if (!name || !text || !email || submitting) return;
      if (!EMAIL_REGEX.test(email)) return;
      setSubmitting(true);
      setSubmitError('');
      axios.post(`${API_BASE_URL}/api/research/${postSlug}/comments`, {
        authorName: name,
        authorEmail: email,
        text,
      }).then((res) => {
        if (res.data?.success && res.data.comment) {
          setComments((prev) => [res.data.comment, ...prev]);
          setAuthorName('');
          setAuthorEmail('');
          setMessage('');
        }
      }).catch((err) => {
        const msg = err.response?.data?.error || 'Failed to post comment. Use a full email address (e.g. abc@email.com).';
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
    <section id="comments" className="blog-comments" aria-label="Comments">
      <h2 className="blog-comments-title">
        {loading ? 'Comments' : comments.length === 0 ? 'Comments' : `Comments (${comments.length})`}
      </h2>
      <form className="blog-comment-form" onSubmit={handleSubmit}>
        <div className="blog-comment-form-row">
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
          Comment <span aria-hidden="true">*</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your comment..."
            required
          />
        </label>
        {submitError && <p className="blog-comment-error" role="alert">{submitError}</p>}
        <button type="submit" className="blog-comment-submit" disabled={submitting}>
          {submitting ? 'Posting…' : 'Post comment'}
        </button>
      </form>
      {loading ? (
        <p className="blog-comments-empty">Loading comments…</p>
      ) : comments.length > 0 ? (
        <ul className="blog-comments-list">
          {comments.map((c) => (
            <li key={c.id} className="blog-comment-item">
              <p className="blog-comment-meta">
                <span className="blog-comment-author">{c.authorName}</span>
                <span className="blog-comment-date">{formatDate(c.date)}</span>
              </p>
              <p className="blog-comment-text">{c.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="blog-comments-empty">No comments yet. Be the first to share your thoughts.</p>
      )}
    </section>
  );
};

const ArticlePageLayout = ({ post, sidebarPosts, children, isSeries }) => (
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
          ) : null}
            <BlogCommentSection postSlug={post.slug} />
            <div className="news-article-back">
            <Link to="/research" className="news-article-back-link">
              <span className="news-article-back-arrow">←</span> Back to Research
              </Link>
            </div>
          </main>

        <ResearchSidebar posts={sidebarPosts} />
      </div>
      </div>
    </article>
);

export const ResearchPostPage = () => {
  const { slug } = useParams();
  const location = useLocation();
  const [post, setPost] = useState(null);
  const [sidebarPosts, setSidebarPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchResearchPostBySlug(slug),
      fetchPublishedResearchPosts(),
    ]).then(([found, posts]) => {
      if (!cancelled) {
        setPost(found);
        setSidebarPosts(posts);
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

  if (loading) {
    return (
      <div className="blog-page scheme_dark">
        <div className="blog-page-inner">
          <p className="lms-empty">Loading article…</p>
        </div>
      </div>
    );
  }

  if (!post) return <Navigate to="/research" replace />;

  const isSeries = post.contentFormat === 'series-table' && post.seriesData?.topics?.length;
  const bodyHtml = !isSeries ? formatResearchContentHtml(post.content) : '';
  const body = isSeries ? (
    <ResearchSeriesView seriesData={post.seriesData} />
  ) : bodyHtml ? (
    <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
  ) : null;

  return (
    <ArticlePageLayout post={post} sidebarPosts={sidebarPosts} isSeries={Boolean(isSeries)}>
      {body}
    </ArticlePageLayout>
  );
};

export default ResearchPostPage;
