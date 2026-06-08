import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error('Missing env');
    }

    const { listingId, title, content, region, authorId } = await req.json();

    if (!listingId || !title) {
      return new Response(JSON.stringify({ error: 'missing listing data' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const headers = {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    };

    const alertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/keyword_alerts?is_active=eq.true&select=id,user_id,keyword`,
      { headers }
    );

    const alerts = await alertRes.json();

    const searchText = `${title} ${content || ''} ${region || ''}`.toLowerCase();

    const matched = alerts.filter((alert: any) => {
      if (alert.user_id === authorId) return false;
      return searchText.includes(String(alert.keyword).toLowerCase());
    });

    if (matched.length === 0) {
      return new Response(JSON.stringify({ ok: true, reason: 'no matched keyword' }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    const userIds = Array.from(new Set(matched.map((m: any) => m.user_id)));

    for (const userId of userIds) {
      const userMatches = matched.filter((m: any) => m.user_id === userId);
      const keywordText = userMatches[0]?.keyword || '관심 키워드';

      await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: userId,
          type: 'keyword_listing',
          title: '키워드 알림',
          body: `"${keywordText}" 관련 새 게시글이 올라왔어요.`,
          data: {
            listingId,
            keyword: keywordText,
          },
        }),
      });

      const tokenRes = await fetch(
        `${SUPABASE_URL}/rest/v1/push_tokens?user_id=eq.${userId}&select=token`,
        { headers }
      );

      const tokens = await tokenRes.json();

      if (!tokens || tokens.length === 0) continue;

      const expoMessages = tokens.map((row: any) => ({
        to: row.token,
        sound: 'default',
        title: '키워드 알림',
        body: `"${keywordText}" 관련 새 게시글이 올라왔어요.`,
        data: {
          type: 'keyword_listing',
          listingId,
        },
      }));

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expoMessages),
      });
    }

    return new Response(JSON.stringify({ ok: true, count: userIds.length }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});