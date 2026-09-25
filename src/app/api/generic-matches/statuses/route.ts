import { matchStatusesResponse } from "@/lib/match-statuses";

export async function GET(request: Request) {
  return matchStatusesResponse(request);
}
