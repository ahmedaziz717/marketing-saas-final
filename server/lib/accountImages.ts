import { safeAccountImage } from "../../shared/accountIdentity";
import type { Channel, ConnectionDetails } from "../../shared/channels";
import { graphRequest, remoteId } from "./channelGraph";
import { createHash } from "node:crypto";
const images = new Map<
  string,
  {
    expires: number;
    value: Promise<Pick<ConnectionDetails, "imageUrl" | "imageSource">>;
  }
>();

/** Meta exposes Page pictures and business pictures, not an ad-account logo field. */
export async function readAccountImage(
  channel: Channel,
  accountId: string,
  token: string
): Promise<Pick<ConnectionDetails, "imageUrl" | "imageSource">> {
  const key = `${channel}:${accountId}:${createHash("sha256").update(token).digest("hex")}`;
  const cached = images.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  if (images.size > 200) images.clear();
  const value = fetchAccountImage(channel, accountId, token);
  images.set(key, { expires: Date.now() + 15 * 60000, value });
  return value;
}
async function fetchAccountImage(
  channel: Channel,
  accountId: string,
  token: string
): Promise<Pick<ConnectionDetails, "imageUrl" | "imageSource">> {
  try {
    const page = channel === "facebook";
    const result = await graphRequest(
      page ? remoteId(accountId) : `act_${remoteId(accountId)}`,
      token,
      { fields: page ? "picture.type(large)" : "business{profile_picture_uri}" }
    );
    const imageUrl = safeAccountImage(
      page ? result.picture?.data?.url : result.business?.profile_picture_uri
    );
    return imageUrl
      ? { imageUrl, imageSource: page ? "page" : "business" }
      : {};
  } catch {
    // Optional presentation metadata must never block account connection or publishing.
    return {};
  }
}
