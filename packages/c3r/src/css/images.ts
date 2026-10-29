import type { ReadonlyVec2 } from "gl-matrix";

export interface ImageInfo {
  size: ReadonlyVec2;
  opaque: boolean;
}

// Larger textures keep their mask
const MAX_SCAN = 4096 * 4096;

const loads = new Map<string, Promise<ImageInfo | null>>();
const settled = new Map<string, ImageInfo | null>();

async function decode(url: string, cors: boolean): Promise<HTMLImageElement> {
  const image = new Image();
  if (cors) image.crossOrigin = "anonymous";
  image.src = url;
  await image.decode();
  // A server-side DOM resolves decode() before the image loads
  if (!image.complete)
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve);
      image.addEventListener("error", reject);
    });
  return image;
}

// Full size, a downscale can skip thin transparent areas
function isOpaque(image: HTMLImageElement): boolean {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (width * height > MAX_SCAN) return false;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return false;
  context.canvas.width = width;
  context.canvas.height = height;
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return false;
  return true;
}

async function read(url: string): Promise<ImageInfo | null> {
  let image: HTMLImageElement;
  let readable = true;
  try {
    image = await decode(url, true);
  } catch {
    // Like the CSS background, for the size only
    try {
      image = await decode(url, false);
      readable = false;
    } catch {
      return null;
    }
  }
  const { naturalWidth, naturalHeight } = image;
  if (!naturalWidth || !naturalHeight) return null;
  let opaque = false;
  try {
    opaque = readable && isOpaque(image);
  } catch {}
  return { size: [naturalWidth, naturalHeight], opaque };
}

// Data urls are skipped, a canvas map makes a new one each frame
const skipped = (url: string): boolean => url.startsWith("data:");

export function loadImage(url: string): Promise<ImageInfo | null> {
  if (skipped(url)) return Promise.resolve(null);
  let load = loads.get(url);
  if (!load) {
    load = read(url).then((info) => {
      settled.set(url, info);
      return info;
    });
    loads.set(url, load);
  }
  return load;
}

export function imageInfo(url: string): ImageInfo | null | undefined {
  return skipped(url) ? null : settled.get(url);
}
