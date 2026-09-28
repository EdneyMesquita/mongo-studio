import { useId } from "react";
import { cn } from "@/lib/utils";

interface AppLogoProps {
  className?: string;
}

/**
 * The app icon (src-tauri/icons/icon-source.svg), inline so it scales
 * crisply at any size. Gradient ids are per instance: two logos on screen
 * (toolbar and welcome) mustn't share them.
 */
export function AppLogo({ className }: AppLogoProps) {
  // useId's punctuation doesn't survive url(#...) everywhere
  const id = `logo${useId().replace(/[^\w-]/g, "")}`;
  const bg = `${id}-bg`;
  const cyl = `${id}-cyl`;
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#242837" />
          <stop offset="1" stopColor="#0d0f14" />
        </linearGradient>
        <linearGradient id={cyl} x1="512" y1="230" x2="512" y2="800" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6EF0AE" />
          <stop offset="1" stopColor="#0E7C4A" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="200" fill={`url(#${bg})`} />
      <path d="M 232 340 L 232 684 A 280 92 0 0 0 792 684 L 792 340 Z" fill={`url(#${cyl})`} />
      <ellipse
        cx="512"
        cy="340"
        rx="280"
        ry="92"
        fill={`url(#${cyl})`}
        stroke="#0a5c37"
        strokeWidth="8"
      />
      <path d="M 232 458 A 280 92 0 0 0 792 458" fill="none" stroke="#0a5c37" strokeWidth="8" opacity=".55" />
      <path d="M 232 571 A 280 92 0 0 0 792 571" fill="none" stroke="#0a5c37" strokeWidth="8" opacity=".55" />
    </svg>
  );
}
