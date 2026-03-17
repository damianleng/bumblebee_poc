const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export function fetchRequests() {
  return request("/api/requests");
}

export function fetchRequest(id: string) {
  return request(`/api/requests/${id}`);
}

export function ingestEmail(formData: FormData) {
  return request("/api/ingest", {
    method: "POST",
    body: formData,
  });
}

export function approveRequest(id: string) {
  return request(`/api/requests/${id}/approve`, { method: "POST" });
}

export function denyRequest(id: string) {
  return request(`/api/requests/${id}/deny`, { method: "POST" });
}

export function flagRequest(id: string) {
  return request(`/api/requests/${id}/flag`, { method: "POST" });
}

export function updateItem(requestId: string, itemId: string, data: { approval_status: string; reviewer_comment: string }) {
  return request(`/api/requests/${requestId}/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function executeSkybot(requestId: string) {
  return request(`/api/skybot/execute?request_id=${requestId}`, { method: "POST" });
}

export function fetchAttachments(requestId: string) {
  return request(`/api/requests/${requestId}/attachments`);
}

export function downloadAttachmentUrl(requestId: string, attachmentId: string) {
  return `${BASE_URL}/api/requests/${requestId}/attachments/${attachmentId}/download`;
}

export function uploadAttachment(requestId: string, file: File, notes: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("notes", notes);
  return request(`/api/requests/${requestId}/attachments`, { method: "POST", body: fd });
}

export function reprocessRequest(requestId: string, reviewerComment: string, file?: File) {
  const fd = new FormData();
  fd.append("reviewer_comment", reviewerComment);
  if (file) fd.append("file", file);
  return request(`/api/requests/${requestId}/reprocess`, { method: "POST", body: fd });
}

export function fetchAuditLog(params: { status?: string; from_date?: string; to_date?: string }) {
  const query = new URLSearchParams();
  if (params.status && params.status !== "all") query.set("status", params.status);
  if (params.from_date) query.set("from_date", params.from_date);
  if (params.to_date) query.set("to_date", params.to_date);
  return request(`/api/audit?${query.toString()}`);
}
