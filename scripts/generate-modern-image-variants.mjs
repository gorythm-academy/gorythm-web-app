/**
 * Generates AVIF + WebP siblings next to selected PNG sources (same basename),
 * optionally downscaled so transfer size matches on-screen usage (PageSpeed).
 *
 * Also writes small hero + header logo files under `public/images/` for LCP
 * (stable URLs + preload without bundling multi‑megapixel sources).
 *
 * Run after adding/changing raster art:
 *   npm run optimize-images
 *
 * Requires: sharp (devDependency).
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

/** PNGs we serve through <picture> in the UI (expand when you add new heavy images). */
const REL_PNG_PATHS = [
  'src/assets/images/about us/about-main-img.png',
  'src/assets/images/about us/our-mission.png',
  'src/assets/images/about us/our-vision.png',
  'src/assets/images/about us/video-thumbnail.png',
  'src/assets/images/our team/shazia.png',
  'src/assets/images/our team/kamran.png',
  'src/assets/images/our team/sufiyan.png',
  'src/assets/images/our team/ahmed.png',
  'src/assets/images/our team/maham.png',
  'src/assets/images/our team/fatima.png',
  'src/assets/images/our team/farhan.png',
  'src/assets/images/our team/shahmeer.png',
  'src/assets/images/our team/Gülsen Yazici.png',
  'src/assets/images/home/hero-banner-image.png',
  'src/assets/images/home/center-logo.png',
  'src/assets/images/home/logo.png',
  'src/assets/images/home/about-left.png',
  'src/assets/images/home/about-right.png',
  'src/assets/images/home/why-choose-left.png',
  'src/assets/images/home/why-choose-right.png',
  'src/assets/images/home/subscribe.png',
  'src/assets/images/footer-bd-image.png',
];

const LCP_PRELOAD_BASENAME = 'lcp-hero';
const PUBLIC_PRELOAD_DIR = path.join(repoRoot, 'public', 'preload');
const PUBLIC_COURSE_IMAGES_DIR = path.join(repoRoot, 'public', 'images', 'courses');
const SRC_BLOG_IMAGES_DIR = path.join(repoRoot, 'src', 'assets', 'images', 'blog');
const PUBLIC_HERO_DIR = path.join(repoRoot, 'public', 'images', 'hero');
const PUBLIC_BRAND_DIR = path.join(repoRoot, 'public', 'images', 'brand');

const COURSE_CARD_MAX_WIDTH = 960;

/** Max width (px) before encoding; keeps bytes near layout size. */
function maxWidthForSrcAsset(absPng) {
  const rel = path.relative(repoRoot, absPng).replace(/\\/g, '/');
  const base = path.basename(absPng, '.png');
  if (rel.includes('our team')) return 520;
  const map = {
    'about-main-img': 1280,
    'our-mission': 1100,
    'our-vision': 1100,
    'video-thumbnail': 1120,
    'hero-banner-image': 1920,
    'center-logo': 360,
    logo: 384,
    'about-left': 720,
    'about-right': 720,
    'why-choose-left': 1000,
    'why-choose-right': 1000,
    subscribe: 900,
    'footer-bd-image': 2048,
  };
  return map[base];
}

async function buildPipeline(absPng, maxWidth) {
  if (!maxWidth) return sharp(absPng);
  const { width } = await sharp(absPng).metadata();
  if (!width || width <= maxWidth) return sharp(absPng);
  return sharp(absPng).resize({ width: maxWidth, withoutEnlargement: true });
}

async function emitVariants(absPng, maxWidth) {
  const dir = path.dirname(absPng);
  const base = path.join(dir, path.basename(absPng, path.extname(absPng)));
  const webpPath = `${base}.webp`;
  const avifPath = `${base}.avif`;

  const p1 = await buildPipeline(absPng, maxWidth);
  await p1.webp({ quality: 82, effort: 6 }).toFile(webpPath);
  const p2 = await buildPipeline(absPng, maxWidth);
  await p2.avif({ quality: 50, effort: 6 }).toFile(avifPath);
  return { webpPath, avifPath };
}

async function collectPngFilesRecursively(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return collectPngFilesRecursively(full);
        if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.png') return [full];
        return [];
      })
    );
    return nested.flat();
  } catch {
    return [];
  }
}

/** LCP: tiny center mark + header logo — stable `/public` URLs (see `src/config/publicAssets.js`). */
async function emitPublicLcpImages() {
  await fs.mkdir(PUBLIC_HERO_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_BRAND_DIR, { recursive: true });

  const centerSrc = path.join(repoRoot, 'src/assets/images/home/center-logo.png');
  const logoSrc = path.join(repoRoot, 'src/assets/images/home/logo.png');

  try {
    await fs.access(centerSrc);
    const centerAvif = await buildPipeline(centerSrc, 240);
    await centerAvif.avif({ quality: 48, effort: 5 }).toFile(path.join(PUBLIC_HERO_DIR, 'center-logo-240.avif'));
    const centerWebp = await buildPipeline(centerSrc, 240);
    await centerWebp.webp({ quality: 82, effort: 5 }).toFile(path.join(PUBLIC_HERO_DIR, 'center-logo-240.webp'));
    console.log('[optimize-images] public → public/images/hero/center-logo-240.{avif,webp}');
  } catch {
    console.warn('[optimize-images] skip public hero logo (missing center-logo.png)');
  }

  try {
    await fs.access(logoSrc);
    const logoAvif = await buildPipeline(logoSrc, 320);
    await logoAvif.avif({ quality: 50, effort: 5 }).toFile(path.join(PUBLIC_BRAND_DIR, 'logo-header-320.avif'));
    const logoWebp = await buildPipeline(logoSrc, 320);
    await logoWebp.webp({ quality: 85, effort: 5 }).toFile(path.join(PUBLIC_BRAND_DIR, 'logo-header-320.webp'));
    const logoPng = await buildPipeline(logoSrc, 320);
    await logoPng.png({ compressionLevel: 9 }).toFile(path.join(PUBLIC_BRAND_DIR, 'logo-header-320.png'));
    console.log('[optimize-images] public → public/images/brand/logo-header-320.{avif,webp,png}');
  } catch {
    console.warn('[optimize-images] skip public header logo (missing logo.png)');
  }
}

async function main() {
  await fs.mkdir(PUBLIC_PRELOAD_DIR, { recursive: true });

  const sourceAssetPngs = REL_PNG_PATHS.map((rel) => path.join(repoRoot, rel));
  const publicCoursePngs = await collectPngFilesRecursively(PUBLIC_COURSE_IMAGES_DIR);
  const srcBlogPngs = await collectPngFilesRecursively(SRC_BLOG_IMAGES_DIR);
  const allPngs = [...sourceAssetPngs, ...publicCoursePngs, ...srcBlogPngs];

  for (const abs of allPngs) {
    try {
      await fs.access(abs);
    } catch {
      console.warn(`[optimize-images] skip (missing): ${path.relative(repoRoot, abs)}`);
      continue;
    }
    const isCourse = abs.startsWith(PUBLIC_COURSE_IMAGES_DIR);
    const maxW = isCourse ? COURSE_CARD_MAX_WIDTH : maxWidthForSrcAsset(abs);
    const { webpPath, avifPath } = await emitVariants(abs, maxW);
    console.log(
      `[optimize-images] ok: ${path.relative(repoRoot, abs)} → ${path.relative(repoRoot, webpPath)}, ${path.relative(repoRoot, avifPath)}`
    );
  }

  const heroBanner = path.join(repoRoot, 'src/assets/images/home/hero-banner-image.png');
  try {
    await fs.access(heroBanner);
    const hb = await buildPipeline(heroBanner, 1920);
    await hb.clone().webp({ quality: 82, effort: 6 }).toFile(path.join(PUBLIC_PRELOAD_DIR, `${LCP_PRELOAD_BASENAME}.webp`));
    await hb.clone().avif({ quality: 50, effort: 6 }).toFile(path.join(PUBLIC_PRELOAD_DIR, `${LCP_PRELOAD_BASENAME}.avif`));
    console.log(`[optimize-images] public preload → public/preload/${LCP_PRELOAD_BASENAME}.{webp,avif}`);
  } catch {
    console.warn('[optimize-images] hero preload skipped (missing hero-banner-image.png)');
  }

  await emitPublicLcpImages();

  console.log('[optimize-images] done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
