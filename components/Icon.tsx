// A small set of line icons drawn inline, so the app ships no icon font.
// Icons are decorative by default; pass `label` when one stands alone.

const PATHS = {
  copy: "M9 9h10v10H9z M5 15V5h10",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12 M18 6L6 18",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M6 11a6 6 0 0 0 12 0 M12 17v4",
  volume: "M4 10v4h4l5 4V6L8 10H4z M16.5 9a4 4 0 0 1 0 6 M19 6.5a8 8 0 0 1 0 11",
  mute: "M4 10v4h4l5 4V6L8 10H4z M17 9.5l4 5 M21 9.5l-4 5",
  crown: "M4 18h16 M4 18L3 8l5 4 4-7 4 7 5-4-1 10",
  bot: "M7 9h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z M12 9V5 M9.5 14h.01 M14.5 14h.01 M12 5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.200-1.8z M19 16l.7 2 .2.1 2 .7-2 .7-.2.1-.7 2-.7-2-.2-.1-2-.7 2-.7.2-.1z",
  pencil: "M4 20l1-4L16 5l3 3L8 19z M14 7l3 3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  share: "M12 15V4 M8 8l4-4 4 4 M5 13v6h14v-6",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  pause: "M8 5v14 M16 5v14",
  play: "M7 5l12 7-12 7z",
  skip: "M5 5l9 7-9 7z M18 5v14",
  users: "M9 11a3.500 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7z M2.500 20a6.500 6.500 0 0 1 13 0 M17 4.500a3.500 3.500 0 0 1 0 6.500 M18 14.500a6 6 0 0 1 3.500 5.500",
  settings: "M4 7h10 M18 7h2 M4 17h2 M10 17h10 M16 7m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M8 17m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0",
  refresh: "M20 11a8 8 0 0 0-14.500-4 M4 4v4h4 M4 13a8 8 0 0 0 14.500 4 M20 20v-4h-4",
  eye: "M2 12s3.500-6.500 10-6.500S22 12 22 12s-3.500 6.500-10 6.500S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  flag: "M6 21V4 M6 4h11l-2 4 2 4H6",
  logout: "M10 5H5v14h5 M14 8l4 4-4 4 M9 12h9",
  drop: "M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z",
  home: "M4 11l8-7 8 7 M6 10v10h12V10",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  label,
  className,
}: {
  name: IconName;
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name].split(" M").map((part, i) => (
        <path key={i} d={i === 0 ? part : `M${part}`} />
      ))}
    </svg>
  );
}
