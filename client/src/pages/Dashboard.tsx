import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchRequests, ingestEmail } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, Loader2 } from "lucide-react";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormErrors {
  sender?: string;
  subject?: string;
  emailBody?: string;
  attachment?: string;
}

function validate(sender: string, subject: string, emailBody: string, file: File | null): FormErrors {
  const errors: FormErrors = {};
  if (!sender.trim()) {
    errors.sender = "Sender email is required.";
  } else if (!EMAIL_RE.test(sender.trim())) {
    errors.sender = "Enter a valid email address.";
  }
  if (!subject.trim()) {
    errors.subject = "Subject is required.";
  }
  if (!emailBody.trim()) {
    errors.emailBody = "Email body is required.";
  } else if (emailBody.trim().length < 20) {
    errors.emailBody = "Email body is too short to be processed.";
  }
  if (file && !file.name.endsWith(".xlsx")) {
    errors.attachment = "Attachment must be an .xlsx file.";
  }
  return errors;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: requests, isLoading, error } = useQuery({
    queryKey: ["requests"],
    queryFn: fetchRequests,
  });

  const [sender, setSender] = useState("");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    const validationErrors = validate(sender, subject, emailBody, file);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.append("sender", sender.trim());
      fd.append("subject", subject.trim());
      fd.append("email_body", emailBody.trim());
      if (file) fd.append("attachment", file);

      const res = await ingestEmail(fd);
      setSender("");
      setSubject("");
      setEmailBody("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      navigate(`/requests/${res.request_id}`);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to process email. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const items = Array.isArray(requests) ? requests : requests?.requests || [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Master Data Requests</h1>

      {/* Submit Email Form */}
      <div className="bg-card border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Upload className="h-4 w-4" /> Process Email
        </h2>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sender" className="text-xs text-muted-foreground">
                Sender Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="sender"
                type="email"
                value={sender}
                onChange={e => { setSender(e.target.value); setErrors(prev => ({ ...prev, sender: undefined })); }}
                placeholder="user@example.com"
                className={`h-8 text-sm ${errors.sender ? "border-destructive focus-visible:ring-destructive" : ""}`}
              />
              {errors.sender && <p className="text-xs text-destructive">{errors.sender}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subject" className="text-xs text-muted-foreground">
                Subject <span className="text-destructive">*</span>
              </Label>
              <Input
                id="subject"
                value={subject}
                onChange={e => { setSubject(e.target.value); setErrors(prev => ({ ...prev, subject: undefined })); }}
                placeholder="e.g. CSR Reassignment Request"
                className={`h-8 text-sm ${errors.subject ? "border-destructive focus-visible:ring-destructive" : ""}`}
              />
              {errors.subject && <p className="text-xs text-destructive">{errors.subject}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="body" className="text-xs text-muted-foreground">
              Email Body <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="body"
              value={emailBody}
              onChange={e => { setEmailBody(e.target.value); setErrors(prev => ({ ...prev, emailBody: undefined })); }}
              placeholder="Paste the full email content here..."
              rows={4}
              className={`text-sm resize-none ${errors.emailBody ? "border-destructive focus-visible:ring-destructive" : ""}`}
            />
            {errors.emailBody && <p className="text-xs text-destructive">{errors.emailBody}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="attachment" className="text-xs text-muted-foreground">
                Excel Attachment <span className="text-muted-foreground/60">(optional, .xlsx only)</span>
              </Label>
              <Input
                id="attachment"
                type="file"
                accept=".xlsx"
                onChange={e => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  setErrors(prev => ({ ...prev, attachment: undefined }));
                }}
                className={`h-8 text-sm ${errors.attachment ? "border-destructive focus-visible:ring-destructive" : ""}`}
              />
              {errors.attachment && <p className="text-xs text-destructive">{errors.attachment}</p>}
            </div>

            <div className="flex items-end">
              <Button type="submit" disabled={submitting} className="h-8 text-sm w-full sm:w-auto">
                {submitting
                  ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Processing...</>
                  : "Process Email"
                }
              </Button>
            </div>
          </div>

          {submitError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {submitError}
            </div>
          )}
        </form>
      </div>

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
                      {r.request_type === "new_vendor" ? "New Vendor" : r.request_type === "change_existing" ? "Change Existing" : r.request_type ?? "—"}
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
