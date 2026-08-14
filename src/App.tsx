import { type FormEvent, useEffect, useMemo, useState } from "react";
import OfferRecommendations from "./OfferRecommendations";

type CatalogItem = { id: string; label: string; aliases: string[]; confidence: number; status: string };
type Catalog = { cpus: CatalogItem[]; gpus: CatalogItem[]; useCases: Array<{ id: string; name: string }> };
type Workflow = "purchase" | "replacement" | "sale";
type Mode = "url" | "manual";
type StockState = "in_stock" | "low_stock" | "out_of_stock" | "sold" | "unavailable" | "unknown";
type EvaluationResult = {
  scores: { hardware: number; fit: number; value: number; condition: number; longevity: number; risk: number; confidence: number; overall: number };
  decision: string;
  warnings: string[];
  reasonDetails: Array<{ code: string; kind: string; message: string }>;
  engineVersion: string;
  knowledgeVersion: string;
};
type ReplacementResult = { decision: "keep" | "upgrade" | "repair_or_inspect" | "replace" | "insufficient_data"; urgency: number; reasons: string[] };
type SaleAssessment = { decision: "sellable" | "compare_quotes" | "repair_then_sell" | "recycle_or_parts" | "insufficient_data"; market?: { fairPriceJpy: number; lowPriceJpy?: number; highPriceJpy?: number; confidence: number }; reasons: string[] };
type InspectResponse = { extraction: { sourceUrl: string; merchant: string | null; parserName: string; parserVersion: string; stockState: StockState; title: string | null; priceJpy: number | null; cpuRaw: string | null; gpuRaw: string | null; ramGb: number | null; storageGb: number | null; confidence: Record<string, number> }; error?: string };
type EvaluateResponse = { result: EvaluationResult; error?: string };
type ReplacementResponse = { evaluation: EvaluationResult; replacement: ReplacementResult; error?: string };
type SaleResponse = { sale: SaleAssessment; error?: string };
type ErrorResponse = { error?: string };

type FormState = {
  category: string;
  useCase: string;
  cpu: string;
  gpu: string;
  cpuConfidence: number;
  gpuConfidence: number;
  gpuTgp: string;
  vram: string;
  ram: string;
  storage: string;
  refreshHz: string;
  price: string;
  fairPrice: string;
  condition: "new" | "used" | "refurbished" | "unknown";
  grade: "S" | "A" | "B" | "C" | "D" | "unknown";
  batteryHealth: string;
  warrantyDays: string;
  weightKg: string;
  gamingResolution: "1080p" | "1440p" | "4k";
  targetFps: "60" | "120" | "144" | "240";
};

const initialForm: FormState = {
  category: "general_laptop",
  useCase: "office",
  cpu: "",
  gpu: "",
  cpuConfidence: 0,
  gpuConfidence: 0,
  gpuTgp: "",
  vram: "",
  ram: "",
  storage: "",
  refreshHz: "",
  price: "",
  fairPrice: "",
  condition: "unknown",
  grade: "unknown",
  batteryHealth: "",
  warrantyDays: "",
  weightKg: "",
  gamingResolution: "1080p",
  targetFps: "60",
};

const decisionText: Record<string, [string, string]> = {
  strong_buy: ["かなり有力", "用途・価格・リスクの条件が揃っています。"],
  buy: ["購入候補", "用途に適合し、価格面も許容範囲です。"],
  fair: ["条件付きで妥当", "比較してから決める余地があります。"],
  overpriced: ["価格が高め", "PC自体は使えても現在価格では割高です。"],
  avoid: ["購入非推奨", "用途不足または重大なリスクがあります。"],
  insufficient_data: ["情報不足", "重要項目を確認してから判断すべきです。"],
};
const replacementText: Record<ReplacementResult["decision"], string> = { keep: "そのまま使う", upgrade: "増設を優先", repair_or_inspect: "修理・点検を優先", replace: "買い替え候補", insufficient_data: "情報不足" };
const saleText: Record<SaleAssessment["decision"], string> = { sellable: "売却価値あり", compare_quotes: "査定比較を推奨", repair_then_sell: "修理費と査定を比較", recycle_or_parts: "回収・部品価値も比較", insufficient_data: "相場データ不足" };
const scoreLabels: Array<[keyof EvaluationResult["scores"], string]> = [["fit", "用途適合"], ["value", "価格"], ["hardware", "構成"], ["condition", "状態"], ["longevity", "将来性"], ["confidence", "判定信頼度"]];
const workflowText: Record<Workflow, { label: string; detail: string }> = {
  purchase: { label: "買う", detail: "購入候補の性能・用途・価格を確認" },
  replacement: { label: "買い替える", detail: "今のPCを使い続けるか確認" },
  sale: { label: "売る", detail: "売却・回収の判断材料を確認" },
};

function numberOrNull(value: string): number | null {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}

async function responseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function track(event: string, dimensions: Record<string, string | number | boolean | null> = {}) {
  const body = JSON.stringify({ event, dimensions });
  if (navigator.sendBeacon) navigator.sendBeacon("/api/v1/events", new Blob([body], { type: "application/json" }));
  else void fetch("/api/v1/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}

function gpuVariant(category: string, gpu: string): "desktop" | "laptop" | "integrated" {
  const normalized = gpu.toLowerCase();
  const integrated = normalized.includes("uhd") || normalized.includes("iris") || normalized.includes("integrated");
  if (integrated) return "integrated";
  if (category.includes("laptop")) return "laptop";
  return "desktop";
}

function stockMessage(stockState: StockState): string {
  if (stockState === "sold") return "売却済み表示を検出しました。購入候補として扱う前に販売状態を確認してください。";
  if (stockState === "out_of_stock") return "在庫切れ表示を検出しました。現在購入できるか確認してください。";
  if (stockState === "unavailable") return "販売終了・取扱終了の可能性があります。販売状態を確認してください。";
  if (stockState === "low_stock") return "在庫僅少表示を検出しました。";
  return "";
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [workflow, setWorkflow] = useState<Workflow>("purchase");
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [replacement, setReplacement] = useState<ReplacementResult | null>(null);
  const [sale, setSale] = useState<SaleAssessment | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/v1/catalog");
        if (!response.ok) throw new Error("CATALOG_LOAD_FAILED");
        setCatalog(await responseJson<Catalog>(response));
      } catch {
        setNotice("候補データを読み込めませんでした。手入力は利用できます。");
      }
    })();
  }, []);

  const isGaming = form.category.includes("gaming") || form.useCase === "gaming";
  const positives = useMemo(() => result?.reasonDetails.filter((x) => x.kind === "positive").slice(0, 4) ?? [], [result]);
  const concerns = useMemo(() => result?.reasonDetails.filter((x) => x.kind === "warning" || x.kind === "critical").slice(0, 5) ?? [], [result]);
  const hasOutput = Boolean(result || sale);
  const showOffers = workflow === "purchase" && Boolean(result) && !replacement;

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function resetOutput() {
    setResult(null);
    setReplacement(null);
    setSale(null);
    setNotice("");
  }

  function chooseWorkflow(next: Workflow) {
    setWorkflow(next);
    resetOutput();
    if (next !== "purchase") setMode("manual");
  }

  async function inspectUrl() {
    setBusy(true);
    resetOutput();
    track("url_inspect_start");
    try {
      const response = await fetch("/api/v1/url/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await responseJson<InspectResponse & ErrorResponse>(response);
      if (!response.ok) throw new Error(data.error ?? "URL_INSPECTION_FAILED");
      const extraction = data.extraction;
      setForm((previous) => ({
        ...previous,
        cpu: extraction.cpuRaw ?? "",
        gpu: extraction.gpuRaw ?? "",
        cpuConfidence: extraction.cpuRaw ? (extraction.confidence.cpu ?? 0) : 0,
        gpuConfidence: extraction.gpuRaw ? (extraction.confidence.gpu ?? 0) : 0,
        ram: extraction.ramGb != null ? String(extraction.ramGb) : "",
        storage: extraction.storageGb != null ? String(extraction.storageGb) : "",
        price: extraction.priceJpy != null ? String(extraction.priceJpy) : "",
        fairPrice: "",
        condition: "unknown",
        grade: "unknown",
        batteryHealth: "",
        warrantyDays: "",
        weightKg: "",
      }));
      setMode("manual");
      track("url_inspect_success", {
        merchant: extraction.merchant ?? "unknown",
        parser: extraction.parserName,
        stock: extraction.stockState,
        has_cpu: Boolean(extraction.cpuRaw),
        has_gpu: Boolean(extraction.gpuRaw),
        has_price: Boolean(extraction.priceJpy),
      });
      const merchant = extraction.merchant ? `（${extraction.merchant}）` : "";
      const title = extraction.title ? `：${extraction.title}` : "";
      const stock = stockMessage(extraction.stockState);
      setNotice(`商品情報を読み取りました${merchant}${title}。不足項目を確認してください。${stock ? ` ${stock}` : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "URL_INSPECTION_FAILED";
      track("url_inspect_failure", { reason: message });
      setNotice(message === "DOMAIN_NOT_SUPPORTED" ? "この販売サイトはまだ自動解析対象外です。スペック入力は利用できます。" : message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    resetOutput();
    track(`${workflow}_start`, { category: form.category, use_case: form.useCase });
    try {
      const storage = numberOrNull(form.storage);
      const pc = {
        category: form.category,
        cpu: form.cpu ? { raw: form.cpu, confidence: form.cpuConfidence } : null,
        gpu: form.gpu ? { raw: form.gpu, variant: gpuVariant(form.category, form.gpu), tgpW: numberOrNull(form.gpuTgp), vramGb: numberOrNull(form.vram), confidence: form.gpuConfidence } : null,
        memory: { sizeGb: numberOrNull(form.ram), upgradeable: null },
        storage: storage ? [{ kind: "unknown", sizeGb: storage }] : [],
        display: { refreshHz: numberOrNull(form.refreshHz) },
        mobility: { weightKg: numberOrNull(form.weightKg) },
        condition: { type: form.condition, grade: form.grade, batteryHealthPct: numberOrNull(form.batteryHealth), defects: [] },
        commerce: { priceJpy: numberOrNull(form.price), warrantyDays: numberOrNull(form.warrantyDays), sourceUrl: url || null },
        confidence: {},
        extra: { coolingScore: null, upgradeabilityScore: null },
      };
      const fair = numberOrNull(form.fairPrice);
      const market = fair && fair > 0 ? { fairPriceJpy: fair, source: "user_estimate" as const, sampleCount: 1, confidence: 40, ageDays: 0 } : null;
      const gaming = form.useCase === "gaming" ? { resolution: form.gamingResolution, targetFps: Number(form.targetFps) } : undefined;
      const endpoint = workflow === "purchase" ? "/api/v1/evaluate" : workflow === "replacement" ? "/api/v1/replace" : "/api/v1/sell";
      const payload = workflow === "sale" ? { pc, market } : { pc, useCase: form.useCase, market, gaming };
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

      if (workflow === "purchase") {
        const data = await responseJson<EvaluateResponse & ErrorResponse>(response);
        if (!response.ok) throw new Error(data.error ?? "EVALUATION_FAILED");
        setResult(data.result);
        track("evaluation_complete", { decision: data.result.decision, overall: Math.round(data.result.scores.overall), confidence: Math.round(data.result.scores.confidence) });
      } else if (workflow === "replacement") {
        const data = await responseJson<ReplacementResponse & ErrorResponse>(response);
        if (!response.ok) throw new Error(data.error ?? "REPLACEMENT_FAILED");
        setResult(data.evaluation);
        setReplacement(data.replacement);
        track("replacement_complete", { decision: data.replacement.decision, urgency: data.replacement.urgency });
      } else {
        const data = await responseJson<SaleResponse & ErrorResponse>(response);
        if (!response.ok) throw new Error(data.error ?? "SALE_ASSESSMENT_FAILED");
        setSale(data.sale);
        track("sale_assessment_complete", { decision: data.sale.decision });
      }
      requestAnimationFrame(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "REQUEST_FAILED";
      setNotice(message);
      track(`${workflow}_failure`, { reason: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="PC ASSIST トップ">
          <strong>PC ASSIST</strong>
          <span>正二郎商事株式会社</span>
        </a>
        <nav aria-label="主要ナビゲーション">
          <a href="#judge">診断</a>
          <a href="#principle">判定基準</a>
          <a href="https://www.szpc.jp/" target="_blank" rel="noreferrer">運営会社</a>
        </nav>
      </header>

      <main id="top">
        <section className="intro" aria-labelledby="page-title">
          <h1 id="page-title">PCの購入・買い替え・売却を判定</h1>
          <p>商品URL、または分かる範囲のスペックを入力すると、用途適合・価格・状態・将来性を別々に評価します。判断材料が足りない場合は「情報不足」と表示します。</p>
          <dl className="intro-facts">
            <div><dt>対象</dt><dd>一般PC・中古PC・ゲーミングPC・BTO・自作PC</dd></div>
            <div><dt>入力</dt><dd>商品URLまたはスペック</dd></div>
            <div><dt>結果</dt><dd>購入判定・買い替え必要度・売却判断</dd></div>
          </dl>
        </section>

        <section id="judge" className="judge-section" aria-labelledby="judge-heading">
          <SectionHeading id="judge-heading" title="診断" text="最初に、何を判断したいか選んでください。分からない項目は空欄のままで構いません。" />

          <div className="workflow-switch" aria-label="診断の種類">
            {(["purchase", "replacement", "sale"] as Workflow[]).map((item) => (
              <button key={item} className={workflow === item ? "active" : ""} onClick={() => chooseWorkflow(item)} aria-pressed={workflow === item}>
                <strong>{workflowText[item].label}</strong>
                <small>{workflowText[item].detail}</small>
              </button>
            ))}
          </div>

          <div className="mode-switch" aria-label="入力方法">
            <button className={mode === "url" ? "active" : ""} disabled={workflow !== "purchase"} onClick={() => setMode("url")}>商品URL</button>
            <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>スペックから</button>
          </div>

          {mode === "url" && workflow === "purchase" && <div className="url-panel">
            <div className="input-heading"><label htmlFor="product-url">商品ページURL</label><span>Amazon・楽天・Yahoo!ショッピング・メルカリ・主要メーカー/BTO</span></div>
            <div className="url-row"><input id="product-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." /><button className="primary" disabled={busy || !url.trim()} onClick={inspectUrl}>{busy ? "読み取り中…" : "商品情報を読み取る"}</button></div>
            <p className="support-note">取得できなかった項目は空欄のまま残し、読み取り後に確認できます。</p>
          </div>}

          {notice && <p className="notice" role="status">{notice}</p>}

          {mode === "manual" && <form className="spec-form" onSubmit={submit}>
            <div className="form-grid">
              <label>PCの種類<select value={form.category} onChange={(event) => patch("category", event.target.value)}><option value="general_laptop">一般ノート</option><option value="mobile_laptop">モバイルノート</option><option value="gaming_laptop">ゲーミングノート</option><option value="general_desktop">一般デスクトップ</option><option value="gaming_desktop">ゲーミングデスクトップ</option><option value="bto_desktop">BTOデスクトップ</option><option value="custom_desktop">自作PC</option><option value="mini_pc">ミニPC</option><option value="workstation">ワークステーション</option></select></label>
              <label>主な用途<select value={form.useCase} onChange={(event) => patch("useCase", event.target.value)}>{(catalog?.useCases ?? [{ id: "office", name: "事務・Web" }, { id: "student", name: "大学・学校" }, { id: "programming", name: "プログラミング" }, { id: "gaming", name: "PCゲーム" }, { id: "video_editing", name: "動画編集" }, { id: "creative", name: "写真・デザイン" }, { id: "cad_3d", name: "CAD・3D" }, { id: "local_ai", name: "ローカル生成AI" }]).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>CPU<input list="cpu-list" value={form.cpu} onChange={(event) => setForm((previous) => ({ ...previous, cpu: event.target.value, cpuConfidence: event.target.value ? 95 : 0 }))} placeholder="Core i5-1235U" /></label>
              <label>GPU<input list="gpu-list" value={form.gpu} onChange={(event) => setForm((previous) => ({ ...previous, gpu: event.target.value, gpuConfidence: event.target.value ? 95 : 0 }))} placeholder="RTX 4060 Laptop" /></label>
              <datalist id="cpu-list">{catalog?.cpus.map((item) => <option key={item.id} value={item.label} />)}</datalist>
              <datalist id="gpu-list">{catalog?.gpus.map((item) => <option key={item.id} value={item.label} />)}</datalist>
              <NumberField label="メモリ" value={form.ram} unit="GB" min="1" onChange={(value) => patch("ram", value)} />
              <NumberField label="ストレージ" value={form.storage} unit="GB" min="1" onChange={(value) => patch("storage", value)} />
              {workflow === "purchase" && <NumberField label="販売価格" value={form.price} unit="円" min="0" onChange={(value) => patch("price", value)} />}
              {workflow !== "replacement" && <NumberField label="比較相場（分かる場合）" value={form.fairPrice} unit="円" min="0" onChange={(value) => patch("fairPrice", value)} />}
            </div>
            <button type="button" className="advanced-toggle" onClick={() => setAdvanced((value) => !value)}>{advanced ? "保証・状態などを閉じる" : "保証・状態なども入力する"}</button>
            {advanced && <div className="form-grid advanced-fields">
              <label>状態<select value={form.condition} onChange={(event) => patch("condition", event.target.value as FormState["condition"])}><option value="unknown">不明</option><option value="new">新品</option><option value="refurbished">整備済み</option><option value="used">中古</option></select></label>
              <label>外観ランク<select value={form.grade} onChange={(event) => patch("grade", event.target.value as FormState["grade"])}><option value="unknown">不明</option><option>S</option><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
              <NumberField label="保証" value={form.warrantyDays} unit="日" min="0" onChange={(value) => patch("warrantyDays", value)} />
              <NumberField label="バッテリー健康度" value={form.batteryHealth} unit="%" min="0" max="100" onChange={(value) => patch("batteryHealth", value)} />
              <NumberField label="重量" value={form.weightKg} unit="kg" min="0.1" step="0.01" onChange={(value) => patch("weightKg", value)} />
              <NumberField label="画面Hz" value={form.refreshHz} unit="Hz" min="1" onChange={(value) => patch("refreshHz", value)} />
              {form.useCase === "gaming" && <><label>ゲーム解像度<select value={form.gamingResolution} onChange={(event) => patch("gamingResolution", event.target.value as FormState["gamingResolution"])}><option>1080p</option><option>1440p</option><option value="4k">4K</option></select></label><label>目標FPS<select value={form.targetFps} onChange={(event) => patch("targetFps", event.target.value as FormState["targetFps"])}><option>60</option><option>120</option><option>144</option><option>240</option></select></label></>}
              {isGaming && <><NumberField label="GPU TGP" value={form.gpuTgp} unit="W" min="1" max="1000" onChange={(value) => patch("gpuTgp", value)} /><NumberField label="VRAM" value={form.vram} unit="GB" min="0" onChange={(value) => patch("vram", value)} /></>}
            </div>}
            <div className="submit-row"><button className="primary large" disabled={busy}>{busy ? "判定中…" : workflow === "purchase" ? "このPCを判定する" : workflow === "replacement" ? "買い替え必要性を判定する" : "売却価値を確認する"}</button><p>{workflow === "purchase" ? "相場の根拠が弱い場合は、購入推奨を断定しません。" : workflow === "replacement" ? "購入時の価格ではなく、現在の用途適合・状態・将来性を見ます。" : "観測相場が不足している場合は、買取額を推測で表示しません。"}</p></div>
          </form>}
        </section>

        {result && !replacement && <PurchaseResult result={result} positives={positives} concerns={concerns} />}
        {replacement && result && <ReplacementView result={result} replacement={replacement} />}
        {sale && <SaleView sale={sale} />}
        {showOffers && result && <OfferRecommendations category={form.category} useCase={form.useCase} initialMaxPriceJpy={numberOrNull(form.price)} gaming={form.useCase === "gaming" ? { resolution: form.gamingResolution, targetFps: Number(form.targetFps) as 60 | 120 | 144 | 240 } : undefined} />}

        {hasOutput && <NextActions workflow={workflow} />}

        <section id="principle" className="principle" aria-labelledby="principle-heading">
          <SectionHeading id="principle-heading" title="判定基準" text="総合点だけで結論を決めず、用途不足や重大なリスクを先に確認します。" />
          <dl className="principle-list">
            <div><dt>用途</dt><dd>必要性能を満たさないPCは、価格が安くても推奨しません。</dd></div>
            <div><dt>リスク</dt><dd>電源不足や状態不明などの重大要因は、他項目の高得点で打ち消しません。</dd></div>
            <div><dt>価格</dt><dd>使えるPCでも価格が高い場合は、性能評価とは分けて「割高」と表示します。</dd></div>
            <div><dt>根拠</dt><dd>CPU・GPU・相場などの重要情報が不足する場合は「情報不足」と表示します。</dd></div>
          </dl>
        </section>

        <section className="operator" aria-labelledby="operator-heading">
          <h2 id="operator-heading">運営</h2>
          <p><strong>正二郎商事株式会社</strong>（大分県別府市）が運営しています。</p>
          <p className="operator-links"><a href="https://www.szpc.jp/" target="_blank" rel="noreferrer">会社サイト</a><a href="https://www.szpc.jp/products/" target="_blank" rel="noreferrer">中古PC販売</a><a href="https://www.szpc.jp/pc-recycle/" target="_blank" rel="noreferrer">PC回収・引取</a></p>
        </section>
      </main>

      <footer>
        <strong>PC ASSIST</strong>
        <span>正二郎商事株式会社</span>
        <p>一部の商品リンクから紹介料を受け取る場合があります。紹介料の有無は評価・順位に使用しません。</p>
      </footer>
    </div>
  );
}

function SectionHeading({ id, title, text }: { id?: string; title: string; text: string }) {
  return <div className="section-heading"><h2 id={id}>{title}</h2><p>{text}</p></div>;
}

function NumberField({ label, value, unit, min, max, step, onChange }: { label: string; value: string; unit: string; min?: string; max?: string; step?: string; onChange: (value: string) => void }) {
  return <label>{label}<input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} /><span className="unit">{unit}</span></label>;
}

function PurchaseResult({ result, positives, concerns }: { result: EvaluationResult; positives: EvaluationResult["reasonDetails"]; concerns: EvaluationResult["reasonDetails"] }) {
  return <section id="result" className="result"><SectionHeading title="購入判定" text="紹介料や自社取扱の有無は判定点に影響しません。" /><div className="verdict"><div className="overall"><strong>{Math.round(result.scores.overall)}</strong><span>/100</span></div><div><p className="decision-label">{decisionText[result.decision]?.[0] ?? result.decision}</p><p>{decisionText[result.decision]?.[1]}</p></div></div><ScoreTable result={result} /><div className="result-columns"><div><h3>評価できる点</h3><ul>{positives.map((item) => <li key={item.code}>{item.message}</li>)}</ul></div><div><h3>確認したい点</h3><ul>{concerns.map((item) => <li key={item.code}>{item.message}</li>)}{result.warnings.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul></div></div><p className="engine-note">Engine {result.engineVersion} / Knowledge {result.knowledgeVersion} / 判定信頼度 {Math.round(result.scores.confidence)}%</p></section>;
}

function ReplacementView({ result, replacement }: { result: EvaluationResult; replacement: ReplacementResult }) {
  return <section id="result" className="result"><SectionHeading title="買い替え判定" text="現在のPCを今の用途で使い続けられるかを評価します。" /><div className="verdict"><div className="overall"><strong>{replacement.urgency}</strong><span>/100</span></div><div><p className="decision-label">{replacementText[replacement.decision]}</p><p>買い替え必要度</p></div></div><div className="result-columns"><div><h3>判断理由</h3><ul>{replacement.reasons.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>現在のPC</h3><p>用途適合 {Math.round(result.scores.fit)} / 将来性 {Math.round(result.scores.longevity)} / リスク {Math.round(result.scores.risk)} / 信頼度 {Math.round(result.scores.confidence)}</p></div></div></section>;
}

function SaleView({ sale }: { sale: SaleAssessment }) {
  return <section id="result" className="result"><SectionHeading title="売却判定" text="登録済みの相場データだけを使い、買取額を推測で生成しません。" /><div className="verdict"><div><p className="decision-label">{saleText[sale.decision]}</p><p>{sale.reasons[0]}</p></div></div>{sale.market && <div className="market-summary"><strong>参考市場価格 {sale.market.fairPriceJpy.toLocaleString()}円</strong>{sale.market.lowPriceJpy != null && sale.market.highPriceJpy != null && <span>観測レンジ {sale.market.lowPriceJpy.toLocaleString()}～{sale.market.highPriceJpy.toLocaleString()}円</span>}<span>相場信頼度 {Math.round(sale.market.confidence)}%</span></div>}</section>;
}

function NextActions({ workflow }: { workflow: Workflow }) {
  const content = workflow === "purchase"
    ? { title: "購入判定のあと", links: [{ label: "販売中の中古PCを見る", href: "https://www.szpc.jp/products/" }, { label: "条件を送ってPC選びを相談する（Google Forms）", href: "https://forms.gle/NXQJ4pWRbFBoowWz9" }] }
    : workflow === "replacement"
      ? { title: "買い替え判定のあと", links: [{ label: "買い替え候補の中古PCを見る", href: "https://www.szpc.jp/products/" }, { label: "現在のPCと希望条件を送る（Google Forms）", href: "https://forms.gle/NXQJ4pWRbFBoowWz9" }] }
      : { title: "売却判定のあと", links: [{ label: "PC回収・引取の条件を見る", href: "https://www.szpc.jp/pc-recycle/" }, { label: "型番・台数・状態を送って相談する（Google Forms）", href: "https://forms.gle/NXQJ4pWRbFBoowWz9" }] };

  return <section className="next-actions" aria-labelledby="next-actions-heading"><h2 id="next-actions-heading">{content.title}</h2><ul>{content.links.map((link) => <li key={link.label}><a href={link.href} target="_blank" rel="noreferrer" onClick={() => track("next_action_click", { workflow, target: link.href.includes("forms.gle") ? "contact" : "service" })}>{link.label}</a></li>)}</ul></section>;
}

function ScoreTable({ result }: { result: EvaluationResult }) {
  return <div className="score-table">{scoreLabels.map(([key, label]) => <div className="score-row" key={key}><span>{label}</span><div className="meter"><i style={{ width: `${Math.round(result.scores[key])}%` }} /></div><strong>{Math.round(result.scores[key])}</strong></div>)}<div className="score-row risk"><span>リスク</span><div className="meter"><i style={{ width: `${Math.round(result.scores.risk)}%` }} /></div><strong>{Math.round(result.scores.risk)}</strong></div></div>;
}
