import { useEffect, useState } from "react";
import { Image, Sparkles } from "lucide-react";

/** Decorative motion accompanies real job state; it does not imply a completion percentage. */
export function StudioGeneration({
  status,
  referenceUrl,
  completed = 0,
  reconnecting = false,
}: {
  status?: string;
  referenceUrl?: string;
  completed?: number;
  reconnecting?: boolean;
}) {
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const title = reconnecting
    ? "Checking your generation"
    : status === "queued"
      ? "Your images are queued"
      : "Creating your images";
  return (
    <div
      className="cfg-generation"
      aria-label="Image generation"
      aria-busy="true"
    >
      <div className="cfg-generation-visual" aria-hidden="true">
        <div className="cfg-generation-glow" />
        <div className="cfg-generation-card cfg-generation-card-back" />
        <div className="cfg-generation-card cfg-generation-card-middle" />
        <div className="cfg-generation-card cfg-generation-card-front">
          {referenceUrl ? (
            <img src={referenceUrl} alt="" />
          ) : (
            <Image size={38} />
          )}
          <span className="cfg-generation-sweep" />
        </div>
        <Sparkles className="cfg-generation-spark" size={21} />
      </div>
      <div className="cfg-generation-copy" role="status" aria-live="polite">
        <strong>
          {title}
          <span className="cfg-generation-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </strong>
        <p>
          {reconnecting
            ? "The connection is taking a moment. Checking again automatically."
            : completed > 0
              ? `${completed} ${completed === 1 ? "image is" : "images are"} ready. Finishing the remaining versions.`
              : status === "queued"
                ? "Waiting to start. Finished images will appear here."
                : "Bringing your creative to life. Results will appear here."}
        </p>
      </div>
      <div className="cfg-generation-meta">
        <span>Saved as drafts when ready</span>
        <time aria-label="Time in this generation view">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}{" "}
          elapsed
        </time>
      </div>
      <div className="cfg-generation-track" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}
