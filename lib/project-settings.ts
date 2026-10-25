import sharp from "sharp";
export class ProjectSettingsError extends Error {}
export function parseProjectSettings(input: {
  displayName: unknown;
  appUrl: unknown;
  repo: unknown;
  imageMode: unknown;
}) {
  if (
    typeof input.displayName !== "string" ||
    input.displayName.trim().length > 80
  )
    throw new ProjectSettingsError(
      "Use a display name of up to 80 characters.",
    );
  if (typeof input.appUrl !== "string" || input.appUrl.length > 2048)
    throw new ProjectSettingsError("Enter a valid app URL.");
  let appUrl: string | null = null;
  if (input.appUrl.trim()) {
    try {
      const url = new URL(input.appUrl.trim());
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
      appUrl = url.href;
    } catch {
      throw new ProjectSettingsError(
        "Enter an app URL starting with http:// or https://, without embedded credentials.",
      );
    }
  }
  if (
    typeof input.repo !== "string" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repo.trim())
  )
    throw new ProjectSettingsError("Choose a GitHub repository you own.");
  if (!["keep", "auto", "upload"].includes(String(input.imageMode)))
    throw new ProjectSettingsError("Choose a valid project image option.");
  return {
    displayName: input.displayName.trim() || null,
    appUrl,
    repo: input.repo.trim(),
    imageMode: String(input.imageMode),
  };
}
export async function projectImage(file: File) {
  if (!file.size || file.size > 2 * 1024 * 1024)
    throw new ProjectSettingsError(
      "Choose a PNG, JPG or WebP image up to 2 MB.",
    );
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 16_777_216,
    });
    const metadata = await image.metadata();
    if (
      !["png", "jpeg", "webp"].includes(metadata.format || "") ||
      (metadata.pages || 1) > 1 ||
      (metadata.width || 0) > 4096 ||
      (metadata.height || 0) > 4096
    )
      throw new Error();
    const bytes = await image
      .rotate()
      .resize({
        width: 256,
        height: 256,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
    // Small, sanitized logos stay in the project record; no separate upload setup.
    return `data:image/webp;base64,${bytes.toString("base64")}`;
  } catch {
    throw new ProjectSettingsError(
      "Use a static PNG, JPG or WebP image, up to 4096 × 4096 pixels.",
    );
  }
}
