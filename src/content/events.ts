import type { WordController } from './controller';
import { readSelection } from './selection';

export function bindPageEvents(document: Document, host: HTMLElement, controller: WordController): () => void {
  const window = document.defaultView!;
  const listeners = new AbortController();
  const options = { capture: true, signal: listeners.signal };
  let pointerInCard = false;
  let previousSelection = '';
  let pendingFrame: number | undefined;

  function insideCard(event: Event): boolean {
    return event.composedPath().includes(host);
  }

  function close(): void {
    if (pendingFrame !== undefined) {
      window.cancelAnimationFrame(pendingFrame);
      pendingFrame = undefined;
    }
    controller.close();
  }

  document.addEventListener('pointerdown', event => {
    pointerInCard = insideCard(event);
    previousSelection = document.getSelection()?.toString() ?? '';
    if (!pointerInCard) close();
  }, options);

  document.addEventListener('mouseup', event => {
    if (event.button !== 0 || pointerInCard || insideCard(event)) {
      pointerInCard = false;
      return;
    }
    const current = document.getSelection()?.toString() ?? '';
    if (event.detail === 1 && current === previousSelection) return;
    if (pendingFrame !== undefined) window.cancelAnimationFrame(pendingFrame);
    pendingFrame = window.requestAnimationFrame(() => {
      pendingFrame = undefined;
      try {
        const selection = readSelection(document, host);
        if (selection) void controller.select(selection);
        else close();
      } catch {
        close();
      }
    });
  }, options);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  }, options);
  document.addEventListener('scroll', event => {
    if (!insideCard(event)) close();
  }, options);
  window.addEventListener('resize', close, { signal: listeners.signal });
  document.addEventListener('selectionchange', () => {
    if (pointerInCard) return;
    const selection = document.getSelection();
    const anchor = selection?.anchorNode;
    if (anchor && (host.contains(anchor) || anchor.getRootNode() === host.shadowRoot)) return;
    const composedRanges = host.shadowRoot
      ? selection?.getComposedRanges?.({ shadowRoots: [host.shadowRoot] })
      : undefined;
    if (composedRanges?.some(range =>
      range.startContainer.getRootNode() === host.shadowRoot || range.endContainer.getRootNode() === host.shadowRoot,
    )) return;
    if (!selection || selection.isCollapsed) close();
  }, { signal: listeners.signal });

  return () => {
    close();
    listeners.abort();
  };
}
