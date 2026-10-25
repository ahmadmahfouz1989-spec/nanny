/** ouiKnow's WhatsApp number for questions and help (digits only, for wa.me). */
export const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "96176775996";

type SupportDoc = {
  title: string;
  intro: string;
  contact: string;
  sections: { heading: string; body: string }[];
};

// The /support page, also the App Store listing's support URL.
export const SUPPORT: Record<"en" | "ar", SupportDoc> = {
  en: {
    title: "Help & support",
    intro: "Questions, a problem with the app, or something to report? Message the ouiKnow team on WhatsApp -- we usually answer within a day.",
    contact: "Message us on WhatsApp",
    sections: [
      {
        heading: "Signing in",
        body: "Sign in with Apple, Google, WhatsApp or your email. If you signed up with Google and it isn't working, enter your Gmail address in the email field and we'll send you a code to the same account.",
      },
      {
        heading: "Reporting and blocking",
        body: "Every profile, post and message has a Report option, and you can block anyone from contacting you. Reports are reviewed by the ouiKnow team, usually within 24 hours.",
      },
      {
        heading: "Notifications",
        body: "Turn notifications on or off on your Profile, or in your phone's Settings under ouiKnow.",
      },
      {
        heading: "Deleting your account",
        body: "Open Settings and choose Delete account. This removes your profiles, posts, messages, photos and documents. See the Privacy Policy for what may be kept by law.",
      },
    ],
  },
  ar: {
    title: "المساعدة والدعم",
    intro: "لديك سؤال أو مشكلة في التطبيق أو شيء تريد الإبلاغ عنه؟ راسل فريق ouiKnow على واتساب — نردّ عادةً خلال يوم.",
    contact: "راسلنا على واتساب",
    sections: [
      {
        heading: "تسجيل الدخول",
        body: "سجّل الدخول باستخدام Apple أو Google أو واتساب أو بريدك الإلكتروني. إذا أنشأت حسابك باستخدام Google ولم ينجح ذلك، أدخل عنوان Gmail في حقل البريد الإلكتروني وسنرسل لك رمزاً إلى الحساب نفسه.",
      },
      {
        heading: "الإبلاغ والحظر",
        body: "لكل ملف ومنشور ورسالة خيار «إبلاغ»، ويمكنك حظر أي شخص من التواصل معك. يراجع فريق ouiKnow البلاغات عادةً خلال ٢٤ ساعة.",
      },
      {
        heading: "الإشعارات",
        body: "فعّل الإشعارات أو أوقفها من ملفك الشخصي، أو من إعدادات هاتفك ضمن ouiKnow.",
      },
      {
        heading: "حذف حسابك",
        body: "افتح الإعدادات واختر «حذف الحساب». يؤدّي ذلك إلى حذف ملفاتك ومنشوراتك ورسائلك وصورك ووثائقك. راجع سياسة الخصوصية لمعرفة ما قد يُحتفظ به بموجب القانون.",
      },
    ],
  },
};
