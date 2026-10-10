CREATE TABLE "PartyCommunicationLink" (
 "partyId" TEXT NOT NULL, "threadId" TEXT NOT NULL, "companyId" TEXT NOT NULL,
 "archived" BOOLEAN NOT NULL DEFAULT false, "revision" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PartyCommunicationLink_pkey" PRIMARY KEY ("partyId","threadId"),
 CONSTRAINT "PartyCommunicationLink_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PartyCommunicationLink_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommunicationThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PartyCommunicationLink_companyId_partyId_archived_idx" ON "PartyCommunicationLink"("companyId","partyId","archived");
CREATE INDEX "PartyCommunicationLink_threadId_idx" ON "PartyCommunicationLink"("threadId");
