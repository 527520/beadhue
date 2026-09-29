import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
const prefix = "preview-";
/** Only reproducible authenticated previews live here; original-* files are never evicted. */
export function clearPreviewCache(keep?: string) {
  const fs = wx.getFileSystemManager();
  for (const name of fs.readdirSync(wx.env.USER_DATA_PATH)) {
    if (name.startsWith(prefix) && name !== keep) {
      try {
        fs.unlinkSync(`${wx.env.USER_DATA_PATH}/${name}`);
      } catch {
        /* Best effort cache cleanup. */
      }
    }
  }
}
export function cachePreview(
  userId: string,
  apiPath: string,
  bytes: ArrayBuffer,
): string {
  const fs = wx.getFileSystemManager();
  const name = `${prefix}${userId}-${bytesToHex(sha256(utf8ToBytes(apiPath))).slice(0, 24)}.png`;
  const path = `${wx.env.USER_DATA_PATH}/${name}`;
  // A single deterministic preview bounds persistent usage even when many originals are visited.
  clearPreviewCache(name);
  try {
    fs.writeFileSync(path, bytes);
  } catch {
    clearPreviewCache();
    fs.writeFileSync(path, bytes);
  }
  return path;
}
