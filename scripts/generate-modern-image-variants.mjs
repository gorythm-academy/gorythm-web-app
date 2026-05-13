/**
 * Generates AVIF + WebP siblings next to selected PNG sources (same basename).
 *
 * Why this exists:
 * - AVIF/WebP cut bytes dramatically vs PNG for photos/gradients → faster first paint on EC2/VPS.
 * - Keeps PNG as authored fallback for rare browsers without modern codecs.
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

/** PNGs we serve through <picture> in the UI (expand this list when you add new heavy images). */
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
  'src/assets/images/home/about-left.png',
  'src/assets/images/home/about-right.png',
  'src/assets/images/home/why-choose-left.png',
  'src/assets/images/home/why-choose-right.png',
  'src/assets/images/footer-bd-image.png',
];

const LCP_PRELOAD_BASENAME = 'lcp-hero';
const PUBLIC_PRELOAD_DIR = path.join(repoRoot, 'public', 'preload');
const PUBLIC_COURSE_IMAGES_DIR = path.join(repoRoot, 'public', 'images', 'courses');
const SRC_BLOG_IMAGES_DIR = path.join(repoRoot, 'src', 'assets', 'images', 'blog');

async function emitVariants(absPng) {
  const dir = path.dirname(absPng);
  const base = path.join(dir, path.basename(absPng, path.extname(absPng)));
  const webpPath = `${base}.webp`;
  const avifPath = `${base}.avif`;

  await sharp(absPng)
    .webp({ quality: 82, effort: 6 })
    .toFile(webpPath);

  await sharp(absPng)
    .avif({ quality: 52, effort: 6 })
    .toFile(avifPath);

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
    const { webpPath, avifPath } = await emitVariants(abs);
    console.log(`[optimize-images] ok: ${path.relative(repoRoot, abs)} → ${path.relative(repoRoot, webpPath)}, ${path.relative(repoRoot, avifPath)}`);
  }

  // Stable URLs for <link rel="preload"> — Create React App hashes imported files; public/ paths stay predictable.
  const heroBanner = path.join(repoRoot, 'src/assets/images/home/hero-banner-image.png');
  try {
    await fs.access(heroBanner);
    await sharp(heroBanner)
      .webp({ quality: 82, effort: 6 })
      .toFile(path.join(PUBLIC_PRELOAD_DIR, `${LCP_PRELOAD_BASENAME}.webp`));
    await sharp(heroBanner)
      .avif({ quality: 52, effort: 6 })
      .toFile(path.join(PUBLIC_PRELOAD_DIR, `${LCP_PRELOAD_BASENAME}.avif`));
    console.log(`[optimize-images] public preload → public/preload/${LCP_PRELOAD_BASENAME}.{webp,avif}`);
  } catch {
    console.warn('[optimize-images] hero preload skipped (missing hero-banner-image.png)');
  }

  console.log('[optimize-images] done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
