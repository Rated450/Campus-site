// Runs automatically once a day (see the `config.schedule` line at the bottom).
// Pulls upcoming CU Boulder events from the public Localist calendar API,
// finds a real matching photo for each from Unsplash, and saves everything
// to Netlify Blobs so the site can read it instantly.
import { getStore } from "@netlify/blobs";

const SOURCES = [
  "https://calendar.colorado.edu/api/2.1/events?days=60&pp=100",
];

const UNSPLASH_KEY = process.env.UNSPLASH_KEY;
const photoCache = new Map(); // avoid asking Unsplash for the same query twice in one run

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
    _type: (ev.type_name || ev.filters?.event_types?.[0]?.name || "").toLowerCase(),
  };
}

// Turn an event into a short, generic search phrase — never the exact event
// name, since Unsplash won't have a photo of an event that hasn't happened.
function searchQuery(ev) {
  const t = (ev.title + " " + ev._type).toLowerCase();
  if (/football|game|vs\.?\s/.test(t)) return "college football stadium crowd";
  if (/concert|music|open mic|show/.test(t)) return "concert crowd stage lights";
  if (/hike|outdoor|climb/.test(t)) return "hiking mountains outdoors";
  if (/career|startup|pitch|workshop/.test(t)) return "college students workshop";
  if (/art|gallery|museum|culture/.test(t)) return "art gallery exhibit";
  if (/soccer|basketball|sport/.test(t)) return "college sports game";
  if (/lecture|seminar|talk/.test(t)) return "university lecture hall";
  return "university campus students";
}

async function unsplashPhoto(query) {
  if (!UNSPLASH_KEY) return null;
  if (photoCache.has(query)) return photoCache.get(query);
  try {
    const res = await fetch(
      "https://api.unsplash.com/search/photos?per_page=1&orientation=landscape&query=" +
        encodeURIComponent(query),
      { headers: { Authorization: "Client-ID " + UNSPLASH_KEY } }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const hit = data.results && data.results[0];
    const photo = hit
      ? {
          url: hit.urls.regular,
          credit: hit.user?.name || "Unsplash",
          creditUrl: hit.user?.links?.html || "https://unsplash.com",
        }
      : null;
    photoCache.set(query, photo);
    return photo;
  } catch {
    photoCache.set(query, null);
    return null;
  }
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

  // Fetch a real photo per event (capped so a big event list can't blow
  // through Unsplash's hourly free-tier limit in one run).
  const LIMIT = 40;
  for (const ev of events.slice(0, LIMIT)) {
    ev.photo = await unsplashPhoto(searchQuery(ev));
    delete ev._type;
  }
  events.slice(LIMIT).forEach((ev) => delete ev._type);

  await store.setJSON("events", {
    updatedAt: new Date().toISOString(),
    ok: events.length > 0,
    error,
    events,
  });

  return new Response(
    JSON.stringify({ saved: events.length, error, photosOn: !!UNSPLASH_KEY }),
    { headers: { "content-type": "application/json" } }
  );
};

// Runs once a day automatically. No cron setup needed on your end.
export const config = { schedule: "@daily" };
