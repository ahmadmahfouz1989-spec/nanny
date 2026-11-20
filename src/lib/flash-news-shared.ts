/** Flash news, as the banner and the admin page see it (no server code here: both run in the browser). */
export type FlashNews = { id: string; body: string; bodyAr: string | null; createdAt: string };

export const FLASH_NEWS_MAX = 300;
