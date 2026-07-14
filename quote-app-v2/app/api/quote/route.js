import { NextResponse } from "next/server";
import { getJobs } from "@/lib/jobs";

const WINDOWS = {
  single: {
    "1": { open: 280, hesitant: 230, floor: 220 },
    "2": { open: 280, hesitant: 230, floor: 220 },
    "3": { open: 370, hesitant: 320, floor: 300 },
    "4": { open: 400, hesitant: 350, floor: 320 },
    "5": { open: 430, hesitant: 380, floor: 350 },
    "6+": { open: 460, hesitant: 410, floor: 375 },
    "unit": { open: 280, hesitant: 230, floor: 220 },
    "townhouse": { open: 450, hesitant: 400, floor: 370 },
  },
  double: {
    "1": { open: 520, hesitant: 470, floor: 420 },
    "2": { open: 520, hesitant: 470, floor: 420 },
    "3": { open: 520, hesitant: 470, floor: 420 },
    "4": { open: 580, hesitant: 530, floor: 470 },
    "5": { open: 640, hesitant: 590, floor: 520 },
    "6+": { open: 700, hesitant: 650, floor: 570 },
    "townhouse": { open: 450, hesitant: 400, floor: 370 },
  }
};

const GUTTERS = {
  single: {
    "1": { open: 250, hesitant: 200, floor: 190 },
    "2": { open: 250, hesitant: 200, floor: 190 },
    "3": { open: 340, hesitant: 290, floor: 265 },
    "4": { open: 370, hesitant: 320, floor: 290 },
    "5": { open: 410, hesitant: 360, floor: 325 },
    "6+": { open: 410, hesitant: 360, floor: 325 },
    "unit": { open: 250, hesitant: 200, floor: 190 },
    "townhouse": { open: 445, hesitant: 395, floor: 370 },
  },
  double: {
    "1": { open: 465, hesitant: 415, floor: 385 },
    "2": { open: 465, hesitant: 415, floor: 385 },
    "3": { open: 465, hesitant: 415, floor: 385 },
    "4": { open: 510, hesitant: 460, floor: 420 },
    "5": { open: 560, hesitant: 510, floor: 460 },
    "6+": { open: 560, hesitant: 510, floor: 460 },
    "townhouse": { open: 445, hesitant: 395, floor: 370 },
  }
};

const COLONIAL = {
  standard: 0, half_colonial: 75, front_colonial: 50,
  colonial_6: 125, colonial_8: 200, colonial_10: 250, colonial_10plus: 300,
};

const WINDOW_TYPE_LABELS = {
  standard: "Standard", half_colonial: "Half colonial", front_colonial: "Front colonial only",
  colonial_6: "Colonial 6-pane", colonial_8: "Colonial 8-pane",
  colonial_10: "Colonial 10-pane", colonial_10plus: "Colonial 10+ pane",
};

const PITCH_SURCHARGES = { flat: 0, standard: 0, steep: 65, very_steep: 100 };
const RATE_PER_KM = 0.85;

function getTravelFee(distanceKm, driveTimeMins) {
  const kmCharge = Math.round(distanceKm * RATE_PER_KM);
  const timeFee = driveTimeMins > 45 ? 35 : driveTimeMins > 20 ? 12 : 0;
  return kmCharge + timeFee;
}

function getKey(bedrooms, propType) {
  if (propType === "Unit / apartment") return "unit";
  if (propType === "Townhouse") return "townhouse";
  return String(bedrooms);
}

function buildQuote(facts, bedrooms, storeys, propType, windowType, onRoof, pitch, poolPanes, ownerHours) {
  const isDouble = storeys === "Double storey";
  const tier = isDouble ? "double" : "single";
  const key = getKey(bedrooms, propType);

  const win = WINDOWS[tier][key] || WINDOWS[tier]["3"];
  const gut = GUTTERS[tier][key] || GUTTERS[tier]["3"];

  const colonial = COLONIAL[windowType] || 0;
  const pitchAdd = (onRoof && PITCH_SURCHARGES[pitch]) || 0;
  const poolAdd = Math.round((parseInt(poolPanes) || 0) * 10);
  const extra = colonial + pitchAdd + poolAdd;

  const distanceKm = parseFloat(facts.distance_km) || 0;
  const driveTimeMins = facts.drive_time_mins || 0;
  const travel = getTravelFee(distanceKm, driveTimeMins);

  const wOpen = win.open + extra + travel;
  const wHes = win.hesitant + extra + travel;
  const wFloor = win.floor + extra + travel;

  const outsideFlat = isDouble ? 75 : 0;
  const oOpen = Math.round(win.open * 0.65) + outsideFlat + travel;
  const oHes = Math.round(win.hesitant * 0.65) + outsideFlat + travel;
  const oFloor = Math.max(220, Math.round(win.floor * 0.65) + outsideFlat + travel);

  const gOpen = gut.open + travel;
  const gHes = gut.hesitant + travel;
  const gFloor = gut.floor + travel;

  const cOpen = Math.round((wOpen + gOpen) * 0.90 / 5) * 5;
  const cHes = Math.round((wHes + gHes) * 0.90 / 5) * 5;
  const cFloor = Math.round((wFloor + gFloor) * 0.90 / 5) * 5;
  const cSaving = (wOpen + gOpen) - cOpen;

  const extras = [
    colonial ? `${WINDOW_TYPE_LABELS[windowType]} +$${colonial}` : null,
    pitchAdd ? `pitch +$${pitchAdd}` : null,
    poolAdd ? `pool fencing +$${poolAdd}` : null,
    travel ? `travel +$${travel}` : null,
  ].filter(Boolean).join(" · ");

  return {
    windows: { open: wOpen, hesitant: wHes, floor: wFloor, includes: extras || "Base price" },
    outside: { open: oOpen, hesitant: oHes, floor: oFloor, includes: `Outside only 65%${isDouble ? " +$75" : ""}${travel ? ` · travel +$${travel}` : ""}` },
    gutters: { open: gOpen, hesitant: gHes, floor: gFloor, includes: `Gutters${travel ? ` · travel +$${travel}` : ""}` },
    combo: { open: cOpen, hesitant: cHes, floor: cFloor, saving: cSaving },
    owner_hours: ownerHours || null,
    window_type_label: WINDOW_TYPE_LABELS[windowType] || "Standard",
    window_type: windowType,
    travel_cost: travel,
  };
}

const RESEARCH_PROMPT = `You are a property research assistant for a Melbourne window cleaning business.
Search ONLY these sources. Exact address in quotes. Ignore results not for this specific property:
1. site:realestate.com.au "[ADDRESS]" — sale history, photos
2. site:domain.com.au "[ADDRESS]" — sale history, value estimate
3. "[ADDRESS] Melbourne street view" — access, pool fencing, condition
4. Google Maps directions from "25 Margot Street Chadstone VIC" to "[ADDRESS]" — distance and drive time

Return ONLY this JSON, no markdown, no explanation:
{
  "address": "full address",
  "property": "e.g. 4BR double-storey house",
  "distance_km": "14.2",
  "drive_time": "22 min",
  "drive_time_mins": 22,
  "distance_flag": "ok|moderate|long|very long",
  "sale_history": "Sold Jan 2022 for $1.42M.",
  "wealth_signal": "Recent purchase — quote at target.",
  "sources": "realestate.com.au found",
  "observations": ["point 1"],
  "verify": ["check 1"]
}
distance_km: number only, no units. drive_time_mins: integer. distance_flag: ok=under 30min, moderate=30-40, long=40-60, very long=over 60. observations: max 3. verify: omit if nothing material.`;

export async function POST(request) {
  try {
    const { address, bedrooms, storeys, propType, extraNotes, windowType, pitch, onRoof, poolPanes, ownerHours } = await request.json();

    if (!address?.trim()) return NextResponse.json({ error: "Address is required" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured." }, { status: 500 });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: RESEARCH_PROMPT,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: `Research: ${address}\n${bedrooms}BR ${storeys} ${propType}${extraNotes ? `\nNotes: ${extraNotes}` : ""}\nReturn only the JSON.` }],
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
      facts = { address, property: `${bedrooms}BR ${storeys} ${propType}`, distance_km: "0", drive_time: "unknown", drive_time_mins: 0, distance_flag: "ok", sale_history: "Not found", wealth_signal: "No data", sources: "Unavailable", observations: [], verify: [] };
    }

    const pricing = buildQuote(facts, bedrooms, storeys, propType, windowType || "standard", onRoof === true, pitch || "standard", poolPanes || 0, ownerHours || null);

    return NextResponse.json({ ...facts, ...pricing });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
