const textEncoder = new TextEncoder();

export function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function base64UrlDecode(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function hashPassword(password: string, salt = randomToken(16), iterations = 210_000) {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: textEncoder.encode(salt),
      iterations,
    },
    key,
    256,
  );

  return `pbkdf2-sha256$${iterations}$${salt}$${base64UrlEncode(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterations, salt, digest] = storedHash.split("$");
  if (algorithm !== "pbkdf2-sha256" || !iterations || !salt || !digest) {
    return false;
  }

  const nextHash = await hashPassword(password, salt, Number(iterations));
  return timingSafeEqual(textEncoder.encode(nextHash), textEncoder.encode(storedHash));
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.at(index)! ^ right.at(index)!;
  }
  return diff === 0;
}
