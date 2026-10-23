import { Suspense } from "react";
import { isNativeAppRequest } from "@/lib/native-app-server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "./login-form";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect({ href: "/feed", locale });
  }

  return (
    <Suspense>
      {/* Inside the app, no Google button: Apple expects an app offering
          Google sign-in to offer Sign in with Apple too, and the email code
          (and WhatsApp) cover sign-in there. */}
      <LoginForm showGoogle={!(await isNativeAppRequest())} />
    </Suspense>
  );
}
