import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ingestEmail, demoReset } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, Zap, AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

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
  if (!subject.trim()) errors.subject = "Subject is required.";
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

interface ScenarioConfig {
  id: number;
  label: string;
  title: string;
  description: string;
  requiresPrevious?: string;
  sender: string;
  subject: string;
  body: string;
  filename: string;
}

const SCENARIOS: ScenarioConfig[] = [
  {
    id: 3,
    label: "Scenario 1",
    title: "New Vendor Setup",
    description: "AI extracts vendor fields from a SAP setup form. Skybot assigns a new vendor number.",
    sender: "maria.gonzalez@bumblebeefoods.com",
    subject: "New Vendor Setup - G7 Tech Services LLC",
    body: `Hi Master Data team,

Please set up the following new vendor in SAP. The completed SAP Vendor Setup form is attached.

G7 Tech Services LLC is a new IT services provider approved by Procurement. Payment will be via ACH. W-9 is on file with AP.

Please confirm once the vendor has been created in SAP.

Thanks,
Maria Gonzalez
Accounts Payable | BumbleBee Foods`,
    filename: "scenario_3_new_vendor.xlsx",
  },
  {
    id: 4,
    label: "Scenario 2",
    title: "Update Existing Vendor",
    description: "Follow-up to Scenario 1. AI shows current vs proposed values side by side for a bank update.",
    requiresPrevious: "Run Scenario 1 first",
    sender: "maria.gonzalez@bumblebeefoods.com",
    subject: "Vendor Update - G7 Tech Services LLC (V-003001)",
    body: `Hi Master Data team,

G7 Tech Services (V-003001) has switched banks. Please update their payment method and banking details in SAP. The completed SAP Vendor Change form is attached.

They are moving from CHECK to ACH Company payments with a new JP Morgan Chase account. This is a bank and payment method update only — no other fields are changing.

Please confirm once the update has been processed.

Thanks,
Maria Gonzalez
Accounts Payable | BumbleBee Foods`,
    filename: "scenario_4_update_vendor.xlsx",
  },
  {
    id: 6,
    label: "Scenario 3",
    title: "Ambiguous Vendor Form",
    description: "Incomplete form — AI flags as Needs Review. Reviewer uploads the completed form and re-runs AI.",
    sender: "procurement.user@bumblebeefoods.com",
    subject: "vendor update needed",
    body: `Hi,

We need to update one of our vendors in SAP. I think it's a change to their payment info but I'm not 100% sure what fields need to change. The form is attached but I may have left some things blank — let me know if you need more.

I believe the vendor name is something like "G7 Tech" but I don't have the vendor number handy. The region manager said it was urgent.

Let me know if you need anything else.

Thanks`,
    filename: "scenario_6_incomplete.xlsx",
  },
];

export default function SubmitEmail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [sender, setSender] = useState("");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [loadingScenario, setLoadingScenario] = useState<number | null>(null);

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
      setFileName("");
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      navigate(`/requests/${res.request_id}`);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to process email. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const loadScenario = async (scenario: ScenarioConfig) => {
    setLoadingScenario(scenario.id);
    try {
      if (scenario.id === 3) {
        await demoReset();
      }

      const res = await fetch(`${BASE_URL}/demo-fixtures/${scenario.filename}`);
      if (!res.ok) throw new Error("Failed to fetch fixture file");
      const blob = await res.blob();
      const xlsxFile = new File([blob], scenario.filename, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      setSender(scenario.sender);
      setSubject(scenario.subject);
      setEmailBody(scenario.body);
      setFile(xlsxFile);
      setFileName(scenario.filename);
      setErrors({});
      setSubmitError("");

      toast.success(`${scenario.label} imported`, {
        description: `${scenario.title} — form is ready to submit.`,
        closeButton: true,
        duration: Infinity,
      });
    } catch {
      toast.error(`Failed to load ${scenario.label}`, {
        description: "Could not fetch the fixture file from the server.",
        closeButton: true,
        duration: Infinity,
      });
    } finally {
      setLoadingScenario(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Submit Email for Processing</h1>

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
                placeholder="e.g. New Vendor Setup - Acme Corp"
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
              rows={6}
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
                  setFileName(f?.name || "");
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
          {fileName && (
            <p className="text-xs text-muted-foreground -mt-2 font-mono">{fileName}</p>
          )}

          {submitError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {submitError}
            </div>
          )}
        </form>
      </div>

      {/* Demo Scenario Quick-Load */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Demo Scenarios</h2>
          <span className="text-xs text-muted-foreground">— click to populate the form above</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SCENARIOS.map((scenario, idx) => (
            <div
              key={scenario.id}
              className="bg-card border rounded-lg p-4 flex flex-col gap-3"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {scenario.label}
                  </span>
                </div>
                {scenario.requiresPrevious && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 leading-tight">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {scenario.requiresPrevious}
                  </span>
                )}
              </div>

              {/* Title + description */}
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground leading-snug">{scenario.title}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{scenario.description}</p>
              </div>

              {/* Fixture badge + download */}
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-mono text-muted-foreground/70 truncate">{scenario.filename}</p>
                <a
                  href={`${BASE_URL}/demo-fixtures/${scenario.filename}`}
                  download={scenario.filename}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title="Download fixture file"
                >
                  <Download className="h-3 w-3" />
                  Download
                </a>
              </div>

              {/* Load button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs"
                disabled={loadingScenario !== null}
                onClick={() => loadScenario(scenario)}
              >
                {loadingScenario === scenario.id
                  ? <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Loading...</>
                  : "Load Scenario"
                }
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
