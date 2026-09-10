export type LegalSection = { heading: string; body: string };

type LegalDoc = {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
};

export const TERMS: Record<"en" | "ar", LegalDoc> = {
  en: {
    title: "Terms of Service",
    updated: "Last updated: September 2026",
    intro: "By creating an account you agree to the following terms.",
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
    ],
  },
  ar: {
    title: "شروط الخدمة",
    updated: "آخر تحديث: أيلول ٢٠٢٦",
    intro: "بإنشائك حسابًا فإنك توافق على الشروط التالية.",
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
    ],
  },
};
