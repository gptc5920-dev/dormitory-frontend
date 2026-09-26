import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef } from "react";

export default function Modal({ title, children, onClose, wide = false }) {
  const previousFocus = useRef(document.activeElement);
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="modal-backdrop" />
      <Dialog.Content className={`modal ${wide ? "modal-wide" : ""}`} aria-describedby={undefined}
        onCloseAutoFocus={(event) => { event.preventDefault(); if (previousFocus.current?.isConnected) previousFocus.current.focus(); }}>
        <header className="modal-header">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Close asChild><button className="icon-button" type="button" aria-label="Close"><X size={19} /></button></Dialog.Close>
        </header>
        <div className="modal-body">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
