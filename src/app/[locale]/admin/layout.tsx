import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "@/components/admin/admin-shell";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user!.id).single();
  if (profile?.role !== "admin") {
    redirect({ href: "/dashboard", locale });
  }

  return <AdminShell>{children}</AdminShell>;
}
