import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chromePath = process.env.CHROME;
const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:5173/";
const outputDir = process.env.VISUAL_OUTPUT_DIR ?? "visual-artifacts";
const port = Number(process.env.CHROME_DEBUG_PORT ?? 9222);
if (!chromePath) throw new Error("CHROME environment variable is required");

await mkdir(outputDir, { recursive: true });
const userDataDir = join(tmpdir(), `choosepc-chrome-${process.pid}`);
const chrome = spawn(chromePath, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--hide-scrollbars",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });

let chromeError = "";
chrome.stderr.on("data", (chunk) => { chromeError += String(chunk); });

async function waitForDebugEndpoint() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Chrome DevTools endpoint did not start. ${chromeError.slice(-2000)}`);
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
        return;
      }
      this.events.push(message);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function createPage() {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not create Chrome target: ${response.status}`);
  const target = await response.json();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  return { client, targetId: target.id };
}

async function closeTarget(targetId) {
  await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`);
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Runtime evaluation failed");
  return result.result?.value;
}

async function waitFor(client, expression, message, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(client, `Boolean(${expression})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Timed out waiting for ${message}`);
}

const offerMock = {
  ranked: [
    {
      rank: 1,
      candidateId: "offer-own",
      result: { decision: "buy", scores: { overall: 88, fit: 92, value: 86, confidence: 84, risk: 18 } },
    },
    {
      rank: 2,
      candidateId: "offer-affiliate",
      result: { decision: "fair", scores: { overall: 81, fit: 87, value: 78, confidence: 82, risk: 24 } },
    },
    {
      rank: 3,
      candidateId: "offer-normal",
      result: { decision: "fair", scores: { overall: 76, fit: 82, value: 74, confidence: 79, risk: 29 } },
    },
  ],
  commercialOffers: [
    {
      offerId: "offer-own",
      rank: 1,
      evaluationScore: 88,
      merchant: "正二郎商事",
      title: "Let's note CF-SV8 / Core i5 / 8GB / SSD 256GB",
      priceJpy: 27800,
      merchantType: "own",
      disclosureRequired: true,
      disclosureText: "自社取扱商品です。評価・順位は取扱関係とは独立して計算しています。",
      outboundPath: "/api/v1/outbound/offer-own",
    },
    {
      offerId: "offer-affiliate",
      rank: 2,
      evaluationScore: 81,
      merchant: "Example PC Shop",
      title: "13.3型モバイルノート / Core i5 / 16GB / SSD 512GB",
      priceJpy: 34800,
      merchantType: "affiliate",
      disclosureRequired: true,
      disclosureText: "このリンクから購入された場合、紹介料を受け取ることがあります。",
      outboundPath: "/api/v1/outbound/offer-affiliate",
    },
    {
      offerId: "offer-normal",
      rank: 3,
      evaluationScore: 76,
      merchant: "Neutral Market",
      title: "中古モバイルノート / Core i5 / 8GB / SSD 256GB",
      priceJpy: 25800,
      merchantType: "normal",
      disclosureRequired: false,
      disclosureText: null,
      outboundPath: "/api/v1/outbound/offer-normal",
    },
  ],
  search: { scannedRows: 12, skippedRows: 2, candidateCount: 3 },
};

const mockScript = `(() => {
  const originalFetch = window.fetch.bind(window);
  const mock = ${JSON.stringify(offerMock)};
  window.fetch = async (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, location.href);
    if (url.pathname === '/api/v1/offers/recommend') {
      return new Response(JSON.stringify(mock), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return originalFetch(input, init);
  };
})();`;

async function preparePurchaseFlow(client, mockOffers) {
  if (mockOffers) await client.send("Page.addScriptToEvaluateOnNewDocument", { source: mockScript });
  await client.send("Page.navigate", { url: baseUrl });
  await waitFor(client, "document.readyState === 'complete' || document.readyState === 'interactive'", "page load");
  await waitFor(client, "[...document.querySelectorAll('.mode-switch button')].some(b => b.textContent?.includes('スペックから'))", "manual input button");
  await evaluate(client, `[...document.querySelectorAll('.mode-switch button')].find(b => b.textContent?.includes('スペックから')).click()`);
  await waitFor(client, "document.querySelector('form.spec-form')", "manual PC form");
  await evaluate(client, `[...document.querySelectorAll('button')].find(b => b.textContent?.includes('このPCを判定')).click()`);
  await waitFor(client, "document.querySelector('#result')", "purchase result", 15000);
  await waitFor(client, "[...document.querySelectorAll('button')].some(b => b.textContent?.includes('販売候補を探す'))", "offer search button");
  await evaluate(client, `[...document.querySelectorAll('button')].find(b => b.textContent?.includes('販売候補を探す')).click()`);
  if (mockOffers) {
    await waitFor(client, "document.querySelectorAll('.offer-row').length === 3", "ranked offer rows");
  } else {
    await waitFor(client, "document.querySelector('.offer-section .notice')", "empty offer notice");
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}

async function captureState({ name, width, height, mockOffers }) {
  const { client, targetId } = await createPage();
  try {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 500,
      screenWidth: width,
      screenHeight: height,
    });
    await preparePurchaseFlow(client, mockOffers);
    const clip = await evaluate(client, `(() => {
      const start = document.querySelector('#result');
      const end = document.querySelector('#principle');
      if (!start || !end) return null;
      const top = Math.max(0, window.scrollY + start.getBoundingClientRect().top - 24);
      const bottom = window.scrollY + end.getBoundingClientRect().top + Math.min(end.getBoundingClientRect().height, 280);
      return { x: 0, y: top, width: document.documentElement.clientWidth, height: Math.max(600, bottom - top) };
    })()`);
    if (!clip) throw new Error("Could not calculate screenshot clip");
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { ...clip, scale: 1 },
    });
    await writeFile(join(outputDir, `${name}.png`), Buffer.from(screenshot.data, "base64"));

    const diagnostics = await evaluate(client, `(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      offerRows: document.querySelectorAll('.offer-row').length,
      notice: document.querySelector('.offer-section .notice')?.textContent ?? null,
      disclosureCount: document.querySelectorAll('.offer-disclosure').length,
      labels: [...document.querySelectorAll('.merchant-type')].map(x => x.textContent),
    }))()`);
    if (diagnostics.bodyScrollWidth > diagnostics.viewportWidth + 1) throw new Error(`${name}: horizontal overflow ${JSON.stringify(diagnostics)}`);
    if (mockOffers && diagnostics.offerRows !== 3) throw new Error(`${name}: missing mocked offers ${JSON.stringify(diagnostics)}`);
    if (mockOffers && diagnostics.disclosureCount !== 2) throw new Error(`${name}: disclosure rendering mismatch ${JSON.stringify(diagnostics)}`);
    if (!mockOffers && !String(diagnostics.notice ?? "").includes("販売候補は登録されていません")) throw new Error(`${name}: empty-state notice mismatch ${JSON.stringify(diagnostics)}`);
    console.log(`${name}: ${JSON.stringify(diagnostics)}`);
  } finally {
    client.close();
    await closeTarget(targetId).catch(() => undefined);
  }
}

try {
  await waitForDebugEndpoint();
  await captureState({ name: "purchase-empty-desktop", width: 1440, height: 1200, mockOffers: false });
  await captureState({ name: "purchase-empty-mobile", width: 390, height: 900, mockOffers: false });
  await captureState({ name: "purchase-offers-desktop", width: 1440, height: 1200, mockOffers: true });
  await captureState({ name: "purchase-offers-mobile", width: 390, height: 900, mockOffers: true });
} finally {
  chrome.kill("SIGTERM");
}
