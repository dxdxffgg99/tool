const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, *"
};

function json(body, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    ...CORS_HEADERS,
    ...extraHeaders
  });

  return new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    { status, headers }
  );
}

function badRequest(msg) {
  return json({ ok: false, error: msg }, 400);
}

function notFound() {
  return json({ ok: false, error: "Not found" }, 404);
}

function methodNotAllowed() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}

function safeTargetUrl(raw) {
  if (!raw) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return null;
  }
  return u;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    if (path === "/api/env") {
      if (method !== "GET" && method !== "HEAD") return methodNotAllowed();
      return handleEnv(request);
    }

    // /api/inspect 와 /api/exurl 둘 다 같은 기능
    if (path === "/api/inspect" || path === "/api/exurl") {
      if (method !== "GET" && method !== "HEAD") return methodNotAllowed();
      return handleInspect(request, url);
    }

    if (path === "/api/file") {
      if (method !== "GET" && method !== "HEAD") return methodNotAllowed();
      return handleProxyFile(request, url);
    }

    return notFound();
  }
};

// /api/env
function handleEnv(request) {
  const headers = request.headers;
  const cf = request.cf || {};

  const data = {
    ok: true,
    ip: headers.get("cf-connecting-ip") || null,
    userAgent: headers.get("user-agent") || null,
    country: cf.country || null,
    city: cf.city || null,
    colo: cf.colo || null,
    asn: cf.asn || null,
    asOrganization: cf.asOrganization || null,
    continent: cf.continent || null,
    tlsVersion: cf.tlsVersion || null,
    httpProtocol: cf.httpProtocol || null,
    botManagement: cf.botManagement || undefined
  };

  return json(data, 200);
}

// /api/inspect?url=...&method=HEAD|GET
async function handleInspect(request, requestUrl) {
  const targetRaw = requestUrl.searchParams.get("url");
  const methodParam = (requestUrl.searchParams.get("method") || "HEAD").toUpperCase();

  const target = safeTargetUrl(targetRaw);
  if (!target) return badRequest("유효한 http/https URL이 아닙니다.");

  const method = methodParam === "GET" ? "GET" : "HEAD";

  const maxRedirects = 10;
  const redirects = [];
  let current = target;
  let lastRes = null;

  for (let i = 0; i < maxRedirects; i++) {
    const res = await fetch(current.toString(), {
      method,
      redirect: "manual"
    });

    const status = res.status;
    const statusText = res.statusText;
    const location = res.headers.get("location");

    if (status >= 300 && status < 400 && location) {
      const next = new URL(location, current);
      redirects.push({
        url: current.toString(),
        status,
        statusText,
        location: next.toString()
      });
      current = next;
      lastRes = res;
      continue;
    }

    lastRes = res;
    break;
  }

  if (!lastRes) {
    return json({ ok: false, error: "요청 실패" }, 502);
  }

  const headersObj = {};
  for (const [k, v] of lastRes.headers) {
    headersObj[k.toLowerCase()] = v;
  }

  const contentType = headersObj["content-type"] || null;
  const contentLengthRaw = headersObj["content-length"] || null;
  const contentLength = contentLengthRaw ? Number(contentLengthRaw) || null : null;
  const isImage = !!(contentType && contentType.startsWith("image/"));

  const body = {
    ok: true,
    requestedUrl: target.toString(),
    finalUrl: current.toString(),
    status: lastRes.status,
    statusText: lastRes.statusText,
    redirects,
    headers: headersObj,
    contentType,
    contentLength,
    isImage
  };

  return json(body, 200);
}

// /api/file?url=...&download=1
async function handleProxyFile(request, requestUrl) {
  const targetRaw = requestUrl.searchParams.get("url");
  const download = requestUrl.searchParams.get("download") === "1";

  const target = safeTargetUrl(targetRaw);
  if (!target) return badRequest("유효한 http/https URL이 아닙니다.");

  const maxRedirects = 10;
  let current = target;
  let lastRes = null;

  for (let i = 0; i < maxRedirects; i++) {
    const res = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual"
    });

    const status = res.status;
    const location = res.headers.get("location");

    if (status >= 300 && status < 400 && location) {
      const next = new URL(location, current);
      current = next;
      lastRes = res;
      continue;
    }

    lastRes = res;
    break;
  }

  if (!lastRes) {
    return new Response("fetch failed", {
      status: 502,
      headers: CORS_HEADERS
    });
  }

  const hopByHop = new Set([
    "connection",
    "keep-alive",
    "transfer-encoding",
    "upgrade",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers"
  ]);

  const headers = new Headers();
  for (const [k, v] of lastRes.headers) {
    const lower = k.toLowerCase();
    if (hopByHop.has(lower)) continue;
    headers.set(k, v);
  }

  headers.set("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    headers.set(k, v);
  }

  if (download) {
    const name = current.pathname.split("/").pop() || "download";
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(name)}"`
    );
  }

  return new Response(lastRes.body, {
    status: lastRes.status,
    headers
  });
}
