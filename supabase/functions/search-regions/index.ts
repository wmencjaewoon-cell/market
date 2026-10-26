import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const body = await req.json();
    const query = body?.query;

    if (!query || typeof query !== "string" || query.trim().length > 120) {
      return new Response(
        JSON.stringify({ error: "query is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const restKey = Deno.env.get("KAKAO_REST_API_KEY");

    if (!restKey) {
      return new Response(
        JSON.stringify({ error: "KAKAO_REST_API_KEY is missing" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const headers = { Authorization: `KakaoAK ${restKey}` };
    const addressUrl = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query.trim())}&size=15`;
    const keywordUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query.trim())}&size=15`;
    const [addressRes, keywordRes] = await Promise.all([
      fetch(addressUrl, { method: "GET", headers }),
      fetch(keywordUrl, { method: "GET", headers }),
    ]);
    const [addressText, keywordText] = await Promise.all([addressRes.text(), keywordRes.text()]);
    if (!addressRes.ok && !keywordRes.ok) {
      return new Response(
        JSON.stringify({
          error: "Kakao API error",
          status: addressRes.status,
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const addressData = addressRes.ok ? JSON.parse(addressText) : { documents: [] };
    const keywordData = keywordRes.ok ? JSON.parse(keywordText) : { documents: [] };
    const rawDocuments = [...(addressData?.documents || []), ...(keywordData?.documents || [])];
    const seen = new Set<string>();
    const documents = rawDocuments.flatMap((doc: any) => {
      const roadAddress = doc.road_address_name || doc.road_address?.address_name || '';
      const jibunAddress = doc.address_name || doc.address?.address_name || '';
      const key = `${doc.x}:${doc.y}`;
      if (!doc.x || !doc.y || seen.has(key)) return [];
      seen.add(key);
      const regionName =
        roadAddress || jibunAddress || doc.place_name || '';

      return [{
        id: doc.id || key,
        place_name: doc.place_name || doc.road_address?.building_name || '',
        address_name: jibunAddress,
        road_address_name: roadAddress,
        zonecode: doc.road_address?.zone_no || '',
        bcode: doc.address?.b_code || '',
        region_name: regionName,
        x: doc.x,
        y: doc.y,
      }];
    }).slice(0, 15);

    return new Response(
      JSON.stringify({ items: documents }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
