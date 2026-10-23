export type LegalSection = { heading: string; body: string };

type LegalDoc = {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  /** Attribution for data the app uses (the areas list is CC BY 4.0). */
  credits: { text: string; link: string; linkText: string };
};

export const TERMS: Record<"en" | "ar", LegalDoc> = {
  en: {
    title: "Terms of Service",
    updated: "Last updated: October 2026",
    intro: "By creating an account you agree to the following terms.",
    credits: {
      text: "Lebanon's districts and areas come from Open Admin Data's “Lebanon Administrative Divisions” (CC BY 4.0), with some everyday place names added by ouiKnow:",
      link: "https://github.com/open-admin-data/lebanon-administrative-divisions",
      linkText: "open-admin-data/lebanon-administrative-divisions",
    },
    sections: [
      {
        heading: "1. Nature of the Platform as a Technical Intermediary",
        body: "This platform serves solely as a technical intermediary and electronic marketplace designed to connect users seeking services (clients) with independent service providers (such as tutors, nannies, and others). The platform does not directly provide any services, nor is it an employer, partner, or guarantor for any users or service providers registered on it.",
      },
      {
        heading: "2. No Liability for Third-Party Actions",
        body: "The platform and its management bear no legal, criminal, or financial responsibility whatsoever for any actions, behaviors, fraud, negligence, or misconduct committed by any user or service provider toward another party. This includes, but is not limited to: fraud, theft, providing false information, or breaching agreements regarding services arranged inside or outside the platform.",
      },
      {
        heading: "3. Verification and Background Checks",
        body: "Accounts and service listings are created based on information provided by the users themselves. The platform makes no explicit or implicit guarantees regarding the accuracy, validity, identity, or qualification of any service provider, nor does it guarantee that their criminal or professional records are free of issues. It is the sole responsibility of the user (client) to fully verify the identity and reliability of the other party before entering into any agreement or transferring funds.",
      },
      {
        heading: "4. Financial and Contractual Transactions",
        body: "Any financial transactions or contractual agreements conducted between the client and the service provider are done at their own absolute personal risk. The platform assumes no responsibility for refunds or compensation for material or moral damages resulting from failed or fraudulent transactions.",
      },
      {
        heading: "5. Cooperation with Law Enforcement",
        body: "In the event of any legal dispute or fraudulent activity, the platform's obligation is strictly limited to cooperating with official judicial and security authorities by providing available data (such as registration logs or reports) in accordance with applicable laws, without assuming any liability for compensation on behalf of the wrongdoer.",
      },
      {
        heading: "6. Advertising and Analytics (Meta Pixel)",
        body: "The platform uses the Meta Pixel, a tool provided by Meta Platforms (Facebook and Instagram), to measure how visitors use the website and how effective our advertising is. When you visit the website, the Meta Pixel may collect technical information such as the pages you view, the actions you take (for example, creating an account), your browser and device type, and your IP address, and send it to Meta. Meta may combine this with information it already holds, under its own privacy policy, to show you relevant ads. The platform does not send your messages or the contents of your profile to Meta. You can limit the use of this information for ads through your Facebook or Instagram ad settings, or by blocking third-party cookies in your browser.",
      },
      {
        heading: "7. Content and Conduct",
        body: "There is zero tolerance for objectionable content or abusive behaviour. You may not post or send anything hateful, harassing, threatening, sexual, violent, discriminatory or illegal, impersonate anyone, share another person's private information, or use the platform to scam or exploit others. Every profile, post and message can be reported, and any person can be blocked from contacting you. Reports are reviewed by the ouiKnow team, usually within 24 hours; content that breaks these rules is removed and the accounts responsible can be suspended or deleted.",
      },
    ],
  },
  ar: {
    title: "شروط الخدمة",
    updated: "آخر تحديث: تشرين الأول ٢٠٢٦",
    intro: "بإنشائك حسابًا فإنك توافق على الشروط التالية.",
    credits: {
      text: "مصدر أقضية ومناطق لبنان: «Lebanon Administrative Divisions» من Open Admin Data (رخصة CC BY 4.0)، مع أسماء أماكن شائعة أضافتها ouiKnow:",
      link: "https://github.com/open-admin-data/lebanon-administrative-divisions",
      linkText: "open-admin-data/lebanon-administrative-divisions",
    },
    sections: [
      {
        heading: "١. طبيعة المنصة كوسيط تقني",
        body: "تعمل هذه المنصة حصراً كوسيط تقني وسوق إلكتروني يهدف إلى ربط المستخدمين الباحثين عن الخدمات (العملاء) بمقدّمي خدمات مستقلين (مثل المدرّسين والمربيات وغيرهم). لا تقدّم المنصة أي خدمات بشكل مباشر، وليست صاحب عمل أو شريكاً أو ضامناً لأي من المستخدمين أو مقدّمي الخدمات المسجّلين عليها.",
      },
      {
        heading: "٢. عدم المسؤولية عن أفعال الغير",
        body: "لا تتحمّل المنصة وإدارتها أي مسؤولية قانونية أو جزائية أو مالية على الإطلاق عن أي أفعال أو تصرفات أو احتيال أو إهمال أو سوء سلوك يرتكبه أي مستخدم أو مقدّم خدمة تجاه طرف آخر. ويشمل ذلك على سبيل المثال لا الحصر: الاحتيال أو السرقة أو تقديم معلومات كاذبة أو الإخلال بالاتفاقات المتعلقة بالخدمات المرتّبة داخل المنصة أو خارجها.",
      },
      {
        heading: "٣. التحقق والتدقيق في السوابق",
        body: "تُنشأ الحسابات وإعلانات الخدمات بناءً على المعلومات التي يقدّمها المستخدمون أنفسهم. لا تقدّم المنصة أي ضمانات صريحة أو ضمنية بشأن دقة أو صحة أو هوية أو مؤهلات أي مقدّم خدمة، ولا تضمن خلوّ سجلّه الجنائي أو المهني من أي مشكلات. وتقع على عاتق المستخدم (العميل) وحده مسؤولية التحقق الكامل من هوية الطرف الآخر وموثوقيته قبل الدخول في أي اتفاق أو تحويل أي أموال.",
      },
      {
        heading: "٤. المعاملات المالية والتعاقدية",
        body: "تتم أي معاملات مالية أو اتفاقات تعاقدية بين العميل ومقدّم الخدمة على مسؤوليتهما الشخصية المطلقة. ولا تتحمّل المنصة أي مسؤولية عن ردّ الأموال أو التعويض عن أي أضرار مادية أو معنوية ناتجة عن معاملات فاشلة أو احتيالية.",
      },
      {
        heading: "٥. التعاون مع الجهات المختصة",
        body: "في حال وجود أي نزاع قانوني أو نشاط احتيالي، يقتصر التزام المنصة حصراً على التعاون مع السلطات القضائية والأمنية الرسمية من خلال تزويدها بالبيانات المتاحة (مثل سجلّات التسجيل أو البلاغات) وفقاً للقوانين المرعية الإجراء، دون تحمّل أي مسؤولية عن التعويض نيابةً عن المتسبّب بالضرر.",
      },
      {
        heading: "٦. الإعلانات والتحليلات (Meta Pixel)",
        body: "تستخدم المنصة أداة Meta Pixel المقدَّمة من شركة Meta Platforms (فيسبوك وإنستغرام) لقياس كيفية استخدام الزوار للموقع ومدى فعالية إعلاناتنا. عند زيارتك للموقع، قد تجمع أداة Meta Pixel معلومات تقنية مثل الصفحات التي تتصفّحها والإجراءات التي تقوم بها (كإنشاء حساب) ونوع المتصفح والجهاز وعنوان IP الخاص بك، وترسلها إلى Meta. وقد تربط Meta هذه المعلومات بمعلومات أخرى لديها، وفقاً لسياسة الخصوصية الخاصة بها، لعرض إعلانات مناسبة لك. لا ترسل المنصة رسائلك أو محتوى ملفك الشخصي إلى Meta. يمكنك الحدّ من استخدام هذه المعلومات في الإعلانات من خلال إعدادات الإعلانات في حسابك على فيسبوك أو إنستغرام، أو بحظر ملفات تعريف الارتباط الخاصة بالأطراف الثالثة في متصفحك.",
      },
      {
        heading: "٧. المحتوى والسلوك",
        body: "لا تسامح إطلاقاً مع المحتوى المسيء أو السلوك المؤذي. يُمنع نشر أو إرسال أي محتوى يحضّ على الكراهية أو يتضمّن تحرّشاً أو تهديداً أو محتوى جنسياً أو عنيفاً أو تمييزياً أو غير قانوني، أو انتحال شخصية أي أحد، أو نشر معلومات خاصة بشخص آخر، أو استخدام المنصة للاحتيال على الآخرين أو استغلالهم. يمكن الإبلاغ عن أي ملف أو منشور أو رسالة، ويمكن حظر أي شخص من التواصل معك. يراجع فريق ouiKnow البلاغات، عادةً خلال ٢٤ ساعة؛ ويُحذف المحتوى المخالف ويمكن تعليق أو حذف الحسابات المسؤولة.",
      },
    ],
  },
};

// What ouiKnow collects, who sees it and who processes it -- linked from
// the App Store listing, Settings and the Terms. Keep in step with what
// the app actually does (e.g. src/lib/login-log.ts, components/meta-pixel.tsx).
export const PRIVACY: Record<"en" | "ar", LegalDoc> = {
  en: {
    title: "Privacy Policy",
    updated: "Last updated: October 2026",
    intro: "This explains what ouiKnow collects when you use the website or the app, who can see it, and how to delete it.",
    credits: TERMS.en.credits,
    sections: [
      {
        heading: "1. What you give us",
        body: "Your email address or phone number to sign in, and the profiles and requests you create: name, photo, area, the services you offer or need, availability, descriptions and any other answers in the forms. Also the posts, replies, messages, voice notes, ratings and reports you send, the people you save, and for delivery & errands providers, a photo of an ID or driving licence. A phone number you add to a profile is optional.",
      },
      {
        heading: "2. Who can see it",
        body: "Signed-in users can see approved profiles and requests (name, photo, area, services and what you wrote) and your posts. Messages are only between you and the other person. Your email, your phone number, your ID document and health details you add to a nursing request are never shown to other users -- only the ouiKnow team sees them, to review profiles and keep the platform safe. Others only see that a provider's ID was checked.",
      },
      {
        heading: "3. What is collected automatically",
        body: "When you sign in we record the time, your IP address and the approximate country and city it points to (looked up through ipapi.co), to protect accounts from misuse. We count how often a profile is viewed, without telling its owner who viewed it. If you turn on notifications, we keep your device's notification token. On the website only, the Meta Pixel measures visits and ad results (see the Terms); the iOS and Android apps don't use it and don't track you across other apps or websites.",
      },
      {
        heading: "4. How it is used",
        body: "To run the service: show your profile, match you with people, deliver messages and notifications, review profiles and reports, prevent fraud and abuse, and answer you when you contact us. We don't sell your information.",
      },
      {
        heading: "5. Who processes it for us",
        body: "Supabase (database, sign-in and file storage), Railway (hosting), Resend (emails), Apple and Google (push notifications), ipapi.co (approximate location of a sign-in), and, on the website, Meta (the Pixel). They handle data only to provide their service to ouiKnow.",
      },
      {
        heading: "6. Keeping and deleting it",
        body: "Your information is kept while your account exists. You can edit or delete any profile, post or message you sent, and delete your whole account in Settings: this removes your profiles, posts, messages, photos and documents. Reports you filed and records we must keep by law may be kept after that. To ask anything about your data, contact us on WhatsApp from Settings & Help.",
      },
      {
        heading: "7. Children",
        body: "ouiKnow is for adults. Accounts are not for anyone under 18; parents may create a request on behalf of their children.",
      },
    ],
  },
  ar: {
    title: "سياسة الخصوصية",
    updated: "آخر تحديث: تشرين الأول ٢٠٢٦",
    intro: "توضّح هذه السياسة ما تجمعه ouiKnow عند استخدامك للموقع أو التطبيق، ومن يمكنه رؤيته، وكيف تحذفه.",
    credits: TERMS.ar.credits,
    sections: [
      {
        heading: "١. ما تعطينا إياه",
        body: "بريدك الإلكتروني أو رقم هاتفك لتسجيل الدخول، والملفات والطلبات التي تنشئها: الاسم والصورة والمنطقة والخدمات التي تقدّمها أو تحتاجها والأوقات المتاحة والأوصاف وأي إجابات أخرى في النماذج. وكذلك المنشورات والردود والرسائل والرسائل الصوتية والتقييمات والبلاغات التي ترسلها، والأشخاص الذين تحفظهم، وبالنسبة لمقدّمي خدمات التوصيل والمشاوير، صورة عن الهوية أو رخصة السوق. رقم الهاتف في الملف اختياري.",
      },
      {
        heading: "٢. من يمكنه رؤيته",
        body: "يمكن للمستخدمين المسجّلين رؤية الملفات والطلبات الموافق عليها (الاسم والصورة والمنطقة والخدمات وما كتبته) ومنشوراتك. الرسائل بينك وبين الشخص الآخر فقط. بريدك الإلكتروني ورقم هاتفك ووثيقة هويتك والتفاصيل الصحية التي تضيفها إلى طلب تمريض لا تُعرض أبداً على المستخدمين الآخرين — يراها فريق ouiKnow فقط لمراجعة الملفات والحفاظ على أمان المنصة. يرى الآخرون فقط أنّه تمّ التحقّق من هوية مقدّم الخدمة.",
      },
      {
        heading: "٣. ما يُجمع تلقائياً",
        body: "عند تسجيل الدخول نسجّل الوقت وعنوان IP والبلد والمدينة التقريبيين المرتبطين به (عبر خدمة ipapi.co)، لحماية الحسابات من سوء الاستخدام. نحصي عدد مرات مشاهدة الملف من دون أن نخبر صاحبه من شاهده. إذا فعّلت الإشعارات، نحتفظ برمز الإشعارات الخاص بجهازك. على الموقع فقط، تقيس أداة Meta Pixel الزيارات ونتائج الإعلانات (راجع الشروط)؛ أمّا تطبيقا iOS وأندرويد فلا يستخدمانها ولا يتتبّعانك عبر التطبيقات أو المواقع الأخرى.",
      },
      {
        heading: "٤. كيف نستخدمه",
        body: "لتشغيل الخدمة: عرض ملفك ومطابقتك مع الآخرين وإيصال الرسائل والإشعارات ومراجعة الملفات والبلاغات ومنع الاحتيال وسوء الاستخدام والردّ عليك عند تواصلك معنا. لا نبيع معلوماتك.",
      },
      {
        heading: "٥. من يعالجها لصالحنا",
        body: "Supabase (قاعدة البيانات وتسجيل الدخول وتخزين الملفات) وRailway (الاستضافة) وResend (البريد الإلكتروني) وApple وGoogle (الإشعارات) وipapi.co (الموقع التقريبي لتسجيل الدخول)، وعلى الموقع فقط Meta (أداة Pixel). تعالج هذه الجهات البيانات فقط لتقديم خدمتها لـ ouiKnow.",
      },
      {
        heading: "٦. الاحتفاظ والحذف",
        body: "نحتفظ بمعلوماتك ما دام حسابك موجوداً. يمكنك تعديل أو حذف أي ملف أو منشور أو رسالة أرسلتها، وحذف حسابك بالكامل من الإعدادات: يؤدّي ذلك إلى حذف ملفاتك ومنشوراتك ورسائلك وصورك ووثائقك. قد نحتفظ بعد ذلك بالبلاغات التي قدّمتها والسجلات التي يفرض القانون الاحتفاظ بها. لأي سؤال عن بياناتك، تواصل معنا على واتساب من «الإعدادات والمساعدة».",
      },
      {
        heading: "٧. الأطفال",
        body: "ouiKnow مخصّصة للبالغين. لا يجوز لمن هم دون ١٨ عاماً إنشاء حساب؛ ويمكن للأهل إنشاء طلب نيابةً عن أطفالهم.",
      },
    ],
  },
};
