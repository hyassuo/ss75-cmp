import { redirect } from "next/navigation";

// Kept for old bookmarks: tabs are addressed as /dashboard?tab=… now.
export default function Page() {
  redirect("/dashboard?tab=zones");
}
