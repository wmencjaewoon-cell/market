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

    if (!query || typeof query !== "string") {
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

    const url =
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=15`;

    const kakaoRes = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `KakaoAK ${restKey}`,
      },
    });

    const kakaoText = await kakaoRes.text();
    console.log("kakao status:", kakaoRes.status);
    console.log("kakao response:", kakaoText);

    if (!kakaoRes.ok) {
      return new Response(
        JSON.stringify({
          error: "Kakao API error",
          status: kakaoRes.status,
          raw: kakaoText,
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

    const kakaoData = JSON.parse(kakaoText);

    const documents = (kakaoData?.documents || []).map((doc: any) => {
      const regionName =
        doc.address_name ||
        [doc.road_address_name, doc.place_name].filter(Boolean).join(" ");

      return {
        id: doc.id,
        place_name: doc.place_name,
        address_name: doc.address_name,
        road_address_name: doc.road_address_name,
        region_name: regionName,
        x: doc.x,
        y: doc.y,
      };
    });

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
    console.log("search-regions error:", e);

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