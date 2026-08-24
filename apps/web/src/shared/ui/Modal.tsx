import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/shared/utils';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Radix Dialog 薄封装，统一控制台弹层样式。 */
export function Modal({ open, onOpenChange, title, children, footer, className }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-28 z-50 w-[420px] max-w-[92vw] -translate-x-1/2 rounded-card bg-surface shadow-soft',
            className,
          )}
        >
          <div className="flex h-14 items-center justify-between border-b border-line px-5">
            <Dialog.Title className="font-medium">{title}</Dialog.Title>
            <Dialog.Close className="text-muted hover:text-ink">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="p-5">{children}</div>
          {footer ? (
            <div className="flex h-14 items-center justify-end gap-2 border-t border-line px-5">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
