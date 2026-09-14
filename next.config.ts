import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    // Nanny profile photos live in Supabase Storage (public bucket). Next's
    // image optimizer refuses to load any remote host that isn't
    // explicitly allow-listed here -- without this, <Image src={photoUrl}>
    // fails or renders a broken/partial image for every real uploaded
    // photo, on every page that shows one (dashboard, feed, profile panel).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
