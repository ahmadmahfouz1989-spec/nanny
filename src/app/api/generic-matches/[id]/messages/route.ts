import { messagesGet, messagesPost } from "@/lib/matching/match-routes";

export const GET = messagesGet("generic");
export const POST = messagesPost("generic");
