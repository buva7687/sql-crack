import type { EventListenerCallbacks, EventListenerContext } from './eventListenerTypes';

export function registerTooltipListeners(
    _context: EventListenerContext,
    _callbacks: EventListenerCallbacks
): void {
    // Node-level tooltip handlers remain attached in renderNode().
    // This hook exists so listener wiring can be extended without re-coupling setup.
}
