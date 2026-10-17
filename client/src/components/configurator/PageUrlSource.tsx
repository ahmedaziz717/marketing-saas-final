import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { CreativeSetup } from "@shared/creativeBuilder";
import type { VideoSetup } from "@shared/videoCreation";

const pageTypes = [
  { id: "product", title: "Product", detail: "A specific catalog item" },
  { id: "service", title: "Service", detail: "An offering or service" },
  {
    id: "general",
    title: "General promotion",
    detail: "A page, quiz, article or event",
  },
] as const;
type PageType = (typeof pageTypes)[number]["id"];

export function PageUrlSource({
  organizationId,
  kind,
  image,
  video,
  updateImage,
  updateVideo,
  onUploaded,
  onManual,
}: {
  organizationId: number;
  kind: "image" | "video";
  image: CreativeSetup;
  video: VideoSetup;
  updateImage: (patch: Partial<CreativeSetup>) => void;
  updateVideo: (patch: Partial<VideoSetup>) => void;
  onUploaded: () => Promise<unknown>;
  onManual: () => void;
}) {
  const saved =
    kind === "image"
      ? image.promotionMode === "platform"
        ? image.promotion
        : undefined
      : video.promotion;
  const [pageType, setPageType] = useState<PageType>(
    saved?.kind === "service"
      ? "service"
      : saved?.sourceUrl
        ? "general"
        : "product"
  );
  const [url, setUrl] = useState(saved?.sourceUrl ?? "");
  const [title, setTitle] = useState(saved?.sourceUrl ? saved.title : "");
  const [description, setDescription] = useState(
    saved?.sourceUrl ? saved.description : ""
  );
  const [pageContent, setPageContent] = useState(saved?.pageContent);
  const [reviewedUrl, setReviewedUrl] = useState(saved?.sourceUrl ?? "");
  const [applied, setApplied] = useState(!!saved?.sourceUrl);
  const [imported, setImported] = useState(false);
  const preview = trpc.catalogSources.previewPage.useMutation();
  const importer = trpc.catalogSources.addEntries.useMutation();
  const busy = preview.isPending || importer.isPending;
  const product = preview.data?.product;
  return (
    <div className="cfg-form">
      <h3>Get from URL</h3>
      <p className="cfg-help">
        Bring in a product, service or page content. Reading a public page uses
        no AI credits.
      </p>
      <div
        className="cfg-page-types"
        role="group"
        aria-label="What does this page promote?"
      >
        {pageTypes.map(type => (
          <button
            key={type.id}
            type="button"
            aria-pressed={pageType === type.id}
            disabled={busy}
            onClick={() => {
              setPageType(type.id);
              setApplied(false);
            }}
          >
            <strong>{type.title}</strong>
            <small>{type.detail}</small>
          </button>
        ))}
      </div>
      <form
        onSubmit={async e => {
          e.preventDefault();
          setImported(false);
          setApplied(false);
          setReviewedUrl("");
          try {
            const page = await preview.mutateAsync({
              organizationId,
              website: url,
            });
            setTitle(page.title);
            setDescription(page.description);
            setPageContent(page.pageContent);
            setReviewedUrl(page.url);
          } catch {}
        }}
      >
        <label className="cfg-field">
          <span>Page URL</span>
          <input
            aria-label="Page URL"
            value={url}
            disabled={busy}
            onChange={e => {
              setUrl(e.target.value);
              preview.reset();
              setReviewedUrl("");
              setImported(false);
              setApplied(false);
            }}
            placeholder="https://example.com/page"
            required
          />
        </label>
        <button className="cfg-primary" disabled={busy || !url.trim()}>
          {preview.isPending ? "Reading page…" : "Get page details"}
        </button>
      </form>
      {preview.error && (
        <div role="alert" className="cfg-problems">
          <p>{preview.error.message}</p>
          <button type="button" className="cfg-secondary" onClick={onManual}>
            Describe manually
          </button>
        </div>
      )}
      {!!reviewedUrl && (
        <div className="cfg-url-result">
          {preview.data?.imageUrl && (
            <img
              src={preview.data.imageUrl}
              alt="Page preview"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="cfg-page-details">
            <a href={reviewedUrl} target="_blank" rel="noopener noreferrer">
              View source page
            </a>
            {pageType === "product" ? (
              product ? (
                <>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  {imported ? (
                    <p role="status">
                      Added to your catalog for review.{" "}
                      <Link href="/app/catalog">
                        Review and approve the product
                      </Link>
                      , then return to select its images.
                    </p>
                  ) : (
                    <button
                      className="cfg-primary"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          const result = await importer.mutateAsync({
                            organizationId,
                            entries: [product],
                          });
                          if (result[0]?.error)
                            throw new Error(result[0].error);
                          setImported(true);
                          await onUploaded();
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not import product"
                          );
                        }
                      }}
                    >
                      {importer.isPending
                        ? "Adding product…"
                        : "Add to catalog for review"}
                    </button>
                  )}
                </>
              ) : (
                <div role="status">
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <p>
                    This page does not appear to be a catalog product. Choose{" "}
                    <strong>Service</strong> or{" "}
                    <strong>General promotion</strong> above to use its content.
                  </p>
                </div>
              )
            ) : (
              <>
                <p className="cfg-help">
                  Review the page details, then use them as your creative brief.
                  You can refine the copy in Story &amp; Sound.
                </p>
                <label className="cfg-field">
                  <span>Promotion title</span>
                  <input
                    value={title}
                    maxLength={180}
                    onChange={e => {
                      setTitle(e.target.value);
                      setApplied(false);
                    }}
                  />
                </label>
                <label className="cfg-field">
                  <span>What should we promote?</span>
                  <textarea
                    value={description}
                    rows={5}
                    maxLength={3000}
                    onChange={e => {
                      setDescription(e.target.value);
                      setApplied(false);
                    }}
                  />
                </label>
                <button
                  className="cfg-primary"
                  disabled={!title.trim() || !description.trim() || applied}
                  onClick={() => {
                    const promotion = {
                      kind: pageType,
                      title: title.trim(),
                      description: description.trim(),
                      sourceUrl: reviewedUrl,
                      pageContent,
                    };
                    if (kind === "image")
                      updateImage({
                        promotionMode: "platform",
                        products: [],
                        preserveProduct: false,
                        promotion,
                        copy: {
                          headline: promotion.title,
                          subheadline: promotion.description.slice(0, 400),
                          cta: "Learn more",
                        },
                      });
                    else
                      updateVideo({
                        promotion,
                        title: promotion.title.slice(0, 160),
                        prompt: `Create a promotion for ${promotion.title}. Use the reviewed page details as factual context.`,
                        imageKeys: video.imageKeys.filter(
                          key => !key.startsWith("product_image:")
                        ),
                      });
                    setApplied(true);
                    toast.success("Page details added to your creative brief.");
                  }}
                >
                  {applied ? "Page added to brief" : "Use page for promotion"}
                </button>
                <details className="cfg-page-content">
                  <summary>Page content used by AI</summary>
                  <p className="cfg-help">
                    The copy uses your title, summary and this page text. Remove
                    anything unrelated before adding it to your brief.
                  </p>
                  <label className="cfg-field">
                    <span>Page details</span>
                    <textarea
                      value={pageContent ?? ""}
                      rows={7}
                      maxLength={12000}
                      onChange={e => {
                        setPageContent(e.target.value);
                        setApplied(false);
                      }}
                    />
                  </label>
                </details>
                {applied && (
                  <p role="status">
                    Your {pageType === "service" ? "service" : "page content"}{" "}
                    is ready. Continue to Look &amp; Feel to style the creative.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
