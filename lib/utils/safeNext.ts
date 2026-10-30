// Post-login destination from ?next=, restricted to this app's own paths so
// a crafted link can't turn the login into an open redirect.
//
// Browsers and the WHATWG URL parser don't read a path the way a string
// check does: they drop TAB/CR/LF anywhere ("/\t/evil.example" becomes
// "//evil.example"), treat "\" as "/" and resolve "/./" and "/../" segments
// ("/.//evil.example" becomes "//evil.example"). So the value is parsed
// exactly like the navigation will parse it, against a fixed placeholder
// origin, and only what that parse keeps on the same origin is returned.
const FALLBACK = "/dashboard";
const BASE = "https://next.invalid";

export function safeNext(raw: string | null | undefined): string {
  if (!raw) return FALLBACK;
  // ASCII control characters (TAB, CR, LF, NUL, DEL…) and backslashes
  // have no business in an app path: refuse them outright.
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return FALLBACK;
  // A single leading "/" and no scheme ("/javascript:…" is harmless after
  // the parse below, but there is no reason to accept it).
  if (!raw.startsWith("/") || raw.startsWith("//")) return FALLBACK;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(raw)) return FALLBACK;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return FALLBACK;
  }
  if (url.origin !== BASE) return FALLBACK;
  const out = url.pathname + url.search + url.hash;
  // The normalised path must still be a plain same-origin path.
  if (!out.startsWith("/") || out.startsWith("//")) return FALLBACK;
  if (url.pathname.startsWith("/login")) return FALLBACK;
  return out;
}
