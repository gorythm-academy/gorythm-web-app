import axios from 'axios';
import { API_BASE_URL } from '../config/constants';
import { resolveMediaUrl } from './resolveMediaUrl';

export function slugifyResearchTitle(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeApiPost(post) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt || '',
    content: post.content || '',
    contentFormat: post.contentFormat || 'article',
    seriesData: post.seriesData || null,
    imagePath: post.imagePath || '',
    category: post.category || 'General',
    tags: post.tags || [],
    author: post.author || 'Gorythm Team',
    date: post.date || '',
    publishedAt: post.publishedAt,
    isPublished: post.isPublished !== false,
    source: 'api',
    image: null,
  };
}

export async function fetchPublishedResearchPosts() {
  const base = (API_BASE_URL || '').replace(/\/$/, '');
  try {
    const res = await axios.get(`${base}/api/research/posts`);
    if (res.data?.success) {
      const posts = (res.data.posts || []).map(normalizeApiPost);
      posts.sort((a, b) => {
        const da = new Date(a.publishedAt || a.date || 0).getTime();
        const db = new Date(b.publishedAt || b.date || 0).getTime();
        return db - da;
      });
      return posts;
    }
  } catch {
    /* API unavailable */
  }
  return [];
}

export async function fetchResearchPostBySlug(slug) {
  const base = (API_BASE_URL || '').replace(/\/$/, '');
  try {
    const res = await axios.get(`${base}/api/research/posts/${encodeURIComponent(slug)}`);
    if (res.data?.success && res.data.post) {
      return normalizeApiPost(res.data.post);
    }
  } catch {
    /* not found */
  }
  return null;
}

export function getResearchPostImage(post) {
  if (post?.imagePath) {
    const url = resolveMediaUrl(post.imagePath);
    return { type: 'single', url };
  }
  if (post?.image) {
    return {
      type: 'picture',
      avif: post.image.avif,
      webp: post.image.webp,
      png: post.image.png,
    };
  }
  return null;
}

function titleCaseFromSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function researchCategoryFromSlug(slug, posts = []) {
  if (!slug) return null;
  const normalized = String(slug).toLowerCase();
  for (const post of posts) {
    const postSlug = String(post.category || '')
      .toLowerCase()
      .replace(/\s+/g, '-');
    if (postSlug === normalized) {
      return { slug: normalized, name: post.category, description: '' };
    }
  }
  return { slug: normalized, name: titleCaseFromSlug(normalized), description: '' };
}

export function researchTagFromSlug(slug) {
  if (!slug) return null;
  const normalized = String(slug).toLowerCase();
  return { slug: normalized, name: normalized, description: '' };
}

export function formatResearchContentHtml(content) {
  if (!content) return '';
  if (/<[a-z][\s\S]*>/i.test(content)) return content;
  return content
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('');
}
