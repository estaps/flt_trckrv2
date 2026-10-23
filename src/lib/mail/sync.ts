import type { ImapFlow } from "imapflow";
import { prisma } from "../db";
import { ingestFile } from "../ingest";

export interface SyncResult {
  imported: number;
  duplicates: number;
}

type Log = (msg: string) => void;

// Imports every message in the mailbox that arrived after the stored cursor.
// The cursor only advances past a message once it is stored, so a crash re-reads at most one
// message, and re-reads are harmless because documents are deduplicated by Message-ID and hash.
export async function syncMailbox(client: ImapFlow, mailbox: string, log: Log = console.log): Promise<SyncResult> {
  const result: SyncResult = { imported: 0, duplicates: 0 };
  const lock = await client.getMailboxLock(mailbox);
  try {
    const box = client.mailbox;
    if (!box) throw new Error(`mailbox ${mailbox} did not open`);
    const uidValidity = BigInt(box.uidValidity);
    const cursor = await prisma.mailCursor.findUnique({ where: { mailbox } });
    let lastUid = cursor && cursor.uidValidity === uidValidity ? cursor.lastUid : 0;
    if (cursor && cursor.uidValidity !== uidValidity) log(`${mailbox}: UIDVALIDITY changed, rescanning`);
    if (box.exists === 0) return result;

    // "N:*" always includes the newest message even when its UID is below N, hence the check.
    const uids: number[] = [];
    for await (const msg of client.fetch(`${lastUid + 1}:*`, { uid: true }, { uid: true })) {
      if (msg.uid > lastUid) uids.push(msg.uid);
    }
    uids.sort((a, b) => a - b);

    for (const uid of uids) {
      const msg = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
      if (!msg || !msg.source) continue;
      const res = await ingestFile({ data: msg.source, filename: `${mailbox}-${uid}.eml`, mimeType: "message/rfc822", source: "imap" });
      if (res.duplicate) result.duplicates++;
      else result.imported++;
      lastUid = uid;
      await prisma.mailCursor.upsert({
        where: { mailbox },
        create: { mailbox, uidValidity, lastUid },
        update: { uidValidity, lastUid },
      });
    }
    if (!cursor && uids.length === 0) {
      await prisma.mailCursor.create({ data: { mailbox, uidValidity, lastUid } });
    }
  } finally {
    lock.release();
  }
  return result;
}
