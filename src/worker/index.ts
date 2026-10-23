// Background worker: watches the import mailbox over IMAP and sends each new email
// through the same ingestion as an upload, so it lands in the review inbox.
import { ImapFlow } from "imapflow";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { syncMailbox } from "@/lib/mail/sync";

const log = (msg: string) => console.log(`${new Date().toISOString()} [mail] ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let stopping = false;
let client: ImapFlow | undefined;

async function waitForSchema() {
  for (let attempt = 1; ; attempt++) {
    try {
      await prisma.mailCursor.count();
      return;
    } catch (err) {
      if (attempt % 6 === 1) log(`waiting for the database and migrations: ${(err as Error).message.split("\n")[0]}`);
      await sleep(5000);
    }
  }
}

async function runSession() {
  const c = getConfig();
  client = new ImapFlow({
    host: c.IMAP_HOST!,
    port: c.IMAP_PORT,
    secure: c.IMAP_SECURE,
    auth: { user: c.IMAP_USER!, pass: c.IMAP_PASSWORD! },
    tls: { rejectUnauthorized: !c.IMAP_TLS_INSECURE },
    logger: false,
  });
  const session = client;
  let syncing: Promise<void> | null = null;
  let again = false;
  const sync = async () => {
    if (syncing) {
      again = true;
      return syncing;
    }
    syncing = (async () => {
      do {
        again = false;
        const r = await syncMailbox(session, c.IMAP_MAILBOX, log);
        if (r.imported || r.duplicates) log(`imported ${r.imported} new message(s), skipped ${r.duplicates} already seen`);
      } while (again);
    })().finally(() => {
      syncing = null;
    });
    return syncing;
  };

  const closed = new Promise<void>((resolve) => session.on("close", () => resolve()));
  session.on("error", (err: Error) => log(`connection error: ${err.message}`));
  await session.connect();
  log(`connected to ${c.IMAP_HOST}:${c.IMAP_PORT}, watching ${c.IMAP_MAILBOX}`);
  await sync();

  // New mail arrives as an EXISTS notification while the client idles; a timer covers missed ones.
  session.on("exists", () => void sync().catch((err) => log(`sync failed: ${(err as Error).message}`)));
  const timer = setInterval(() => void sync().catch((err) => log(`sync failed: ${(err as Error).message}`)), c.IMAP_POLL_SECONDS * 1000);
  // Hold the mailbox open so the server sends EXISTS notifications.
  const lock = await session.getMailboxLock(c.IMAP_MAILBOX);
  lock.release();
  await closed;
  clearInterval(timer);
}

async function main() {
  const c = getConfig();
  if (!c.IMAP_HOST || !c.IMAP_USER || !c.IMAP_PASSWORD) {
    log("IMAP_HOST, IMAP_USER and IMAP_PASSWORD are not all set; email import is off");
    // Stay up so a restart policy does not loop.
    await new Promise(() => {});
  }
  await waitForSchema();
  let delay = 5000;
  while (!stopping) {
    const started = Date.now();
    try {
      await runSession();
    } catch (err) {
      log(`session ended: ${(err as Error).message}`);
    }
    if (stopping) break;
    if (Date.now() - started > 60000) delay = 5000;
    log(`reconnecting in ${delay / 1000}s`);
    await sleep(delay);
    delay = Math.min(delay * 2, 300000);
  }
}

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, async () => {
    stopping = true;
    log("shutting down");
    await client?.logout().catch(() => {});
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
