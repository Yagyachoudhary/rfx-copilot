/**
 * Reads a JSON API response without crashing on non-JSON bodies. When the hosting platform stops a request
 * (time limit, crash), it returns a plain-text page such as "An error occurred with your deployment";
 * turn that into a sentence the user can act on instead of "Unexpected token 'A' … is not valid JSON".
 */
export async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    if (res.status === 504 || /TIMEOUT|timed out/i.test(text)) {
      return { error: "This took longer than the server allows (the AI service may be busy). Please try again in a minute." };
    }
    if (res.status === 413 || /PAYLOAD_TOO_LARGE|too large/i.test(text)) {
      return { error: "The upload is too large. Try fewer or smaller files (under about 4 MB in total)." };
    }
    return { error: `The server ran into a problem (HTTP ${res.status}). Please try again.` };
  }
}
