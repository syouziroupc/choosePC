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
  strong_buy: "かなり有力",
  buy: "購入候補",
  fair: "条件付きで妥当",
  overpriced: "価格が高め",
  avoid: "購入非推奨",
  insufficient_data: "情報不足",
};

function merchantLabel(type: CommercialOffer["merchantType"]): string {
  if (type === "own") return "自社取扱";
  if (type === "affiliate") return "紹介リンク";
  return "通常リンク";
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
      if (!(data.ranked?.length)) setNotice("現在、この条件で比較できる販売候補は登録されていません。手入力したPCの判定結果はそのまま利用できます。");
      else if (!(data.commercialOffers?.length)) setNotice("候補は評価できましたが、表示用の商品情報を取得できませんでした。順位だけで購入先を推測しません。");
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
        <h2 id="offer-heading">販売候補を比較</h2>
        <p>登録済みの商品だけを同じ判定基準で並べます。紹介料や自社取扱の有無は順位計算に使いません。</p>
      </div>

      <div className="offer-controls">
        <label>
          上限価格
          <span className="offer-price-input"><input type="number" min="1" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="指定なし" /><span>円</span></span>
        </label>
        <button type="button" className="primary" onClick={search} disabled={busy}>{busy ? "候補を評価中…" : "販売候補を探す"}</button>
        <p>登録されていない商品を推測で追加することはありません。</p>
      </div>

      {notice && <p className="notice" role="status">{notice}</p>}

      {loaded && visible.length > 0 && <div className="offer-list" aria-live="polite">
        {visible.map(({ ranked: item, offer }) => <article className="offer-row" key={offer.offerId}>
          <div className="offer-rank"><span>順位</span><strong>{item.rank}</strong></div>
          <div className="offer-main">
            <div className="offer-title-line"><h3>{offer.title}</h3><span className={`merchant-type ${offer.merchantType}`}>{merchantLabel(offer.merchantType)}</span></div>
            <p className="offer-merchant">{offer.merchant}</p>
            <div className="offer-metrics"><span><strong>{offer.priceJpy.toLocaleString()}</strong>円</span><span>総合 {Math.round(item.result.scores.overall)}</span><span>用途 {Math.round(item.result.scores.fit)}</span><span>価格 {Math.round(item.result.scores.value)}</span><span>信頼度 {Math.round(item.result.scores.confidence)}%</span></div>
            <p className="offer-decision">{decisionLabel[item.result.decision] ?? item.result.decision}</p>
            {offer.disclosureRequired && <p className="offer-disclosure">{offer.disclosureText || "このリンクには商用関係があります。"}</p>}
          </div>
          <div className="offer-action"><a href={offer.outboundPath} rel={offer.merchantType === "normal" ? "noopener" : "sponsored nofollow noopener"}>商品ページへ</a></div>
        </article>)}
      </div>}
    </section>
  );
}
