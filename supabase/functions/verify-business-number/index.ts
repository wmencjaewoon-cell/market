import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
};

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const { businessNumber } = await req.json();

    if (!businessNumber || typeof businessNumber !== "string") {
      return jsonResponse(
        { valid: false, error: "사업자등록번호가 필요합니다." },
        400
      );
    }

    const cleanNumber = businessNumber.replace(/[^0-9]/g, "");

    if (cleanNumber.length !== 10) {
      return jsonResponse(
        { valid: false, error: "사업자등록번호는 10자리여야 합니다." },
        400
      );
    }

    const serviceKey = Deno.env.get("BUSINESS_API_KEY");

    if (!serviceKey) {
      return jsonResponse(
        { valid: false, error: "API 키가 설정되지 않았습니다." },
        500
      );
    }

    const url = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(
      serviceKey
    )}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        b_no: [cleanNumber],
      }),
    });

    const result = await response.json();
    const item = result?.data?.[0];

    if (!item) {
      return jsonResponse({
        valid: false,
        error: "조회 결과가 없습니다.",
        raw: result,
      });
    }

    const businessStatusCode = String(item?.b_stt_cd ?? "");
    const businessStatus = String(item?.b_stt ?? item?.tax_type ?? "");
    const isActiveBusiness =
      businessStatusCode === "01" || businessStatus.includes("계속");

    if (!isActiveBusiness) {
      return jsonResponse({
        valid: false,
        error: "휴업 또는 폐업 사업자는 가게 인증을 신청할 수 없습니다.",
        businessNumber: cleanNumber,
        status: item?.b_stt ?? item?.tax_type ?? null,
        raw: item,
      });
    }

    return jsonResponse({
      valid: true,
      businessNumber: cleanNumber,
      status: item?.b_stt ?? item?.tax_type ?? null,
      raw: item,
    });
  } catch (error) {
    return jsonResponse(
      {
        valid: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});
