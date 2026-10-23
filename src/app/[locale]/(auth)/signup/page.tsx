import { Suspense } from "react";
import { isNativeAppRequest } from "@/lib/native-app-server";
import SignupForm from "./signup-form";

export default async function SignupPage() {
  return (
    <Suspense>
      {/* Inside the app, no Google button: Apple expects an app offering
          Google sign-in to offer Sign in with Apple too, and the email code
          (and WhatsApp) cover sign-in there. */}
      <SignupForm showGoogle={!(await isNativeAppRequest())} />
    </Suspense>
  );
}
