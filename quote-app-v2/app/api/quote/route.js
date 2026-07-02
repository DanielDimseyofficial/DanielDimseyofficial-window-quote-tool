import { NextResponse } from "next/server";
import { getJobs } from "@/lib/jobs";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const HARD_FLOOR = 220;
const CAC = 80;
const FUEL = 20;
const HOURLY = 35;

// ─── WINDOW TYPE SURCHARGES ──────────────────────────────────────────────────

const WINDOW_SURCHARGES = {
  "standard":           0,
  "half_colonial":      75,
  "front_colonial":     50,
  "colonial_6":         125,
  "colonial_8":         200,
  "colonial_10":        250,
  "colonial_10plus":    300,
};

const WINDOW_TYPE_LABELS = {
  "standard":           "Standard windows",
  "half_colonial":      "Half colonial",
  "front_colonial":     "Front colonial only",
  "colonial_6":         "Full colonial 6-pane",
  "colonial_8":         "Full colonial 8-pane",
  "colonial_10":        "Full colonial 10-pane",
  "colonial_10plus":    "Full colonial 10+ pane",
};

// ─── TIME ESTIMATION ─────────────────────────────────────────────────────────
// Based on real job data:
// Single: 140m² = 1.75hrs, 230m² = 3.75hrs
// Double: 154m² = 2hrs, 296m² = 6.25hrs

function estimateHours(roofM2, storeys) {
  if (storeys === "Double storey") {
    // Linear interpolation based on real data points
    // 154m² = 2hrs, 296m² = 6.25hrs
    // slope = (6.25 - 2) / (296 - 154) = 4.25 / 142 = 0.02993 hrs per m²
    const hours = 2 + (roofM2 - 154) * (4.25 / 142);
    return Math.max(1.5, Math.round(hours * 4) / 4); // round to nearest 0.25
  } else {
    // Single storey
    // 140m² = 1.75hrs, 230m² = 3.75hrs
    // slope = (3.75 - 1.75) / (230 - 140) = 2 / 90 = 0.02222 hrs per m²
    const hours = 1.75 + (roofM2 - 140) * (2 / 90);
    return Math.max(1, Math.round(hours * 4) / 4);
  }
}

function formatTime(hours) {
  const low = Math.max(1, hours - 0.25);
  const high = hours + 0.25;
  return `${low}–${high} hrs`;
}

// ─── HISTORICAL LEARNING ─────────────────────────────────────────────────────
// Adjusts time estimate based on completed jobs with similar profile

function getLearnedHours(jobs, bedrooms, storeys, roofM2, windowType) {
  const completed = jobs.filter(j =>
    j.actualHours &&
    j.bedrooms === bedrooms &&
    j.storeys === storeys &&
    j.windowType === windowType &&
    j.quote?.roof_m2 &&
    Math.abs(j.quote.roof_m2 - roofM2) < 40 // within 40m² of this property
  );

  if (completed.length === 0) return null;

  const avgHours = completed.reduce((sum, j) => sum + parseFloat(j.actualHours), 0) / completed.length;
  return {
    hours: Math.round(avgHours * 4) / 4,
    sampleSize: completed.length,
    note: `Based on ${completed.length} similar job${completed.length > 1 ? "s" : ""} you've completed`
  };
}

// ─── PRICE CALCULATOR ────────────────────────────────────────────────────────

function calcPrice(baseHours, basePrice, windowSurcharge) {
  const cost = Math.round(baseHours * HOURLY + CAC + FUEL);
  const totalBase = basePrice + windowSurcharge;

  const opening = Math.max(totalBase, Math.round(cost / 0.62 / 5) * 5);
  const fallback = Math.max(Math.round(cost / 0.70 / 5) * 5, HARD_FLOOR);
  const floor = Math.max(Math.ceil(cost * 1.10 / 5) * 5, HARD_FLOOR);

  const m = (price) => Math.round(((price - cost) / price) * 100);

  return {
    cost,
    opening, fallback, floor,
    opening_margin: m(opening),
    fallback_margin: m(fallback),
    floor_margin: m(floor),
  };
}

// ─── BASE WINDOW PRICE BY BEDROOMS ───────────────────────────────────────────

function getWindowBase(bedrooms, storeys, propType) {
  const isDouble = storeys === "Double storey";
  const isTownhouse = propType === "Townhouse";
  const isUnit = propType === "Unit / apartment";

  if (isUnit) return { base: 280, gutBase: 220 };
  if (isTownhouse) return { base: 470, gutBase: 445 };

  const single = { "1": 290, "2": 320, "3": 365, "4": 395, "5": 425, "6+": 455 };
  const double = { "1": 450, "2": 470, "3": 510, "4": 560, "5": 620, "6+": 680 };
  const gutSingle = { "1": 220, "2": 250, "3": 355, "4": 385, "5": 410, "6+": 435 };
  const gutDouble = { "1": 445, "2": 445, "3": 465, "4": 500, "5": 540, "6+": 580 };

  const key = String(bedrooms);
  return {
    base: isDouble ? (double[key] || 510) : (single[key] || 365),
    gutBase: isDouble ? (gutDouble[key] || 465) : (gutSingle[key] || 355),
  };
}

// ─── ROOF SIZE ADJUSTMENT ────────────────────────────────────────────────────

function getRoofAdjustment(roofM2, storeys) {
  if (!roofM2) return 0;
  const avg = storeys === "Double storey" ? 200 : 170;
  const diff = roofM2 - avg;
  if (diff < -80) return -45;
  if (diff < -50) return -30;
  if (diff < -20) return -15;
  if (diff < 20)  return 0;
  if (diff < 50)  return 20;
  if (diff < 80)  return 35;
  if (diff < 120) return 50;
  return 70;
}

// ─── BUILD QUOTE ─────────────────────────────────────────────────────────────

function buildQuote(facts, bedrooms, storeys, propType, windowType, roofM2, jobs) {
  const surcharge = WINDOW_SURCHARGES[windowType] ?? 0;
  const { base, gutBase } = getWindowBase(bedrooms, storeys, propType);
  const roofAdj = getRoofAdjustment(roofM2, storeys);
  const finalBase = base + roofAdj;
  const finalGutBase = gutBase + Math.round(roofAdj * 0.5);

  const estHours = estimateHours(roofM2 || 170, storeys);
  const learned = getLearnedHours(jobs, bedrooms, storeys, roofM2 || 170, windowType);
  const finalHours = learned ? learned.hours : estHours;

  const winPrices = calcPrice(finalHours, finalBase, surcharge);
  const gutPrices = calcPrice(finalHours * 0.6, finalGutBase, 0);

  // Combo — 10% off, single CAC
  const comboCost = Math.round(winPrices.cost + gutPrices.cost - CAC);
  const comboOpen = Math.round((winPrices.opening + gutPrices.opening) * 0.90 / 5) * 5;
  const comboFall = Math.round((winPrices.fallback + gutPrices.fallback) * 0.90 / 5) * 5;
  const comboFloor = Math.max(Math.ceil(comboCost * 1.10 / 5) * 5, HARD_FLOOR);
  const cm = (p) => Math.round(((p - comboCost) / p) * 100);

  const timeLabel = learned
    ? `${finalHours} hrs (learned from ${learned.sampleSize} similar job${learned.sampleSize > 1 ? "s" : ""})`
    : formatTime(estHours);

  const roofLabel = roofM2
    ? `${roofM2}m² measured · ${bedrooms}BR ${storeys.toLowerCase()}`
    : `${bedrooms}BR ${storeys.toLowerCase()} · roof not measured`;

  return {
    windows: {
      opening: winPrices.opening,
      fallback: winPrices.fallback,
      floor: winPrices.floor,
      opening_margin: winPrices.opening_margin,
      fallback_margin: winPrices.fallback_margin,
      floor_margin: winPrices.floor_margin,
      cost: winPrices.cost,
      time: timeLabel,
      includes: `${roofLabel} · ${WINDOW_TYPE_LABELS[windowType] || "standard"}${surcharge ? ` · +$${surcharge} colonial` : ""}${roofAdj !== 0 ? ` · roof adj ${roofAdj > 0 ? "+" : ""}$${roofAdj}` : ""}`,
    },
    gutters: {
      opening: gutPrices.opening,
      fallback: gutPrices.fallback,
      floor: gutPrices.floor,
      opening_margin: gutPrices.opening_margin,
      fallback_margin: gutPrices.fallback_margin,
      floor_margin: gutPrices.floor_margin,
      cost: gutPrices.cost,
      time: formatTime(finalHours * 0.6),
      includes: `${roofLabel} gutters`,
    },
    combo: {
      cost: comboCost,
      standard_opening: comboOpen, standard_fallback: comboFall, standard_floor: comboFloor,
      standard_opening_margin: cm(comboOpen),
      standard_fallback_margin: cm(comboFall),
      standard_floor_margin: cm(comboFloor),
      saving: (winPrices.opening + gutPrices.opening) - comboOpen,
    },
    estimated_hours: finalHours,
    learned_time: learned,
    roof_m2: roofM2,
    roof_adj: roofAdj,
    window_type: windowType,
    window_type_label: WINDOW_TYPE_LABELS[windowType] || "Standard",
  };
}

// ─── RESEARCH PROMPT ─────────────────────────────────────────────────────────

const RESEARCH_PROMPT = `You are a property research assistant for a Melbourne window cleaning business.
Find facts about the property. Do NOT calculate prices — pricing is handled by the system.

Search ONLY these sources. Exact address in quotes. Ignore results not for this specific property:
1. site:realestate.com.au "[ADDRESS]" — sale history, listing photos
2. site:domain.com.au "[ADDRESS]" — sale history, property value estimate
3. "[ADDRESS] Melbourne street view" — access difficulty, pool fencing, trees near gutters, general property condition
4. Google Maps directions from "25 Margot Street Chadstone VIC" to "[ADDRESS]" — driving distance and time

Return ONLY this JSON:
{
  "address": "full address string",
  "property": "e.g. 3BR single-storey house",
  "difficult_access": false,
  "pool_fencing": false,
  "extra_glass": false,
  "distance_km": "14.2 km",
  "drive_time": "22 min",
  "drive_time_mins": 22,
  "distance_flag": "ok|moderate|long|very long",
  "travel_surcharge": 0,
  "sale_history": "Sold Jan 2022 for $1.42M. Previously sold 1997 for $310k.",
  "wealth_signal": "Recent high-value purchase — quote confidently at target.",
  "sources": "realestate.com.au listing found, domain.com.au not listed",
  "observations": ["dot point 1", "dot point 2"],
  "verify": ["thing to check 1"]
}

Rules:
- difficult_access: true if narrow gates, steep block, tight paths
- pool_fencing: true if glass pool fencing visible
- extra_glass: true if unusually large floor-to-ceiling glass in living areas
- drive_time_mins: integer only
- travel_surcharge: 0 if under 40min, 25 if 40-60min, 45 if over 60min
- distance_flag: "ok" under 30min, "moderate" 30-40min, "long" 40-60min, "very long" over 60min
- observations: max 4 short dot points
- verify: omit if nothing material
- Return ONLY the JSON. No markdown. No explanation.`;

// ─── ROUTE HANDLER ───────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const { address, bedrooms, storeys, propType, extraNotes, windowType, roofM2: manualRoofM2 } = await request.json();

    if (!address?.trim()) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured." }, { status: 500 });
    }

    // Load historical jobs for learning
    const jobs = await getJobs();

    // Get roof data
    let roofData = null;
    if (manualRoofM2 && manualRoofM2 > 0) {
      roofData = {
        roof_m2: manualRoofM2,
        roof_description: `${manualRoofM2}m² — manually measured`,
        confidence: "high"
      };
    } else {
      roofData = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/roof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      }).then(r => r.json()).catch(() => null);
    }

    const roofM2 = roofData?.roof_m2 || null;

    // Research the property
    const userMessage = `Research this property:
Address: ${address}
Property: ${bedrooms}-bedroom ${storeys} ${propType}
${extraNotes ? `Notes: ${extraNotes}` : ""}
Search all 4 sources and return only the JSON.`;

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

    if (!facts) {
      facts = {
        address, property: `${bedrooms}BR ${storeys} ${propType}`,
        difficult_access: false, pool_fencing: false, extra_glass: false,
        distance_km: "unknown", drive_time: "unknown", drive_time_mins: 0,
        distance_flag: "ok", travel_surcharge: 0,
        sale_history: "Could not retrieve", wealth_signal: "No data found",
        sources: "Research unavailable", observations: [], verify: []
      };
    }

    const pricing = buildQuote(facts, bedrooms, storeys, propType, windowType || "standard", roofM2, jobs);

    return NextResponse.json({
      ...facts,
      ...pricing,
      roof_description: roofData?.roof_description || (roofM2 ? `${roofM2}m²` : "Not measured — using bedroom estimate"),
      roof_confidence: roofData?.confidence || "none",
    });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
