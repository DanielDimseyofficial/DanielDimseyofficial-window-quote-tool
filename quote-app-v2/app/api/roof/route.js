import { NextResponse } from "next/server";

const VISION_PROMPT = `You are analyzing a satellite image of a property in Melbourne, Australia to estimate the roof size for window and gutter cleaning quotes.

Look at the satellite image carefully and:
1. Identify the main house/building roof (not the garage, shed, or neighbouring properties)
2. Estimate the roof dimensions in metres (width x depth)
3. Calculate the approximate roof footprint in m²
4. Note if the roof is simple (rectangle) or complex (multiple angles, extensions, L-shape etc)

A standard Melbourne brick veneer house is typically 10-15m wide and 12-18m deep.
Compare the roof to the surrounding features — driveways, pools, gardens — to calibrate your estimate.

Return ONLY this JSON:
{
  "roof_m2": 165,
  "roof_width_m": 13,
  "roof_depth_m": 13,
  "roof_description": "Estimated 13m x 13m single-storey roof — average size for the street",
  "roof_complexity": "simple|moderate|complex",
  "confidence": "high|medium|low",
  "confidence_reason": "Clear satellite image, rectangular roof easily measured against driveway"
}

Rules:
- roof_m2: integer, your best estimate of the house footprint only (not land size)
- roof_complexity: simple = rectangle, moderate = L-shape or small extension, complex = many angles/large extensions
- confidence: high if image is clear and roof is visible, medium if partially obscured, low if image quality is poor
- Return ONLY the JSON, no markdown, no explanation`;

export async function POST(request) {
  try {
    const { address } = await request.json();
    if (!address?.trim()) {
      return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    const googleKey = process.env.GOOGLE_MAPS_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!googleKey || !anthropicKey) {
      return NextResponse.json({ roof_m2: 160, roof_description: "160m² default — API keys not configured", confidence: "low" });
    }

    // Step 1: Geocode the address to get lat/lng
    const geocodeRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`);
    const geocodeData = await geocodeRes.json();

    if (!geocodeData.results?.length) {
      return NextResponse.json({ roof_m2: 160, roof_description: "160m² default — address not found", confidence: "low" });
    }

    const { lat, lng } = geocodeData.results[0].geometry.location;

    // Step 2: Get satellite image — zoom 19 gives ~0.3m per pixel, clear enough to see roof
    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=19&size=640x640&maptype=satellite&key=${googleKey}`;
    const imageRes = await fetch(mapUrl);

    if (!imageRes.ok) {
      return NextResponse.json({ roof_m2: 160, roof_description: "160m² default — satellite image unavailable", confidence: "low" });
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");
    const contentType = imageRes.headers.get("content-type") || "image/png";

    // Step 3: Send satellite image to Claude vision
    const visionRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system: VISION_PROMPT,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: contentType, data: base64Image }
            },
            {
              type: "text",
              text: `This is a satellite image of ${address} in Melbourne. Estimate the roof size of the main house only.`
            }
          ]
        }]
      })
    });

    const visionData = await visionRes.json();
    if (visionData.error) {
      return NextResponse.json({ roof_m2: 160, roof_description: "160m² default — vision failed", confidence: "low" });
    }

    const visionText = (visionData.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    let roofData = null;
    const m1 = visionText.match(/\{[\s\S]*\}/);
    if (m1) { try { roofData = JSON.parse(m1[0]); } catch {} }
    if (!roofData) {
      const stripped = visionText.replace(/```json|```/g, "").trim();
      const m2 = stripped.match(/\{[\s\S]*\}/);
      if (m2) { try { roofData = JSON.parse(m2[0]); } catch {} }
    }

    return NextResponse.json(roofData || { roof_m2: 160, roof_description: "160m² default — parse failed", confidence: "low" });

  } catch (err) {
    return NextResponse.json({ roof_m2: 160, roof_description: "160m² default — " + err.message, confidence: "low" });
  }
}
