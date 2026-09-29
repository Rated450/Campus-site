// Runs automatically once a day (see the `config.schedule` line at the bottom).
// Pulls upcoming CU Boulder events from the public Localist calendar API
// and saves them to Netlify Blobs so the site can read them instantly.
import { getStore } from "@netlify/blobs";

const SOURCES = [
  "https://calendar.colorado.edu/api/2.1/events?days=60&pp=100",
];

function mapEvent(raw) {
  const ev = raw.event || raw;
  const inst =
    (ev.event_instances && ev.event_instances[0] && ev.event_instances[0].event_instance) ||
    {};
  const at = inst.start || ev.first_date;
  if (!at) return null;
  return {
    id: "live-" + ev.id,
    title: ev.title || "CU Boulder event",
    desc: (ev.description_text || ev.description || "").replace(/\s+/g, " ").slice(0, 260) || "See the source link for details.",
    place: ev.location_name || ev.room_number || "CU Boulder campus",
    at,
    tba: inst.all_day ? 1 : 0,
    cat: "Campus",
    src: ev.localist_url || ev.url || "https://calendar.colorado.edu/",
  };
}

export default async () => {
  const store = getStore("campus-data");
  let events = [];
  let error = null;

  for (const url of SOURCES) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const list = (data.events || []).map(mapEvent).filter(Boolean);
      events = events.concat(list);
    } catch (err) {
      error = String(err);
    }
  }

  await store.setJSON("events", {
    updatedAt: new Date().toISOString(),
    ok: events.length > 0,
    error,
    events,
  });

  return new Response(
    JSON.stringify({ saved: events.length, error }),
    { headers: { "content-type": "application/json" } }
  );
};

// Runs once a day automatically. No cron setup needed on your end.
export const config = { schedule: "@daily" };
