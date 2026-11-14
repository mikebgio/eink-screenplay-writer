/**
 * True for the two ways a share is dismissed on purpose: the Web Share `AbortError`, and the Share
 * plugin's own "Share canceled". Any other error, even one whose text mentions "cancel", is a failure.
 */
export const isCancel = (e: unknown): boolean =>
  (e instanceof Error || (typeof DOMException !== 'undefined' && e instanceof DOMException)) &&
  (e.name === 'AbortError' || /^share cancell?ed\.?$/i.test(e.message.trim()));
