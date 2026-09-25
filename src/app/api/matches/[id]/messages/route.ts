import { messagesGet, messagesPost } from "@/lib/matching/match-routes";

export const GET = messagesGet("nanny");
export const POST = messagesPost("nanny");
