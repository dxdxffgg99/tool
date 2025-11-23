export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/env") {
      return handleEnv(request);
    }

    if (path === "/api/inspect") {
      return handleInspect(request, url);
    }

    if (path === "/api/file") {
      return handleProxyFile(request, url);
    }

    return new Response("Not found", { status: 404 });
  }
};

function badRequest(msg) {
  return new Response(
    JSON.stringify({ ok: false, error: msg }),
    {
      status: 400,
      headers: { "Content-Type": "application/json" }
    }
  );
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

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
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
    return new Response(
      JSON.stringify({ ok: false, error: "요청 실패" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
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

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

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
    return new Response("fetch failed", { status: 502 });
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
