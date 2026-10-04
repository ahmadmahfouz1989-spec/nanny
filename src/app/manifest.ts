import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest (excluded from the locale proxy). start_url
// is "/" so the proxy sends each user to their own locale on launch.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ouiKnow",
    short_name: "ouiKnow",
    description: "Find trusted nannies, nurses and tutors — or offer your help.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf8f4",
    theme_color: "#fbf8f4",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
