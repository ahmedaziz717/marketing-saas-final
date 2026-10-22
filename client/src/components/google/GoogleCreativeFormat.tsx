import { Image, Video, Type, Shapes } from "lucide-react";
import { StudioCard } from "@/components/configurator/StudioCard";
import type { GoogleAssetInput } from "@shared/googleCampaigns";

export type GoogleCreativeFormat = "image" | "video" | "text" | "logo";

const formats = {
  image: {
    title: "Images",
    description: "Square, landscape and supported portrait placements",
    icon: Image,
  },
  video: {
    title: "Videos",
    description: "Reuse a Google video asset or add a YouTube video",
    icon: Video,
  },
  text: {
    title: "Text",
    description: "Headlines, descriptions and business name",
    icon: Type,
  },
  logo: {
    title: "Logos",
    description: "Brand images in supported logo placements",
    icon: Shapes,
  },
};
export const googleFormatLabel = (format: GoogleCreativeFormat) =>
  formats[format].title;
export function googleCreativeFormats(
  type: string,
  brandAssets = true
): GoogleCreativeFormat[] {
  if (type === "SEARCH") return ["text"];
  if (type === "SHOPPING") return [];
  const result: GoogleCreativeFormat[] = ["image"];
  if (["PERFORMANCE_MAX", "APP"].includes(type)) result.push("video");
  if (type === "PERFORMANCE_MAX") result.push("text");
  if (
    brandAssets &&
    ["PERFORMANCE_MAX", "DISPLAY", "DEMAND_GEN"].includes(type)
  )
    result.push("logo");
  return result;
}
export function googleAssetFormat(
  field: GoogleAssetInput["field"]
): GoogleCreativeFormat {
  return field === "YOUTUBE_VIDEO"
    ? "video"
    : field.includes("LOGO")
      ? "logo"
      : field.includes("IMAGE")
        ? "image"
        : "text";
}
export function GoogleFormatPicker({
  type,
  brandAssets = true,
  value,
  includeText = true,
  onChange,
}: {
  type: string;
  brandAssets?: boolean;
  value: GoogleCreativeFormat;
  includeText?: boolean;
  onChange: (value: GoogleCreativeFormat) => void;
}) {
  return (
    <>
      <h2>{type === "PERFORMANCE_MAX" ? "Asset type" : "Ad format"}</h2>
      <p>
        {type === "PERFORMANCE_MAX"
          ? "Choose what to add to this asset group. You can combine images, videos and text in the same reviewed change."
          : "Choose from the creative formats supported by this campaign in EvokeLoop."}
      </p>
      <div className="cfg-card-grid">
        {googleCreativeFormats(type, brandAssets)
          .filter(
            format => includeText || format !== "text" || type === "SEARCH"
          )
          .map(format => {
            const { title, description, icon: Icon } = formats[format];
            return (
              <StudioCard
                key={format}
                title={title}
                description={description}
                selected={value === format}
                onSelect={() => onChange(format)}
                media={
                  <div className="activation-channel-art">
                    <Icon size={36} aria-hidden="true" />
                  </div>
                }
              />
            );
          })}
      </div>
      {type === "SEARCH" && (
        <p>
          Responsive search ads use text. Image and video uploads are not part
          of this ad format.
        </p>
      )}
      {type === "SHOPPING" && (
        <p>Product images come from your Merchant Center feed.</p>
      )}
    </>
  );
}
