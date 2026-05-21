import {
  assertValidRoleMarketProfile,
  roleMarketProfileFixtures,
  type RoleMarketProfile,
} from "@daily-push/shared";

export function getRoleMarketContractSmokeProfile(): RoleMarketProfile {
  const [profile] = roleMarketProfileFixtures;
  assertValidRoleMarketProfile(profile);
  return profile;
}
