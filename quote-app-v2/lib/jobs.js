// Job storage — uses Vercel KV in production, local JSON file in development
// Vercel KV is a simple key-value store, free tier is generous for this use case

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const JOBS_KEY = "window_quote_jobs";

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

async function kvSet(key, value) {
  await fetch(`${KV_URL}/set/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(JSON.stringify(value)),
  });
}

// In-memory fallback for when KV is not configured (local dev / preview)
const memStore = {};

export async function getJobs() {
  try {
    if (KV_URL && KV_TOKEN) {
      return (await kvGet(JOBS_KEY)) || [];
    }
    return memStore[JOBS_KEY] || [];
  } catch {
    return memStore[JOBS_KEY] || [];
  }
}

export async function saveJob(job) {
  const jobs = await getJobs();
  const existingIndex = jobs.findIndex(j => j.id === job.id);
  if (existingIndex >= 0) {
    jobs[existingIndex] = { ...jobs[existingIndex], ...job, updatedAt: new Date().toISOString() };
  } else {
    jobs.unshift({ ...job, id: job.id || Date.now().toString(), createdAt: new Date().toISOString() });
  }
  try {
    if (KV_URL && KV_TOKEN) {
      await kvSet(JOBS_KEY, jobs);
    } else {
      memStore[JOBS_KEY] = jobs;
    }
  } catch {
    memStore[JOBS_KEY] = jobs;
  }
  return jobs;
}

export async function deleteJob(id) {
  const jobs = await getJobs();
  const filtered = jobs.filter(j => j.id !== id);
  try {
    if (KV_URL && KV_TOKEN) {
      await kvSet(JOBS_KEY, filtered);
    } else {
      memStore[JOBS_KEY] = filtered;
    }
  } catch {
    memStore[JOBS_KEY] = filtered;
  }
  return filtered;
}
