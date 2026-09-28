import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs/config";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Profile photos live in this project's Supabase Storage (public buckets).
// Next's image optimizer only loads hosts allow-listed here -- without
// this, <Image src={photoUrl}> fails for every uploaded photo. Only our
// own project: allowing every *.supabase.co would let anyone have our
// server fetch and process images from a Supabase project of their own.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: supabaseUrl.protocol === "http:" ? "http" : "https",
            hostname: supabaseUrl.hostname,
            port: supabaseUrl.port,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
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
