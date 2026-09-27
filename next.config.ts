import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs/config";

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

const config = withNextIntl(nextConfig);

// Readable stack traces in Sentry need the build's source maps uploaded,
// which needs a Sentry auth token -- without one, the build is unchanged.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      // Upload the maps, then keep them off the public site.
      sourcemaps: { deleteSourcemapsAfterUpload: true },
    })
  : config;
