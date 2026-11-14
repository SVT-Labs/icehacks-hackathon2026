import type { Avatar } from "@/lib/types";

/** Body colours of the penguins. `shade` is the wing and outline tone. */
export const AVATAR_COLORS: Record<
  Avatar,
  { body: string; shade: string; label: string }
> = {
  navy: { body: "#27476e", shade: "#1a3252", label: "Navy" },
  teal: { body: "#12857b", shade: "#0b635c", label: "Teal" },
  coral: { body: "#e2604a", shade: "#b9432f", label: "Coral" },
  sun: { body: "#dfa01a", shade: "#b27c0c", label: "Sun" },
  plum: { body: "#8647ab", shade: "#653284", label: "Plum" },
  mint: { body: "#35a880", shade: "#237d5e", label: "Mint" },
  rose: { body: "#d9558a", shade: "#ae3869", label: "Rose" },
  slate: { body: "#5d7088", shade: "#435468", label: "Slate" },
};
