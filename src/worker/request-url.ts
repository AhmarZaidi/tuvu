type RequestLike = {
  url: string;
  header(name: string): string | undefined;
};

const ipAddressPattern = /^(\d{1,3}\.){3}\d{1,3}$|^\[[a-f0-9:]+\]$/i;

export function publicOrigin(request: RequestLike) {
  const url = new URL(request.url);
  const forwardedHost = firstForwardedValue(request.header("x-forwarded-host"));
  const forwardedProto = firstForwardedValue(request.header("x-forwarded-proto"));
  const host = forwardedHost ?? request.header("host") ?? url.host;
  const protocol = forwardedProto ?? url.protocol.replace(":", "");

  return `${protocol}://${host}`;
}

export function publicHostname(request: RequestLike) {
  return new URL(publicOrigin(request)).hostname;
}

export function isPublicHttps(request: RequestLike) {
  return new URL(publicOrigin(request)).protocol === "https:";
}

export function passkeyRpId(request: RequestLike) {
  const hostname = publicHostname(request);
  if (hostname === "localhost") {
    return hostname;
  }

  if (ipAddressPattern.test(hostname)) {
    throw new Error("Passkeys cannot be used from an IP address. Open http://localhost:8787 on this computer, or use your HTTPS ngrok URL on your phone.");
  }

  return hostname;
}

function firstForwardedValue(value: string | undefined) {
  return value?.split(",")[0]?.trim() || undefined;
}
