import { useState } from "react";
import { Link2 } from "lucide-react";
import { linkSchema, type PublicationContent } from "@shared/channels";
import { normalizeDestinationUrl } from "@shared/briefValidation";
import { appendCaptionLink, SOCIAL_CAPTION_LIMIT } from "@shared/socialPost";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { channelInput } from "./ChannelConnections";

export function SocialPostFields({
  content,
  hasMedia,
  onChange,
  errors = {},
}: {
  content: PublicationContent;
  hasMedia: boolean;
  onChange: (content: PublicationContent) => void;
  errors?: Record<string, string>;
}) {
  const [addingLink, setAddingLink] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");
  const overLimit = content.message.length > SOCIAL_CAPTION_LIMIT;
  const captionRequired = !hasMedia && !content.link.trim();
  function addLink() {
    const url = normalizeDestinationUrl(link);
    if (!url || !linkSchema.safeParse(url).success) {
      setLinkError("Enter a website address, such as example.com.");
      return;
    }
    const message = appendCaptionLink(content.message, url);
    if (message.length > SOCIAL_CAPTION_LIMIT) {
      setLinkError("Shorten the caption to make room for this link.");
      return;
    }
    onChange({ ...content, message });
    setLink("");
    setLinkError("");
    setAddingLink(false);
    document.getElementById("pub-message")?.focus();
  }
  return (
    <section aria-label="Write your post" className="sm:col-span-2 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor="pub-message" className="text-base font-semibold">
          Post caption
        </Label>
        <span className="text-xs text-muted-foreground">
          {captionRequired ? "Required for a text-only post" : "Optional"}
        </span>
      </div>
      <textarea
        id="pub-message"
        className={channelInput + " social-post-caption"}
        rows={5}
        maxLength={SOCIAL_CAPTION_LIMIT}
        value={content.message}
        aria-required={captionRequired}
        aria-invalid={overLimit || !!errors.message}
        aria-describedby="pub-caption-help pub-caption-count"
        placeholder="Write what you want people to see. Include your website link and hashtags here."
        onChange={e => onChange({ ...content, message: e.target.value })}
      />
      <div className="flex flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground">
        <p id="pub-caption-help" className="max-w-xl">
          {hasMedia
            ? "This text appears with your photo or video. Website links belong in this caption."
            : "This is the text people will see on Facebook. Add a photo, video or website preview below if you want."}
        </p>
        <span
          id="pub-caption-count"
          className={overLimit ? "text-destructive" : ""}
        >
          {content.message.length.toLocaleString()} / 5,000
        </span>
      </div>
      {(overLimit || errors.message) && (
        <p role="alert" className="text-sm text-destructive">
          {overLimit
            ? "Your caption is over 5,000 characters. Shorten it before saving."
            : errors.message}
        </p>
      )}
      {hasMedia ? (
        <>
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddingLink(true)}
            >
              <Link2 className="mr-2 h-4 w-4" />
              Add website link
            </Button>
            <Dialog open={addingLink} onOpenChange={setAddingLink}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add website link</DialogTitle>
                  <DialogDescription>
                    The link will be added to the end of your caption.
                  </DialogDescription>
                </DialogHeader>
                <Label htmlFor="pub-caption-link">Website URL</Label>
                <input
                  id="pub-caption-link"
                  className={channelInput}
                  value={link}
                  placeholder="example.com"
                  inputMode="url"
                  autoFocus
                  aria-invalid={!!linkError}
                  onChange={e => {
                    setLink(e.target.value);
                    setLinkError("");
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLink();
                    }
                  }}
                />
                {linkError && (
                  <p role="alert" className="text-sm text-destructive">
                    {linkError}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!link.trim()}
                    onClick={addLink}
                  >
                    Add to caption
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAddingLink(false);
                      setLinkError("");
                    }}
                  >
                    Cancel link
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        </>
      ) : (
        <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
          <Label htmlFor="pub-link">Website preview (optional)</Label>
          <input
            id="pub-link"
            className={channelInput}
            value={content.link}
            inputMode="url"
            placeholder="example.com"
            aria-invalid={!!errors.link}
            onChange={e => onChange({ ...content, link: e.target.value })}
            onBlur={() => {
              const url = normalizeDestinationUrl(content.link);
              if (url !== null && linkSchema.safeParse(url).success)
                onChange({ ...content, link: url });
            }}
          />
          <p className="text-xs text-muted-foreground">
            Creates a website preview. If you add a photo or video, we’ll move
            this link into your caption automatically.
          </p>
          {errors.link && (
            <p role="alert" className="text-sm text-destructive">
              {errors.link}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
