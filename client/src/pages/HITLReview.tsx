import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchRequest, fetchAttachments, downloadAttachmentUrl, uploadAttachment, reprocessRequest, approveRequest, denyRequest, updateItem, executeSkybot } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, X, Loader2, Paperclip, Download, Upload, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";

export default function HITLReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["request", id], queryFn: () => fetchRequest(id!) });

  const [comments, setComments] = useState<Record<string, string>>({});
  const [itemStatuses, setItemStatuses] = useState<Record<string, string>>({});
  const [acting, setActing] = useState("");
  const [actionError, setActionError] = useState("");
  const [skybotResult, setSkybotResult] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);

  // Reprocess state
  const [reprocessComment, setReprocessComment] = useState("");
  const [reprocessFile, setReprocessFile] = useState<File | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessError, setReprocessError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: attachments } = useQuery({
    queryKey: ["attachments", id],
    queryFn: () => fetchAttachments(id!),
  });

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
    } catch (e: any) {
      setActionError(e.message || "Failed to update item.");
    }
  };

  const handleBulkApprove = async () => {
    setActing("approve");
    setActionError("");
    try {
      await approveRequest(id!);
      queryClient.invalidateQueries({ queryKey: ["request", id] });
    } catch (e: any) {
      setActionError(e.message || "Failed to approve request.");
    } finally { setActing(""); }
  };

  const handleBulkDeny = async () => {
    setActing("deny");
    setActionError("");
    try {
      await denyRequest(id!);
      queryClient.invalidateQueries({ queryKey: ["request", id] });
    } catch (e: any) {
      setActionError(e.message || "Failed to deny request.");
    } finally { setActing(""); }
  };

  const handleSkybot = async () => {
    setActing("skybot");
    setActionError("");
    try {
      const res = await executeSkybot(id!);
      setSkybotResult(res);
      setShowModal(true);
    } catch (e: any) {
      setActionError(e.message || "Skybot submission failed.");
    } finally { setActing(""); }
  };

  const handleReprocess = async () => {
    if (!reprocessFile) {
      setReprocessError("An updated attachment is required before reprocessing.");
      return;
    }
    if (!reprocessComment.trim()) {
      setReprocessError("Comment is required before reprocessing.");
      return;
    }
    setReprocessError("");
    setReprocessing(true);
    try {
      await reprocessRequest(id!, reprocessComment.trim(), reprocessFile ?? undefined);
      queryClient.invalidateQueries({ queryKey: ["request", id] });
      queryClient.invalidateQueries({ queryKey: ["attachments", id] });
      setReprocessComment("");
      setReprocessFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      setReprocessError(e.message || "Reprocess failed.");
    } finally {
      setReprocessing(false);
    }
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
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="h-8 text-xs bg-status-approved hover:bg-status-approved/90 text-primary-foreground" onClick={handleBulkApprove} disabled={!!acting || items.length === 0}>
            {acting === "approve" && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />} Approve All
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs border-destructive text-destructive hover:bg-destructive/10" onClick={handleBulkDeny} disabled={!!acting || items.length === 0}>
            {acting === "deny" && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />} Deny All
          </Button>
        </div>
        {actionError && <p className="text-xs text-destructive">{actionError}</p>}
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
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Proposed Change</th>
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
                        value={comments[iid] !== undefined ? comments[iid] : (item.reviewer_comment || "")}
                        onChange={e => setComments(prev => ({ ...prev, [iid]: e.target.value }))}
                        onBlur={async () => {
                          const comment = comments[iid];
                          if (comment === undefined) return;
                          try {
                            await updateItem(id!, iid, { approval_status: st || item.approval_status || "pending", reviewer_comment: comment });
                            queryClient.invalidateQueries({ queryKey: ["request", id] });
                          } catch {}
                        }}
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

      {/* Attachments */}
      <div className="bg-card border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          Attachments
        </div>
        {attachments && attachments.length > 0 ? (
          <div className="space-y-1.5">
            {attachments.map((att: any) => (
              <div key={att.id} className="text-sm bg-muted/40 rounded px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">v{att.version}</span>
                    <span className="font-medium break-all">{att.filename}</span>
                  </div>
                  <a href={downloadAttachmentUrl(id!, att.id)} download={att.filename}>
                    <Button variant="ghost" size="sm" className="h-7 px-2 shrink-0">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No attachments on this request.</p>
        )}
      </div>

      {/* Reprocess panel — only shown when needs_review or flagged */}
      {(r.status === "needs_review" || r.status === "flagged" || r.classification_status === "needs_review") && (
        <div className="bg-card border border-dashed rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            Re-process with AI
          </div>
          <p className="text-xs text-muted-foreground">
            Download the attachment above, make your changes in Excel, re-upload it here, add a comment describing what you changed, then click Re-process.
          </p>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              Upload updated form <span className="text-destructive">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => setReprocessFile(e.target.files?.[0] ?? null)}
              />
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" />
                {reprocessFile ? reprocessFile.name : "Choose file"}
              </Button>
              {reprocessFile && (
                <button className="text-xs text-muted-foreground hover:text-destructive" onClick={() => { setReprocessFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                  Remove
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Comment <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={reprocessComment}
              onChange={e => { setReprocessComment(e.target.value); setReprocessError(""); }}
              placeholder="Describe what you changed or added (required)..."
              className="text-sm min-h-[72px] resize-none"
            />
          </div>
          {reprocessError && <p className="text-xs text-destructive">{reprocessError}</p>}
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <span className="text-amber-500 mt-0.5">⚠</span>
              <div>
                <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-0.5">Action Required</p>
                <p className="text-sm text-amber-900">Upload a corrected file and add a comment, then click Re-process.</p>
              </div>
            </div>
            <Button size="sm" className="h-8 text-xs gap-1.5 shrink-0" onClick={handleReprocess} disabled={reprocessing}>
              {reprocessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Re-process with AI
            </Button>
          </div>
        </div>
      )}

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
