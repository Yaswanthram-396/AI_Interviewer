"use client";

import { useState, type FormEvent } from "react";
import { TextField } from "@/components/forms/TextField";
import { useAuth } from "../hooks/useAuth";
import { useAuthSubmit } from "../hooks/useAuthSubmit";
import { validateLogin, type FieldErrors } from "../schemas/authSchemas";
import { AuthFormLayout } from "./AuthFormLayout";
import { DemoAccess } from "./DemoAccess";

export function LoginForm() {
  const { login } = useAuth();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors<"email" | "password">>({});
  const { submit, isSubmitting, formError } = useAuthSubmit(() => login(values));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateLogin(values);
    setErrors(found);
    if (Object.keys(found).length === 0) void submit();
  };

  return (
    <AuthFormLayout
      title="Welcome back"
      subtitle="Sign in to continue to SIRI."
      submitLabel="Sign in"
      isSubmitting={isSubmitting}
      formError={formError}
      onSubmit={handleSubmit}
      footerText="New here?"
      footerLinkLabel="Create an account"
      footerHref="/register"
      extra={<DemoAccess />}
    >
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        value={values.email}
        error={errors.email}
        onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
      />
      <TextField
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        value={values.password}
        error={errors.password}
        onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
      />
    </AuthFormLayout>
  );
}
