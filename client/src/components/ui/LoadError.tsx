import { AlertTriangle } from "lucide-react";

/** Shown when data could not be loaded, instead of an empty state that looks like "nothing exists". */
export function LoadError({ what, message, onRetry }: { what: string; message?: string | null; onRetry?: () => void }) {
  return (
    <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg border border-accent-line bg-accent-soft px-4 py-3 text-sm text-accent-ink">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="flex-1">
        Could not load {what} from the SIRI backend{message ? `: ${message}` : "."}
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}
