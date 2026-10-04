/** Keep native Tab navigation within an open dialog, including changing forms. */
export function trapDialogFocus(event: KeyboardEvent, dialog: HTMLElement): void {
    if (event.key !== 'Tab' || !dialog.isConnected) {
        return;
    }
    event.stopPropagation();
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex]'
    )).filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = dialog.ownerDocument.activeElement;
    if (!first) {
        event.preventDefault();
        dialog.focus();
    } else if (!controls.includes(active as HTMLElement) || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
    }
}
