import { apiGet } from "./api";
import type { ActivityPage } from "./types";

export async function fetchActivity(businessId: string, page: number, pageSize: number): Promise<ActivityPage> {
  return apiGet<ActivityPage>(`/activity?businessId=${businessId}&page=${page}&pageSize=${pageSize}`);
}
