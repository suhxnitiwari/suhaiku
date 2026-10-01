// Standalone-site shim: gives the page the same `claude.use("sample" | "downloads")`
// interface it has inside a Claude artifact, backed by this site's /api/claude function.
(() => {
  if (window.claude) return; // inside a Claude viewer, use the real thing

  const err = (code, message = code, text) => Object.assign(new Error(message), { code, text });
  const toBase64 = (blob) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1]);
      r.onerror = () => rej(err("image_rejected"));
      r.readAsDataURL(blob);
    });

  async function sample(input, opts = {}) {
    const prompt = typeof input === "string" ? input : input.map((t) => t.content).join("\n\n");
    const body = { prompt };
    const img = opts.images && (opts.images[0] || null);
    if (img) body.image = { mediaType: img.type || "image/jpeg", data: await toBase64(img) };

    let res;
    try {
      res = await fetch("/api/claude", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (e) {
      throw e?.name === "AbortError" ? err("cancelled") : err("upstream_error");
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw err(j.code || (res.status === 429 ? "rate_limited" : "upstream_error"));
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let text = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const delta = dec.decode(value, { stream: true });
        text += delta;
        const ctrl = text.indexOf("\u0000");
        if (ctrl >= 0) {
          const tail = text.slice(ctrl + 1);
          const kept = text.slice(0, ctrl);
          throw tail.startsWith("REFUSED") ? err("refused", "refused", kept) : err(tail.replace("ERROR:", "") || "upstream_error", "error", kept);
        }
        opts.onText?.({ text, delta });
      }
    } catch (e) {
      if (e?.name === "AbortError") throw err("cancelled", "cancelled", text);
      throw e;
    }
    if (text.trim() === "OFF_TOPIC") throw err("refused");
    if (!text.trim()) throw err("empty_completion");
    return { text, truncated: false };
  }

  sample.json = async (input, opts) => {
    const { text } = await sample(input, opts);
    const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    try {
      return JSON.parse(m ? m[0] : text);
    } catch {
      throw err("invalid_json", "invalid_json", text);
    }
  };
  sample.limits = async () => ({
    maxPromptBytes: 6000,
    images: { maxCount: 1, maxInputBytes: 20_000_000, mediaTypes: ["image/jpeg", "image/png", "image/webp"] },
  });

  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return { status: "saved" };
    },
  };

  window.claude = { use: async (name) => (name === "sample" ? sample : name === "downloads" ? downloads : null) };
})();
