import { NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { sendWhatsAppCode, whatsappConfigured } from "@/lib/whatsapp";

// Configured as Supabase's "Send SMS" Auth Hook. Supabase creates the
// one-time code for a phone sign-in and POSTs it here instead of texting
// it; we deliver it over WhatsApp. No SMS is ever sent.
const hookSecret = (process.env.SUPABASE_SMS_HOOK_SECRET ?? "").replace("v1,whsec_", "");

interface HookPayload {
  user: { phone?: string };
  sms: { otp: string };
}

function hookError(message: string, status = 500) {
  // Supabase's documented hook error shape -- surfaces as a real error on
  // the signInWithOtp() call instead of it "succeeding" with no message sent.
  return NextResponse.json({ error: { http_code: status, message } }, { status });
}

export async function POST(request: Request) {
  const payload = await request.text();
  const headers = Object.fromEntries(request.headers);

  let parsed: HookPayload;
  try {
    parsed = new Webhook(hookSecret).verify(payload, headers) as HookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const phone = parsed.user?.phone;
  const code = parsed.sms?.otp;
  if (!phone || !code) return hookError("Missing phone or code", 400);

  if (!whatsappConfigured()) {
    // Local development without WhatsApp credentials: print the code so the
    // flow can still be tried end to end. Never in production.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[sms-hook] WhatsApp not configured -- code for ${phone}: ${code}`);
      return NextResponse.json({});
    }
    return hookError("WhatsApp sending is not configured");
  }

  const failure = await sendWhatsAppCode(phone, code);
  if (failure) {
    // Never log the code itself -- it's a live sign-in credential.
    console.error(`[sms-hook] ${failure} (to ${phone.slice(0, 5)}…)`);
    return hookError("Couldn't send the WhatsApp code");
  }
  return NextResponse.json({});
}
