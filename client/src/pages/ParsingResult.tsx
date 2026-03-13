import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchRequest, flagRequest } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useState } from "react";

export default function ParsingResult() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ["request", id], queryFn: () => fetchRequest(id!) });
  const [acting, setActing] = useState("");

  if (isLoading) return <div className="p-8 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading...</div>;
  if (error) return <div className="p-8 text-center text-destructive">Error: {(error as Error).message}</div>;

  const r = data;
  const items = r?.items || r?.changes || [];
  const confidence = r?.confidence ?? 0;

  const handleApprove = () => {
    navigate(`/requests/${id}/review`);
  };
  const handleFlag = async () => {
    setActing("flag");
    try { await flagRequest(id!); navigate("/"); } catch {} finally { setActing(""); }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Request Details</h1>

      <div className="bg-card border rounded-lg p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-xs text-muted-foreground block">Sender</span><span className="break-all">{r.sender}</span></div>
          <div><span className="text-xs text-muted-foreground block">Submitted</span>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</div>
          <div><span className="text-xs text-muted-foreground block">Request Type</span>{r.request_type}{r.sub_type ? ` / ${r.sub_type}` : ""}</div>
          <div>
            <span className="text-xs text-muted-foreground block">Confidence</span>
            <span className={`font-medium ${confidence >= 0.85 ? "text-status-approved" : "text-status-flagged"}`}>{Math.round(confidence * 100)}%</span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          <StatusBadge status={r.status} />
        </div>
        {r.notes && <div className="mt-3 bg-muted rounded p-3 text-sm"><span className="text-xs font-medium text-muted-foreground block mb-1">AI Notes</span>{r.notes}</div>}
      </div>

      {items.length > 0 && (
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Account ID</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Field</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Current Value</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Proposed Value</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, i: number) => (
                  <tr key={item.id || i} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{item.account_id}</td>
                    <td className="px-4 py-2">{item.field_name || item.field}</td>
                    <td className="px-4 py-2 text-muted-foreground">{item.current_value ?? "—"}</td>
                    <td className="px-4 py-2 font-medium">{item.proposed_value ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleApprove} disabled={!!acting} className="bg-status-approved hover:bg-status-approved/90 text-primary-foreground">
          {acting === "approve" && <Loader2 className="mr-2 h-3 w-3 animate-spin" />} Send for Review
        </Button>
        <Button variant="outline" onClick={handleFlag} disabled={!!acting} className="border-status-flagged text-status-flagged hover:bg-status-flagged/10">
          {acting === "flag" && <Loader2 className="mr-2 h-3 w-3 animate-spin" />} Flag for Manual Review
        </Button>
      </div>
    </div>
  );
}
