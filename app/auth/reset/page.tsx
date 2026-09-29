import { ResetPasswordForm } from "@/components/layout/ResetPasswordForm";

// Landing page of the password-reset email (public: see PUBLIC_PATHS in
// lib/supabase/proxy.ts).
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
