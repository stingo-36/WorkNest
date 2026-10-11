import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Class merge helper.
 *
 * Lives here rather than in `src/lib/` because `src/lib/**` is owned by the
 * backend. Import it as `@/components/cn`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
