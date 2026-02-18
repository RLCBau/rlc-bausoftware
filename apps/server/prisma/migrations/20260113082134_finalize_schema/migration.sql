-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_companyId_fkey";

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
