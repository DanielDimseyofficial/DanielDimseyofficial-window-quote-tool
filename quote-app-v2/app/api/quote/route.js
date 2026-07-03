import { NextResponse } from "next/server";
import { getJobs } from "@/lib/jobs";

// ─── BUSINESS RULES ──────────────────────────────────────────────────────────

const HOURLY_RATE = 35;          // cleaner wage per hour
const DRIVE_TIME_HOURS = 1;      // 30 min there + 30 min back, paid
const CAC = 80;                  // customer acquisition cost
const FUEL = 20;                 // fuel per job
const DS_PREMIUM = 150;          // double storey danger/harness premium
const TARGET_MARGIN = 0.30;      // 30% target profit margin
const FLOOR_MARGIN = 0.15;       // 15% absolute minimum margin
const MIN_HOURS = 2;             // minimum 2 hours any job
const MIN_CHARGE = 200;          // minimum charge inside+outside
const MIN_OUTSIDE_CHARGE = 220;  // minimum charge outside only
const DS_MIN_CHARGE = 400;       // double storey minimum

// ─── WINDOW TYPE SURCHARGES ──────────────────────────────────────────────────

const WINDOW_SURCHARGES = {
  "standard":        0,
  "half_colonial":   75,
  "front_colonial":  50,
  "colonial_6":      125,
  "colonial_8":      200,
  "colonial_10":     250,
  "colonial_10plus": 300,
};

const WINDOW_TYPE_LABELS = {
  "standard":        "Standard windows",
  "half_colonial":   "Half colonial",
  "front_colonial":  "Front colonial only",
  "colonial_6":      "Full colonial 6-pane",
  "colonial_8":      "Full colonial 8-pane",
  "colonial_10":     "Full colonial 10-pane",
  "colonial_10plus": "Full colonial 10+ pane",
};

// ─── FEATURE SURCHARGES ──────────────────────────────────────────────────────

const FEATURE_SURCHARGES = {
  large_sliding_doors: 30,
  large_living_glass:  30,
  pool_windows:        25,
  pool_fencing:        30,
  difficult_access:    30,
  high_window_count:   30,
};

// ─── BASE HOURS BY PROPERTY ──────────────────────────────────────────────────
// Based on real job data — calibrated from actual completed jobs

function getBaseHours(bedrooms, storeys, propType, roofM2) {
  const isDouble = storeys === "Double storey";
  const isUnit = propType === "Unit / apartment";
  const isTownhouse = propType === "Townhouse";

  let hours;

  if (isUnit) {
    hours = 1.5;
  } else if (isTownhouse) {
    hours = 2.5;
  } else if (isDouble) {
    // Double storey — calibrated to: 154m²=2hrs, 296m²=6.25hrs
    // slope = (6.25-2)/(296-154) = 0.02993 per m²
    const roof = roofM2 || 180;
    hours = 2 + (roof - 154) * (4.25 / 142);
  } else {
    // Single storey — calibrated to: 140m²=1.75hrs, 230m²=3.75hrs
    // slope = (3.75-1.75)/(230-140) = 0.02222 per m²
    const roof = roofM2 || 170;
    hours = 1.75 + (roof - 140) * (2 / 90);
  }

  // Bedroom adjustment on top of roof-based estimate
  const brAdjust = { "1": -0.25, "2": 0, "3": 0, "4": 0.25, "5": 0.5, "6+": 0.75 };
  hours += brAdjust[String(bedrooms)] || 0;

  // Enforce minimum 2 hours
  return Math.max(MIN_HOURS, Math.round(hours * 4) / 4);
}

// ─── ROOF SIZE ADJUSTMENT ────────────────────────────────────────────────────

function getRoofAdjustment(roofM2, storeys) {
  if (!roofM2) return 0;
  const avg = storeys === "Double storey" ? 180 : 170;
  const diff = roofM2 - avg;
  if (diff < -70) return -40;
  if (diff < -40) return -25;
  if (diff < -15) return -15;
  if (diff < 15)  return 0;
  if (diff < 40)  return 20;
  if (diff < 70)  return 35;
  if (diff < 100) return 50;
  return 70;
}

// ─── HISTORICAL LEARNING ─────────────────────────────────────────────────────

function getLearnedHours(jobs, bedrooms, storeys, roofM2, windowType) {
  const completed = jobs.filter(j =>
    j.actualHours &&
    j.bedrooms === String(bedrooms) &&
    j.storeys === storeys &&
    j.windowType === windowType &&
    j.quote?.roof_m2 &&
    Math.abs(j.quote.roof_m2 - (roofM2 || 170)) < 40
  );
  if (!completed.length) return null;
  const avg = completed.reduce((s, j) => s + parseFloat(j.actualHours), 0) / completed.length;
  return {
    hours: Math.max(MIN_HOURS, Math.round(avg * 4) / 4),
    sampleSize: completed.length,
    note: `Learned from ${completed.length} similar job${completed.length > 1 ? "s" : ""}`
  };
}

// ─── PRICE CALCULATOR ────────────────────────────────────────────────────────

function calcPrices(hours, isDouble, baseExtra, minCharge) {
  // Total cost includes drive time
  const totalHours = hours + DRIVE_TIME_HOURS;
  const labourCost = totalHours * HOURLY_RATE;
  const dangerPremium = isDouble ? DS_PREMIUM : 0;
  const cost = Math.round(labourCost + CAC + FUEL + dangerPremium);

  // Add any base extras (roof adj, features, colonial)
  const adjustedCost = cost;

  // Target 30% margin: price = cost / (1 - margin)
  const rawOpening = cost / (1 - TARGET_MARGIN) + baseExtra;
  const rawFallback = cost / (1 - 0.22) + baseExtra;  // ~22% margin fallback
  const rawFloor = cost / (1 - FLOOR_MARGIN) + baseExtra;

  const opening = Math.max(minCharge, Math.round(rawOpening / 5) * 5);
  const fallback = Math.max(minCharge, Math.round(rawFallback / 5) * 5);
  const floor = Math.max(minCharge, Math.ceil(rawFloor / 5) * 5);

  const m = (p) => Math.round(((p - cost) / p) * 100);

  return { cost, opening, fallback, floor, opening_margin: m(opening), fallback_margin: m(fallback), floor_margin: m(floor) };
}

// ─── FORMAT TIME ─────────────────────────────────────────────────────────────

function fmtTime(hours) {
  const lo = Math.max(1.5, hours - 0.25);
  const hi = hours + 0.25;
  return `${lo}–${hi} hrs`;
}

// ─── BUILD QUOTE ─────────────────────────────────────────────────────────────

function buildQuote(facts, bedrooms, storeys, propType, windowType, roofM2, features, jobs) {
  const isDouble = storeys === "Double storey";
  const isTownhouse = propType === "Townhouse";
  const minCharge = isDouble ? DS_MIN_CHARGE : MIN_CHARGE;

  // Time estimate
  const baseHours = getBaseHours(bedrooms, storeys, propType, roofM2);
  const learned = getLearnedHours(jobs, bedrooms, storeys, roofM2, windowType);
  const hours = learned ? learned.hours : baseHours;

  // Surcharges
  const roofAdj = getRoofAdjustment(roofM2, storeys);
  const colSurcharge = WINDOW_SURCHARGES[windowType] || 0;
  const featSurcharge = Object.entries(features || {})
    .filter(([, v]) => v)
    .reduce((sum, [k]) => sum + (FEATURE_SURCHARGES[k] || 0), 0);
  const totalExtra = roofAdj + colSurcharge + featSurcharge;

  // Windows full price
  const win = calcPrices(hours, isDouble, totalExtra, minCharge);

  // Gutters — roughly 55% of window time, separate calculation
  const gutHours = Math.max(1, Math.round(hours * 0.55 * 4) / 4);
  const gutMin = isDouble ? 445 : 220;
  const gut = calcPrices(gutHours, isDouble, roofAdj * 0.5, gutMin);

  // Outside only — 65% of full price, + $100 flat for double storey (roof/harness/ladder), min $220
  const outsidePct = 0.65;
  const outsideDSFlat = isDouble ? 100 : 0;
  const outsideOpening = Math.max(MIN_OUTSIDE_CHARGE, Math.round((win.opening * outsidePct + outsideDSFlat) / 5) * 5);
  const outsideFallback = Math.max(MIN_OUTSIDE_CHARGE, Math.round((win.fallback * outsidePct + outsideDSFlat) / 5) * 5);
  const outsideFloor = Math.max(MIN_OUTSIDE_CHARGE, Math.round((win.floor * outsidePct + outsideDSFlat) / 5) * 5);
  const outsideCost = Math.round(win.cost * outsidePct + outsideDSFlat);
  const om = (p) => Math.round(((p - outsideCost) / p) * 100);

  // Combo — 10% off, single CAC
  const comboCost = Math.round(win.cost + gut.cost - CAC);
  const comboOpen = Math.max(minCharge + gutMin, Math.round((win.opening + gut.opening) * 0.90 / 5) * 5);
  const comboFall = Math.max(minCharge + gutMin, Math.round((win.fallback + gut.fallback) * 0.90 / 5) * 5);
  const comboFloor = Math.max(minCharge + gutMin, Math.ceil(comboCost / (1 - FLOOR_MARGIN) / 5) * 5);
  const cm = (p) => Math.round(((p - comboCost) / p) * 100);

  const timeLabel = learned
    ? `${hours} hrs (${learned.note})`
    : fmtTime(hours);

  const roofLabel = roofM2
    ? `${roofM2}m² · ${bedrooms}BR ${storeys.toLowerCase()}`
    : `${bedrooms}BR ${storeys.toLowerCase()} · roof not measured`;

  const includesLabel = [
    roofLabel,
    WINDOW_TYPE_LABELS[windowType] || "Standard",
    isDouble ? "+$150 double storey premium" : null,
    roofAdj !== 0 ? `roof adj ${roofAdj > 0 ? "+" : ""}$${roofAdj}` : null,
    colSurcharge ? `colonial +$${colSurcharge}` : null,
    featSurcharge ? `features +$${featSurcharge}` : null,
  ].filter(Boolean).join(" · ");

  return {
    windows: {
      ...win, time: timeLabel, includes: includesLabel,
    },
    outside_only: {
      opening: outsideOpening,
      fallback: outsideFallback,
      floor: outsideFloor,
      opening_margin: om(outsideOpening),
      fallback_margin: om(outsideFallback),
      floor_margin: om(outsideFloor),
      cost: outsideCost,
      time: timeLabel,
      includes: `Outside only · 65% of full price${isDouble ? " + $100 roof/harness flat" : ""} · min $${MIN_OUTSIDE_CHARGE}`,
    },
    gutters: {
      ...gut, time: fmtTime(gutHours),
      includes: `${roofLabel} gutters${isDouble ? " · +$150 premium" : ""}`,
    },
    combo: {
      cost: comboCost,
      standard_opening: comboOpen, standard_fallback: comboFall, standard_floor: comboFloor,
      standard_opening_margin: cm(comboOpen),
      standard_fallback_margin: cm(comboFall),
      standard_floor_margin: cm(comboFloor),
      saving: (win.opening + gut.opening) - comboOpen,
    },
    estimated_hours: hours,
    learned_time: learned,
    roof_m2: roofM2,
    roof_adj: roofAdj,
    window_type: windowType,
    window_type_label: WINDOW_TYPE_LABELS[windowType] || "Standard",
    cost_breakdown: {
      labour: Math.round((hours + DRIVE_TIME_HOURS) * HOURLY_RATE),
      drive_time: Math.round(DRIVE_TIME_HOURS * HOURLY_RATE),
      cac: CAC,
      fuel: FUEL,
      danger_premium: isDouble ? DS_PREMIUM : 0,
      total_cost: win.cost,
    }
  };
}

// ─── RESEARCH PROMPT ─────────────────────────────────────────────────────────

const RESEARCH_PROMPT = `You are a property research assistant for a Melbourne window cleaning business.
Find facts about the property. Do NOT calculate prices.

Search ONLY these sources. Exact address in quotes. Ignore results not for this specific property:
1. site:realestate.com.au "[ADDRESS]" — sale history, listing photos
2. site:domain.com.au "[ADDRESS]" — sale history, property value estimate
3. "[ADDRESS] Melbourne street view" — access difficulty, pool fencing, large glass areas, general condition
4. Google Maps directions from "25 Margot Street Chadstone VIC" to "[ADDRESS]" — driving distance and time

Return ONLY this JSON:
{
  "address": "full address string",
  "property": "e.g. 3BR single-storey house",
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
- drive_time_mins: integer only
- travel_surcharge: 0 if under 40min, 25 if 40-60min, 45 if over 60min
- distance_flag: "ok" under 30min, "moderate" 30-40min, "long" 40-60min, "very long" over 60min
- observations: max 4 short dot points
- verify: omit if nothing material
- Return ONLY the JSON. No markdown. No explanation.`;

// ─── ROUTE HANDLER ───────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const { address, bedrooms, storeys, propType, extraNotes, windowType, roofM2: manualRoofM2, features } = await request.json();

    if (!address?.trim()) return NextResponse.json({ error: "Address is required" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured." }, { status: 500 });

    const jobs = await getJobs();

    // Roof size — manual takes priority, then auto satellite
    let roofData = null;
    if (manualRoofM2 && manualRoofM2 > 0) {
      roofData = { roof_m2: manualRoofM2, roof_description: `${manualRoofM2}m² — manually measured`, confidence: "high" };
    } else {
      roofData = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/roof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      }).then(r => r.json()).catch(() => null);
    }

    const roofM2 = roofData?.roof_m2 || null;

    // Research property
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
        messages: [{ role: "user", content: `Research this property:\nAddress: ${address}\nProperty: ${bedrooms}-bedroom ${storeys} ${propType}\n${extraNotes ? `Notes: ${extraNotes}` : ""}\nSearch all 4 sources and return only the JSON.` }],
      }),
    });

    const data = await response.json();
    if (data.error) return NextResponse.json({ error: data.error.message }, { status: 500 });

    const fullText = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    let facts = null;
    const m1 = fullText.match(/\{[\s\S]*\}/);
    if (m1) { try { facts = JSON.parse(m1[0]); } catch {} }
    if (!facts) {
      const m2 = fullText.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
      if (m2) { try { facts = JSON.parse(m2[0]); } catch {} }
    }
    if (!facts) {
      facts = {
        address, property: `${bedrooms}BR ${storeys} ${propType}`,
        distance_km: "unknown", drive_time: "unknown", drive_time_mins: 0,
        distance_flag: "ok", travel_surcharge: 0,
        sale_history: "Could not retrieve", wealth_signal: "No data found",
        sources: "Research unavailable", observations: [], verify: []
      };
    }

    const pricing = buildQuote(facts, bedrooms, storeys, propType, windowType || "standard", roofM2, features || {}, jobs);

    return NextResponse.json({
      ...facts,
      ...pricing,
      roof_description: roofData?.roof_description || (roofM2 ? `${roofM2}m²` : "Not measured — using time estimate"),
      roof_confidence: roofData?.confidence || "none",
    });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
