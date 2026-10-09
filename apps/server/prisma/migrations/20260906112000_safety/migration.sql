-- CreateTable
CREATE TABLE "SafetyInstruction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectId" TEXT,
    "instructor" TEXT,
    "date" TIMESTAMP(3),
    "nextDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyInstructionParticipant" (
    "id" TEXT NOT NULL,
    "instructionId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyInstructionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyInstructionDocument" (
    "id" TEXT NOT NULL,
    "instructionId" TEXT NOT NULL,
    "storageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyInstructionDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SafetyInstruction_companyId_idx" ON "SafetyInstruction"("companyId");

-- CreateIndex
CREATE INDEX "SafetyInstruction_companyId_projectId_idx" ON "SafetyInstruction"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "SafetyInstruction_companyId_nextDate_idx" ON "SafetyInstruction"("companyId", "nextDate");

-- CreateIndex
CREATE INDEX "SafetyInstructionParticipant_employeeId_idx" ON "SafetyInstructionParticipant"("employeeId");

-- CreateIndex
CREATE INDEX "SafetyInstructionParticipant_instructionId_idx" ON "SafetyInstructionParticipant"("instructionId");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyInstructionParticipant_instructionId_employeeId_key" ON "SafetyInstructionParticipant"("instructionId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyInstructionDocument_storageId_key" ON "SafetyInstructionDocument"("storageId");

-- CreateIndex
CREATE INDEX "SafetyInstructionDocument_instructionId_createdAt_idx" ON "SafetyInstructionDocument"("instructionId", "createdAt");

-- AddForeignKey
ALTER TABLE "SafetyInstructionParticipant" ADD CONSTRAINT "SafetyInstructionParticipant_instructionId_fkey" FOREIGN KEY ("instructionId") REFERENCES "SafetyInstruction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyInstructionParticipant" ADD CONSTRAINT "SafetyInstructionParticipant_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "CompanyEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyInstructionDocument" ADD CONSTRAINT "SafetyInstructionDocument_instructionId_fkey" FOREIGN KEY ("instructionId") REFERENCES "SafetyInstruction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyInstructionDocument" ADD CONSTRAINT "SafetyInstructionDocument_storageId_fkey" FOREIGN KEY ("storageId") REFERENCES "StorageObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

