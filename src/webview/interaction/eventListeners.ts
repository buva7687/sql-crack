import { registerDragListeners } from './dragListeners';
import { registerZoomPanListeners } from './zoomPanListeners';
import { registerSvgKeyboardListeners, registerDocumentKeyboardListeners } from './keyboardListeners';
import { registerTooltipListeners } from './tooltipListeners';
import type { EventListenerCallbacks, EventListenerContext } from './eventListenerTypes';

export type { EventListenerCallbacks, EventListenerContext } from './eventListenerTypes';

export function setupEventListeners(context: EventListenerContext, callbacks: EventListenerCallbacks): void {
    registerDragListeners(context, callbacks);
    registerZoomPanListeners(context, callbacks);
    registerSvgKeyboardListeners(context, callbacks);
    registerDocumentKeyboardListeners(context, callbacks);
    registerTooltipListeners(context, callbacks);
}
