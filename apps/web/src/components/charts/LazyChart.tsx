import { ReactNode, Suspense } from "react";
import { Skeleton } from "../ui";

/**
 * recharts is ~350 kB of the bundle. Every chart is imported through
 * React.lazy so a phone opening a list page never downloads it at all; this
 * wrapper just supplies the placeholder while the chunk arrives.
 */
export function LazyChart({ children, height = "h-64 sm:h-72" }: { children: ReactNode; height?: string }) {
  return <Suspense fallback={<Skeleton className={`w-full ${height}`} />}>{children}</Suspense>;
}
