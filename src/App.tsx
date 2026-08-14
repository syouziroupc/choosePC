import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import OfferRecommendations from "./OfferRecommendations";

type CatalogItem = { id: string; label: string; aliases: string[]; confidence: number; status: string };
type Catalog = { cpus: CatalogItem[]; gpus: CatalogItem[]; useCases: Array<{ id: string; name: string }> };
type Workflow = "purchase" | "replacement" | "sale";
type Mode = "url" | "manual";
type StockState = "in_stock" | "low_stock" | "out_of_stock" | "sold" | "unavailable" | "unknown";
type EvaluationResult = {
  scores: { hardware: number; fit: number; value: number; condition: number; longevity: number; risk: number; confidence: number; overall: number };
  scoreBreakdown?: { components: Array<{ key: string; status: string; score: number; coverage: number; earnedPoints: number; maxPoints: number }> };
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

const fallbackUseCases = [
  { id: "office", name: "事務・Web" },
  { id: "student", name: "大学・学校" },
  { id: "programming", name: "プログラミング" },
  { id: "gaming", name: "PCゲーム" },
  { id: "video_editing", name: "動画編集" },
  { id: "creative", name: "写真・デザイン" },
  { id: "cad_3d", name: "CAD・3D" },
  { id: "local_ai", name: "ローカル生成AI" },
];

const categoryLabels: Record<string, string> = {
  general_laptop: "一般ノート",
  mobile_laptop: "モバイルノート",
  gaming_laptop: "ゲーミングノート",
  general_desktop: "一般デスクトップ",
  gaming_desktop: "ゲーミングデスクトップ",
  bto_desktop: "BTOデスクトップ",
  custom_desktop: "自作PC",
  mini_pc: "ミニPC",
  workstation: "ワークステーション",
};

const workflowCopy: Record<Workflow, { tab: string; title: string; description: string; panelTitle: string; panelText: string }> = {
  purchase: {
    tab: "購入前チェック",
    title: "このパソコン、買って大丈夫？",
    description: "商品URLを貼るか、CPU・GPU・メモリ・ストレージ・販売価格を入力してください。使いたい用途に性能が足りるか、価格が高すぎないかを分けて確認します。",
    panelTitle: "購入候補の情報を入力",
    panelText: "Amazon、楽天、Yahoo!ショッピング、メルカリなどの商品URLから読み取るか、分かるスペックを直接入力できます。",
  },
  replacement: {
    tab: "買い替えチェック",
    title: "今のパソコン、まだ使い続けて大丈夫？",
    description: "現在使っているPCのCPU・GPU・メモリなどを入力してください。今の用途で不足している部分と、買い替えを急ぐ必要があるかを確認します。",
    panelTitle: "現在使っているPCを入力",
    panelText: "型番が分からなくても、CPU・メモリなど分かる項目だけで確認できます。",
  },
  sale: {
    tab: "売却チェック",
    title: "このパソコン、売る前に相場を確認",
    description: "PCのスペック・状態・分かれば比較相場を入力してください。登録済みの相場データがある場合だけ参考価格を表示し、データがない金額は作りません。",
    panelTitle: "売りたいPCの情報を入力",
    panelText: "CPU・メモリ・状態など、分かる範囲を入力してください。中古PCはバッテリーや保証の有無も判断材料になります。",
  },
};

const purchaseDecisionText: Record<string, [string, string]> = {
  strong_buy: ["買ってよい候補です", "用途に必要な性能を満たし、入力された価格でも大きな問題は見つかりませんでした。"],
  buy: ["購入候補に残してよいPCです", "用途には合っています。下の注意点と価格評価を確認してから購入先を決めてください。"],
  fair: ["購入前に条件確認が必要です", "使える構成ですが、価格・状態・一部スペックの確認が必要です。"],
  overpriced: ["この価格では割高です", "PC自体の性能とは別に、入力された販売価格が高めと判定されています。"],
  avoid: ["この用途では見送った方がよいです", "必要性能を満たしていない項目、または大きなリスクがあります。"],
  insufficient_data: ["判定に必要な情報が足りません", "CPU・メモリ・価格など不足している項目を追加すると、判定できる範囲が増えます。"],
};

const replacementText: Record<ReplacementResult["decision"], string> = {
  keep: "そのまま使ってよい",
  upgrade: "まず増設を検討",
  repair_or_inspect: "修理・点検を先に確認",
  replace: "買い替えを検討",
  insufficient_data: "判定材料が足りません",
};

const saleText: Record<SaleAssessment["decision"], string> = {
  sellable: "売却候補です",
  compare_quotes: "複数の査定を比較してください",
  repair_then_sell: "修理費と査定額を比較してください",
  recycle_or_parts: "回収・部品取りも比較してください",
  insufficient_data: "相場を出せるデータが足りません",
};

const scoreLabels: Array<[keyof EvaluationResult["scores"], string]> = [
  ["fit", "用途適合（総合30点）"],
  ["hardware", "基本性能（総合25点）"],
  ["value", "価格妥当性（総合20点）"],
  ["condition", "状態・保証（総合10点）"],
  ["longevity", "将来性（総合15点）"],
  ["confidence", "判定確度（総合点外）"],
];

function numberOrNull(value: string): number | null {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}

function formatPrice(value: string): string {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? `${Math.round(parsed).toLocaleString()}円` : "未入力";
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
  if (stockState === "sold") return "販売ページは売却済み表示です。購入できる商品か確認してください。";
  if (stockState === "out_of_stock") return "販売ページは在庫切れ表示です。";
  if (stockState === "unavailable") return "販売終了・取扱終了の表示を検出しました。";
  if (stockState === "low_stock") return "在庫僅少の表示があります。";
  return "";
}

function decisionTone(decision: string): "good" | "caution" | "bad" | "neutral" {
  if (decision === "strong_buy" || decision === "buy" || decision === "keep" || decision === "sellable") return "good";
  if (decision === "avoid" || decision === "replace" || decision === "recycle_or_parts") return "bad";
  if (decision === "insufficient_data") return "neutral";
  return "caution";
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
        setNotice("CPU・GPU候補の読み込みに失敗しました。型番を直接入力して診断できます。");
      }
    })();
  }, []);

  const useCases = catalog?.useCases ?? fallbackUseCases;
  const isGaming = form.category.includes("gaming") || form.useCase === "gaming";
  const positives = useMemo(() => result?.reasonDetails.filter((x) => x.kind === "positive").slice(0, 5) ?? [], [result]);
  const concerns = useMemo(() => result?.reasonDetails.filter((x) => x.kind === "warning" || x.kind === "critical").slice(0, 6) ?? [], [result]);
  const hasOutput = Boolean(result || sale);
  const showOffers = workflow === "purchase" && Boolean(result) && !replacement;
  const selectedUseCase = useCases.find((item) => item.id === form.useCase)?.name ?? form.useCase;

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
    requestAnimationFrame(() => document.getElementById("judge")?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
      const merchant = extraction.merchant ? `販売元: ${extraction.merchant}` : "販売元は取得できませんでした";
      const title = extraction.title ? ` / ${extraction.title}` : "";
      const stock = stockMessage(extraction.stockState);
      setNotice(`商品情報を読み取りました。${merchant}${title}${stock ? ` / ${stock}` : ""} 下の項目を確認して判定してください。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "URL_INSPECTION_FAILED";
      track("url_inspect_failure", { reason: message });
      setNotice(message === "DOMAIN_NOT_SUPPORTED" ? "この販売サイトは自動読み取りに未対応です。「スペックから」に切り替えてCPU・GPU・価格を入力してください。" : message);
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
        <div className="header-inner">
          <a className="brand" href="#top" aria-label="PC ASSIST トップ">
            <strong>PC ASSIST</strong>
            <span>正二郎商事のPC診断</span>
          </a>
          <nav aria-label="主要ナビゲーション">
            <a href="#judge">診断する</a>
            <a href="#principle">判定項目</a>
            <a href="https://www.szpc.jp/products/" target="_blank" rel="noreferrer">中古PC在庫</a>
            <a href="https://www.szpc.jp/" target="_blank" rel="noreferrer">正二郎商事</a>
          </nav>
        </div>
      </header>

      <div className="service-notice" role="note">
        <div className="service-notice-inner"><strong>ベータ版</strong><span>古い・新しいCPU/GPUは相場データがない場合があります。その場合は価格を推測せず、判定できた項目だけ表示します。</span></div>
      </div>

      <main id="top" className="site-main">
        <section className="page-title-row" aria-labelledby="page-title">
          <div>
            <p className="page-context">{workflowCopy[workflow].tab}</p>
            <h1 id="page-title">{workflowCopy[workflow].title}</h1>
            <p>{workflowCopy[workflow].description}</p>
          </div>
          <div className="operator-stamp">
            <span>運営・開発</span>
            <strong>正二郎商事株式会社</strong>
            <small>大分県別府市</small>
          </div>
        </section>

        <div className="workflow-switch" aria-label="診断の種類">
          {(["purchase", "replacement", "sale"] as Workflow[]).map((item) => (
            <button key={item} className={workflow === item ? "active" : ""} onClick={() => chooseWorkflow(item)} aria-pressed={workflow === item}>
              <span>{workflowCopy[item].tab}</span>
              <small>{item === "purchase" ? "買う前のPCを確認" : item === "replacement" ? "今のPCを確認" : "売るPCを確認"}</small>
            </button>
          ))}
        </div>

        <div className="diagnosis-progress" aria-label="診断の進み具合">
          <div className="active"><span>1</span><strong>PC情報を入力</strong></div>
          <div className={hasOutput ? "active" : ""}><span>2</span><strong>判定結果を確認</strong></div>
          <div className={showOffers ? "active" : ""}><span>3</span><strong>{workflow === "purchase" ? "販売候補を比較" : "次の対応を確認"}</strong></div>
        </div>

        <div className="diagnosis-layout">
          <section id="judge" className="diagnosis-panel" aria-labelledby="judge-heading">
            <div className="panel-heading">
              <h2 id="judge-heading">{workflowCopy[workflow].panelTitle}</h2>
              <p>{workflowCopy[workflow].panelText}</p>
            </div>

            {workflow === "purchase" && <div className="mode-switch" aria-label="入力方法">
              <button className={mode === "url" ? "active" : ""} onClick={() => setMode("url")}>商品URLで確認</button>
              <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>スペックから</button>
            </div>}

            {mode === "url" && workflow === "purchase" && <div className="url-panel">
              <label className="url-label" htmlFor="product-url">商品ページのURL</label>
              <div className="url-row">
                <input id="product-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.example.com/item/..." />
                <button className="primary url-submit" disabled={busy || !url.trim()} onClick={inspectUrl}>{busy ? "読み取り中…" : "商品ページを読み取る"}</button>
              </div>
              <div className="url-support">
                <p><strong>対応例</strong> Amazon / 楽天 / Yahoo!ショッピング / メルカリ / 主要メーカー・BTO</p>
                <p><strong>読み取る項目</strong> 商品名 / CPU / GPU / メモリ / ストレージ / 販売価格 / 在庫表示</p>
              </div>
              <button type="button" className="text-button" onClick={() => setMode("manual")}>URLが読み取れない場合はスペックを直接入力</button>
            </div>}

            {notice && <p className="notice" role="status">{notice}</p>}

            {mode === "manual" && <form className="spec-form" onSubmit={submit}>
              <fieldset className="field-group">
                <legend>基本情報</legend>
                <FieldRow label="PCの種類" help="ノートとデスクトップでは、同じGPU名でも性能条件が変わる場合があります。">
                  <select value={form.category} onChange={(event) => patch("category", event.target.value)}>
                    <option value="general_laptop">一般ノート</option>
                    <option value="mobile_laptop">モバイルノート</option>
                    <option value="gaming_laptop">ゲーミングノート</option>
                    <option value="general_desktop">一般デスクトップ</option>
                    <option value="gaming_desktop">ゲーミングデスクトップ</option>
                    <option value="bto_desktop">BTOデスクトップ</option>
                    <option value="custom_desktop">自作PC</option>
                    <option value="mini_pc">ミニPC</option>
                    <option value="workstation">ワークステーション</option>
                  </select>
                </FieldRow>
                <FieldRow label="主な用途" help="ゲームを選ぶと、解像度・目標FPS・GPU TGPも入力できます。">
                  <select value={form.useCase} onChange={(event) => patch("useCase", event.target.value)}>
                    {useCases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </FieldRow>
              </fieldset>

              <fieldset className="field-group">
                <legend>主要スペック</legend>
                <FieldRow label="CPU" help="例: Core i5-8365U / Ryzen 5 5600X。型番の一部を入力すると候補が出ます。">
                  <input list="cpu-list" value={form.cpu} onChange={(event) => setForm((previous) => ({ ...previous, cpu: event.target.value, cpuConfidence: event.target.value ? 95 : 0 }))} placeholder="Core i5-8365U" />
                </FieldRow>
                <FieldRow label="GPU" help="例: GeForce GTX 680 / RTX 4060 Laptop。内蔵GPUも入力できます。">
                  <input list="gpu-list" value={form.gpu} onChange={(event) => setForm((previous) => ({ ...previous, gpu: event.target.value, gpuConfidence: event.target.value ? 95 : 0 }))} placeholder="GeForce GTX 680" />
                </FieldRow>
                <datalist id="cpu-list">{catalog?.cpus.map((item) => <option key={item.id} value={item.label} />)}</datalist>
                <datalist id="gpu-list">{catalog?.gpus.map((item) => <option key={item.id} value={item.label} />)}</datalist>
                <NumberFieldRow label="メモリ" value={form.ram} unit="GB" min="1" help="例: 8GB / 16GB / 32GB" onChange={(value) => patch("ram", value)} />
                <NumberFieldRow label="ストレージ" value={form.storage} unit="GB" min="1" help="SSD/HDDの種類が不明でも容量だけ入力できます。" onChange={(value) => patch("storage", value)} />
              </fieldset>

              {workflow !== "replacement" && <fieldset className="field-group">
                <legend>{workflow === "purchase" ? "価格" : "相場"}</legend>
                {workflow === "purchase" && <NumberFieldRow label="販売価格" value={form.price} unit="円" min="0" help="商品ページに表示されている税込価格を入力してください。" onChange={(value) => patch("price", value)} />}
                <NumberFieldRow label="比較相場" value={form.fairPrice} unit="円" min="0" help="同じ型番・近い構成の相場が分かる場合だけ入力してください。空欄でも診断できます。" onChange={(value) => patch("fairPrice", value)} />
              </fieldset>}

              <button type="button" className="advanced-toggle" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}>{advanced ? "保証・状態などを閉じる" : "保証・状態・重量なども入力する"}</button>

              {advanced && <fieldset className="field-group advanced-fields">
                <legend>状態・追加情報</legend>
                <FieldRow label="商品の状態" help="中古品は新品より状態差が大きいため、分かる場合は選んでください。">
                  <select value={form.condition} onChange={(event) => patch("condition", event.target.value as FormState["condition"])}>
                    <option value="unknown">不明</option><option value="new">新品</option><option value="refurbished">整備済み</option><option value="used">中古</option>
                  </select>
                </FieldRow>
                <FieldRow label="外観ランク" help="販売店のS/A/B/C/D表記がある場合だけ選択してください。">
                  <select value={form.grade} onChange={(event) => patch("grade", event.target.value as FormState["grade"])}>
                    <option value="unknown">不明</option><option>S</option><option>A</option><option>B</option><option>C</option><option>D</option>
                  </select>
                </FieldRow>
                <NumberFieldRow label="保証期間" value={form.warrantyDays} unit="日" min="0" help="販売店保証の日数。保証なしは0日です。" onChange={(value) => patch("warrantyDays", value)} />
                <NumberFieldRow label="バッテリー健康度" value={form.batteryHealth} unit="%" min="0" max="100" help="中古ノートで販売店が数値を公開している場合に入力してください。" onChange={(value) => patch("batteryHealth", value)} />
                <NumberFieldRow label="重量" value={form.weightKg} unit="kg" min="0.1" step="0.01" help="持ち運び用途のノートPCで使います。" onChange={(value) => patch("weightKg", value)} />
                <NumberFieldRow label="画面リフレッシュレート" value={form.refreshHz} unit="Hz" min="1" help="ゲーミング用途では60Hz / 120Hz / 144Hzなどを確認します。" onChange={(value) => patch("refreshHz", value)} />
                {form.useCase === "gaming" && <>
                  <FieldRow label="ゲーム解像度" help="普段ゲームをする解像度を選んでください。">
                    <select value={form.gamingResolution} onChange={(event) => patch("gamingResolution", event.target.value as FormState["gamingResolution"])}><option>1080p</option><option>1440p</option><option value="4k">4K</option></select>
                  </FieldRow>
                  <FieldRow label="目標FPS" help="60 / 120 / 144 / 240fpsから選択します。">
                    <select value={form.targetFps} onChange={(event) => patch("targetFps", event.target.value as FormState["targetFps"])}><option>60</option><option>120</option><option>144</option><option>240</option></select>
                  </FieldRow>
                </>}
                {isGaming && <>
                  <NumberFieldRow label="GPU TGP" value={form.gpuTgp} unit="W" min="1" max="1000" help="ゲーミングノートは同じGPU名でもTGPで性能差が出るため、分かる場合は入力してください。" onChange={(value) => patch("gpuTgp", value)} />
                  <NumberFieldRow label="VRAM" value={form.vram} unit="GB" min="0" help="グラフィックメモリ容量。例: 4GB / 8GB / 12GB。" onChange={(value) => patch("vram", value)} />
                </>}
              </fieldset>}

              <div className="submit-row">
                <button className="primary large" disabled={busy}>{busy ? "判定中…" : workflow === "purchase" ? "このPCを判定する" : workflow === "replacement" ? "買い替え必要性を判定する" : "売却価値を確認する"}</button>
                <p>{workflow === "purchase" ? "CPU・メモリ・販売価格が空欄だと、性能や価格の判定が一部できません。" : workflow === "replacement" ? "CPUとメモリだけでも確認できます。GPUを使う用途ならGPU型番も入力してください。" : "近い相場データがない場合は、参考価格を表示しません。"}</p>
              </div>
            </form>}
          </section>

          <aside className="diagnosis-sidebar" aria-label="入力内容と運営情報">
            <section className="summary-box">
              <div className="summary-heading"><h2>入力内容</h2><span>{workflowCopy[workflow].tab}</span></div>
              <dl>
                <SummaryRow label="入力方法" value={workflow === "purchase" ? (mode === "url" ? "商品URL" : "スペック入力") : "スペック入力"} />
                <SummaryRow label="PCの種類" value={categoryLabels[form.category] ?? form.category} />
                <SummaryRow label="用途" value={selectedUseCase} />
                <SummaryRow label="CPU" value={form.cpu || "未入力"} />
                <SummaryRow label="GPU" value={form.gpu || "未入力"} />
                <SummaryRow label="メモリ" value={form.ram ? `${form.ram}GB` : "未入力"} />
                <SummaryRow label="ストレージ" value={form.storage ? `${form.storage}GB` : "未入力"} />
                {workflow === "purchase" && <SummaryRow label="販売価格" value={formatPrice(form.price)} />}
                {workflow !== "replacement" && <SummaryRow label="比較相場" value={formatPrice(form.fairPrice)} />}
              </dl>
            </section>

            <section className="support-box">
              <h2>正二郎商事に相談</h2>
              <p>診断に出ない型番、法人で複数台必要な場合、中古PCの購入・回収も相談できます。</p>
              <a href="https://forms.gle/NXQJ4pWRbFBoowWz9" target="_blank" rel="noreferrer">条件をフォームで送る</a>
              <a href="https://www.szpc.jp/" target="_blank" rel="noreferrer">会社情報を見る</a>
              <small>診断結果と自社商品の掲載・紹介料は別に扱います。</small>
            </section>
          </aside>
        </div>

        {result && !replacement && <PurchaseResult result={result} positives={positives} concerns={concerns} form={form} />}
        {replacement && result && <ReplacementView result={result} replacement={replacement} />}
        {sale && <SaleView sale={sale} />}
        {showOffers && result && <OfferRecommendations category={form.category} useCase={form.useCase} initialMaxPriceJpy={numberOrNull(form.price)} gaming={form.useCase === "gaming" ? { resolution: form.gamingResolution, targetFps: Number(form.targetFps) as 60 | 120 | 144 | 240 } : undefined} />}
        {hasOutput && <NextActions workflow={workflow} />}

        <section id="principle" className="principle" aria-labelledby="principle-heading">
          <div className="section-heading">
            <h2 id="principle-heading">判定で見ている項目</h2>
            <p>入力された値と登録済みデータを使います。確認できない数値や相場を補って表示することはありません。</p>
          </div>
          <div className="criteria-table" role="table" aria-label="判定項目">
            <div role="row"><strong role="cell">CPU・GPU</strong><span role="cell">選んだ用途に必要な処理性能に届いているかを確認します。ゲームではGPU、解像度、目標FPSを重く見ます。</span></div>
            <div role="row"><strong role="cell">メモリ・ストレージ</strong><span role="cell">容量不足が用途の支障にならないかを確認します。入力がない項目は判定対象から外れます。</span></div>
            <div role="row"><strong role="cell">販売価格</strong><span role="cell">相場データまたは入力された比較相場がある場合だけ価格を評価します。相場がなければ金額評価を保留します。</span></div>
            <div role="row"><strong role="cell">中古状態</strong><span role="cell">外観、バッテリー、保証など入力された情報を使います。状態不明を新品同等として扱いません。</span></div>
            <div role="row"><strong role="cell">判定信頼度</strong><span role="cell">CPU・GPU・価格など、判定に必要な情報がどこまで揃っているかを示します。</span></div>
          </div>
        </section>
      </main>

      <footer>
        <div className="footer-inner">
          <div><strong>PC ASSIST</strong><span>正二郎商事株式会社 / 大分県別府市</span></div>
          <div className="footer-links"><a href="https://www.szpc.jp/" target="_blank" rel="noreferrer">運営会社</a><a href="https://www.szpc.jp/products/" target="_blank" rel="noreferrer">中古PC販売</a><a href="https://www.szpc.jp/pc-recycle/" target="_blank" rel="noreferrer">PC回収・引取</a></div>
          <p>一部の商品リンクから紹介料を受け取る場合があります。紹介料の有無は評価・順位に使用しません。</p>
        </div>
      </footer>
    </div>
  );
}

function FieldRow({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return <div className="field-row"><div className="field-label">{label}</div><div className="field-control">{children}</div><p className="field-help">{help}</p></div>;
}

function NumberFieldRow({ label, value, unit, min, max, step, help, onChange }: { label: string; value: string; unit: string; min?: string; max?: string; step?: string; help: string; onChange: (value: string) => void }) {
  return <FieldRow label={label} help={help}><span className="number-control"><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} /><span>{unit}</span></span></FieldRow>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd className={value === "未入力" ? "empty" : ""}>{value}</dd></div>;
}

function PurchaseResult({ result, positives, concerns, form }: { result: EvaluationResult; positives: EvaluationResult["reasonDetails"]; concerns: EvaluationResult["reasonDetails"]; form: FormState }) {
  const copy = purchaseDecisionText[result.decision] ?? [result.decision, "判定結果を確認してください。"];
  const missing = [!form.cpu && "CPU", !form.ram && "メモリ", !form.storage && "ストレージ", !form.price && "販売価格", form.useCase === "gaming" && !form.gpu && "GPU"].filter(Boolean) as string[];
  return <section id="result" className="result-section" aria-labelledby="purchase-result-heading">
    <div className={`result-banner ${decisionTone(result.decision)}`}>
      <div><p>購入判定</p><h2 id="purchase-result-heading">{copy[0]}</h2><span>{copy[1]}</span></div>
      <div className="result-score"><strong>{result.scores.overall.toFixed(1)}</strong><span>/100</span><small>総合点</small></div>
    </div>
    {result.decision === "insufficient_data" && missing.length > 0 && <div className="missing-data"><strong>追加すると判定しやすい項目</strong><span>{missing.join(" / ")}</span></div>}
    <ScoreTable result={result} />
    <div className="reason-grid">
      <section className="reason-block positive"><h3>良い点</h3><ul>{positives.length ? positives.map((item) => <li key={item.code}>{item.message}</li>) : <li>明確な加点理由はありません。</li>}</ul></section>
      <section className="reason-block caution"><h3>購入前に確認</h3><ul>{concerns.map((item) => <li key={item.code}>{item.message}</li>)}{result.warnings.slice(0, 5).map((item) => <li key={item}>{item}</li>)}{concerns.length === 0 && result.warnings.length === 0 && <li>大きな注意点は見つかりませんでした。</li>}</ul></section>
    </div>
    <p className="engine-note">判定エンジン {result.engineVersion} / データ {result.knowledgeVersion} / 判定に使えた情報量 {Math.round(result.scores.confidence)}%</p>
  </section>;
}

function ReplacementView({ result, replacement }: { result: EvaluationResult; replacement: ReplacementResult }) {
  const tone = decisionTone(replacement.decision);
  return <section id="result" className="result-section" aria-labelledby="replacement-result-heading">
    <div className={`result-banner ${tone}`}>
      <div><p>買い替え判定</p><h2 id="replacement-result-heading">{replacementText[replacement.decision]}</h2><span>{replacement.reasons[0] ?? "入力内容から買い替え必要度を確認しました。"}</span></div>
      <div className="result-score"><strong>{replacement.urgency}</strong><span>/100</span><small>買い替え必要度</small></div>
    </div>
    <div className="compact-result-table">
      <div><span>用途に足りるか</span><strong>{Math.round(result.scores.fit)}</strong></div>
      <div><span>今後も使えるか</span><strong>{Math.round(result.scores.longevity)}</strong></div>
      <div><span>リスク</span><strong>{Math.round(result.scores.risk)}</strong></div>
      <div><span>判定に使えた情報量</span><strong>{Math.round(result.scores.confidence)}%</strong></div>
    </div>
    <div className="single-reason"><h3>判定理由</h3><ul>{replacement.reasons.map((item) => <li key={item}>{item}</li>)}</ul></div>
  </section>;
}

function SaleView({ sale }: { sale: SaleAssessment }) {
  return <section id="result" className="result-section" aria-labelledby="sale-result-heading">
    <div className={`result-banner ${decisionTone(sale.decision)}`}>
      <div><p>売却判定</p><h2 id="sale-result-heading">{saleText[sale.decision]}</h2><span>{sale.reasons[0] ?? "入力内容から売却・回収の選択肢を確認しました。"}</span></div>
    </div>
    {sale.market ? <div className="market-result">
      <div><span>参考市場価格</span><strong>{sale.market.fairPriceJpy.toLocaleString()}円</strong></div>
      {sale.market.lowPriceJpy != null && sale.market.highPriceJpy != null && <div><span>観測レンジ</span><strong>{sale.market.lowPriceJpy.toLocaleString()}〜{sale.market.highPriceJpy.toLocaleString()}円</strong></div>}
      <div><span>相場データの信頼度</span><strong>{Math.round(sale.market.confidence)}%</strong></div>
    </div> : <div className="missing-data"><strong>参考価格は表示していません</strong><span>近い構成の相場データが不足しています。比較相場が分かる場合は入力して再確認してください。</span></div>}
    {sale.reasons.length > 1 && <div className="single-reason"><h3>確認事項</h3><ul>{sale.reasons.slice(1).map((item) => <li key={item}>{item}</li>)}</ul></div>}
  </section>;
}

function NextActions({ workflow }: { workflow: Workflow }) {
  const content = workflow === "purchase"
    ? { title: "次にできること", text: "判定結果を見て別の中古PCと比較するか、用途と予算を送って相談できます。", primary: "中古PC在庫を見る", primaryHref: "https://www.szpc.jp/products/", secondary: "条件を送って相談", secondaryHref: "https://forms.gle/NXQJ4pWRbFBoowWz9" }
    : workflow === "replacement"
      ? { title: "修理か買い替えを決める", text: "現在のPCの症状や希望予算を送ると、修理・買い替えの相談ができます。", primary: "買い替え候補を見る", primaryHref: "https://www.szpc.jp/products/", secondary: "現在のPCを相談", secondaryHref: "https://forms.gle/NXQJ4pWRbFBoowWz9" }
      : { title: "売却・回収方法を確認", text: "型番、台数、状態を送って売却・引取・回収について相談できます。", primary: "PC回収・引取を見る", primaryHref: "https://www.szpc.jp/pc-recycle/", secondary: "型番と状態を送る", secondaryHref: "https://forms.gle/NXQJ4pWRbFBoowWz9" };
  return <section className="next-actions"><div><h2>{content.title}</h2><p>{content.text}</p></div><div><a className="action-primary" href={content.primaryHref} target="_blank" rel="noreferrer" onClick={() => track("next_action_click", { workflow, target: "service" })}>{content.primary}</a><a href={content.secondaryHref} target="_blank" rel="noreferrer" onClick={() => track("next_action_click", { workflow, target: "contact" })}>{content.secondary}</a></div></section>;
}

function ScoreTable({ result }: { result: EvaluationResult }) {
  return <div className="score-table" role="table" aria-label="判定内訳">
    <div className="score-header" role="row"><span role="columnheader">判定項目</span><span role="columnheader">点数</span><span role="columnheader">目安</span></div>
    {scoreLabels.map(([key, label]) => {
      const value = result.scores[key];
      const componentKey = key === "hardware" ? "performance" : key === "value" ? "price" : key;
      const breakdown = result.scoreBreakdown?.components.find((item) => item.key === componentKey);
      const unavailable = breakdown?.status === "unavailable";
      return <div className="score-row" role="row" key={key}><span role="cell">{label}</span><strong role="cell">{unavailable ? "相場なし" : `${value.toFixed(1)} / 100`}</strong><div role="cell" className="meter"><i style={{ width: `${unavailable ? 0 : Math.round(value)}%` }} /></div></div>;
    })}
    <div className="score-row risk" role="row"><span role="cell">リスク（低いほど良い）</span><strong role="cell">{result.scores.risk.toFixed(1)} / 100</strong><div role="cell" className="meter"><i style={{ width: `${Math.round(result.scores.risk)}%` }} /></div></div>
  </div>;
}
