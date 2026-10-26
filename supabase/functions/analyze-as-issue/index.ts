import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

import {
  AS_MEDIA_BUCKET,
  AS_MIME_EXTENSIONS,
  applyAsSafetyPolicy,
  inputSafetyResult,
  parseAnalysisInput,
  type AsAnalysisRecord,
  type AsGuide,
} from '../_shared/asAnalysis.ts';

// 기존 Gemini 파일에 들어 있던 파일 시그니처 검증 함수만 재사용합니다.
// Gemini API 자체는 더 이상 사용하지 않습니다.
import {
  mediaSignatureMatches,
} from '../_shared/asGemini.ts';


const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':
    'POST, OPTIONS',
};


const json = (
  body: unknown,
  status = 200,
) =>
  new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...cors,
        'Content-Type':
          'application/json',
        'Cache-Control':
          'no-store',
      },
    },
  );


const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


function publicRecord(
  row: AsAnalysisRecord,
) {
  return {
    id:
      row.id,

    status:
      row.status,

    result:
      row.result,

    error_message:
      row.error_message,

    created_at:
      row.created_at,
  };
}


function databaseFailure(
  message: string,
) {
  const messages = {
    ANALYSIS_DAILY_LIMIT:
      '최근 24시간 동안 분석 답변 5회를 모두 이용했습니다. 실패한 분석은 횟수에 포함되지 않습니다.',

    ANALYSIS_RATE_LIMIT:
      '요청이 너무 빠르게 이어지고 있습니다. 잠시 후 다시 시도해 주세요. 실패한 분석은 이용 횟수에 포함되지 않습니다.',

    ANALYSIS_BUSY:
      '이미 분석 중입니다. 잠시 후 결과 확인을 눌러 주세요.',

    ANALYSIS_RETRY_LIMIT:
      '이 분석의 재시도 횟수를 초과했습니다. 새 분석이나 상담을 요청해 주세요.',

    ANALYSIS_EXPIRED:
      '첨부 대기 시간이 지났습니다. 새 분석을 시작해 주세요.',

    ANALYSIS_LEASE_EXPIRED:
      '분석 대기 시간이 초과되었습니다. 결과를 확인하거나 다시 시도해 주세요.',
  };


  for (
    const [code, error]
    of Object.entries(messages)
  ) {
    if (
      message.includes(code)
    ) {
      return {
        code,
        error,
      };
    }
  }


  return {
    code:
      'AS_AI_DATABASE_ERROR',

    error:
      '분석 기록을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  };
}


class AnalysisDatabaseError
  extends Error {

  constructor(
    readonly failure:
      ReturnType<
        typeof databaseFailure
      >,
  ) {
    super(
      failure.error,
    );
  }
}


class AiBackendError
  extends Error {

  constructor(
    message: string,

    readonly code =
      'AS_AI_BACKEND_ERROR',

    readonly httpStatus:
      number | null = null,
  ) {
    super(message);

    this.name =
      'AiBackendError';
  }
}


Deno.serve(
  async (req) => {

    // ==========================================
    // CORS
    // ==========================================

    if (
      req.method === 'OPTIONS'
    ) {
      return new Response(
        'ok',
        {
          headers: cors,
        },
      );
    }


    if (
      req.method !== 'POST'
    ) {
      return json(
        {
          error:
            'POST 요청만 지원합니다.',
        },
        405,
      );
    }


    // ==========================================
    // Supabase 환경변수
    // ==========================================

    const url =
      Deno.env.get(
        'SUPABASE_URL',
      );


    const anonKey =
      Deno.env.get(
        'SUPABASE_ANON_KEY',
      );


    const serviceKey =
      Deno.env.get(
        'SUPABASE_SERVICE_ROLE_KEY',
      );


    if (
      !url
      || !anonKey
      || !serviceKey
    ) {
      return json(
        {
          error:
            '분석 서버 설정이 필요합니다.',
        },
        503,
      );
    }


    // ==========================================
    // 로그인 확인
    // ==========================================

    const auth =
      req.headers.get(
        'Authorization',
      );


    if (
      !auth?.startsWith(
        'Bearer ',
      )
    ) {
      return json(
        {
          error:
            '로그인이 필요합니다.',
        },
        401,
      );
    }


    const viewer =
      createClient(
        url,
        anonKey,
        {
          global: {
            headers: {
              Authorization:
                auth,
            },
          },
        },
      );


    const {
      data: {
        user,
      },

      error:
        authError,

    } =
      await viewer
        .auth
        .getUser();


    if (
      authError
      || !user
    ) {
      return json(
        {
          error:
            '로그인 상태를 확인해 주세요.',
        },
        401,
      );
    }


    // ==========================================
    // Service Role DB
    // ==========================================

    const db =
      createClient(
        url,
        serviceKey,
        {
          auth: {
            persistSession:
              false,
          },
        },
      );


    const {
      data:
        profile,

      error:
        profileError,

    } =
      await db
        .from('profiles')
        .select(
          'status,role',
        )
        .eq(
          'id',
          user.id,
        )
        .maybeSingle();


    if (
      profileError
      || !profile
      || [
        'blocked',
        'deletion_pending',
      ].includes(
        profile.status,
      )
    ) {
      return json(
        {
          error:
            '이 계정은 분석을 이용할 수 없습니다.',
        },
        403,
      );
    }


    // ==========================================
    // 요청 Body
    // ==========================================

    let body:
      Record<string, unknown>;


    try {

      const raw =
        await req.text();


      if (
        raw.length > 20000
      ) {
        return json(
          {
            error:
              '요청이 너무 큽니다.',
          },
          413,
        );
      }


      body =
        JSON.parse(raw);


      if (
        !body
        || typeof body
          !== 'object'
        || Array.isArray(
          body,
        )
      ) {
        throw new Error();
      }

    } catch {

      return json(
        {
          error:
            '잘못된 분석 요청입니다.',
        },
        400,
      );
    }


    const id =
      typeof body.id === 'string'
        ? body.id
        : '';


    if (
      !uuid.test(id)
    ) {
      return json(
        {
          error:
            '분석 번호가 올바르지 않습니다.',
        },
        400,
      );
    }


    // ==========================================
    // STATUS
    // ==========================================

    if (
      body.action === 'status'
    ) {

      const {
        data,
        error,
      } =
        await db
          .from(
            'as_ai_analyses',
          )
          .select('*')
          .eq(
            'id',
            id,
          )
          .eq(
            'user_id',
            user.id,
          )
          .maybeSingle();


      if (
        error
        || !data
      ) {
        return json(
          {
            error:
              '분석 기록을 찾을 수 없습니다.',
          },
          404,
        );
      }


      return json(
        {
          analysis:
            publicRecord(
              data,
            ),
        },
      );
    }


    // ==========================================
    // 관리자 테스트 제한
    // ==========================================

    if (
      Deno.env.get(
        'AS_AI_ACCESS_MODE',
      ) !== 'public'
      && profile.role
        !== 'admin'
    ) {
      return json(
        {
          code:
            'AS_AI_ADMIN_ONLY',

          error:
            'AI 답변은 현재 관리자 테스트 중입니다. 답변 없이 상담을 요청해 주세요.',
        },
        403,
      );
    }


    // ==========================================
    // WMENC FastAPI 설정
    // ==========================================

    const backendUrl =
      Deno.env.get(
        'AS_AI_BACKEND_URL',
      );


    const backendSecret =
      Deno.env.get(
        'AS_AI_BACKEND_SECRET',
      );


    const model =
      Deno.env.get(
        'AS_AI_MODEL',
      )
      || 'qwen3-vl:8b-instruct';


    if (
      Deno.env.get(
        'AS_AI_ENABLED',
      ) !== 'true'
      || !backendUrl
      || !backendSecret
    ) {
      return json(
        {
          code:
            'AS_AI_UNAVAILABLE',

          error:
            'AI 분석 서버가 아직 준비되지 않았습니다.',
        },
        503,
      );
    }


    // ==========================================
// CLARIFICATION
// ==========================================

if (
  body.action === 'clarify'
) {
  const value =
    typeof body.value === 'string'
      ? body.value.trim()
      : '';

  if (
    !value
    || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/
      .test(value)
  ) {
    return json(
      {
        error:
          '추가 확인 답변이 올바르지 않습니다.',
      },
      400,
    );
  }

  const {
    data,
    error,
  } =
    await db.rpc(
      'reopen_as_ai_analysis_for_clarification',
      {
        p_id:
          id,

        p_user_id:
          user.id,

        p_value:
          value,
      },
    );

  if (error) {
    if (
      error.message.includes(
        'ANALYSIS_NOT_FOUND',
      )
    ) {
      return json(
        {
          error:
            '분석 기록을 찾을 수 없습니다.',
        },
        404,
      );
    }

    if (
      error.message.includes(
        'INVALID_CLARIFICATION_OPTION',
      )
    ) {
      return json(
        {
          error:
            '선택할 수 없는 답변입니다. 다시 확인해 주세요.',
        },
        400,
      );
    }

    if (
      error.message.includes(
        'ANALYSIS_CLARIFICATION_ALREADY_USED',
      )
    ) {
      return json(
        {
          error:
            '추가 확인은 한 번만 진행할 수 있습니다.',
        },
        409,
      );
    }

    if (
      error.message.includes(
        'ANALYSIS_CLARIFICATION_NOT_REQUIRED',
      )
      || error.message.includes(
        'ANALYSIS_CLARIFICATION_MISSING',
      )
    ) {
      return json(
        {
          error:
            '현재 분석에는 추가 확인이 필요하지 않습니다.',
        },
        409,
      );
    }

    if (
      error.message.includes(
        'ANALYSIS_NOT_COMPLETED',
      )
    ) {
      return json(
        {
          error:
            '기존 분석이 아직 완료되지 않았습니다.',
        },
        409,
      );
    }

    console.error(
      'reopen_as_ai_analysis_for_clarification failed',
      {
        message:
          error.message,
      },
    );

    return json(
      {
        error:
          '추가 확인 답변을 저장하지 못했습니다.',
      },
      500,
    );
  }

  return json(
    {
      analysis:
        publicRecord(
          data,
        ),
    },
  );
}

    // ==========================================
    // PREPARE
    // ==========================================

    if (
      body.action === 'prepare'
    ) {

      let input;


      try {

        input =
          parseAnalysisInput(
            body.input,
          );

      } catch (error) {

        return json(
          {
            error:
              (
                error as Error
              ).message,
          },
          400,
        );
      }

      if (input.home_id) {
        const { data: ownedHome, error: homeError } = await db
          .from('user_homes')
          .select('id')
          .eq('id', input.home_id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (homeError || !ownedHome) {
          return json({ error: '선택한 집을 확인할 수 없습니다.' }, 403);
        }
      }


      const media =
        input.media.map(
          (
            spec,
            index,
          ) => ({
            ...spec,

            path:
              `${user.id}/${id}/${index}.${AS_MIME_EXTENSIONS[spec.mime_type]}`,
          }),
        );


      const {
        data,
        error,
      } =
        await db.rpc(
          'reserve_as_ai_analysis',
          {
            p_id:
              id,

            p_user_id:
              user.id,

            p_input:
              input,

            p_media:
              media,
          },
        );


      if (error) {

        return json(
          databaseFailure(
            error.message,
          ),

          error.message.includes(
            'LIMIT',
          )
            ? 429
            : 409,
        );
      }


      if (
        data.status
          !== 'completed'
        && data.status
          !== 'processing'
      ) {

        if (
          data.attempts >= 2
        ) {
          return json(
            databaseFailure(
              'ANALYSIS_RETRY_LIMIT',
            ),
            409,
          );
        }


        if (
          Date.parse(
            data.created_at,
          )
          < Date.now()
            - 86400000
        ) {
          return json(
            databaseFailure(
              'ANALYSIS_EXPIRED',
            ),
            409,
          );
        }
      }


      return json(
        {
          analysis:
            publicRecord(
              data,
            ),

          media,
        },
      );
    }


    // ==========================================
    // ANALYZE 외의 Action 차단
    // ==========================================

    if (
      body.action
        !== 'analyze'
    ) {
      return json(
        {
          error:
            '지원하지 않는 요청입니다.',
        },
        400,
      );
    }


    // ==========================================
    // 분석 작업 Claim
    // ==========================================

    const lease =
      crypto.randomUUID();


    const {
      data:
        row,

      error:
        claimError,

    } =
      await db.rpc(
        'claim_as_ai_analysis',
        {
          p_id:
            id,

          p_user_id:
            user.id,

          p_lease:
            lease,
        },
      );


    if (
      claimError
    ) {
      return json(
        databaseFailure(
          claimError.message,
        ),

        /ANALYSIS_(DAILY|RATE)_LIMIT/
          .test(
            claimError.message,
          )
          ? 429
          : 409,
      );
    }


    if (
      row.status
        === 'completed'
    ) {
      return json(
        {
          analysis:
            publicRecord(
              row,
            ),
        },
      );
    }


    // ==========================================
    // 최대 분석 시간
    // ==========================================

    const controller =
      new AbortController();


    const timeout =
      setTimeout(
        () =>
          controller.abort(),

        105000,
      );


    try {

      // ========================================
      // 저장된 입력 재검증
      // ========================================

      const input =
        parseAnalysisInput(
          row.input_payload,
        );

      let homeContext: {
        building_type: string | null;
        building_year: number | null;
        area_pyeong: number | null;
      } | null = null;

      if (input.home_id) {
        const { data: home, error: homeError } = await db
          .from('user_homes')
          .select('building_type,building_year,area_pyeong')
          .eq('id', input.home_id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (homeError || !home) {
          throw new Error('선택한 집을 확인할 수 없습니다. 새 분석을 시작해 주세요.');
        }

        const areaPyeong = Number(home.area_pyeong);

        homeContext = {
          building_type: typeof home.building_type === 'string' ? home.building_type : null,
          building_year: typeof home.building_year === 'number' ? home.building_year : null,
          area_pyeong: Number.isFinite(areaPyeong) && areaPyeong > 0 ? areaPyeong : null,
        };
      }


      // ========================================
      // 먼저 서버 안전정책 검사
      // ========================================

      let result =
        inputSafetyResult(
          input,
        );


      // 위험 입력이면 AI를 부르지 않음
      if (!result) {

        // ======================================
        // 첨부 manifest
        // ======================================

        const {
          data:
            media,

          error:
            mediaError,

        } =
          await db
            .from(
              'as_ai_media',
            )
            .select('*')
            .eq(
              'analysis_id',
              id,
            )
            .order(
              'sort_order',
            );


        if (
          mediaError
          || !media
          || media.length
            !== input.media.length
        ) {
          throw new Error(
            '첨부 정보가 불완전합니다. 다시 분석해 주세요.',
          );
        }


        // ======================================
        // 검수된 수리 가이드
        // ======================================

        const {
          data:
            guides,

          error:
            guidesError,

        } =
          await db
            .from(
              'as_repair_guides',
            )
            .select('*')
            .eq(
              'status',
              'published',
            )
            .not(
              'reviewed_at',
              'is',
              null,
            )
            .not(
              'reviewed_by',
              'is',
              null,
            );


        if (
          guidesError
        ) {
          throw new Error(
            '검수된 가이드를 확인하지 못했습니다. 상담으로 확인해 주세요.',
          );
        }


        // ======================================
        // FastAPI에 전달할 Signed URL 목록
        // ======================================

        const backendMedia:
          Array<{
            url: string;
            mime_type: string;
            bytes: number;
            duration_seconds:
              number | null;
          }> = [];


        for (
          const item
          of media
        ) {

          controller
            .signal
            .throwIfAborted();


          // ------------------------------------
          // 짧은 시간만 유효한 비공개 파일 URL
          // ------------------------------------

          const {
            data:
              signed,

            error:
              signError,

          } =
            await db
              .storage
              .from(
                AS_MEDIA_BUCKET,
              )
              .createSignedUrl(
                item.path,
                180,
              );


          if (
            signError
            || !signed?.signedUrl
          ) {
            throw new Error(
              '첨부 업로드가 완료되지 않았습니다. 다시 시도해 주세요.',
            );
          }


          // ------------------------------------
          // 실제 업로드 파일 검증
          // ------------------------------------

          const downloaded =
            await fetch(
              signed.signedUrl,
              {
                signal:
                  controller.signal,
              },
            );


          if (
            !downloaded.ok
          ) {
            throw new Error(
              '첨부파일을 불러오지 못했습니다. 다시 시도해 주세요.',
            );
          }


          const blob =
            await downloaded
              .blob();


          if (
            blob.size
              !== item.bytes
          ) {
            throw new Error(
              '첨부파일의 실제 크기가 다릅니다. 파일을 다시 선택해 주세요.',
            );
          }


          const headerBytes =
            new Uint8Array(
              await blob
                .slice(
                  0,
                  64,
                )
                .arrayBuffer(),
            );


          if (
            !mediaSignatureMatches(
              headerBytes,
              item.mime_type,
            )
          ) {
            throw new Error(
              '첨부파일의 실제 형식이 다릅니다. 파일을 다시 선택해 주세요.',
            );
          }


          backendMedia.push(
            {
              url:
                signed.signedUrl,

              mime_type:
                item.mime_type,

              bytes:
                item.bytes,

              duration_seconds:
                item.duration_seconds
                ?? null,
            },
          );
        }


        // ======================================
        // WMENC FastAPI 호출
        // ======================================

        const cleanBackendUrl =
          backendUrl.replace(
            /\/+$/,
            '',
          );


        let backendResponse:
          Response;


        try {

          backendResponse =
            await fetch(
              `${cleanBackendUrl}/analyze-supabase`,
              {
                method:
                  'POST',

                headers: {
                  'Content-Type':
                    'application/json',

                  'X-WMENC-AI-SECRET':
                    backendSecret,
                },

                body:
                  JSON.stringify(
                    {
                      analysis_id:
                        id,

                      description:
                        input.description,

                      categories:
                        input.categories,

                      symptoms:
                        input.symptoms,

                      clarification_answer:
                        input.clarification_answer
                        ?? null,

                      // Exact addresses and coordinates never leave Supabase.
                      home_context:
                        homeContext,

                      media:
                        backendMedia,
                    },
                  ),

                signal:
                  controller.signal,
              },
            );

        } catch (error) {

          if (
            controller
              .signal
              .aborted
          ) {
            throw error;
          }


          console.error(
            'WMENC AI backend connection failed',
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'unknown',
            },
          );


          throw new AiBackendError(
            '자체 AI 분석 서버에 연결하지 못했습니다.',
            'AS_AI_BACKEND_CONNECTION',
          );
        }


        // ======================================
        // FastAPI 오류 처리
        // ======================================

        if (
          !backendResponse.ok
        ) {

          let errorText =
            '';


          try {

            errorText =
              await backendResponse
                .text();

          } catch {
            // ignore
          }


          console.error(
            'WMENC AI backend failed',
            {
              status:
                backendResponse
                  .status,

              response:
                errorText
                  .slice(
                    0,
                    500,
                  ),
            },
          );


          throw new AiBackendError(
            '자체 AI 분석 서버가 요청을 처리하지 못했습니다.',
            'AS_AI_BACKEND_RESPONSE',
            backendResponse.status,
          );
        }


        // ======================================
        // FastAPI JSON
        // ======================================

        let backendData:
          Record<string, unknown>;


        try {

          backendData =
            await backendResponse
              .json();

        } catch {

          throw new AiBackendError(
            '자체 AI 서버의 응답 형식이 올바르지 않습니다.',
            'AS_AI_BACKEND_INVALID_JSON',
          );
        }


        const raw =
          backendData.result;


        if (
          !raw
          || typeof raw
            !== 'object'
          || Array.isArray(
            raw,
          )
        ) {
          throw new AiBackendError(
            '자체 AI 서버에서 분석 결과를 받지 못했습니다.',
            'AS_AI_BACKEND_EMPTY_RESULT',
          );
        }


        // ======================================
        // 핵심:
        // Qwen 결과를 그대로 사용자에게 보내지 않고
        // 기존 Supabase 안전정책을 반드시 거침
        // ======================================

        result =
          applyAsSafetyPolicy(
            input,

            raw,

            (
              guides
              ?? []
            ) as AsGuide[],
          );
      }


      // ========================================
      // 최종 결과 DB 저장
      // ========================================

      const {
        data:
          saved,

        error:
          saveError,

      } =
        await db.rpc(
          'complete_as_ai_analysis',
          {
            p_id:
              id,

            p_user_id:
              user.id,

            p_lease:
              lease,

            p_result:
              result,

            p_model:
              result.source
                === 'ai'
                ? model
                : null,
          },
        );


      if (saveError) {
        console.error(
          'complete_as_ai_analysis failed',
          {
            message: saveError.message,
            details: saveError.details,
            hint: saveError.hint,
            code: saveError.code,
          }
        );

        throw new AnalysisDatabaseError(
          databaseFailure(saveError.message)
        );
      }


      if (
        !saved
      ) {
        throw new Error(
          '분석 결과를 저장하지 못했습니다. 결과 확인을 눌러 주세요.',
        );
      }


      return json(
        {
          analysis:
            publicRecord(
              saved,
            ),
        },
      );

    } catch (error) {

      // ========================================
      // 오류 로그
      // ========================================

      if (
        error
          instanceof AiBackendError
      ) {
        console.error(
          'WMENC AI request failed',
          {
            code:
              error.code,

            http_status:
              error.httpStatus,
          },
        );
      }


      const message =
        controller
          .signal
          .aborted

          ? '분석 시간이 초과되었습니다. 잠시 후 다시 시도하거나 상담을 요청해 주세요.'

          : error
            instanceof Error

            ? error.message

            : '분석에 실패했습니다. 다시 시도해 주세요.';


      // ========================================
      // 실패 상태 DB 저장
      // ========================================

      await db
        .from(
          'as_ai_analyses',
        )
        .update(
          {
            status:
              'failed',

            error_message:
              message.slice(
                0,
                500,
              ),
          },
        )
        .eq(
          'id',
          id,
        )
        .eq(
          'lease_id',
          lease,
        )
        .neq(
          'status',
          'completed',
        );


      if (
        error
          instanceof AnalysisDatabaseError
      ) {
        return json(
          error.failure,

          /ANALYSIS_(DAILY|RATE)_LIMIT/
            .test(
              error
                .failure
                .code,
            )
            ? 429
            : 409,
        );
      }


      if (
        error
          instanceof AiBackendError
      ) {
        return json(
          {
            error:
              message,

            code:
              error.code,
          },
          502,
        );
      }


      return json(
        {
          error:
            message,
        },
        502,
      );

    } finally {

      clearTimeout(
        timeout,
      );
    }
  },
);
