import { useId } from "react";

/** Small, local editorial illustrations. These are visual guides, never claimed model outputs. */
export function ChoiceArt({
  name,
  type = "image",
  palette = ["#181727", "#8b7cfa", "#d6fa72"],
}: {
  name: string;
  type?: string;
  palette?: readonly string[];
}) {
  const uid = useId().replaceAll(":", "");
  const hash = Array.from(name).reduce((s, c) => s + c.charCodeAt(0), 0);
  const people = /people|person|creator/i.test(type);
  const video = /video|motion|edit|extend/i.test(type);
  const ratio = type.startsWith("format:") ? Number(type.slice(7)) : null;
  const width = ratio ? Math.min(170, 130 * ratio) : 170;
  const height = ratio ? width / ratio : 130;
  return (
    <svg
      viewBox="0 0 400 220"
      role="img"
      aria-label={name + " illustration"}
      className="cfg-art"
    >
      <defs>
        <linearGradient id={uid} x2="1" y2="1">
          <stop stopColor={palette[0]} />
          <stop offset="1" stopColor={palette[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="220" fill={"url(#" + uid + ")"} />
      <circle
        cx={290 + (hash % 45)}
        cy="30"
        r="140"
        fill={palette[2]}
        opacity=".09"
      />
      <path
        d="M0 180 Q170 90 400 190 M0 200 Q200 120 400 210"
        stroke="white"
        strokeWidth="1"
        fill="none"
        opacity=".13"
      />
      {ratio ? (
        <g>
          <rect
            x={200 - width / 2}
            y={110 - height / 2}
            width={width}
            height={height}
            rx="5"
            fill="white"
            opacity=".18"
            stroke="white"
            strokeWidth="2"
          />
          <path d="M190 110h20m-10-10v20" stroke={palette[2]} strokeWidth="2" />
        </g>
      ) : people ? (
        <g fill={palette[2]}>
          <circle cx="200" cy="77" r="31" opacity=".95" />
          <path d="M130 190 Q130 116 200 116 Q270 116 270 190Z" opacity=".65" />
          <circle cx="285" cy="98" r="22" opacity=".4" />
          <path d="M245 190 Q240 127 286 127 Q335 127 330 190Z" opacity=".3" />
        </g>
      ) : (
        <g transform={"translate(200 109) rotate(" + ((hash % 14) - 7) + ")"}>
          <rect
            x="-91"
            y="-65"
            width="182"
            height="130"
            rx="15"
            fill="#fff"
            opacity=".12"
            stroke="#fff"
          />
          <rect
            x="-74"
            y="-49"
            width="148"
            height="98"
            rx="7"
            fill={palette[0]}
            opacity=".8"
          />
          {video ? (
            <path d="M-12 -23 L25 0 L-12 23Z" fill={palette[2]} />
          ) : (
            <>
              <circle cx="32" cy="-22" r="13" fill={palette[2]} />
              <path
                d="M-65 41 L-19 -18 L11 15 L33 -1 L67 41Z"
                fill={palette[1]}
              />
              <path
                d="M-65 41 L-19 -18 L-2 5 L-13 12Z"
                fill={palette[2]}
                opacity=".6"
              />
            </>
          )}
        </g>
      )}
      <circle cx="43" cy="35" r="4" fill={palette[2]} />
      <path d="M345 174h20m-10-10v20" stroke={palette[2]} opacity=".7" />
    </svg>
  );
}
