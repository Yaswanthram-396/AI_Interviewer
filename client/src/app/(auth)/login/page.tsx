import { Suspense } from "react";
import { LoginForm } from "@/features/auth/components/LoginForm";

export default function LoginPage() {
  // useSearchParams (for ?next=) requires a Suspense boundary.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
