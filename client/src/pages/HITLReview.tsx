import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchRequest, approveRequest, denyRequest, updateItem, executeSkybot } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, X, Loader2 } from "lucide-react";
import { useState } from "react";

export default function HITLReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["request", id], queryFn: () => fetchRequest(id!) });

  const [comments, setComments] = useState<Record<string, string>>({});
  const [itemStatuses, setItemStatuses] = useState<Record<string, string>>({});
  const [acting, setActing] = useState("");
  const [skybotResult, setSkybotResult] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading...</div>;
  if (error) return <div className="p-8 text-center text-destructive">Error: {(error as Error).message}</div>;

  const r = data;
  const items = r?.items || r?.changes || [];
  const isCSR = r?.request_type === "partner_function_change";

  const handleItemAction = async (itemId: string, status: "approved" | "denied") => {
    setItemStatuses(prev => ({ ...prev, [itemId]: status }));
    try {
      await updateItem(id!, itemId, { approval_status: status, reviewer_comment: comments[itemId] || "" });
      queryClient.invalidateQueries({ queryKey: ["request", id] });
    } catch {}
  };

  const handleBulkApprove = async () => {
    setActing("approve");
    try { await approveRequest(id!); queryClient.invalidateQueries({ queryKey: ["request", id] }); } catch {} finally { setActing(""); }
  };

  const handleBulkDeny = async () => {
    setActing("deny");
    try { await denyRequest(id!); queryClient.invalidateQueries({ queryKey: ["request", id] }); } catch {} finally { setActing(""); }
  };

  const handleSkybot = async () => {
    setActing("skybot");
    try {
      const res = await executeSkybot(id!);
      setSkybotResult(res);
      setShowModal(true);
    } catch {} finally { setActing(""); }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Review Changes</h1>

      {/* Summary card */}
      <div className="bg-card border rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          {isCSR ? (
            <div>
              <span className="text-xs text-muted-foreground block mb-0.5">Sender</span>
              <span className="truncate block">{r.sender}</span>
            </div>
          ) : (
            <div>
              <span className="text-xs text-muted-foreground block mb-0.5">Vendor Name</span>
              <span className="font-medium truncate block">{r.vendor_name ?? "—"}</span>
            </div>
          )}
          {isCSR ? (
            <div>
              <span className="text-xs text-muted-foreground block mb-0.5">Submitted</span>
              <span>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</span>
            </div>
          ) : (
            <div>
              <span className="text-xs text-muted-foreground block mb-0.5">Vendor #</span>
              <span className="font-mono">{r.vendor_number ?? "New Vendor"}</span>
            </div>
          )}
          <div>
            <span className="text-xs text-muted-foreground block mb-0.5">Request Type</span>
            <span>
              {r.request_type === "new_vendor" ? "New Vendor"
                : r.request_type === "change_existing" ? "Change Existing"
                : r.request_type === "partner_function_change" ? "Partner Function Change"
                : r.request_type ?? "—"}
            </span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block mb-0.5">Confidence</span>
            <span className={`font-medium ${(r.confidence ?? 0) >= 0.85 ? "text-status-approved" : "text-status-flagged"}`}>
              {Math.round((r.confidence ?? 0) * 100)}%
            </span>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-xs text-muted-foreground">Status:</span>
          <StatusBadge status={r.status} />
        </div>
      </div>

      {/* Bulk actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="h-8 text-xs bg-status-approved hover:bg-status-approved/90 text-primary-foreground" onClick={handleBulkApprove} disabled={!!acting}>
          {acting === "approve" && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />} Approve All
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs border-destructive text-destructive hover:bg-destructive/10" onClick={handleBulkDeny} disabled={!!acting}>
          {acting === "deny" && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />} Deny All
        </Button>
      </div>

      {/* Delta table */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className={`w-full text-sm ${isCSR ? "min-w-[780px]" : "min-w-[600px]"}`}>
            <thead>
              <tr className="border-b bg-muted/50">
                {isCSR && <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Account ID</th>}
                {isCSR && <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Account Name</th>}
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Field</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{isCSR ? "SAP Current" : "Current Value"}</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Proposed</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap w-20">Action</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[160px]">Comment</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, i: number) => {
                const iid = item.id || String(i);
                const st = itemStatuses[iid] || item.approval_status;
                return (
                  <tr key={iid} className={`border-b last:border-0 transition-colors ${st === "approved" ? "bg-green-50 dark:bg-green-950/20" : st === "denied" ? "bg-red-50 dark:bg-red-950/20" : "hover:bg-muted/30"}`}>
                    {isCSR && <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{item.account_id ?? "—"}</td>}
                    {isCSR && <td className="px-3 py-2.5 whitespace-nowrap">{item.account_name ?? "—"}</td>}
                    <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{item.field_name || item.field}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{item.sap_current_value ?? item.current_value ?? "—"}</td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{item.proposed_value ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleItemAction(iid, "approved")}
                          className={`p-1.5 rounded transition-colors ${st === "approved" ? "bg-green-600 text-white" : "hover:bg-green-100 text-green-600 dark:hover:bg-green-900"}`}
                          title="Approve"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleItemAction(iid, "denied")}
                          className={`p-1.5 rounded transition-colors ${st === "denied" ? "bg-red-600 text-white" : "hover:bg-red-100 text-red-600 dark:hover:bg-red-900"}`}
                          title="Deny"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Input
                        value={comments[iid] || ""}
                        onChange={e => setComments(prev => ({ ...prev, [iid]: e.target.value }))}
                        placeholder="Comment..."
                        className="h-7 text-xs min-w-[140px]"
                      />
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={isCSR ? 7 : 5} className="px-3 py-8 text-center text-muted-foreground">No items to review</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <Button onClick={handleSkybot} disabled={!!acting} className="w-full sm:w-auto">
          {acting === "skybot" && <Loader2 className="mr-2 h-3 w-3 animate-spin" />} Submit to SAP (Skybot)
        </Button>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>SAP Submission Successful</DialogTitle>
          </DialogHeader>
          {skybotResult && (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Job ID:</span> <span className="font-mono">{skybotResult.skybot_job_id}</span></div>
              <div><span className="text-muted-foreground">SAP Confirmation:</span> <span className="font-mono">{skybotResult.sap_confirmation}</span></div>
              <div><span className="text-muted-foreground">Records Updated:</span> {skybotResult.records_updated}</div>
              {skybotResult.vendor_number && (
                <div><span className="text-muted-foreground">Vendor # Assigned:</span> <span className="font-mono font-semibold">{skybotResult.vendor_number}</span></div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => { setShowModal(false); navigate("/audit"); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
