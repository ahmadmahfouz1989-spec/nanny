import { notFound } from "next/navigation";

// Any address that isn't a page: the app's own 404 (not-found.tsx), in the
// visitor's language, instead of Next's bare default.
export default function CatchAll() {
  notFound();
}
