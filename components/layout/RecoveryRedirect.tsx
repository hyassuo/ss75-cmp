"use client";

import { useEffect } from "react";

// A reset link that fell back to the Site URL (the app's /auth/reset not
// in Supabase's Redirect URLs) arrives on / — then /login or /dashboard —
// with the recovery tokens, or the "link expired" error, in the fragment.
// Forward it to /auth/reset from wherever it lands, so the tokens neither
// sit in another page's URL nor get ignored when someone else is signed in
// on the device.
export function RecoveryRedirect() {
  useEffect(() => {
    const h = window.location.hash;
    if (window.location.pathname === "/auth/reset") return;
    if (/(^|[#&])type=recovery(&|$)/.test(h) || /(^|[#&])error_code=/.test(h)) {
      window.location.replace("/auth/reset" + h);
    }
  }, []);
  return null;
}
