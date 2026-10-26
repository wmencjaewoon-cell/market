// Shared, dependency-free contract: the app renders only the server's policy-filtered result.
export const AS_ANALYSIS_VERSION = 2;
export const AS_CONSENT_VERSION = '2026-09-28';
export const AS_MEDIA_BUCKET = 'as-analysis-media';
export const AS_MAX_IMAGES = 5;

export const AS_MAX_VIDEOS = 1;

export const AS_MAX_ATTACHMENTS =
  AS_MAX_IMAGES + AS_MAX_VIDEOS;

export const AS_MAX_VIDEO_SECONDS = 60;
export const AS_HAZARDS = {
  electrical: '전기', gas: '가스', electrical_leak: '누전', hidden_pipe: '벽 내부 배관',
  structural: '구조 균열', major_leak: '천장 누수·대형 누수', heating: '보일러·난방 핵심부',
} as const;
export type AsHazard = keyof typeof AS_HAZARDS;
export const AS_GUIDE_KEYS = ['furniture_felt_pad', 'cabinet_knob'] as const;
export type AsGuideKey = typeof AS_GUIDE_KEYS[number];
export type AsRecommendation = 'self_repair' | 'complex' | 'expert_required' | 'needs_more_info' | 'emergency';
export const AS_RESULT_LABELS: Record<AsRecommendation, string> = {
  self_repair: '셀프 수리가 가능한 저위험 작업으로 보여요',
  complex: '직접 수리하기에는 복잡한 작업으로 보여요',
  expert_required: '전문가 점검이 필요해요',
  needs_more_info: '추가 확인이 필요해요',
  emergency: '긴급한 위험이 의심돼요',
};
export type AsMediaSpec = { mime_type: string; bytes: number; duration_seconds: number | null };
export type AsAnalysisInput = {
  home_id?: string | null;
  description: string;
  categories: string[];
  symptoms: string[];

  safety_answer:
    | 'none'
    | 'unsure'
    | 'hazard';

  hazards: AsHazard[];

  consent_version: string;

  media: AsMediaSpec[];

  /*
   * 최초 분석에서는 null 또는 생략.
   * clarification 버튼 선택 후 재분석할 때 사용.
   */
  clarification_answer?:
    AsClarificationAnswer | null;
};


export type AsGuide = {
  key: AsGuideKey; title: string; applicability: string; tools: string[]; steps: string[];
  warnings: string[]; stop_conditions: string[]; status: 'draft' | 'published';
  reviewed_at: string | null; reviewed_by: string | null;
};

export type AsProcedureSource =
  | 'ai'
  | 'guide'
  | 'none';

export type AsClarificationOption = {
  value: string;
  label: string;
};

export type AsClarification = {
  question: string;
  options: AsClarificationOption[];
};

export type AsClarificationAnswer = {
  question: string;
  value: string;
  label: string;
};


export type AsModelResult = {
  issue_area: string;

  problem_summary: string;

  observations: string[];

  possible_causes: string[];

  hazards: AsHazard[];

  safety_uncertain: boolean;

  risk_level:
    | 'low'
    | 'medium'
    | 'high'
    | 'unknown';

  recommended_action:
    AsRecommendation;

  repairability:
    | 'repair_possible'
    | 'replacement_possible'
    | 'unknown';

  reason: string;

  follow_up_questions: string[];

  clarification?: AsClarification | null;

  limitations: string[];

  /*
   * 저위험 셀프수리일 때만 사용한다.
   * 위험하거나 불확실한 경우 빈 배열이어야 한다.
   */
  tools: string[];

  parts: string[];

  repair_steps: string[];

  stop_conditions: string[];

  guide_key: AsGuideKey | null;
};


export type AsAnalysisResult =
  Omit<AsModelResult, 'guide_key'> & {
    schema_version: number;

    source:
      | 'ai'
      | 'safety_policy';

    diy_possible:
      boolean | null;

    expert_required:
      boolean | null;

    guide:
      AsGuide | null;

    safety_warning:
      string;

    guide_pending_review:
      boolean;

    procedure_source:
      AsProcedureSource;
  };


// export type AsModelResult = {
//   issue_area: string; problem_summary: string; observations: string[]; possible_causes: string[];
//   hazards: AsHazard[]; safety_uncertain: boolean; risk_level: 'low' | 'medium' | 'high' | 'unknown';
//   recommended_action: AsRecommendation; repairability: 'repair_possible' | 'replacement_possible' | 'unknown';
//   reason: string; follow_up_questions: string[]; limitations: string[]; guide_key: AsGuideKey | null;
// };
// export type AsAnalysisResult = Omit<AsModelResult, 'guide_key'> & {
//   schema_version: number; source: 'ai' | 'safety_policy';
//   diy_possible: boolean | null; expert_required: boolean | null;
//   guide: AsGuide | null; safety_warning: string; guide_pending_review: boolean;
// };
export type AsAnalysisRecord = {
  id: string; status: 'uploading' | 'processing' | 'completed' | 'failed';
  result: AsAnalysisResult | null; error_message: string | null; created_at: string;
  input_payload?: AsAnalysisInput;
  linked_request_id?: number | null;
};
export const AS_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v',
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('잘못된 분석 데이터입니다.');
  return value as Record<string, unknown>;
}
function text(value: unknown, limit = 600): string {
  if (typeof value !== 'string' || value.length > limit) throw new Error('분석 문장의 형식이나 길이가 올바르지 않습니다.');
  return value.trim();
}
function texts(value: unknown, count = 8, limit = 600): string[] {
  if (!Array.isArray(value) || value.length > count) throw new Error('분석 목록 형식이 올바르지 않습니다.');
  return value.map(item => text(item, limit)).filter(Boolean);
}
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error('알 수 없는 분석 분류입니다.');
  return value as T;
}
function parseClarification(
  value: unknown,
): AsClarification | null {
  if (
    value === null
    || value === undefined
  ) {
    return null;
  }

  const data =
    object(value);

  const question =
    text(
      data.question,
      200,
    );

  if (!question) {
    throw new Error(
      '추가 확인 질문이 올바르지 않습니다.',
    );
  }

  if (
    !Array.isArray(data.options)
    || data.options.length < 2
    || data.options.length > 4
  ) {
    throw new Error(
      '추가 확인 선택지는 2개 이상 4개 이하이어야 합니다.',
    );
  }

  const options =
    data.options.map(
      (item): AsClarificationOption => {
        const option =
          object(item);

        const optionValue =
          text(
            option.value,
            80,
          );

        const label =
          text(
            option.label,
            120,
          );

        if (
          !optionValue
          || !label
        ) {
          throw new Error(
            '추가 확인 선택지 형식이 올바르지 않습니다.',
          );
        }

        return {
          value:
            optionValue,

          label,
        };
      },
    );

  const uniqueValues =
    new Set(
      options.map(
        option =>
          option.value,
      ),
    );

  if (
    uniqueValues.size
    !== options.length
  ) {
    throw new Error(
      '추가 확인 선택지 값이 중복되었습니다.',
    );
  }

  return {
    question,
    options,
  };
}

function parseClarificationAnswer(
  value: unknown,
): AsClarificationAnswer | null {
  if (
    value === null
    || value === undefined
  ) {
    return null;
  }

  const data =
    object(value);

  const question =
    text(
      data.question,
      200,
    );

  const optionValue =
    text(
      data.value,
      80,
    );

  const label =
    text(
      data.label,
      120,
    );

  if (
    !question
    || !optionValue
    || !label
  ) {
    throw new Error(
      '추가 확인 답변 형식이 올바르지 않습니다.',
    );
  }

  if (
    !/^[a-z0-9]+(?:_[a-z0-9]+)*$/
      .test(optionValue)
  ) {
    throw new Error(
      '추가 확인 선택값이 올바르지 않습니다.',
    );
  }

  return {
    question,
    value:
      optionValue,
    label,
  };
}

const hazardKeys = Object.keys(AS_HAZARDS) as AsHazard[];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAnalysisInput(value: unknown): AsAnalysisInput {
  const input = object(value);
  const media = input.media;
  if (!Array.isArray(media) || media.length > AS_MAX_ATTACHMENTS) {
  throw new Error(
    '사진은 최대 5장, 영상은 최대 1개까지 첨부할 수 있습니다.'
  );
}
  const specs = media.map((item): AsMediaSpec => {
    const spec = object(item);
    const mime = text(spec.mime_type, 80);
    if (!AS_MIME_EXTENSIONS[mime]) throw new Error('분석에는 JPG, PNG, WebP, HEIC 사진 또는 MP4, MOV, M4V, WebM 영상을 사용해 주세요.');
    const video = mime.startsWith('video/');
    if (!Number.isSafeInteger(spec.bytes) || Number(spec.bytes) <= 0 || Number(spec.bytes) > (video ? 30 : 10) * 1024 * 1024) {
      throw new Error('사진은 10MB, 영상은 30MB 이하로 첨부해 주세요.');
    }
    const duration = spec.duration_seconds;
    if (
  video &&
  duration !== null &&
  (
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > AS_MAX_VIDEO_SECONDS
  )
) {
  throw new Error(
    `분석할 영상은 ${AS_MAX_VIDEO_SECONDS}초 이하로 선택해 주세요.`
  );
}
    return { mime_type: mime, bytes: Number(spec.bytes), duration_seconds: video && typeof duration === 'number' ? duration : null };
  });
const imageCount =
  specs.filter(
    spec =>
      spec.mime_type.startsWith('image/')
  ).length;

const videoCount =
  specs.filter(
    spec =>
      spec.mime_type.startsWith('video/')
  ).length;

if (imageCount > AS_MAX_IMAGES) {
  throw new Error(
    `사진은 최대 ${AS_MAX_IMAGES}장까지 가능합니다.`
  );
}

if (videoCount > AS_MAX_VIDEOS) {
  throw new Error(
    `영상은 최대 ${AS_MAX_VIDEOS}개까지 가능합니다.`
  );
}  const hazards = texts(input.hazards, 7, 40).map(item => choice(item, hazardKeys));
  const safety = choice(input.safety_answer, ['none', 'unsure', 'hazard']);
  if (safety === 'hazard' && !hazards.length) throw new Error('해당하는 위험 분야를 선택해 주세요.');
  if (safety !== 'hazard' && hazards.length) throw new Error('위험 확인 응답을 다시 선택해 주세요.');
  if (input.consent_version !== AS_CONSENT_VERSION) throw new Error('증상과 첨부파일(선택)의 AI 전송에 동의해 주세요.');
  const description = text(input.description, 2000);
  const symptoms = texts(input.symptoms, 10, 100);
  if (!description && !symptoms.length) throw new Error('증상을 선택하거나 간단히 입력해 주세요.');
  return {
  ...(input.home_id === null || input.home_id === undefined
    ? {}
    : typeof input.home_id === 'string' && uuidPattern.test(input.home_id)
      ? { home_id: input.home_id }
      : (() => { throw new Error('선택한 집 정보가 올바르지 않습니다.'); })()),

  description,

  symptoms,

  categories:
    texts(
      input.categories,
      15,
      80,
    ),

  safety_answer:
    safety,

  hazards:
    [...new Set(hazards)],

  consent_version:
    AS_CONSENT_VERSION,

  media:
    specs,

  clarification_answer:
    parseClarificationAnswer(
      input.clarification_answer,
    ),
};
}

// Supplemental lexical guard, not a claim that keywords alone detect every hazard.
export function detectAsHazards(
  value: string,
): AsHazard[] {
  const rules:
    [AsHazard, RegExp][] = [
      [
        'electrical',
        /분전반|배전반|배선|전선|감전|스파크|합선|차단기.{0,8}(내부|탄|연기|불꽃)|콘센트.{0,8}(내부|탄|연기|불꽃|과열)|electrical panel|wiring|sparks?/i,
      ],

      [
        'gas',
        /가스|일산화탄소|도시가스|\bgas\b|carbon monoxide/i,
      ],

      [
        'electrical_leak',
        /누전|합선|short circuit/i,
      ],

      [
        'hidden_pipe',
        /벽.{0,12}(배관|누수|물)|매립.{0,10}(배관|수도)|내부.{0,8}배관|concealed pipe/i,
      ],

      [
        'structural',
        /균열|구조.{0,10}(손상|문제)|붕괴|기둥.{0,10}(금|갈라)|structural|collapse/i,
      ],

      [
        'major_leak',
        /천장.{0,15}(물|누수|젖|처짐)|대형.{0,8}누수|물.{0,5}쏟아|침수|ceiling.{0,15}leak|flood/i,
      ],

      [
        'heating',
        /보일러|난방|연소기|boiler|heating/i,
      ],
    ];

  return rules
    .filter(
      ([, pattern]) =>
        pattern.test(value)
    )
    .map(([key]) => key);
}

export function hasEmergencySigns(value: string): boolean {
  return /가스.{0,12}(냄새|새|누출)|연기|불꽃|타는.{0,4}냄새|감전|붕괴|천장.{0,12}(처지|무너)|gas.{0,10}(smell|leak)|smoke|sparks/i.test(value);
}

export function parseModelResult(
  value: unknown,
): AsModelResult {
  const data =
    object(value);


  if (
    typeof data.safety_uncertain
      !== 'boolean'
  ) {
    throw new Error(
      '위험 확인 결과가 없습니다.',
    );
  }


  const result:
    AsModelResult = {
      issue_area:
        text(
          data.issue_area,
          150,
        ),

      problem_summary:
        text(
          data.problem_summary,
        ),

      observations:
        texts(
          data.observations,
        ),

      possible_causes:
        texts(
          data.possible_causes,
        ),

      hazards:
        texts(
          data.hazards,
          7,
          40,
        ).map(
          value =>
            choice(
              value,
              hazardKeys,
            )
        ),

      safety_uncertain:
        data.safety_uncertain,

      risk_level:
        choice(
          data.risk_level,
          [
            'low',
            'medium',
            'high',
            'unknown',
          ],
        ),

      recommended_action:
        choice(
          data.recommended_action,
          [
            'self_repair',
            'complex',
            'expert_required',
            'needs_more_info',
            'emergency',
          ],
        ),

      repairability:
        choice(
          data.repairability,
          [
            'repair_possible',
            'replacement_possible',
            'unknown',
          ],
        ),

      reason:
        text(
          data.reason,
        ),

      follow_up_questions:
        texts(
          data.follow_up_questions,
          5,
        ),

      clarification:
        parseClarification(
          data.clarification,
        ),

      limitations:
        texts(
          data.limitations,
        ),

      tools:
        texts(
          data.tools,
          10,
          120,
        ),

      parts:
        texts(
          data.parts,
          10,
          160,
        ),

      repair_steps:
        texts(
          data.repair_steps,
          8,
          600,
        ),

      stop_conditions:
        texts(
          data.stop_conditions,
          8,
          600,
        ),

      guide_key:
        data.guide_key === null
          ? null
          : choice(
              data.guide_key,
              AS_GUIDE_KEYS,
            ),
    };


  if (
    !result.issue_area
    || !result.problem_summary
    || !result.reason
  ) {
    throw new Error(
      '분석 결과가 불완전합니다.',
    );
  }


  return result;
}

export function safetyOnlyResult(
  hazards: AsHazard[],
  emergency: boolean,
): AsAnalysisResult {
  return {
    schema_version:
      AS_ANALYSIS_VERSION,

    source:
      'safety_policy',

    issue_area:
      hazards
        .map(
          key =>
            AS_HAZARDS[key]
        )
        .join(' · ')
      || '위험 징후 확인 필요',

    problem_summary:
      '위험 가능성이 있는 증상으로, 작성한 내용과 첨부자료만으로 안전 여부를 판단할 수 없습니다.',

    observations: [],

    possible_causes: [],

    hazards,

    safety_uncertain:
      true,

    risk_level:
      'high',

    recommended_action:
      emergency
        ? 'emergency'
        : 'expert_required',

    repairability:
      'unknown',

    reason:
      emergency
        ? '긴급 위험 가능성이 있어 일반 상담보다 안전 확보가 우선입니다.'
        : '직접 작업하지 말고 해당 분야 전문가의 점검을 받아 주세요.',

    follow_up_questions: [],

    clarification:
      null,

    limitations: [
      '이 안내는 위험 분류이며 고장 원인을 확정한 진단이 아닙니다.',
    ],

    tools: [],

    parts: [],

    repair_steps: [],

    stop_conditions: [],

    diy_possible:
      false,

    expert_required:
      true,

    guide:
      null,

    guide_pending_review:
      false,

    procedure_source:
      'none',

    safety_warning:
      emergency
        ? '접근하지 말고 안전한 곳으로 이동하세요. 긴급 위험이 있으면 119에 연락하세요.'
        : '직접 작업하지 말고 관련 전문가에게 문의하세요.',
  };
}

export function inputSafetyResult(
  input: AsAnalysisInput,
): AsAnalysisResult | null {

  const clarificationAnswer =
    input.clarification_answer?.label
    ?? '';

  const value = [
    ...input.categories,
    ...input.symptoms,
    input.description,
    clarificationAnswer,
  ]
    .filter(Boolean)
    .join(' ');

  const hazards = [
    ...new Set([
      ...input.hazards,
      ...detectAsHazards(
        value,
      ),
    ]),
  ];

  const emergency =
    hasEmergencySigns(
      value,
    );

  return hazards.length || emergency
    ? safetyOnlyResult(
        hazards,
        emergency,
      )
    : null;
}

function hasForbiddenProcedure(
  model: AsModelResult,
): boolean {
  /*
   * stop_conditions는 검사하지 않습니다.
   *
   * 예:
   * "전선이 보이면 중단하세요"
   *
   * 같은 안전 중단 문구에는
   * 위험 단어가 들어갈 수 있기 때문입니다.
   */
  const procedureText = [
    ...model.tools,
    ...model.parts,
    ...model.repair_steps,
  ].join('\n');


  return (
    /가스|LPG|분전반|배전반|차단기.{0,8}내부|콘센트.{0,8}내부|전선|배선|누전|감전|220V|보일러.{0,10}(내부|연소|가스)|벽.{0,10}내부|매립.{0,10}배관|구조체|기둥.{0,10}(균열|갈라|금)|보.{0,10}(균열|갈라|금)|천장.{0,10}(누수|처짐)|화재|연기|불꽃|탄.{0,4}냄새|대량.{0,4}누수|침수/i
      .test(
        procedureText,
      )
  );
}

// export function applyAsSafetyPolicy(input: AsAnalysisInput, raw: unknown, guides: AsGuide[]): AsAnalysisResult {
//   const preliminary = inputSafetyResult(input);
//   if (preliminary) return preliminary;
//   const model = parseModelResult(raw);
//   const evidence = [model.issue_area, model.problem_summary, ...model.observations, ...model.possible_causes, model.reason].join(' ');
//   const questions = model.follow_up_questions.join('\n');
//   const narrative = [evidence, questions].join('\n');
//   const hazards = [...new Set([...model.hazards, ...detectAsHazards(evidence)])];
//   if (hazards.length || model.risk_level === 'high' || model.recommended_action === 'emergency' || hasEmergencySigns(evidence)) {
//     const safe = safetyOnlyResult(hazards, model.recommended_action === 'emergency' || hasEmergencySigns(evidence));
//     return { ...safe, source: 'ai' };
//   }
//   // Free-form model prose is descriptive only. Never accept model-generated procedures/tools.
//   if (/https?:\/\/|분해하|분해해|풀어|연결하|교체하|조작하|뜯어|만져|돌려|조여|열어|잠가|끼워|잘라|뚫어|insert |disconnect |unscrew /i.test(narrative)) {
//     throw new Error('안전 기준에 맞는 분석 결과를 받지 못했습니다. 상담으로 확인해 주세요.');
//   }
//   let action = model.recommended_action;
//   // Asking whether water reached a socket is not evidence that it did. Still
//   // withhold DIY until safety questions are resolved, even if the model says low risk.
//   const safetyQuestionPending = detectAsHazards(questions).length > 0 || hasEmergencySigns(questions);
//   // Text-only questions receive hypotheses, not visually verified repair instructions.
//   const textOnly = input.media.length === 0;
//   if (textOnly && action === 'self_repair') action = 'needs_more_info';
//   if (input.safety_answer !== 'none' || model.safety_uncertain || safetyQuestionPending || model.risk_level === 'unknown' || (action === 'self_repair' && model.repairability === 'unknown')) action = 'needs_more_info';
//   if (action === 'self_repair' && model.risk_level !== 'low') action = 'complex';
//   const guide = guides.find(item => item.key === model.guide_key && item.status === 'published' && item.reviewed_by && item.reviewed_at);
//   const pending = action === 'self_repair' && !guide;
//   if (pending) action = 'needs_more_info';
//   const { guide_key: _key, ...descriptive } = model;
//   return {
//     ...descriptive, schema_version: AS_ANALYSIS_VERSION, source: 'ai', recommended_action: action,
//     safety_uncertain: model.safety_uncertain || safetyQuestionPending,
//     risk_level: safetyQuestionPending ? 'unknown' : model.risk_level,
//     observations: textOnly ? [] : descriptive.observations,
//     limitations: textOnly ? ['사진·영상 없이 작성한 증상만으로 추정했습니다. 실제 부품 상태와 안전 여부는 확인되지 않았습니다.', ...descriptive.limitations].slice(0, 8) : descriptive.limitations,
//     reason: pending ? '현재 문제에 맞는 검수된 셀프 가이드가 없어 직접 수리 방법은 제공하지 않습니다. 상담으로 확인해 주세요.' : model.reason,
//     follow_up_questions: action === 'needs_more_info' && !model.follow_up_questions.length
//       ? ['분해하거나 위험한 곳에 접근하지 말고, 안전한 위치에서 확인할 수 있는 증상을 추가로 설명해 주세요.'] : model.follow_up_questions,
//     diy_possible: action === 'needs_more_info' ? null : action === 'self_repair',
//     expert_required: action === 'needs_more_info' ? null : action !== 'self_repair',
//     guide: action === 'self_repair' && guide ? guide : null, guide_pending_review: pending,
//     safety_warning: 'AI 사전 분석은 현장 점검을 대신하지 않습니다. 실제 상태가 다르거나 이상 징후가 있으면 작업을 중단하고 전문가에게 문의하세요.',
//   };
// }

export function applyAsSafetyPolicy(
  input: AsAnalysisInput,
  raw: unknown,
  guides: AsGuide[],
): AsAnalysisResult {

  /*
   * 사용자 입력 자체에 명확한 위험이 있으면
   * AI를 호출한 결과와 상관없이 안전 결과를 사용합니다.
   */
  const preliminary =
    inputSafetyResult(input);


  if (preliminary) {
    return preliminary;
  }


  const model =
    parseModelResult(raw);


  const evidence = [
    model.issue_area,
    model.problem_summary,
    ...model.observations,
    ...model.possible_causes,
    model.reason,
  ].join(' ');


  const clarificationText =
    model.clarification
      ? [
          model.clarification.question,
          ...model.clarification.options.map(
            option =>
              option.label,
          ),
        ].join('\n')
      : '';

  const questions = [
    ...model.follow_up_questions,
    clarificationText,
  ]
    .filter(Boolean)
    .join('\n');


  const hazards = [
    ...new Set([
      ...model.hazards,
      ...detectAsHazards(
        evidence,
      ),
    ]),
  ];


  /*
   * 위험 징후가 확인되면
   * AI가 만든 절차를 전부 버립니다.
   */
  if (
    hazards.length > 0
    || model.risk_level
      === 'high'
    || model.recommended_action
      === 'emergency'
    || hasEmergencySigns(
      evidence,
    )
  ) {
    const safe =
      safetyOnlyResult(
        hazards,
        model.recommended_action
          === 'emergency'
        || hasEmergencySigns(
          evidence,
        ),
      );


    return {
      ...safe,
      source: 'ai',
    };
  }


  let action =
    model.recommended_action;


  const safetyQuestionPending =
    detectAsHazards(
      questions,
    ).length > 0
    || hasEmergencySigns(
      questions,
    );


  const safetyUncertain =
  model.safety_uncertain
  || safetyQuestionPending
  || model.risk_level === 'unknown';


  /*
   * 위험 여부가 확실하지 않으면
   * 절차를 보여주지 않고 추가 정보를 요청합니다.
   */
  if (safetyUncertain) {
    action =
      'needs_more_info';
  }


  /*
   * 셀프수리는 반드시 low여야 합니다.
   */
  if (
    action === 'self_repair'
    && model.risk_level
      !== 'low'
  ) {
    action =
      'complex';
  }


  /*
   * 수리/교체 가능성을 알 수 없는 경우
   * 셀프수리를 확정하지 않습니다.
   */
  if (
    action === 'self_repair'
    && model.repairability
      === 'unknown'
  ) {
    action =
      'needs_more_info';
  }


  const guide =
    guides.find(
      item =>
        item.key
          === model.guide_key
        && item.status
          === 'published'
        && item.reviewed_by
        && item.reviewed_at,
    ) ?? null;


  /*
   * 검수 가이드가 없는 경우에만
   * AI가 만든 절차 내용을 검사합니다.
   */
  const procedureBlocked =
    action === 'self_repair'
    && !guide
    && hasForbiddenProcedure(
      model,
    );


  if (procedureBlocked) {
    action =
      'expert_required';
  }


  const hasAiProcedure =
    model.repair_steps.length > 0
    && model.stop_conditions.length > 0;


  /*
   * 셀프수리라고 판단했지만
   * 실제 절차나 중단 조건이 없으면
   * 사용자에게 수리 가능하다고 확정하지 않습니다.
   */
  if (
    action === 'self_repair'
    && !guide
    && !hasAiProcedure
  ) {
    action =
      'needs_more_info';
  }

  /*
 * 추가 확인 상태인데 실제 질문 카드가 없으면
 * 사용자에게 진행할 방법이 없으므로
 * 전문가 확인으로 안전하게 전환합니다.
 */
if (
  action === 'needs_more_info'
  && !model.clarification
) {
  action =
    'expert_required';
}


  const procedureSource:
    AsProcedureSource =
      action !== 'self_repair'
        ? 'none'
        : guide
          ? 'guide'
          : 'ai';


  const tools =
    procedureSource === 'guide'
      ? guide?.tools ?? []
      : procedureSource === 'ai'
        ? model.tools
        : [];


  const parts =
    procedureSource === 'ai'
      ? model.parts
      : [];


  const repairSteps =
    procedureSource === 'guide'
      ? guide?.steps ?? []
      : procedureSource === 'ai'
        ? model.repair_steps
        : [];


  const stopConditions =
    procedureSource === 'guide'
      ? guide?.stop_conditions
        ?? []
      : procedureSource === 'ai'
        ? model.stop_conditions
        : [];


  const textOnly =
    input.media.length === 0;


  const {
    guide_key: _guideKey,
    ...descriptive
  } = model;


  const limitations = descriptive.limitations;




  const finalRiskLevel =
    procedureBlocked && model.risk_level === 'low'
      ? 'medium'
      : safetyQuestionPending
        ? 'unknown'
        : model.risk_level;


  return {
    ...descriptive,

    schema_version:
      AS_ANALYSIS_VERSION,

    source:
      'ai',

    recommended_action:
      action,

    safety_uncertain:
      safetyUncertain,

    risk_level:
      finalRiskLevel,

    observations:
      textOnly
        ? []
        : descriptive.observations,

    limitations,

    reason:
      procedureBlocked
        ? '안전 기준상 직접 수리 절차를 제공할 수 없어 전문가 확인을 권장합니다.'
        : model.reason,

    follow_up_questions:
      action === 'needs_more_info'
        ? []
        : model.follow_up_questions,

      clarification:
        action === 'needs_more_info'
          ? model.clarification ?? null
          : null,

    tools,

    parts,

    repair_steps:
      repairSteps,

    stop_conditions:
      stopConditions,

    diy_possible:
      action === 'needs_more_info'
        ? null
        : action
          === 'self_repair',

    expert_required:
      action === 'needs_more_info'
        ? null
        : action
          !== 'self_repair',

    guide:
      action === 'self_repair'
      && guide
        ? guide
        : null,

    guide_pending_review:
      false,

    procedure_source:
      procedureSource,

    safety_warning:
      action === 'self_repair'
        ? '안내된 절차는 저위험 사전 안내입니다. 실제 상태가 설명과 다르거나 중단 조건에 해당하면 즉시 작업을 멈추고 문의해 주세요.'
        : 'AI 사전 분석은 현장 점검을 대신하지 않습니다. 이상 징후가 있거나 안전이 불확실하면 직접 작업하지 말고 전문가에게 문의하세요.',
  };
}


export const AS_MODEL_SCHEMA = {
  type:
    'object',

  additionalProperties:
    false,

  properties: {
    issue_area: {
      type:
        'string',
    },

    problem_summary: {
      type:
        'string',
    },

    observations: {
      type:
        'array',

      maxItems:
        8,

      items: {
        type:
          'string',
      },
    },

    possible_causes: {
      type:
        'array',

      maxItems:
        8,

      items: {
        type:
          'string',
      },
    },

    hazards: {
      type:
        'array',

      maxItems:
        7,

      items: {
        type:
          'string',

        enum:
          hazardKeys,
      },
    },

    safety_uncertain: {
      type:
        'boolean',
    },

    risk_level: {
      type:
        'string',

      enum: [
        'low',
        'medium',
        'high',
        'unknown',
      ],
    },

    recommended_action: {
      type:
        'string',

      enum:
        Object.keys(
          AS_RESULT_LABELS,
        ),
    },

    repairability: {
      type:
        'string',

      enum: [
        'repair_possible',
        'replacement_possible',
        'unknown',
      ],
    },

    reason: {
      type:
        'string',
    },

    follow_up_questions: {
      type:
        'array',

      maxItems:
        5,

      items: {
        type:
          'string',
      },
    },

    clarification: {
  type: [
    'object',
    'null',
  ],

  additionalProperties:
    false,

  properties: {
    question: {
      type:
        'string',
    },

    options: {
      type:
        'array',

      minItems:
        2,

      maxItems:
        4,

      items: {
        type:
          'object',

        additionalProperties:
          false,

        properties: {
          value: {
            type:
              'string',
          },

          label: {
            type:
              'string',
          },
        },

        required: [
          'value',
          'label',
        ],
      },
    },
  },

  required: [
    'question',
    'options',
  ],
},

    limitations: {
      type:
        'array',

      maxItems:
        8,

      items: {
        type:
          'string',
      },
    },

    tools: {
      type:
        'array',

      maxItems:
        10,

      items: {
        type:
          'string',
      },
    },

    parts: {
      type:
        'array',

      maxItems:
        10,

      items: {
        type:
          'string',
      },
    },

    repair_steps: {
      type:
        'array',

      maxItems:
        8,

      items: {
        type:
          'string',
      },
    },

    stop_conditions: {
      type:
        'array',

      maxItems:
        8,

      items: {
        type:
          'string',
      },
    },

    guide_key: {
      type: [
        'string',
        'null',
      ],

      enum: [
        ...AS_GUIDE_KEYS,
        null,
      ],
    },
  },

  required: [
    'issue_area',
    'problem_summary',
    'observations',
    'possible_causes',
    'hazards',
    'safety_uncertain',
    'risk_level',
    'recommended_action',
    'repairability',
    'reason',
    'follow_up_questions',
    'limitations',
    'tools',
    'parts',
    'repair_steps',
    'stop_conditions',
    'guide_key',
  ],
};
