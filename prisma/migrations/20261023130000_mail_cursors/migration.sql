-- CreateTable
CREATE TABLE "mail_cursors" (
    "mailbox" TEXT NOT NULL,
    "uid_validity" BIGINT NOT NULL,
    "last_uid" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_cursors_pkey" PRIMARY KEY ("mailbox")
);
