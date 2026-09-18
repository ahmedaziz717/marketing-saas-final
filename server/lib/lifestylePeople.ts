import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { findLifestylePerson } from "../../shared/lifestylePeople";

// Only trusted catalog IDs resolve to local portrait sheets, never user-supplied paths.
export async function readLifestylePortrait(id: string) {
  const person = findLifestylePerson(id);
  if (!person) throw new Error("Person reference unavailable");
  const bytes = await readFile(
    path.resolve("client/public", person.sheet.slice(1))
  );
  const meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height)
    throw new Error("Person reference unavailable");
  const left = Math.floor((meta.width * person.column) / 5);
  const top = Math.floor((meta.height * person.row) / 2);
  const width = Math.floor((meta.width * (person.column + 1)) / 5) - left;
  const height = Math.floor((meta.height * (person.row + 1)) / 2) - top;
  const portrait = await sharp(bytes)
    .extract({ left, top, width, height })
    .png()
    .toBuffer();
  return { b64Json: portrait.toString("base64"), mimeType: "image/png" };
}
