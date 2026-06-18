import { absFileUrl } from './fileUrl';

/** Browser URL for stored upload paths (images, proofs, thumbnails). */
export function resolveMediaUrl(path) {
  return absFileUrl(path);
}
