import { redirect } from "next/navigation";
import { ingestFile } from "@/lib/ingest";

export const dynamic = "force-dynamic";

async function upload(formData: FormData) {
  "use server";
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const pasted = String(formData.get("text") ?? "").trim();
  const results = [];
  for (const file of files) {
    results.push(
      await ingestFile({ data: Buffer.from(await file.arrayBuffer()), filename: file.name, mimeType: file.type, source: "upload" }),
    );
  }
  if (pasted) {
    results.push(await ingestFile({ data: Buffer.from(pasted, "utf8"), filename: "pasted.txt", mimeType: "text/plain", source: "upload" }));
  }
  redirect(results.length === 1 ? `/inbox/${results[0].documentId}` : "/inbox");
}

export default function UploadPage() {
  return (
    <>
    <div className="page-head">
      <div>
        <h2>Upload</h2>
        <p className="sub">Confirmations, receipts, boarding passes</p>
      </div>
    </div>
    <section className="card">
      <form action={upload} className="stack" style={{ gap: 16, margin: 0 }}>
        <div className="dropzone">
          <strong>Choose files</strong>
          <span className="muted small">
            PDFs (including emails printed to PDF), .eml files, or photos of tickets and receipts. Each one is parsed
            and lands in the inbox for you to confirm.
          </span>
          <input type="file" name="files" multiple accept=".pdf,.eml,.txt,image/*,application/pdf,message/rfc822" />
        </div>
        <label>
          Or paste email text
          <textarea name="text" rows={6} placeholder="Paste the body of a Delta confirmation or receipt" />
        </label>
        <div><button type="submit">Upload and parse</button></div>
      </form>
    </section>
    </>
  );
}
