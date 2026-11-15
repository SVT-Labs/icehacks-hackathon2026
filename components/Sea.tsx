import { useId, type ReactNode } from "react";

export function Sea({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <div className={`relative bg-water ${className ?? ""}`}>
      <div
        className="pointer-events-none absolute bottom-full left-0 h-3.5 w-full overflow-hidden"
        aria-hidden="true"
      >
        <svg className="animate-drift h-3.5 w-[calc(100%+120px)]" preserveAspectRatio="none">
          <defs>
            <pattern id={id} width="120" height="14" patternUnits="userSpaceOnUse">
              <path d="M0 8 Q30 -2 60 8 T120 8 V14 H0 Z" fill="var(--water)" />
            </pattern>
          </defs>
          <rect width="100%" height="14" fill={`url(#${id})`} />
        </svg>
      </div>
      {children}
    </div>
  );
}
