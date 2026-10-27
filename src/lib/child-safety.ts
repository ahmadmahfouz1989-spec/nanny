type ChildSafetyDoc = {
  title: string;
  intro: string;
  contact: string;
  sections: { heading: string; body: string }[];
};

// The /child-safety page: ouiKnow's published standards against child sexual
// abuse and exploitation (CSAE), which Google Play requires for social apps.
export const CHILD_SAFETY: Record<"en" | "ar", ChildSafetyDoc> = {
  en: {
    title: "Child safety standards",
    intro: "ouiKnow connects families with nannies, babysitters, tutors and other people who may work with children. Keeping children safe is central to that, and ouiKnow has zero tolerance for child sexual abuse and exploitation (CSAE).",
    contact: "Report a child safety concern on WhatsApp",
    sections: [
      {
        heading: "What is prohibited",
        body: "Any content or behaviour that sexually exploits, abuses or endangers children is banned on ouiKnow. This includes child sexual abuse material (CSAM), sexualised images or descriptions of minors, grooming, sextortion, trafficking, and any attempt to contact a child for sexual purposes. This applies to profiles, photos, posts, replies, messages and voice notes.",
      },
      {
        heading: "Who can use ouiKnow",
        body: "Accounts are only for adults aged 18 and over. Children do not have accounts; parents and guardians create requests on their behalf. Every profile is reviewed by the ouiKnow team before it appears, and providers who work with children are shown with the checks they have passed, such as a verified phone or ID.",
      },
      {
        heading: "How to report",
        body: "Every profile, post and conversation in the app has a Report option, and you can block anyone from contacting you. For anything involving a child's safety, also message the ouiKnow team on WhatsApp so we can act at once. If a child is in immediate danger, contact the police first (112 in Lebanon).",
      },
      {
        heading: "What we do",
        body: "Reports are reviewed by the ouiKnow team, usually within 24 hours, and child safety reports first. When content or behaviour breaks these standards, we remove the content, permanently ban the account, keep the evidence the law requires, and report it to the relevant authorities, including the Internal Security Forces' Cybercrime Bureau in Lebanon and, for child sexual abuse material, the National Center for Missing & Exploited Children (NCMEC).",
      },
      {
        heading: "Compliance",
        body: "ouiKnow complies with the child safety laws that apply to it and cooperates with law enforcement investigations. These standards are part of our Terms of Service.",
      },
    ],
  },
  ar: {
    title: "معايير سلامة الأطفال",
    intro: "يربط ouiKnow العائلات بالمربّيات وجليسات الأطفال والمدرّسين وغيرهم ممن قد يعملون مع الأطفال. سلامة الأطفال أساس هذا العمل، ولا يتسامح ouiKnow إطلاقاً مع الاعتداء الجنسي على الأطفال أو استغلالهم.",
    contact: "أبلغ عن خطر على طفل عبر واتساب",
    sections: [
      {
        heading: "ما هو ممنوع",
        body: "يُمنع على ouiKnow أي محتوى أو سلوك يستغلّ الأطفال جنسياً أو يسيء إليهم أو يعرّضهم للخطر. يشمل ذلك مواد الاعتداء الجنسي على الأطفال، والصور أو الأوصاف الجنسية للقاصرين، والاستدراج، والابتزاز الجنسي، والاتجار، وأي محاولة للتواصل مع طفل لأغراض جنسية. ينطبق ذلك على الملفات والصور والمنشورات والردود والرسائل والرسائل الصوتية.",
      },
      {
        heading: "من يمكنه استخدام ouiKnow",
        body: "الحسابات للبالغين بعمر ١٨ سنة وما فوق فقط. ليس للأطفال حسابات، بل ينشئ الأهل والأوصياء الطلبات نيابةً عنهم. يراجع فريق ouiKnow كل ملف قبل ظهوره، ويظهر مقدّمو الخدمات الذين يعملون مع الأطفال مع ما اجتازوه من تحقّق، مثل رقم الهاتف أو الهوية.",
      },
      {
        heading: "كيف تبلّغ",
        body: "لكل ملف ومنشور ومحادثة في التطبيق خيار «إبلاغ»، ويمكنك حظر أي شخص من التواصل معك. في كل ما يتعلّق بسلامة طفل، راسل فريق ouiKnow على واتساب أيضاً لنتصرّف فوراً. إذا كان طفل في خطر داهم، اتصل بالشرطة أولاً (١١٢ في لبنان).",
      },
      {
        heading: "ما نقوم به",
        body: "يراجع فريق ouiKnow البلاغات عادةً خلال ٢٤ ساعة، وبلاغات سلامة الأطفال أولاً. عند مخالفة هذه المعايير، نحذف المحتوى ونحظر الحساب نهائياً ونحتفظ بالأدلّة التي يفرضها القانون ونبلّغ الجهات المختصّة، ومنها مكتب مكافحة الجرائم المعلوماتية في قوى الأمن الداخلي في لبنان، والمركز الوطني للأطفال المفقودين والمستغَلّين (NCMEC) في ما يخصّ مواد الاعتداء الجنسي على الأطفال.",
      },
      {
        heading: "الالتزام بالقوانين",
        body: "يلتزم ouiKnow بقوانين سلامة الأطفال التي تنطبق عليه ويتعاون مع تحقيقات الجهات الأمنية. هذه المعايير جزء من شروط الخدمة.",
      },
    ],
  },
};
