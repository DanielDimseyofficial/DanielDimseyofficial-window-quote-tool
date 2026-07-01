import { NextResponse } from "next/server";
import { getJobs } from "@/lib/jobs";

// ─── DETERMINISTIC PRICING TABLES ───────────────────────────────────────────
// Same inputs = same price, every single time. Claude never touches these numbers.

const WINDOW_PRICING = {
  single: {
    unit:       { base: 260, time: "1.5–2 hrs" },
    tiny:       { base: 330, time: "2.5–3 hrs" },   // < 100m²
    small:      { base: 350, time: "3–3.5 hrs" },   // 100–140m²
    average:    { base: 365, time: "3.5–4 hrs" },   // 140–180m²
    large:      { base: 380, time: "3.5–4 hrs" },   // 180–220m²
    big:        { base: 395, time: "4–4.5 hrs" },   // 220–270m²
    very_large: { base: 415, time: "4.5–5 hrs" },   // 270m²+
  },
  double: {
    townhouse:  { base: 470, time: "2–2.5 hrs" },
    small:      { base: 510, time: "5–5.5 hrs" },   // < 200m²
    average:    { base: 560, time: "5.5–6.5 hrs" }, // 200–260m²
    large:      { base: 620, time: "6–7 hrs" },     // 260–320m²
    very_large: { base: 680, time: "7–8 hrs" },     // 320m²+
  }
};

const GUTTER_PRICING = {
  single: {
    unit:       { base: 250, time: "1–1.5 hrs" },
    tiny:       { base: 310, time: "1.5 hrs" },
    small:      { base: 335, time: "1.5–2 hrs" },
    average:    { base: 355, time: "2–2.5 hrs" },
    large:      { base: 375, time: "2–2.5 hrs" },
    big:        { base: 400, time: "2.5 hrs" },
    very_large: { base: 420, time: "2.5–3 hrs" },
  },
  double: {
    // Double storey minimum is always $445
    townhouse:  { base: 445, time: "2.5 hrs" },
    small:      { base: 455, time: "2.5–3 hrs" },
    average:    { base: 490, time: "3–3.5 hrs" },
    large:      { base: 530, time: "3.5–4 hrs" },
    very_large: { base: 570, time: "4–4.5 hrs" },
  }
};

const COLONIAL_SURCHARGE = {
  none:    0,
  unknown: 125,  // uncertain — use midpoint
  "6":     125,
  "8":     175,
  "10":    225,
  "10+":   250,
};

const HARD_FLOOR = 220;
const CAC = 80;
const FUEL = 20;
const HOURLY = 35;

// ─── SIZE BRACKET LOGIC ─────────────────────────────────────────────────────

function getSizeBracket(roofM2, storeys, propType) {
  if (propType === "Unit / apartment") return "unit";
  if (storeys === "Double storey") {
    if (propType === "Townhouse") return "townhouse";
    if (roofM2 < 200) return "small";
    if (roofM2 < 260) return "average";
    if (roofM2 < 320) return "large";
    return "very_large";
  }
  // Single storey
  if (roofM2 < 100) return "tiny";
  if (roofM2 < 140) return "small";
  if (roofM2 < 180) return "average";
  if (roofM2 < 220) return "large";
  if (roofM2 < 270) return "big";
  return "very_large";
}

// ─── PRICE CALCULATOR ───────────────────────────────────────────────────────

function calcPrices(basePrice, estimatedHours, colonialSurcharge = 0) {
  const avgHours = (() => {
    const parts = estimatedHours.replace(" hrs", "").split("–");
    if (parts.length === 2) return (parseFloat(parts[0]) + parseFloat(parts[1])) / 2;
    return parseFloat(parts[0]);
  })();

  const colonialBase = basePrice + colonialSurcharge;
  const cost = Math.round(avgHours * HOURLY + CAC + FUEL);
  const colonialCost = Math.round(avgHours * HOURLY + CAC + FUEL); // same time, surcharge is complexity

  const opening = Math.max(basePrice, Math.round(cost / 0.62 / 5) * 5);
  const fallback = Math.max(Math.round(cost / 0.70 / 5) * 5, HARD_FLOOR);
  const floor = Math.max(Math.round(cost * 1.10 / 5) * 5, HARD_FLOOR);

  const col_opening = Math.max(colonialBase, Math.round(colonialCost / 0.62 / 5) * 5 + colonialSurcharge);
  const col_fallback = Math.max(Math.round(colonialCost / 0.70 / 5) * 5 + Math.round(colonialSurcharge * 0.8), HARD_FLOOR);
  const col_floor = Math.max(Math.round(colonialCost * 1.10 / 5) * 5 + Math.round(colonialSurcharge * 0.6), HARD_FLOOR);

  const m = (price, c) => Math.round(((price - c) / price) * 100);

  return {
    standard: {
      cost, opening, fallback, floor,
      opening_margin: m(opening, cost),
      fallback_margin: m(fallback, cost),
      floor_margin: m(floor, cost),
    },
    colonial: {
      cost: colonialCost,
      opening: col_opening, fallback: col_fallback, floor: col_floor,
      opening_margin: m(col_opening, colonialCost),
      fallback_margin: m(col_fallback, colonialCost),
      floor_margin: m(col_floor, colonialCost),
    }
  };
}

function buildQuote(facts, bedrooms, storeys, propType) {
  const roofM2 = facts.roof_m2 || 160; // fallback to average if Claude couldn't determine
  const bracket = getSizeBracket(roofM2, storeys, propType);
  const colonialKey = facts.colonial_panes || (facts.colonial === "none" ? "none" : "unknown");
  const colonialSurcharge = COLONIAL_SURCHARGE[colonialKey] ?? COLONIAL_SURCHARGE["unknown"];

  const winTier = WINDOW_PRICING[storeys === "Double storey" ? "double" : "single"][bracket];
  const gutTier = GUTTER_PRICING[storeys === "Double storey" ? "double" : "single"][bracket];

  // Extra glass surcharge (from Claude's assessment)
  const glassExtra = facts.extra_glass ? 40 : 0;
  const accessExtra = facts.difficult_access ? 30 : 0;
  const poolExtra = facts.pool_fencing ? 30 : 0;
  const surchargeTotal = glassExtra + accessExtra + poolExtra;

  const winBase = winTier.base + surchargeTotal;
  const gutBase = gutTier.base;

  const winPrices = calcPrices(winBase, winTier.time, colonialSurcharge);
  const gutPrices = calcPrices(gutBase, gutTier.time, 0);

  // Combo = 10% off combined, single CAC
  const comboCostStd = Math.round((winPrices.standard.cost + gutPrices.standard.cost - CAC) );
  const comboCostCol = Math.round((winPrices.colonial.cost + gutPrices.colonial.cost - CAC));

  const comboStdOpen = Math.round((winPrices.standard.opening + gutPrices.standard.opening) * 0.90 / 5) * 5;
  const comboStdFall = Math.round((winPrices.standard.fallback + gutPrices.standard.fallback) * 0.90 / 5) * 5;
  const comboStdFloor = Math.max(Math.round(comboCostStd * 1.10 / 5) * 5, HARD_FLOOR);

  const comboColOpen = Math.round((winPrices.colonial.opening + gutPrices.colonial.opening) * 0.90 / 5) * 5;
  const comboColFall = Math.round((winPrices.colonial.fallback + gutPrices.colonial.fallback) * 0.90 / 5) * 5;
  const comboColFloor = Math.max(Math.round(comboCostCol * 1.10 / 5) * 5, HARD_FLOOR);

  const m = (price, cost) => Math.round(((price - cost) / price) * 100);

  return {
    windows: {
      standard: { ...winPrices.standard, time: winTier.time, includes: `${bracket} ${storeys.toLowerCase()} · roof ~${roofM2}m²${surchargeTotal ? ` · +$${surchargeTotal} surcharges` : ""}` },
      colonial: { ...winPrices.colonial, time: winTier.time, includes: `${bracket} ${storeys.toLowerCase()} · colonial surcharge +$${colonialSurcharge}` },
    },
    gutters: {
      ...gutPrices.standard, time: gutTier.time,
      includes: `${bracket} ${storeys.toLowerCase()} roofline`,
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

// ─── SYSTEM PROMPT (research only — no pricing) ──────────────────────────────

const RESEARCH_PROMPT = `You are a property research assistant for a Melbourne window cleaning business.
Your ONLY job is to find facts about the property. Do NOT calculate prices — pricing is handled separately.

Search ONLY these sources. Use exact address in quotes. Ignore any result not for this specific property:
1. site:realestate.com.au "[ADDRESS]" — sale history, photos, listed floor area
2. site:domain.com.au "[ADDRESS]" — sale history, property value estimate
3. "[ADDRESS] Melbourne satellite" — estimate roof footprint in m² by comparing to neighbours
4. "[ADDRESS] Melbourne street view" — window type (colonial?), access difficulty, pool fencing, trees near gutters
5. Google Maps directions from "25 Margot Street Chadstone VIC" to "[ADDRESS]" — driving distance and time

Return ONLY this JSON, nothing else:
{
  "address": "full address string",
  "property": "e.g. 3BR single-storey house",
  "roof_m2": 160,
  "roof_description": "e.g. Estimated 13m x 12m — slightly larger than neighbours",
  "colonial": "confirmed|uncertain|none",
  "colonial_panes": "6|8|10|10+|unknown|none",
  "extra_glass": true,
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
- roof_m2: your best estimate as a number (not a string). Melbourne average single storey = 160m². If truly unknown, use 160.
- colonial_panes: use "6", "8", "10", "10+" as strings, or "unknown" if uncertain, or "none" if no colonial
- extra_glass: true if unusually large windows or floor-to-ceiling glass in living areas
- difficult_access: true if narrow gates, steep block, or tight side paths
- pool_fencing: true if glass pool fencing visible
- drive_time_mins: integer minutes only
- travel_surcharge: 0 if under 40min drive, 25 if 40-60min, 45 if over 60min
- distance_flag: "ok" under 30min, "moderate" 30-40min, "long" 40-60min, "very long" over 60min
- observations: max 4 short dot points
- verify: omit if nothing material to check
- Return ONLY the JSON object. No markdown. No explanation.`;

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

    // Get historical jobs to pass context
    const jobs = await getJobs();
    const completed = jobs.filter(j => j.actualHours && j.finalPrice).slice(-10);
    let historyNote = "";
    if (completed.length > 0) {
      historyNote = `\n\nNote from historical jobs: ${completed.map(j => `${j.bedrooms}BR ${j.storeys}: roof ~${j.quote?.facts?.roof_m2 || "?"}m², actual ${j.actualHours}hrs`).join("; ")}`;
    }

    const userMessage = `Research this property and return the facts JSON:

Address: ${address}
Property type: ${bedrooms}-bedroom ${storeys} ${propType}
${extraNotes ? `Owner notes: ${extraNotes}` : ""}
${historyNote}

Search all 5 sources listed in your instructions. Return only the JSON.`;

    // Single API call — research only
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: RESEARCH_PROMPT,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const data = await response.json();
    if (data.error) return NextResponse.json({ error: data.error.message }, { status: 500 });

    const fullText = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");

    // Parse facts JSON
    let facts = null;
    const m1 = fullText.match(/\{[\s\S]*\}/);
    if (m1) { try { facts = JSON.parse(m1[0]); } catch {} }
    if (!facts) {
      const stripped = fullText.replace(/```json|```/g, "").trim();
      const m2 = stripped.match(/\{[\s\S]*\}/);
      if (m2) { try { facts = JSON.parse(m2[0]); } catch {} }
    }

    // If still no facts, use sensible defaults so pricing still works
    if (!facts) {
      facts = {
        address, property: `${bedrooms}BR ${storeys} ${propType}`,
        roof_m2: 160, roof_description: "Could not determine — using Melbourne average",
        colonial: "none", colonial_panes: "none",
        extra_glass: false, difficult_access: false, pool_fencing: false,
        distance_km: "unknown", drive_time: "unknown", drive_time_mins: 0,
        distance_flag: "ok", travel_surcharge: 0,
        sale_history: "Could not retrieve", wealth_signal: "No sale data found",
        sources: "Research unavailable", observations: [], verify: []
      };
    }

    // Deterministic pricing — always consistent
    const pricing = buildQuote(facts, bedrooms, storeys, propType);

    return NextResponse.json({
      ...facts,
      ...pricing,
    });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
