ALTER TABLE "CompanyMasterCatalog" DROP CONSTRAINT "CompanyMasterCatalog_kind_check";
ALTER TABLE "CompanyMasterCatalog" ADD CONSTRAINT "CompanyMasterCatalog_kind_check" CHECK ("kind" IN ('UNIT','LICENSE_CLASS','HAZARD_CLASS','COST_CENTER_AREA','TIME_TYPE'));
