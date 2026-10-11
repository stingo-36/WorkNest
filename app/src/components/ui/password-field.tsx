"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Input, type InputProps } from "@/components/ui/input";

/** Password field for the authenticated app, with a keyboard-accessible reveal control. */
export function PasswordField({ fieldLabel, ...props }: InputProps & { fieldLabel: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      {...props}
      type={visible ? "text" : "password"}
      endIcon={
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? "Hide" : "Show"} ${fieldLabel}`}
          aria-pressed={visible}
          className="-mr-2 grid size-11 cursor-pointer place-items-center rounded-lg text-text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-text md:size-10"
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      }
    />
  );
}
