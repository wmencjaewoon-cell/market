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

    const {
      listingId,
      authorId,
      title,
      changeType,
      oldPrice,
      newPrice,
    } = await req.json();

    if (!listingId || !changeType) {
      return new Response(JSON.stringify({ error: 'missing params' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const headers = {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    };

    const favRes = await fetch(
      `${SUPABASE_URL}/rest/v1/favorites?listing_id=eq.${listingId}&select=user_id`,
      { headers }
    );

    const favorites = await favRes.json();

    const userIds = Array.from(
      new Set(
        favorites
          .map((f: any) => f.user_id)
          .filter((id: string) => id !== authorId)
      )
    );

    if (userIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, reason: 'no favorite users' }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    const body =
      changeType === 'price'
        ? `관심 게시글의 가격이 ${oldPrice || ''} → ${newPrice || ''}로 변경됐어요.`
        : '관심 게시글의 내용이 변경됐어요.';

    for (const userId of userIds) {
      await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: userId,
          type: 'favorite_listing_updated',
          title: '관심 게시글 변경 알림',
          body,
          data: {
            listingId,
            changeType,
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
        title: '관심 게시글 변경 알림',
        body,
        data: {
          type: 'favorite_listing_updated',
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