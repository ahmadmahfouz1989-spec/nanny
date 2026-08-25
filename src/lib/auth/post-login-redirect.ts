export function resolvePostLoginPath(
  role: string | null | undefined,
  moderationStatus: string | null | undefined,
): "/matches" | "/dashboard" {
  if ((role === "parent" || role === "nanny") && moderationStatus === "approved") {
    return "/matches";
  }
  return "/dashboard";
}
