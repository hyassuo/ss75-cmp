import { Suspense } from "react";
import { LoginForm } from "@/components/layout/LoginForm";

export default function LoginPage() {
  // LoginForm reads ?next= (useSearchParams).
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
