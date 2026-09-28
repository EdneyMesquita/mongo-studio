import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** A failed query or script: the server's message, verbatim, in data type. */
export function ResultsError({ message, className }: { message: string; className?: string }) {
  return (
    <div
      role="alert"
      className={cn("mx-3 my-2 flex gap-2 rounded-md bg-danger/10 px-3 py-2 text-danger", className)}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <pre className="m-0 min-w-0 font-data break-words whitespace-pre-wrap select-text">{message}</pre>
    </div>
  );
}
