/** Read MP4 container timing/dimensions without decoding or executing uploaded media. */
export function mp4Info(bytes: Buffer): {
  durationSeconds: number;
  width: number;
  height: number;
} {
  let durationSeconds = 0,
    width = 0,
    height = 0,
    count = 0;
  const visit = (start: number, end: number, depth: number) => {
    if (depth > 4) return;
    let cursor = start;
    while (cursor + 8 <= end) {
      if (++count > 10000) throw new Error("Invalid video container");
      let size = bytes.readUInt32BE(cursor),
        header = 8;
      if (size === 1) {
        if (cursor + 16 > end) throw new Error("Invalid video container");
        size = Number(bytes.readBigUInt64BE(cursor + 8));
        header = 16;
      }
      if (size === 0) size = end - cursor;
      if (!Number.isSafeInteger(size) || size < header || cursor + size > end)
        throw new Error("Invalid video container");
      const type = bytes.toString("ascii", cursor + 4, cursor + 8),
        from = cursor + header,
        to = cursor + size;
      if (["moov", "trak"].includes(type)) visit(from, to, depth + 1);
      if (type === "mvhd" && to - from >= 32) {
        const version = bytes[from];
        if (version !== 0 && version !== 1)
          throw new Error("Invalid video timing");
        const scale = bytes.readUInt32BE(from + (version === 1 ? 20 : 12));
        const ticks =
          version === 1
            ? Number(bytes.readBigUInt64BE(from + 24))
            : bytes.readUInt32BE(from + 16);
        durationSeconds = scale ? ticks / scale : 0;
      }
      if (type === "tkhd" && to - from >= 84) {
        width = Math.max(width, bytes.readUInt32BE(to - 8) / 65536);
        height = Math.max(height, bytes.readUInt32BE(to - 4) / 65536);
      }
      cursor = to;
    }
  };
  if (bytes.length < 16 || bytes.toString("ascii", 4, 8) !== "ftyp")
    throw new Error("Use an MP4 video for this reference.");
  visit(0, bytes.length, 0);
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > 86400 ||
    !width ||
    !height ||
    width > 16384 ||
    height > 16384
  )
    throw new Error(
      "The video’s duration or dimensions could not be read. Export it as MP4 and upload it again."
    );
  return {
    durationSeconds,
    width: Math.round(width),
    height: Math.round(height),
  };
}
