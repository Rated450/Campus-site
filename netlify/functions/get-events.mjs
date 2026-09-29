// Called by the website every time someone visits. Just reads whatever
// fetch-events.mjs saved most recently — fast, and never talks to CU directly.
import { getStore } from "@netlify/blobs";

export default async () => {
  const store = getStore("campus-data");
  const data = (await store.get("events", { type: "json" })) || {
    updatedAt: null,
    ok: false,
    events: [],
  };
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300",
    },
  });
};
