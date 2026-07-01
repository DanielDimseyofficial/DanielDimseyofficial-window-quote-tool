import { NextResponse } from "next/server";
import { saveJob } from "@/lib/jobs";

// This endpoint receives a POST from Zapier/Make when a new lead hits your Google Sheet.
// In Zapier: Trigger = "New Row in Google Sheet" → Action = "POST Webhook" to this URL.
// Expected payload from Zapier (map your Sheet columns to these field names):
// {
//   "address": "42 Elm Street Hawthorn VIC 3122",
//   "bedrooms": "3",
//   "storeys": "Single storey",       // or "Double storey"
//   "propType": "House",              // or "Unit / apartment", "Townhouse"
//   "customerName": "John Smith",
//   "customerPhone": "0412 345 678",
//   "extraNotes": "Has a pool",
//   "source": "Website form",
//   "webhookSecret": "YOUR_SECRET_HERE"  // set this in Vercel env vars as WEBHOOK_SECRET
// }

export async function POST(request) {
  try {
    const body = await request.json();

    // Simple secret validation — set WEBHOOK_SECRET in Vercel env vars
    // and include the same value in your Zapier webhook payload
    const secret = process.env.WEBHOOK_SECRET;
    if (secret && body.webhookSecret !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { address, bedrooms, storeys, propType, customerName, customerPhone, extraNotes, source } = body;

    if (!address) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    // Save lead as a pending job (status = "lead") without a quote yet
    const job = {
      id: Date.now().toString(),
      status: "lead",
      address,
      bedrooms: bedrooms || "3",
      storeys: storeys || "Single storey",
      propType: propType || "House",
      customerName: customerName || "",
      customerPhone: customerPhone || "",
      extraNotes: extraNotes || "",
      source: source || "Webhook",
      createdAt: new Date().toISOString(),
    };

    // Auto-trigger a quote by calling our own quote API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    try {
      const quoteRes = await fetch(`${baseUrl}/api/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, bedrooms: job.bedrooms, storeys: job.storeys, propType: job.propType, extraNotes }),
      });
      if (quoteRes.ok) {
        const quoteData = await quoteRes.json();
        job.quote = quoteData;
        job.quotedPrice = quoteData.windows?.standard?.opening;
        job.estimatedHours = quoteData.windows?.standard?.time;
        job.status = "quoted";
      }
    } catch {
      // Quote failed — still save the lead so it shows up in the app
      job.quoteError = "Auto-quote failed — open the app to generate manually";
    }

    await saveJob(job);

    return NextResponse.json({ success: true, jobId: job.id, status: job.status });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
