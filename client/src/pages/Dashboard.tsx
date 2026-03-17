import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchRequests } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

function truncateUUID(id: string) {
  return id?.length > 8 ? id.slice(0, 8) + "…" : id;
}

function formatDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}


export default function Dashboard() {
  const navigate = useNavigate();
  const { data: requests, isLoading, error } = useQuery({
    queryKey: ["requests"],
    queryFn: fetchRequests,
  });

  const items = Array.isArray(requests) ? requests : requests?.requests || [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Master Data Requests</h1>

      {/* Requests Table */}
      <div className="bg-card border rounded-lg overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading requests...
          </div>
        )}
        {error && (
          <div className="p-8 text-center text-sm text-destructive">
            Failed to load requests: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Request ID</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Sender</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Request Type</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Submitted</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Confidence</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r: any) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{truncateUUID(r.id)}</td>
                    <td className="px-4 py-2 max-w-[180px] truncate">{r.sender}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {r.request_type === "new_vendor" ? "New Vendor"
                        : r.request_type === "change_existing" ? "Change Existing"
                        : r.request_type === "partner_function_change" ? "Partner Function Change"
                        : r.request_type ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-medium ${(r.confidence ?? 0) >= 0.85 ? "text-status-approved" : "text-status-flagged"}`}>
                        {Math.round((r.confidence ?? 0) * 100)}%
                      </span>
                    </td>
                    <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => navigate(`/requests/${r.id}/review`)}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No requests found. Submit an email above to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
