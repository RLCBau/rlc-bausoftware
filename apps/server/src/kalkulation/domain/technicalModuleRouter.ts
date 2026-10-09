import type {
  RlcConstructionFamily,
  RlcConstructionFamilyId,
} from "./constructionFamilyRegistry";

export type RlcTechnicalModuleId =
  | "TRENCH_RULES"
  | "NONE";

export type RlcTechnicalModuleRoute = {
  familyId: RlcConstructionFamilyId;
  moduleId: RlcTechnicalModuleId;
};

const TECHNICAL_MODULE_BY_FAMILY: Partial<
  Record<RlcConstructionFamilyId, RlcTechnicalModuleId>
> = {
  KANALBAU: "TRENCH_RULES",
  KABELBAU: "TRENCH_RULES",
};

export function resolveRlcTechnicalModule(
  familyId: RlcConstructionFamilyId
): RlcTechnicalModuleId {
  return TECHNICAL_MODULE_BY_FAMILY[familyId] || "NONE";
}

export function resolveRlcTechnicalModules(
  families: RlcConstructionFamily[]
): RlcTechnicalModuleRoute[] {
  return families
    .map((family) => ({
      familyId: family.id,
      moduleId: resolveRlcTechnicalModule(family.id),
    }))
    .filter((route) => route.moduleId !== "NONE");
}

export function hasRlcTechnicalModule(
  families: RlcConstructionFamily[],
  moduleId: Exclude<RlcTechnicalModuleId, "NONE">
): boolean {
  return resolveRlcTechnicalModules(families).some(
    (route) => route.moduleId === moduleId
  );
}
