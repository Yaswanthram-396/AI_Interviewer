import type { InputHTMLAttributes } from "react";
import { Field, Input } from "@/components/ui/form";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

/** Labelled input with an accessible, field-level error message. */
export function TextField({ id, label, error, hint, required, ...inputProps }: TextFieldProps) {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      {(field) => <Input {...inputProps} {...field} required={required} />}
    </Field>
  );
}
