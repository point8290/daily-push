import type { ReactNode } from 'react';
import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
} from '@chakra-ui/react';

/**
 * One modal style for the whole app: short title, one line of context,
 * the task in the body, and the actions in the footer.
 * Forms go full-screen on phones so they stay usable with the keyboard open;
 * short confirmations (size="md") stay a centered card.
 */
export default function AppModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'lg',
  closeOnOverlayClick = true,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl' | '2xl';
  closeOnOverlayClick?: boolean;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size={{ base: size === 'md' ? 'md' : 'full', md: size }}
      isCentered
      scrollBehavior="inside"
      closeOnOverlayClick={closeOnOverlayClick}
    >
      <ModalOverlay bg="blackAlpha.500" backdropFilter="blur(2px)" />
      <ModalContent borderRadius={{ base: size === 'md' ? '2xl' : 0, md: '2xl' }} mx={{ base: size === 'md' ? 4 : 0, md: 4 }}>
        <ModalHeader pb={description ? 1 : 3} pr={12}>
          <p className="text-lg font-semibold text-slate-900">{title}</p>
          {description ? (
            <p className="mt-1 text-sm font-normal leading-6 text-slate-500">{description}</p>
          ) : null}
        </ModalHeader>
        <ModalCloseButton top={4} right={4} />
        <ModalBody pb={footer ? 2 : 6}>{children}</ModalBody>
        {footer ? (
          <ModalFooter gap={2} borderTop="1px solid" borderColor="blackAlpha.100" mt={2}>
            {footer}
          </ModalFooter>
        ) : null}
      </ModalContent>
    </Modal>
  );
}
