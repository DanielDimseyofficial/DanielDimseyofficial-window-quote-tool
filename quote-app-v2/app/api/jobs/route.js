import { NextResponse } from "next/server";
import { getJobs, saveJob, deleteJob } from "@/lib/jobs";

export async function GET() {
  try {
    const jobs = await getJobs();
    return NextResponse.json(jobs);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const job = await request.json();
    const jobs = await saveJob(job);
    return NextResponse.json(jobs);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { id } = await request.json();
    const jobs = await deleteJob(id);
    return NextResponse.json(jobs);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
