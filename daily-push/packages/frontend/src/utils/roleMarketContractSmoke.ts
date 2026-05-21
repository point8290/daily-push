import {
  assertValidListRolesResponse,
  listRolesResponseFixture,
  type ListRolesResponse,
} from "@daily-push/shared";

export function getRoleMarketContractSmokeList(): ListRolesResponse {
  assertValidListRolesResponse(listRolesResponseFixture);
  return listRolesResponseFixture;
}
