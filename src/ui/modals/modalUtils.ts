/**
 * Generic modal setup: bind open/close to trigger and close elements.
 * onOpen is called when an open trigger is clicked; onClose for close buttons and outside click.
 */
export function setupModal(
  modalId: string,
  openTriggerIds: string[],
  closeTriggerIds: string[],
  onOpen: () => void,
  onClose: () => void
): void {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  for (const id of openTriggerIds) {
    const trigger = document.getElementById(id);
    if (trigger) {
      trigger.addEventListener('click', () => onOpen());
    }
  }

  for (const id of closeTriggerIds) {
    const closeBtn = document.getElementById(id);
    if (closeBtn) {
      closeBtn.addEventListener('click', onClose);
    }
  }

  modal.addEventListener('click', (e: MouseEvent) => {
    if (e.target === modal) onClose();
  });
}
