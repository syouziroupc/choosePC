import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chromePath = process.env.CHROME;
const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:5173/";
const outputDir = process.env.VISUAL_OUTPUT_DIR ?? "visual-artifacts";
const port = Number(process.env.CHROME_DEBUG_PORT ?? 9223);
if (!chromePath) throw new Error("CHROME environment variable is required");

await mkdir(outputDir, { recursive: true });
const chrome = spawn(chromePath, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${join(tmpdir(), `choosepc-suggest-${process.pid}`)}`,
  "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });
let chromeError = "";
chrome.stderr.on("data", (chunk) => { chromeError += String(chunk); });

async function waitDebug() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Chrome DevTools endpoint did not start. ${chromeError.slice(-1500)}`);
}

class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.nextId = 1; this.pending = new Map(); }
  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result ?? {});
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.socket.close(); }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Runtime evaluation failed");
  return result.result?.value;
}
async function waitFor(client, expression, label, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(client, `Boolean(${expression})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function page() {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not create Chrome target: ${response.status}`);
  const target = await response.json();
  const client = new Cdp(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  return { client, id: target.id };
}

async function capture(name, width, height) {
  const { client, id } = await page();
  try {
    await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500, screenWidth: width, screenHeight: height });
    await client.send("Page.navigate", { url: baseUrl });
    await waitFor(client, "document.readyState === 'complete' || document.readyState === 'interactive'", "page load");
    await waitFor(client, "[...document.querySelectorAll('.mode-switch button')].some(b => b.textContent?.includes('スペックから'))", "manual mode button");
    await evaluate(client, `[...document.querySelectorAll('.mode-switch button')].find(b => b.textContent?.includes('スペックから')).click()`);
    await waitFor(client, "document.querySelector('input[data-catalog-native-list=\"gpu-list\"]')", "enhanced GPU input");
    await evaluate(client, `(() => {
      const input = document.querySelector('input[data-catalog-native-list="gpu-list"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'GTX680');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    })()`);
    await waitFor(client, "document.querySelector('.catalog-suggest-menu:not([hidden])') && [...document.querySelectorAll('.catalog-suggest-option')].some(x => x.textContent?.includes('GeForce GTX 680'))", "GTX 680 suggestion");

    const diagnostics = await evaluate(client, `(() => {
      const input = document.querySelector('input[data-catalog-native-list="gpu-list"]');
      const menu = document.querySelector('.catalog-suggest-menu:not([hidden])');
      return {
        value: input?.value ?? null,
        options: [...document.querySelectorAll('.catalog-suggest-option')].map(x => x.textContent?.trim()),
        bodyScrollWidth: document.body.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        inputRect: input?.getBoundingClientRect().toJSON() ?? null,
        menuRect: menu?.getBoundingClientRect().toJSON() ?? null,
      };
    })()`);
    if (!diagnostics.options.some((x) => String(x).includes("GeForce GTX 680"))) throw new Error(`${name}: GTX 680 suggestion missing ${JSON.stringify(diagnostics)}`);
    if (diagnostics.bodyScrollWidth > diagnostics.viewportWidth + 1) throw new Error(`${name}: horizontal overflow ${JSON.stringify(diagnostics)}`);
    const a = diagnostics.inputRect, b = diagnostics.menuRect;
    if (!a || !b) throw new Error(`${name}: missing suggestion geometry`);
    const x = Math.max(0, Math.min(a.x, b.x) - 18);
    const y = Math.max(0, a.y - 42);
    const right = Math.min(width, Math.max(a.x + a.width, b.x + b.width) + 18);
    const bottom = Math.max(a.y + a.height, b.y + b.height) + 18;
    const shot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y), scale: 1 } });
    await writeFile(join(outputDir, `${name}.png`), Buffer.from(shot.data, "base64"));

    await evaluate(client, `(() => {
      const option = [...document.querySelectorAll('.catalog-suggest-option')].find(x => x.textContent?.includes('GeForce GTX 680'));
      option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    })()`);
    await waitFor(client, "document.querySelector('input[data-catalog-native-list=\"gpu-list\"]')?.value === 'GeForce GTX 680'", "canonical GPU selection");
    console.log(`${name}: ${JSON.stringify({ value: diagnostics.value, options: diagnostics.options.slice(0, 5) })}`);
  } finally {
    client.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${id}`).catch(() => undefined);
  }
}

try {
  await waitDebug();
  await capture("suggest-gtx680-desktop", 1440, 900);
  await capture("suggest-gtx680-mobile", 390, 900);
} finally {
  chrome.kill("SIGTERM");
}
