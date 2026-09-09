import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const activityRetentionMs = 90 * 24 * 60 * 60 * 1000;
const allowedEventTypes = new Set(["login", "logout"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(message: string, status = 400, detail?: unknown) {
  return jsonResponse({ error: message, detail }, status);
}

function firstHeader(headers: Headers, names: string[]) {
  for (const name of names) {
    const value = headers.get(name);
    if (value?.trim()) return value.trim();
  }
  return null;
}

function getIpAddress(headers: Headers) {
  const directIp = firstHeader(headers, [
    "cf-connecting-ip",
    "x-real-ip",
    "x-client-ip",
    "fly-client-ip",
    "x-vercel-forwarded-for",
    "x-forwarded-for",
  ]);

  if (!directIp) return null;

  const firstIp = directIp.split(",")[0]?.trim();
  if (!firstIp || firstIp.toLowerCase() === "unknown") return null;

  const ipWithoutPort = firstIp.match(/^\d{1,3}(\.\d{1,3}){3}:\d+$/)
    ? firstIp.split(":")[0]
    : firstIp;

  return /^[0-9a-fA-F:.]+$/.test(ipWithoutPort) ? ipWithoutPort : null;
}

function getNumberHeader(headers: Headers, names: string[]) {
  const rawValue = firstHeader(headers, names);
  if (!rawValue) return null;

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function cleanText(value: unknown, maxLength = 200) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return trimmed.slice(0, maxLength);
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return errorResponse("Method not allowed", 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return errorResponse("Supabase 환경변수가 필요합니다.", 500, {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasAnonKey: Boolean(anonKey),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });
    }

    const authorization = req.headers.get("Authorization") || "";

    if (!authorization) {
      return errorResponse("로그인이 필요합니다.", 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return errorResponse(
        "로그인 사용자를 확인하지 못했습니다.",
        401,
        userError?.message
      );
    }

    const body = await req.json().catch(() => ({}));
    const eventType = cleanText(body.eventType, 40);

    if (!eventType || !allowedEventTypes.has(eventType)) {
      return errorResponse("지원하지 않는 접속기록 이벤트입니다.", 400);
    }

    const ipAddress = getIpAddress(req.headers);
    const country = firstHeader(req.headers, [
      "cf-ipcountry",
      "x-vercel-ip-country",
      "x-country-code",
      "x-geo-country",
    ]);
    const region = firstHeader(req.headers, [
      "x-vercel-ip-country-region",
      "x-region",
      "x-geo-region",
    ]);
    const city = firstHeader(req.headers, [
      "x-vercel-ip-city",
      "x-city",
      "x-geo-city",
    ]);
    const latitude = getNumberHeader(req.headers, [
      "x-vercel-ip-latitude",
      "x-geo-latitude",
      "cf-iplatitude",
    ]);
    const longitude = getNumberHeader(req.headers, [
      "x-vercel-ip-longitude",
      "x-geo-longitude",
      "cf-iplongitude",
    ]);
    const retentionCutoff = new Date(Date.now() - activityRetentionMs).toISOString();

    const { error: cleanupError } = await adminClient
      .from("auth_activity_logs")
      .delete()
      .lt("created_at", retentionCutoff);
    const { error: insertError } = await adminClient
      .from("auth_activity_logs")
      .insert({
        user_id: user.id,
        event_type: eventType,
        ip_address: ipAddress,
        country: cleanText(country, 80),
        region: cleanText(region, 120),
        city: cleanText(city, 120),
        latitude,
        longitude,
        timezone: cleanText(body.timezone, 120),
        platform: cleanText(body.platform, 40),
        app_version: cleanText(body.appVersion, 60),
        device_name: cleanText(body.deviceName, 120),
        os_name: cleanText(body.osName, 80),
        os_version: cleanText(body.osVersion, 80),
        user_agent: cleanText(req.headers.get("user-agent"), 500),
      });

    if (insertError) {
      return errorResponse("접속기록 저장에 실패했습니다.", 500, insertError.message);
    }

    return jsonResponse({ ok: true });
  } catch (error) {    return errorResponse(
      "접속기록 저장 중 오류가 발생했습니다.",
      500,
      error instanceof Error ? error.message : error
    );
  }
});
