// Decision drawer (docs/12 §2.1, docs/18): right-side sheet for approvals, certifications and
// receipts. Blend's DrawerV2 parts are headless vaul primitives, so the look comes from tokens here.
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { DrawerV2, DrawerV2Close, DrawerV2Content, DrawerV2Description, DrawerV2Overlay, DrawerV2Portal, DrawerV2Title } from '@juspay/blend-design-system';

export function SideDrawer({ open, onClose, title, description, footer, children, width = 560 }: { open: boolean; onClose: () => void; title: string; description?: string; footer?: ReactNode; children: ReactNode; width?: number }) {
  return (
    <DrawerV2 open={open} onOpenChange={(o) => !o && onClose()} direction="right">
      <DrawerV2Portal>
        {/* layers.drawer (1100) from @tgs/design-tokens: above the shell and dropdowns, below modals and toasts. */}
        <DrawerV2Overlay className="fixed inset-0 z-[1100] bg-overlay" />
        <DrawerV2Content className="fixed inset-y-0 right-0 z-[1100] flex max-w-full flex-col rounded-l-sheet bg-surface shadow-drawer outline-none" style={{ width }} {...(description ? {} : { 'aria-describedby': undefined })}>
          <header className="flex items-start justify-between gap-4 border-b border-line-subtle px-6 pb-4 pt-5">
            <div className="min-w-0">
              <DrawerV2Title className="text-section-title text-fg">{title}</DrawerV2Title>
              {description && <DrawerV2Description className="mt-1 text-body text-fg-secondary">{description}</DrawerV2Description>}
            </div>
            <DrawerV2Close className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-control text-fg-secondary hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-focus" aria-label="Close">
              <X size={18} aria-hidden />
            </DrawerV2Close>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <footer className="border-t border-line-subtle px-6 py-4">{footer}</footer>}
        </DrawerV2Content>
      </DrawerV2Portal>
    </DrawerV2>
  );
}
