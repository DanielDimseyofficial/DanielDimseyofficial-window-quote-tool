import { NextResponse } from "next/server";
import { getJobs } from "@/lib/jobs";

// ─── DETERMINISTIC PRICING TABLES ───────────────────────────────────────────
// Bedrooms + storeys = price. Same inputs = same price every time.

const WINDOW_PRICING = {
  single: {
    "1": { base: 320, time: "2.5–3 hrs" },
    "2": { base: 320, time: "2.5–3 hrs" },
    "3": { base: 365, time: "3.5–4 hrs" },
    "4": { base: 395, time: "3.5–4 hrs" },
    "5": { base: 425, time: "4–4.5 hrs" },
    "6+": { base: 455, time: "4.5–5 hrs" },
    "unit": { base: 320, time: "2.5–3 hrs" },
    "townhouse": { base: 470, time: "2–2.5 hrs" },
  },
  double: {
    "1": { base: 470, time: "2–2.5 hrs" },
    "2": { base: 470, time: "2–2.5 hrs" },
    "3": { base: 510, time: "5–5.5 hrs" },
    "4": { base: 560, time: "5.5–6.5 hrs" },
    "5": { base: 620, time: "6–7 hrs" },
    "6+": { base: 680, time: "7–8 hrs" },
    "townhouse": { base: 470, time: "2–2.5 hrs" },
  }
};

const GUTTER_PRICING = {
  single: {
    "1": { base: 250, time: "1–1.5 hrs" },
    "2": { base: 250, time: "1–1.5 hrs" },
    "3": { base: 355, time: "2–2.5 hrs" },
    "4": { base: 385, time: "2–2.5 hrs" },
    "5": { base: 410, time: "2.5–3 hrs" },
    "6+": { base: 435, time: "3 hrs" },
    "unit": { base: 250, time: "1–1.5 hrs" },
    "townhouse": { base: 445, time: "2.5 hrs" },
  },
  double: {
    "1": { base: 445, time: "2.5 hrs" },
    "2": { base: 445, time: "2.5 hrs" },
    "3": { base: 465, time: "2.5–3 hrs" },
    "4": { base: 500, time: "3–3.5 hrs" },
    "5": { base: 540, time: "3.5–4 hrs" },
    "6+": { base: 580, time: "4–4.5 hrs" },
    "townhouse": { base: 445, time: "2.5 hrs" },
  }
};

const COLONIAL_SURCHARGE = {
  none: 0,
  unknown: 125,
  "6": 125,
  "8": 175,
  "10": 225,
  "10+": 250,
};

const HARD_FLOOR = 220;
const CAC = 80;
const FUEL = 20;
const HOURLY = 35;

// ─── PRICE CALCULATOR ───────────────────────────────────────────────────────

function calcPrices(basePrice, timeStr, colonialSurcharge = 0) {
  const parts = timeStr.replace(" hrs", "").split("–");
  const avgHours = parts.length === 2
    ? (parseFloat(parts[0]) + parseFloat(parts[1])) / 2
    : parseFloat(parts[0]);

  const cost = Math.round(avgHours * HOURLY + CAC + FUEL);
  const colonialBase = basePrice + colonialSurcharge;

  const opening = Math.max(basePrice, Math.round(cost / 0.62 / 5) * 5);
  const fallback = Math.max(Math.round(cost / 0.70 / 5) * 5, HARD_FLOOR);
  const floor = Math.max(Math.ceil(cost * 1.10 / 5) * 5, HARD_FLOOR);

  const col_opening = Math.max(colonialBase, Math.round(cost / 0.62 / 5) * 5 + colonialSurcharge);
  const col_fallback = Math.max(Math.round(cost / 0.70 / 5) * 5 + Math.round(colonialSurcharge * 0.8), HARD_FLOOR);
  const col_floor = Math.max(Math.ceil(cost * 1.10 / 5) * 5 + Math.round(colonialSurcharge * 0.6), HARD_FLOOR);

  const m = (price, c) => Math.round(((price - c) / price) * 100);

  return {
    standard: {
      cost, opening, fallback, floor,
      opening_margin: m(opening, cost),
      fallback_margin: m(fallback, cost),
      floor_margin: m(floor, cost),
    },
    colonial: {
      cost,
      opening: col_opening, fallback: col_fallback, floor: col_floor,
      opening_margin: m(col_opening, cost),
      fallback_margin: m(col_fallback, cost),
      floor_margin: m(col_floor, cost),
    }
  };
}

function buildQuote(facts, bedrooms, storeys, propType) {
  const isDouble = storeys === "Double storey";
  const isUnit = propType === "Unit / apartment";
  const isTownhouse = propType === "Townhouse";

  const key = isUnit ? "unit" : isTownhouse ? "townhouse" : String(bedrooms);
  const tier = isDouble ? "double" : "single";

  const winTier = WINDOW_PRICING[tier][key] || WINDOW_PRICING[tier]["3"];
  const gutTier = GUTTER_PRICING[tier][key] || GUTTER_PRICING[tier]["3"];

  const colonialKey = facts.colonial_panes || (facts.colonial === "none" ? "none" : "unknown");
  const colonialSurcharge = COLONIAL_SURCHARGE[colonialKey] ?? COLONIAL_SURCHARGE["unknown"];

  const glassExtra = facts.extra_glass ? 40 : 0;
  const accessExtra = facts.difficult_access ? 30 : 0;
  const poolExtra = facts.pool_fencing ? 30 : 0;
  const surchargeTotal = glassExtra + accessExtra + poolExtra;

  const winBase = winTier.base + surchargeTotal;
  const gutBase = gutTier.base;

  const winPrices = calcPrices(winBase, winTier.time, colonialSurcharge);
  const gutPrices = calcPrices(gutBase, gutTier.time, 0);

  const comboCostStd = Math.round(winPrices.standard.cost + gutPrices.standard.cost - CAC);
  const comboCostCol = Math.round(winPrices.colonial.cost + gutPrices.colonial.cost - CAC);

  const comboStdOpen = Math.round((winPrices.standard.opening + gutPrices.standard.opening) * 0.90 / 5) * 5;
  const comboStdFall = Math.round((winPrices.standard.fallback + gutPrices.standard.fallback) * 0.90 / 5) * 5;
  const comboStdFloor = Math.max(Math.ceil(comboCostStd * 1.10 / 5) * 5, HARD_FLOOR);

  const comboColOpen = Math.round((winPrices.colonial.opening + gutPrices.colonial.opening) * 0.90 / 5) * 5;
  const comboColFall = Math.round((winPrices.colonial.fallback + gutPrices.colonial.fallback) * 0.90 / 5) * 5;
  const comboColFloor = Math.max(Math.ceil(comboCostCol * 1.10 / 5) * 5, HARD_FLOOR);

  const m = (price, cost) => Math.round(((price - cost) / price) * 100);

  const label = `${bedrooms}BR ${storeys.toLowerCase()}${surchargeTotal ? ` · +$${surchargeTotal} surcharges` : ""}`;

  return {
    windows: {
      standard: { ...winPrices.standard, time: winTier.time, includes: label },
      colonial: { ...winPrices.colonial, time: winTier.time, includes: `${label} · colonial +$${colonialSurcharge}` },
    },
    gutters: {
      ...gutPrices.standard, time: gutTier.time,
      includes: `${bedrooms}BR ${storeys.toLowerCase()} gutters`,
    },
    combo: {
      cost: comboCostStd,
      standard_opening: comboStdOpen, standard_fallback: comboStdFall, standard_floor: comboStdFloor,
      standard_opening_margin: m(comboStdOpen, comboCostStd),
      standard_fallback_margin: m(comboStdFall, comboCostStd),
      standard_floor_margin: m(comboStdFloor, comboCostStd),
      colonial_opening: comboColOpen, colonial_fallback: comboColFall, colonial_floor: comboColFloor,
      colonial_opening_margin: m(comboColOpen, comboCostCol),
      colonial_fallback_margin: m(comboColFall, comboCostCol),
      colonial_floor_margin: m(comboColFloor, comboCostCol),
      saving_standard: (winPrices.standard.opening + gutPrices.standard.opening) - comboStdOpen,
      saving_colonial: (winPrices.colonial.opening + gutPrices.colonial.opening) - comboColOpen,
    }
  };
}

// ─── RESEARCH PROMPT (lean — no roof size) ──────────────────────────────────

const RESEARCH_PROMPT = `You are a property research assistant for a Melbourne window cleaning business.
Your job is to find facts about the property. Do NOT calculate prices.

Search ONLY these sources. Exact address in quotes. Ignore results not for this specific property:
1. site:realestate.com.au "[ADDRESS]" — sale history, listing photos
2. site:domain.com.au "[ADDRESS]" — sale history, property value estimate
3. "[ADDRESS] Melbourne street view" — window type (colonial grid panes?), access difficulty, pool fencing, trees near gutters
4. Google Maps directions from "25 Margot Street Chadstone VIC" to "[ADDRESS]" — driving distance and time

Return ONLY this JSON, nothing else:
{
  "address": "full address string",
  "property": "e.g. 3BR single-storey house",
  "colonial": "confirmed|uncertain|none",
  "colonial_panes": "6|8|10|10+|unknown|none",
  "extra_glass": false,
  "difficult_access": false,
  "pool_fencing": false,
  "distance_km": "14.2 km",
  "drive_time": "22 min",
  "drive_time_mins": 22,
  "distance_flag": "ok|moderate|long|very long",
  "travel_surcharge": 0,
  "sale_history": "Sold Jan 2022 for $1.42M. Previously sold 1997 for $310k.",
  "wealth_signal": "Recent high-value purchase — quote confidently at target.",
  "sources": "realestate.com.au listing found, domain.com.au not listed",
  "observations": ["observation 1", "observation 2"],
  "verify": ["thing to check 1"]
}

Rules:
- colonial_panes: "6", "8", "10", "10+" as strings, "unknown" if uncertain, "none" if no colonial
- extra_glass: true if unusually large/floor-to-ceiling glass in living areas
- difficult_access: true if narrow gates, steep block, tight paths
- pool_fencing: true if glass pool fencing visible
- drive_time_mins: integer only
- travel_surcharge: 0 if under 40min, 25 if 40-60min, 45 if over 60min
- distance_flag: "ok" under 30min, "moderate" 30-40min, "long" 40-60min, "very long" over 60min
- observations: max 4 short dot points
- verify: omit if nothing material
- Return ONLY the JSON. No markdown. No explanation.`;

// ─── ROUTE HANDLER ───────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const { address, bedrooms, storeys, propType, extraNotes } = await request.json();

    if (!address?.trim()) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured." }, { status: 500 });
    }

    const jobs = await getJobs();
    const completed = jobs.filter(j => j.actualHours && j.finalPrice).slice(-10);
    let historyNote = "";
    if (completed.length > 0) {
      historyNote = `\n\nHistorical jobs for reference: ${completed.map(j => `${j.bedrooms}BR ${j.storeys}: actual ${j.actualHours}hrs, charged $${j.finalPrice}`).join("; ")}`;
    }

    const userMessage = `Research this property:

Address: ${address}
Property: ${bedrooms}-bedroom ${storeys} ${propType}
${extraNotes ? `Owner notes: ${extraNotes}` : ""}
${historyNote}

Search all 4 sources. Return only the JSON.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: RESEARCH_PROMPT,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const data = await response.json();
    if (data.error) return NextResponse.json({ error: data.error.message }, { status: 500 });

    const fullText = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");

    let facts = null;
    const m1 = fullText.match(/\{[\s\S]*\}/);
    if (m1) { try { facts = JSON.parse(m1[0]); } catch {} }
    if (!facts) {
      const stripped = fullText.replace(/```json|```/g, "").trim();
      const m2 = stripped.match(/\{[\s\S]*\}/);
      if (m2) { try { facts = JSON.parse(m2[0]); } catch {} }
    }

    // Fallback if parsing fails — still produce a valid quote
    if (!facts) {
      facts = {
        address, property: `${bedrooms}BR ${storeys} ${propType}`,
        colonial: "none", colonial_panes: "none",
        extra_glass: false, difficult_access: false, pool_fencing: false,
        distance_km: "unknown", drive_time: "unknown", drive_time_mins: 0,
        distance_flag: "ok", travel_surcharge: 0,
        sale_history: "Could not retrieve", wealth_signal: "No data found",
        sources: "Research unavailable", observations: [], verify: []
      };
    }

    const pricing = buildQuote(facts, bedrooms, storeys, propType);

    return NextResponse.json({ ...facts, ...pricing });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
