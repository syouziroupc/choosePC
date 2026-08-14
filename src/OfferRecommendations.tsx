import { useEffect, useState } from "react";

type OfferEvaluation = {
  decision: string;
  scores: {
    overall: number;
    fit: number;
    value: number;
    confidence: number;
    risk: number;
  };
};

type RankedOffer = {
  rank: number;
  candidateId: string;
  result: OfferEvaluation;
};

type CommercialOffer = {
  offerId: string;
  rank: number;
  evaluationScore: number;
  merchant: string;
  title: string;
  priceJpy: number;
  merchantType: "own" | "affiliate" | "normal";
  disclosureRequired: boolean;
  disclosureText: string | null;
  outboundPath: string;
};

type OfferResponse = {
  ranked?: RankedOffer[];
  commercialOffers?: CommercialOffer[];
  search?: { scannedRows: number; skippedRows: number; candidateCount: number };
  error?: string;
};

type Props = {
  category: string;
  useCase: string;
  initialMaxPriceJpy: number | null;
  gaming?: { resolution: "1080p" | "1440p" | "4k"; targetFps: 60 | 120 | 144 | 240 };
};

const decisionLabel: Record<string, string> = {
  strong_buy: "条件にかなり合っています",
  buy: "購入候補に残せます",
  fair: "条件を確認して比較",
  overpriced: "価格面は慎重に比較",
  avoid: "この条件では見送り寄り",
  insufficient_data: "判定材料が不足",
};

function merchantLabel(type: CommercialOffer["merchantType"]): string {
  if (type === "own") return "正二郎商事取扱";
  if (type === "affiliate") return "紹介リンク";
  return "外部販売店";
}

function fitLabel(score: number): string {
  if (score >= 85) return "用途：十分";
  if (score >= 65) return "用途：概ね十分";
  if (score >= 45) return "用途：要確認";
  return "用途：不足気味";
}

function valueLabel(score: number): string {
  if (score >= 82) return "価格：良い";
  if (score >= 60) return "価格：妥当";
  if (score >= 45) return "価格：比較推奨";
  return "価格：高め";
}

function evidenceLabel(score: number): string {
  if (score >= 80) return "情報：十分";
  if (score >= 60) return "情報：概ね十分";
  return "情報：要確認";
}

export default function OfferRecommendations({ category, useCase, initialMaxPriceJpy, gaming }: Props) {
  const [maxPrice, setMaxPrice] = useState(initialMaxPriceJpy ? String(Math.round(initialMaxPriceJpy)) : "");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [ranked, setRanked] = useState<RankedOffer[]>([]);
  const [commercial, setCommercial] = useState<CommercialOffer[]>([]);

  useEffect(() => {
    setMaxPrice(initialMaxPriceJpy ? String(Math.round(initialMaxPriceJpy)) : "");
    setLoaded(false);
    setNotice("");
    setRanked([]);
    setCommercial([]);
  }, [category, useCase, initialMaxPriceJpy, gaming?.resolution, gaming?.targetFps]);

  async function search() {
    setBusy(true);
    setNotice("");
    try {
      const parsedMax = Number(maxPrice);
      const payload: Record<string, unknown> = { category, useCase };
      if (maxPrice.trim() && Number.isFinite(parsedMax) && parsedMax > 0) payload.maxPriceJpy = parsedMax;
      if (gaming) payload.gaming = gaming;

      const response = await fetch("/api/v1/offers/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as OfferResponse;
      if (!response.ok) throw new Error(data.error ?? "OFFER_SEARCH_FAILED");
      setRanked(data.ranked ?? []);
      setCommercial(data.commercialOffers ?? []);
      setLoaded(true);
      if (!(data.ranked?.length)) setNotice("この条件で比較できる販売商品は現在登録されていません。上限価格を変えるか、別のPCを診断してください。");
      else if (!(data.commercialOffers?.length)) setNotice("判定対象は見つかりましたが、商品ページへ案内できる販売情報がありません。販売ページを確認できない候補は表示しません。");
    } catch (error) {
      setLoaded(true);
      setRanked([]);
      setCommercial([]);
      setNotice(error instanceof Error ? error.message : "OFFER_SEARCH_FAILED");
    } finally {
      setBusy(false);
    }
  }

  const commercialById = new Map(commercial.map((offer) => [offer.offerId, offer]));
  const visible = ranked.flatMap((item) => {
    const offer = commercialById.get(item.candidateId);
    return offer ? [{ ranked: item, offer }] : [];
  });

  return (
    <section id="offers" className="offer-section" aria-labelledby="offer-heading">
      <div className="section-heading">
        <h2 id="offer-heading">条件に合う販売中のPC</h2>
        <p>登録済みの販売商品を同じ判定基準で比較します。自社取扱や紹介料の有無は評価に使用しません。</p>
      </div>

      <div className="offer-controls">
        <label>
          上限価格
          <span className="offer-price-input"><input type="number" min="1" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="指定なし" /><span>円</span></span>
        </label>
        <button type="button" className="primary" onClick={search} disabled={busy}>{busy ? "販売商品を確認中…" : "販売候補を探す"}</button>
        <p>在庫・価格を確認できない商品は表示しません。</p>
      </div>

      {notice && <p className="notice" role="status">{notice}</p>}

      {loaded && visible.length > 0 && <div className="offer-list" aria-live="polite">
        {visible.map(({ ranked: item, offer }) => <article className="offer-row" key={offer.offerId}>
          <div className="offer-main">
            <div className="offer-title-line"><h3>{offer.title}</h3><span className={`merchant-type ${offer.merchantType}`}>{merchantLabel(offer.merchantType)}</span></div>
            <p className="offer-merchant">販売元：{offer.merchant}</p>
            <div className="offer-metrics">
              <span><strong>{offer.priceJpy.toLocaleString()}</strong>円</span>
              <span className="offer-signal">{fitLabel(item.result.scores.fit)}</span>
              <span className="offer-signal">{valueLabel(item.result.scores.value)}</span>
              <span className="offer-signal">{evidenceLabel(item.result.scores.confidence)}</span>
            </div>
            <p className="offer-decision">{decisionLabel[item.result.decision] ?? item.result.decision}</p>
            {offer.disclosureRequired && <p className="offer-disclosure">{offer.disclosureText || "この商品リンクには商用関係があります。"}</p>}
          </div>
          <div className="offer-action"><a href={offer.outboundPath} rel={offer.merchantType === "normal" ? "noopener" : "sponsored nofollow noopener"}>商品ページを確認</a></div>
        </article>)}
      </div>}
    </section>
  );
}
