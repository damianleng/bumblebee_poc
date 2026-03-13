import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; className: string }> = {
  pending_review: { label: "Pending Review", className: "bg-status-pending/15 text-status-pending border-status-pending/30" },
  in_review: { label: "In Review", className: "bg-status-in-review/15 text-status-in-review border-status-in-review/30" },
  approved: { label: "Approved", className: "bg-status-approved/15 text-status-approved border-status-approved/30" },
  auto_classified: { label: "Auto Classified", className: "bg-status-approved/15 text-status-approved border-status-approved/30" },
  denied: { label: "Denied", className: "bg-status-denied/15 text-status-denied border-status-denied/30" },
  completed: { label: "Completed", className: "bg-status-completed/15 text-status-completed border-status-completed/30" },
  flagged: { label: "Flagged", className: "bg-status-flagged/15 text-status-flagged border-status-flagged/30" },
  needs_review: { label: "Needs Review", className: "bg-status-flagged/15 text-status-flagged border-status-flagged/30" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, className: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border", config.className)}>
      {config.label}
    </span>
  );
}
