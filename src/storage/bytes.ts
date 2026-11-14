/** Base64 of binary data, for the Capacitor bridge (which carries strings, not bytes). */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // btoa wants a "binary string"; build it in chunks so a large PDF doesn't overflow the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
