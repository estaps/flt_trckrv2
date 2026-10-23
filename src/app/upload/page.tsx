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
    <section className="card">
      <h2>Add confirmations and receipts</h2>
      <p className="muted">
        PDFs (including emails printed to PDF), .eml files, photos of tickets or receipts, or pasted email text.
        Each one is parsed and lands in the inbox for you to confirm.
      </p>
      <form action={upload}>
        <p>
          <input type="file" name="files" multiple accept=".pdf,.eml,.txt,image/*,application/pdf,message/rfc822" />
        </p>
        <p>
          <label>
            Or paste email text
            <textarea name="text" rows={6} style={{ width: "100%" }} />
          </label>
        </p>
        <button type="submit">Upload and parse</button>
      </form>
    </section>
  );
}
