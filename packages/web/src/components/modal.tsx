"use client";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";

export function Modal({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto max-w-lg w-full rounded-glass bg-white/90 backdrop-blur-sm border border-black/[0.06] shadow-glass p-6">
          <DialogTitle className="text-lg font-semibold text-text-primary mb-4">{title}</DialogTitle>
          {children}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
