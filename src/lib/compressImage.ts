/**
 * Réduit et recompresse une image côté navigateur avant upload.
 *
 * Les affiches ne sont affichées qu'en vignette et en grand dans une modale
 * (max ~672px de large / 80vh de haut) : 1600px sur le grand côté suffit,
 * y compris sur écran Retina. L'image est ré-encodée en WebP (qualité 0.82,
 * sans perte visible). Si le navigateur ne sait pas encoder en WebP (Safari),
 * on retombe sur JPEG pour les photos et PNG pour le reste (transparence).
 *
 * Best-effort : en cas d'échec (format non décodable comme HEIC, GIF animé,
 * SVG…) ou si le résultat n'est pas plus léger, le fichier d'origine est
 * renvoyé tel quel.
 */
export async function compressImage(
  file: File,
  { maxDimension = 1600, quality = 0.82 }: { maxDimension?: number; quality?: number } = {},
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // GIF (potentiellement animé) et SVG (vectoriel) : on n'y touche pas.
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  let bitmap: ImageBitmap;
  try {
    // `from-image` applique l'orientation EXIF (photos de smartphone).
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    let blob = await canvasToBlob(canvas, "image/webp", quality);
    // Safari renvoie du PNG quand il ne sait pas encoder le type demandé.
    if (!blob || blob.type !== "image/webp") {
      blob = file.type === "image/jpeg"
        ? await canvasToBlob(canvas, "image/jpeg", quality)
        : await canvasToBlob(canvas, "image/png");
    }
    if (!blob || blob.size >= file.size) return file;

    const ext = blob.type.split("/")[1] === "jpeg" ? "jpg" : blob.type.split("/")[1];
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.${ext}`, { type: blob.type, lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}
