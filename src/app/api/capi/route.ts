import { createHash } from "node:crypto";

export const runtime = "nodejs";

const PIXEL_ID = "1991322191417716";
const GRAPH = "https://graph.facebook.com/v21.0";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

// Normaliza segun spec de Meta: minusculas, sin espacios. Telefono solo digitos (con pais).
function normPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  // Asume AR si viene sin codigo de pais y arranca con 0 o 11/15
  if (digits.length >= 10 && !digits.startsWith("54")) return "54" + digits.replace(/^0/, "");
  return digits;
}

export async function POST(req: Request) {
  const token = process.env.META_CAPI_TOKEN;
  const secret = process.env.CAPI_WEBHOOK_SECRET;
  if (!token) return Response.json({ error: "META_CAPI_TOKEN no configurado" }, { status: 500 });

  // Auth simple por secreto (header o query)
  const url = new URL(req.url);
  const provided = req.headers.get("x-capi-secret") || url.searchParams.get("secret");
  if (secret && provided !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "body invalido (JSON)" }, { status: 400 });
  }

  const phone = typeof body.phone === "string" ? body.phone : "";
  const email = typeof body.email === "string" ? body.email : "";
  const firstName = typeof body.first_name === "string" ? body.first_name : "";
  const lastName = typeof body.last_name === "string" ? body.last_name : "";
  const eventName = typeof body.event_name === "string" ? body.event_name : "Schedule";
  const eventId = typeof body.event_id === "string" ? body.event_id : undefined;

  if (!phone && !email) {
    return Response.json({ error: "se requiere phone o email" }, { status: 400 });
  }

  const user_data: Record<string, string[]> = {};
  if (phone) user_data.ph = [sha256(normPhone(phone))];
  if (email) user_data.em = [sha256(email.trim().toLowerCase())];
  if (firstName) user_data.fn = [sha256(firstName.trim().toLowerCase())];
  if (lastName) user_data.ln = [sha256(lastName.trim().toLowerCase())];

  const event: Record<string, unknown> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "system_generated",
    user_data,
  };
  if (eventId) event.event_id = eventId;

  const params = new URLSearchParams();
  params.set("access_token", token);
  params.set("data", JSON.stringify([event]));
  if (typeof body.test_event_code === "string") params.set("test_event_code", body.test_event_code);

  const res = await fetch(`${GRAPH}/${PIXEL_ID}/events`, { method: "POST", body: params });
  const json = await res.json();
  return Response.json({ sent: { event_name: eventName }, meta: json }, { status: res.ok ? 200 : 502 });
}
