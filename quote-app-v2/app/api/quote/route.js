import { NextResponse } from "next/server";
import { getJobs } from "@/lib/jobs";

// ─── BUSINESS RULES ──────────────────────────────────────────────────────────

const HOURLY_RATE = 35;          // cleaner wage per hour
const BILLABLE_RATE = 110;       // target billable rate per hour
const DRIVE_TIME_HOURS = 1;      // 30 min there + 30 min back, paid
const CAC = 80;                  // customer acquisition cost
const RATE_PER_KM = 0.85;        // $0.85 per km travel charge
const DS_PREMIUM = 150;          // double storey danger/harness premium
const TARGET_MARGIN = 0.30;      // 30% target profit margin
const FLOOR_MARGIN = 0.15;       // 15% absolute minimum margin
const MIN_HOURS = 2;             // minimum 2 hours any job
const MIN_CHARGE = 200;          // minimum charge inside+outside
const MIN_OUTSIDE_CHARGE = 220;  // minimum charge outside only
const DS_MIN_CHARGE = 400;       // double storey minimum

// Travel fee tiers (on top of per-km charge)
function getTravelFee(distanceKm, driveTimeMins) {
  const kmCharge = Math.round(distanceKm * RATE_PER_KM * 100) / 100;
  let timeFee = 0;
  if (driveTimeMins > 45) timeFee = 35;
  else if (driveTimeMins > 20) timeFee = 12;
  return Math.round((kmCharge + timeFee) * 100) / 100;
}

// Roof type surcharges
const ROOF_TYPE_TIME = { "tile": 0, "metal": 0.75 }; // extra hours for metal

// Roof pitch surcharges
const PITCH_SURCHARGES = { "flat": 0, "standard": 0, "steep": 65, "very_steep": 100 };

const PITCH_LABELS = {
  "flat": "Flat/low pitch",
  "standard": "Standard pitch",
  "steep": "Steep pitch",
  "very_steep": "Very steep pitch",
};

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

// Feature surcharges simplified — pool fencing handled per-pane at $10

// ─── BASE HOURS BY PROPERTY ──────────────────────────────────────────────────
// Based on real job data — calibrated from actual completed jobs

function getBaseHours(bedrooms, storeys, propType, roofM2) {
  const isDouble = storeys === "Double storey";
  const isUnit = propType === "Unit / apartment";
  const isTownhouse = propType === "Townhouse";

  let hours;

  if (isUnit) {
    hours = 2;
  } else if (isTownhouse) {
    hours = 3;
  } else if (isDouble) {
    // Double storey anchor points (confirmed by owner):
    // 170m² = 6hrs, 230m² = 6.5hrs, 296m² = 7hrs
    // Below 170: interpolate down from 6hrs
    // slope low: (6-4)/(170-120) = 0.04 per m²
    // slope high: (7-6)/(296-170) = 0.00794 per m²
    const roof = roofM2 || 200;
    if (roof <= 120) {
      hours = 4;
    } else if (roof <= 170) {
      hours = 4 + (roof - 120) * (2 / 50);
    } else if (roof <= 230) {
      hours = 6 + (roof - 170) * (0.5 / 60);
    } else {
      hours = 6.5 + (roof - 230) * (0.5 / 66);
    }
  } else {
    // Single storey anchor points (confirmed by owner):
    // 100m² = 2hrs (minimum), 140m² = 3hrs, 170m² = 3hrs, 230m² = 4hrs, 270m²+ = 4.5hrs
    const roof = roofM2 || 170;
    if (roof <= 100) {
      hours = 2;
    } else if (roof <= 170) {
      // 100m²=2hrs to 170m²=3hrs: slope = 1/70
      hours = 2 + (roof - 100) * (1 / 70);
    } else if (roof <= 230) {
      // 170m²=3hrs to 230m²=4hrs: slope = 1/60
      hours = 3 + (roof - 170) * (1 / 60);
    } else {
      // 230m²=4hrs to 270m²=4.5hrs: slope = 0.5/40
      hours = 4 + (roof - 230) * (0.5 / 40);
    }
  }

  // Bedroom adjustment
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

function calcPrices(hours, isDouble, baseExtra, minCharge, travelCost) {
  // Total cost includes drive time + travel charges
  const totalHours = hours + DRIVE_TIME_HOURS;
  const labourCost = totalHours * HOURLY_RATE;
  const dangerPremium = isDouble ? DS_PREMIUM : 0;
  const travel = travelCost || 0;
  const cost = Math.round(labourCost + CAC + dangerPremium + travel);

  // Opening = $110/hr billable rate × hours + extras + travel
  const billableRevenue = Math.round(hours * BILLABLE_RATE);
  const rawOpening = billableRevenue + baseExtra + travel;
  const rawFallback = Math.round(cost / (1 - 0.22)) + baseExtra;
  const rawFloor = Math.ceil(cost / (1 - FLOOR_MARGIN)) + baseExtra;

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

function buildQuote(facts, bedrooms, storeys, propType, windowType, roofM2, features, roofType, pitch, onRoof, poolPanes, jobs) {
  const isDouble = storeys === "Double storey";
  const isTownhouse = propType === "Townhouse";
  const minCharge = isDouble ? DS_MIN_CHARGE : MIN_CHARGE;

  // Roof type and pitch only apply if cleaner needs to get on the roof
  const needsRoof = onRoof === true;
  const metalExtra = (needsRoof && roofType === "metal") ? 0.75 : 0;
  const pitchSurcharge = needsRoof ? (PITCH_SURCHARGES[pitch || "standard"] || 0) : 0;

  // Travel cost
  const distanceKm = parseFloat(facts.distance_km) || 0;
  const driveTimeMins = facts.drive_time_mins || 0;
  const travelCost = getTravelFee(distanceKm, driveTimeMins);

  // Time estimate
  const baseHoursRaw = getBaseHours(bedrooms, storeys, propType, roofM2);
  const baseHours = Math.max(MIN_HOURS, Math.round((baseHoursRaw + metalExtra) * 4) / 4);
  const learned = getLearnedHours(jobs, bedrooms, storeys, roofM2, windowType);
  const hours = learned ? learned.hours : baseHours;

  // Surcharges
  const roofAdj = getRoofAdjustment(roofM2, storeys);
  const colSurcharge = WINDOW_SURCHARGES[windowType] || 0;
  const poolFencingSurcharge = Math.round((parseInt(poolPanes) || 0) * 10);
  const totalExtra = roofAdj + colSurcharge + pitchSurcharge + poolFencingSurcharge;

  // Windows full price
  const win = calcPrices(hours, isDouble, totalExtra, minCharge, travelCost);

  // Gutters — roughly 55% of window time, separate calculation
  const gutHours = Math.max(1, Math.round(hours * 0.55 * 4) / 4);
  const gutMin = isDouble ? 445 : 220;
  const gut = calcPrices(gutHours, isDouble, roofAdj * 0.5, gutMin, travelCost * 0.5);

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
    needsRoof && roofType === "metal" ? "metal roof +45min" : null,
    needsRoof && pitch && pitch !== "standard" && pitch !== "flat" ? `${PITCH_LABELS[pitch]} +$${pitchSurcharge}` : null,
    isDouble ? "+$150 double storey premium" : null,
    roofAdj !== 0 ? `roof adj ${roofAdj > 0 ? "+" : ""}$${roofAdj}` : null,
    colSurcharge ? `colonial +$${colSurcharge}` : null,
    poolFencingSurcharge > 0 ? `pool fencing ${poolPanes} panes +$${poolFencingSurcharge}` : null,
    travelCost > 0 ? `travel $${Math.round(travelCost)}` : null,
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
      travel_km_charge: Math.round(distanceKm * RATE_PER_KM),
      travel_time_fee: driveTimeMins > 45 ? 35 : driveTimeMins > 20 ? 12 : 0,
      travel_total: Math.round(travelCost),
      danger_premium: isDouble ? DS_PREMIUM : 0,
      pitch_surcharge: pitchSurcharge,
      pool_fencing: poolFencingSurcharge,
      metal_extra_time: metalExtra > 0 ? "45 min" : null,
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
    const { address, bedrooms, storeys, propType, extraNotes, windowType, roofM2: manualRoofM2, roofType, pitch, onRoof, poolPanes } = await request.json();

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

    const pricing = buildQuote(facts, bedrooms, storeys, propType, windowType || "standard", roofM2, {}, roofType || "tile", pitch || "standard", onRoof === true, poolPanes || 0, jobs);

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
