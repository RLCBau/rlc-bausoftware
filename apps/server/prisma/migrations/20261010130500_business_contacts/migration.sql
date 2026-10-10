CREATE TABLE "PartyContactProfile" (
 "partyId" TEXT NOT NULL,
 "website" TEXT NOT NULL DEFAULT '',
 "trade" TEXT NOT NULL DEFAULT '',
 "notes" TEXT NOT NULL DEFAULT '',
 "subcontractor" BOOLEAN NOT NULL DEFAULT false,
 "contacts" JSONB NOT NULL DEFAULT '[]',
 "sites" JSONB NOT NULL DEFAULT '[]',
 "archived" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PartyContactProfile_pkey" PRIMARY KEY ("partyId"),
 CONSTRAINT "PartyContactProfile_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PartyContactProfile_archived_idx" ON "PartyContactProfile"("archived");
