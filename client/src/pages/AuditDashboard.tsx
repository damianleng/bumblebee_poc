import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAuditLog } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

function truncateUUID(id: string) {
  return id?.length > 8 ? id.slice(0, 8) + "…" : id;
}

const statuses = ["all", "pending_review", "approved", "denied", "completed", "flagged"];

export default function AuditDashboard() {
  const [status, setStatus] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filters, setFilters] = useState<{ status?: string; from_date?: string; to_date?: string }>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit", filters],
    queryFn: () => fetchAuditLog(filters),
  });

  const handleApply = () => {
    setFilters({ status: status !== "all" ? status : undefined, from_date: fromDate || undefined, to_date: toDate || undefined });
  };

  const items = Array.isArray(data) ? data : data?.audit_logs || data?.requests || [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Audit Log</h1>

      <div className="bg-card border rounded-lg p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 w-full sm:w-auto">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {statuses.map(s => <SelectItem key={s} value={s}>{s === "all" ? "All" : s.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 w-full sm:w-auto">
            <label className="text-xs text-muted-foreground">Date From</label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 text-sm w-full sm:w-40" />
          </div>
          <div className="space-y-1.5 w-full sm:w-auto">
            <label className="text-xs text-muted-foreground">Date To</label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 text-sm w-full sm:w-40" />
          </div>
          <Button size="sm" className="h-8 text-sm w-full sm:w-auto" onClick={handleApply}>Apply</Button>
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        {isLoading && <div className="p-8 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading...</div>}
        {error && <div className="p-8 text-center text-destructive">Error: {(error as Error).message}</div>}
        {!isLoading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Request ID", "Sender", "Request Type", "Submitted", "Status", "Reviewed By", "Completed At"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((r: any) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{truncateUUID(r.id || r.request_id)}</td>
                    <td className="px-4 py-2 max-w-[160px] truncate">{r.sender}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.request_type ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.reviewed_by || "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{r.completed_at ? new Date(r.completed_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No audit records found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
