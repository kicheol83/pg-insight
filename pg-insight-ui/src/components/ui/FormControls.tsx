import React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/format";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export function Input({ label, error, icon, className, ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-secondary mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            {icon}
          </div>
        )}
        <input
          className={cn(
            "input",
            icon && "pl-9",
            error && "border-red-400",
            className,
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  options,
  value,
  onChange,
  className,
  placeholder,
}: {
  options: SelectOption[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("input appearance-none pr-8 cursor-pointer", className)}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
      />
    </div>
  );
}
