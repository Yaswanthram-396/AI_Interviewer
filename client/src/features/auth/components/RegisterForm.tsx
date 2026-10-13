"use client";

import { useState, type FormEvent } from "react";
import { TextField } from "@/components/forms/TextField";
import { useAuth } from "../hooks/useAuth";
import { useAuthSubmit } from "../hooks/useAuthSubmit";
import { validateRegister, type FieldErrors } from "../schemas/authSchemas";
import { AuthFormLayout } from "./AuthFormLayout";

export function RegisterForm() {
  const { register } = useAuth();
  const [values, setValues] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<FieldErrors<"email" | "password" | "confirmPassword">>({});
  const { submit, isSubmitting, formError } = useAuthSubmit(() =>
    register({ name: values.name.trim() || undefined, email: values.email, password: values.password })
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateRegister(values);
    setErrors(found);
    if (Object.keys(found).length === 0) void submit();
  };

  const bind = (field: keyof typeof values) => ({
    value: values[field],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [field]: e.target.value })),
  });

  return (
    <AuthFormLayout
      title="Create your candidate account"
      subtitle="Take interviews you have been invited to and get detailed feedback."
      submitLabel="Create account"
      isSubmitting={isSubmitting}
      formError={formError}
      onSubmit={handleSubmit}
      footerText="Already registered?"
      footerLinkLabel="Sign in"
      footerHref="/login"
    >
      <TextField id="name" label="Name (optional)" autoComplete="name" {...bind("name")} />
      <TextField id="email" label="Email" type="email" autoComplete="email" error={errors.email} {...bind("email")} />
      <TextField
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        error={errors.password}
        {...bind("password")}
      />
      <TextField
        id="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword}
        {...bind("confirmPassword")}
      />
    </AuthFormLayout>
  );
}
