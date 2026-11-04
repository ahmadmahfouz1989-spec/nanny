import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    // Everyone is in Lebanon. Without this, times format in the server's
    // zone (UTC on Railway): an order stage at 14:05 showed as 12:05.
    timeZone: "Asia/Beirut",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
