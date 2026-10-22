import { HttpError } from "@fleetly/patterns-ui-core/data";
import type { Tenant } from "@fleetly/patterns-ui-core/tenant";
import { api } from "./api";

export async function listTenants(): Promise<Tenant[]> {
  return api<Tenant[]>("/api/orgs");
}

export async function resolveTenant(id: string): Promise<Tenant | null> {
  try {
    return await api<Tenant>(`/api/orgs/${id}`);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return null;
    }
    throw error;
  }
}
