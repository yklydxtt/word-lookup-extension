import { normalizeSelection } from '../core/normalize';

export interface WordSelection {
  selectedText: string;
  word: string;
  rect: { left: number; right: number; top: number; bottom: number };
}

export function isExcludedNode(node: Node | null, cardHost: HTMLElement): boolean {
  let element = node?.nodeType === 1 ? node as Element : node?.parentElement;
  let editableResolved = false;
  while (element) {
    if (element === cardHost || element.matches('input, textarea, select, [role="textbox"], .monaco-editor, .cm-editor, .CodeMirror')) {
      return true;
    }
    if (!editableResolved && element.hasAttribute('contenteditable')) {
      editableResolved = true;
      if (element.getAttribute('contenteditable')?.toLowerCase() !== 'false') return true;
    }
    const parent = element.parentElement;
    const tree = element.getRootNode();
    element = parent ?? ('host' in tree ? (tree as ShadowRoot).host : null);
  }
  return false;
}

export function readSelection(document: Document, cardHost: HTMLElement): WordSelection | null {
  if (document.contentType === 'application/pdf' || document.designMode === 'on') return null;
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  if (isExcludedNode(selection.anchorNode, cardHost) || isExcludedNode(selection.focusNode, cardHost)) return null;
  const range = selection.getRangeAt(0);
  if (isExcludedNode(range.commonAncestorContainer, cardHost)) return null;
  const selectedText = selection.toString().trim();
  if (selectedText.length > 200) return null;
  const word = normalizeSelection(selectedText);
  if (!word) return null;
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return {
    selectedText,
    word,
    rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
  };
}
