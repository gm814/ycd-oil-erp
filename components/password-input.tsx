"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import styles from "./password-input.module.css";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ id, disabled, ...props }: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <span className={styles.field}>
      <input {...props} id={inputId} disabled={disabled} type={visible ? "text" : "password"} />
      <button
        className={styles.toggle}
        type="button"
        disabled={disabled}
        aria-controls={inputId}
        aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        aria-pressed={visible}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? "إخفاء" : "إظهار"}
      </button>
    </span>
  );
}
