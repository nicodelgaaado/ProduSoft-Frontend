'use client';

import { ComposedModal, ModalBody, ModalFooter, ModalHeader } from '@carbon/react';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <ComposedModal open={open} onClose={onClose} size="lg">
      <ModalHeader title={title} closeModal={onClose} />
      <ModalBody>{children}</ModalBody>
      {footer && <ModalFooter>{footer}</ModalFooter>}
    </ComposedModal>
  );
}

