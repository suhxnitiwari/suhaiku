// Suhaiku backend: one Vercel serverless function that streams Claude's reply.
// The browser never sees the API key; it lives in the ANTHROPIC_API_KEY env var on Vercel.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Guards for a public endpoint that spends your API credit.
const MAX_PROMPT_CHARS = 6000;
const MAX_IMAGE_BYTES = 3_000_000; // base64 length of one downscaled JPEG
const RATE_LIMIT = { windowMs: 60_000, max: 12 }; // per IP, per server instance
const hits = new Map();

const SYSTEM = `You are the writing engine of Suhaiku, a small poetry app.
You only write and revise short poems (haiku, senryu, tanka), give brief editorial notes on them, or finish a writer's partial poem.
If a request asks for anything else, reply with exactly: OFF_TOPIC
Follow the output format the request asks for exactly.`;

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT.max;
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function POST(request) {
  const allowed = process.env.ALLOWED_ORIGIN;
  const origin = request.headers.get("origin");
  if (allowed && origin && origin !== allowed) return json(403, { code: "forbidden" });

  const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (rateLimited(ip)) return json(429, { code: "rate_limited" });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "invalid_request" });
  }
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt) return json(400, { code: "invalid_request" });
  if (prompt.length > MAX_PROMPT_CHARS) return json(400, { code: "prompt_too_large" });

  const content = [];
  const image = body.image;
  if (image) {
    const okType = ["image/jpeg", "image/png", "image/webp"].includes(image.mediaType);
    if (!okType || typeof image.data !== "string" || image.data.length > MAX_IMAGE_BYTES) {
      return json(400, { code: "image_rejected" });
    }
    content.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } });
  }
  content.push({ type: "text", text: prompt });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const msgStream = client.beta.messages.stream({
          model: "claude-opus-5-5",
          max_tokens: 4000, // poems are short; this caps cost per request on a public endpoint
          output_config: { effort: "low" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM,
          messages: [{ role: "user", content }],
        });
        for await (const event of msgStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await msgStream.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(encoder.encode("\u0000REFUSED"));
      } catch (err) {
        const code =
          err instanceof Anthropic.RateLimitError ? "rate_limited"
          : err instanceof Anthropic.AuthenticationError ? "server_misconfigured"
          : err instanceof Anthropic.BadRequestError ? "invalid_request"
          : "upstream_error";
        console.error("Claude request failed:", err?.status, err?.message);
        controller.enqueue(encoder.encode(`\u0000ERROR:${code}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
