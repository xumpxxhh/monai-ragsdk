import { cn } from '@/shared/utils';
import type { InputHTMLAttributes, ReactNode } from 'react';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-ctrl border border-line bg-surface px-3 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-ctrl border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20',
        className,
      )}
      {...props}
    />
  );
}

export function SelectNative({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 rounded-ctrl border border-line bg-surface px-3 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}

export function Field({ label, error, children, htmlFor }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

interface SwitchRowProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: string;
  disabled?: boolean;
}

/** 策略开关行：左侧文案 + 右侧 Switch。 */
export function SwitchRow({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: SwitchRowProps) {
  return (
    <label
      className={cn(
        'flex items-start justify-between gap-4 py-2',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span>
        <span className="text-sm">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted">{description}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
      />
    </label>
  );
}
