import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../contexts/AuthContext';
import { useAppTheme } from '../hooks/use-app-theme';
import { getAsPalette, type AsPalette } from '../lib/asAppearance';
import { supabase } from '../lib/supabase';


const MAX_IMAGES = 5;
const MAX_VIDEO_DURATION_MS = 60 * 1000;


type AiReport = {
  category?: string;
  category_label?: string;

  subtype?: string;
  subtype_label?: string;

  title?: string;
  summary?: string;

  severity?: string;

  diy_possible?: boolean;

  confidence?: number;

  observations?: string[];

  possible_causes?: string[];

  additional_checks?: string[];

  tools?: string[];

  parts?: string[];

  steps?: string[];

  safety_warnings?: string[];

  stop_conditions?: string[];

  professional_required?: boolean;

  professional_type?: string;

  additional_photo_requests?: string[];
};


type AiAnalysisResponse = {
  success: boolean;

  request_id?: string;

  media_count?: number;

  analysis_image_count?: number;

  report?: AiReport;
};


type UploadResult = {
  path: string;
  mimeType: string;
  fileName: string;
};


export default function AsInquiryScreen() {
  const { user } = useAuth();

  const base = useAppTheme();

  const theme = useMemo(
    () => getAsPalette(base),
    [base]
  );

  const styles = useMemo(
    () => createStyles(theme),
    [theme]
  );


  // ========================================================
  // 입력 상태
  // ========================================================

  const [description, setDescription] =
    useState('');


  const [images, setImages] = useState<
    ImagePicker.ImagePickerAsset[]
  >([]);


  const [video, setVideo] =
    useState<ImagePicker.ImagePickerAsset | null>(
      null
    );


  // ========================================================
  // 작업 상태
  // ========================================================

  const [submitting, setSubmitting] =
    useState(false);


  const [uploadProgress, setUploadProgress] =
    useState('');


  const [analysisResult, setAnalysisResult] =
    useState<AiAnalysisResponse | null>(
      null
    );


  const [createdRequestId, setCreatedRequestId] =
    useState<string | null>(null);


  // ========================================================
  // 사진 선택
  // ========================================================

  const pickImages = async () => {
    try {
      const remaining =
        MAX_IMAGES - images.length;


      if (remaining <= 0) {
        Alert.alert(
          '사진 첨부',
          `사진은 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`
        );

        return;
      }


      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();


      if (!permission.granted) {
        Alert.alert(
          '사진 접근 권한 필요',
          '사진을 첨부하려면 사진 보관함 접근 권한을 허용해주세요.'
        );

        return;
      }


      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],

          allowsMultipleSelection: true,

          selectionLimit: remaining,

          orderedSelection: true,

          quality: 0.8,
        });


      if (
        result.canceled ||
        !result.assets?.length
      ) {
        return;
      }


      setImages((current) => {
        const merged = [
          ...current,
          ...result.assets,
        ];

        return merged.slice(
          0,
          MAX_IMAGES
        );
      });


      // 새 미디어를 선택했으면
      // 이전 분석 결과는 초기화
      setAnalysisResult(null);

    } catch (error) {
      console.error(
        '사진 선택 오류:',
        error
      );

      Alert.alert(
        '사진 선택 실패',
        '사진을 선택하는 중 오류가 발생했습니다.'
      );
    }
  };


  // ========================================================
  // 사진 삭제
  // ========================================================

  const removeImage = (
    index: number
  ) => {
    setImages((current) =>
      current.filter(
        (_, itemIndex) =>
          itemIndex !== index
      )
    );

    setAnalysisResult(null);
  };


  // ========================================================
  // 영상 선택
  // ========================================================

  const pickVideo = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();


      if (!permission.granted) {
        Alert.alert(
          '영상 접근 권한 필요',
          '영상을 첨부하려면 사진 보관함 접근 권한을 허용해주세요.'
        );

        return;
      }


      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['videos'],

          allowsMultipleSelection: false,

          videoMaxDuration: 60,
        });


      if (
        result.canceled ||
        !result.assets?.length
      ) {
        return;
      }


      const selected =
        result.assets[0];


      // 기존 영상 선택에서는
      // videoMaxDuration이 항상 강제되는 것은 아니므로
      // 앱에서 한 번 더 검사
      if (
        selected.duration != null &&
        selected.duration >
          MAX_VIDEO_DURATION_MS
      ) {
        Alert.alert(
          '영상 길이 제한',
          '영상은 최대 60초까지 첨부해주세요.'
        );

        return;
      }


      setVideo(selected);

      setAnalysisResult(null);

    } catch (error) {
      console.error(
        '영상 선택 오류:',
        error
      );

      Alert.alert(
        '영상 선택 실패',
        '영상을 선택하는 중 오류가 발생했습니다.'
      );
    }
  };


  // ========================================================
  // 영상 삭제
  // ========================================================

  const removeVideo = () => {
    setVideo(null);

    setAnalysisResult(null);
  };


  // ========================================================
  // 파일 확장자 구하기
  // ========================================================

  const getExtension = (
    asset: ImagePicker.ImagePickerAsset,
    type: 'image' | 'video'
  ) => {
    const name =
      asset.fileName ?? '';


    const fileExtension =
      name
        .split('.')
        .pop()
        ?.toLowerCase();


    if (
      fileExtension &&
      fileExtension.length <= 5
    ) {
      return fileExtension;
    }


    const mimeType =
      asset.mimeType ?? '';


    const mimeExtension =
      mimeType
        .split('/')
        .pop()
        ?.toLowerCase();


    if (mimeExtension) {
      if (mimeExtension === 'quicktime') {
        return 'mov';
      }

      if (mimeExtension === 'jpeg') {
        return 'jpg';
      }

      return mimeExtension;
    }


    return type === 'video'
      ? 'mp4'
      : 'jpg';
  };


  // ========================================================
  // Supabase Storage 업로드
  // ========================================================

  const uploadMedia = async (
    requestId: string,
    userId: string,
    asset: ImagePicker.ImagePickerAsset,
    type: 'image' | 'video',
    index: number
  ): Promise<UploadResult> => {

    if (!asset.uri) {
      throw new Error(
        '첨부파일 경로를 확인할 수 없습니다.'
      );
    }


    // React Native에서는
    // Supabase Storage에 ArrayBuffer 방식으로 업로드
    const fileResponse =
      await fetch(asset.uri);


    if (!fileResponse.ok) {
      throw new Error(
        '첨부파일을 읽을 수 없습니다.'
      );
    }


    const arrayBuffer =
      await fileResponse.arrayBuffer();


    const extension =
      getExtension(
        asset,
        type
      );


    const fileName =
      type === 'image'
        ? `image_${index}.${extension}`
        : `video_${index}.${extension}`;


    const storagePath =
      `${userId}/${requestId}/${fileName}`;


    const contentType =
      asset.mimeType ??
      (
        type === 'video'
          ? 'video/mp4'
          : 'image/jpeg'
      );


    const {
      data,
      error,
    } = await supabase
      .storage
      .from('as-media')
      .upload(
        storagePath,
        arrayBuffer,
        {
          contentType,
          upsert: false,
        }
      );


    if (error) {
      console.error(
        'Storage upload error:',
        error
      );

      throw new Error(
        `파일 업로드 실패: ${error.message}`
      );
    }


    return {
      path: data.path,

      mimeType:
        contentType,

      fileName:
        asset.fileName ??
        fileName,
    };
  };


  // ========================================================
  // AI 접수 시작
  // ========================================================

  const submitAiAnalysis = async () => {
    if (submitting) {
      return;
    }


    if (!user?.id) {
      Alert.alert(
        '로그인 필요',
        '로그인 후 이용해주세요.'
      );

      return;
    }


    const cleanDescription =
      description.trim();


    if (cleanDescription.length < 2) {
      Alert.alert(
        '증상 입력',
        '어떤 문제가 있는지 조금 더 자세히 입력해주세요.'
      );

      return;
    }


    const apiUrl =
      process.env
        .EXPO_PUBLIC_AS_AI_API_URL;


    if (!apiUrl) {
      Alert.alert(
        'AI 서버 설정 오류',
        'EXPO_PUBLIC_AS_AI_API_URL 환경변수가 설정되지 않았습니다.'
      );

      return;
    }


    setSubmitting(true);

    setAnalysisResult(null);

    setUploadProgress(
      '접수를 준비하고 있어요...'
    );


    let requestId:
      string | null = null;


    try {
      // ====================================================
      // 1. Supabase A/S 요청 생성
      // ====================================================

      const {
        data: requestData,
        error: requestError,
      } = await supabase
        .from('as_requests')
        .insert({
          user_id:
            user.id,

          description:
            cleanDescription,

          status:
            'pending',
        })
        .select()
        .single();


      if (requestError) {
        console.error(
          'as_requests insert error:',
          requestError
        );

        throw new Error(
          `A/S 요청 생성 실패: ${requestError.message}`
        );
      }


      if (!requestData?.id) {
        throw new Error(
          '생성된 A/S 요청 ID를 확인할 수 없습니다.'
        );
      }


      requestId =
        requestData.id;


      setCreatedRequestId(
        requestData.id
      );


      // ====================================================
      // 2. 사진 Storage 업로드
      // ====================================================

      for (
        let index = 0;
        index < images.length;
        index++
      ) {
        setUploadProgress(
          `사진 ${index + 1}/${images.length} 업로드 중...`
        );


        const asset =
          images[index];


        const uploaded =
          await uploadMedia(
            requestData.id,
            user.id,
            asset,
            'image',
            index
          );


        const {
          error: mediaInsertError,
        } = await supabase
          .from('as_request_media')
          .insert({
            request_id:
              requestData.id,

            user_id:
              user.id,

            media_type:
              'image',

            storage_bucket:
              'as-media',

            storage_path:
              uploaded.path,

            original_filename:
              uploaded.fileName,

            mime_type:
              uploaded.mimeType,

            sort_order:
              index,
          });


        if (mediaInsertError) {
          console.error(
            'as_request_media image insert:',
            mediaInsertError
          );

          throw new Error(
            `사진 정보 저장 실패: ${mediaInsertError.message}`
          );
        }
      }


      // ====================================================
      // 3. 영상 Storage 업로드
      // ====================================================

      if (video) {
        setUploadProgress(
          '영상을 업로드하고 있어요...'
        );


        const uploaded =
          await uploadMedia(
            requestData.id,
            user.id,
            video,
            'video',
            0
          );


        const {
          error: videoInsertError,
        } = await supabase
          .from('as_request_media')
          .insert({
            request_id:
              requestData.id,

            user_id:
              user.id,

            media_type:
              'video',

            storage_bucket:
              'as-media',

            storage_path:
              uploaded.path,

            original_filename:
              uploaded.fileName,

            mime_type:
              uploaded.mimeType,

            // 사진 다음에 영상이 오도록
            sort_order:
              100,
          });


        if (videoInsertError) {
          console.error(
            'as_request_media video insert:',
            videoInsertError
          );

          throw new Error(
            `영상 정보 저장 실패: ${videoInsertError.message}`
          );
        }
      }


      // ====================================================
      // 4. 업로드 완료 상태
      // ====================================================

      const {
        error: uploadedStatusError,
      } = await supabase
        .from('as_requests')
        .update({
          status:
            'uploaded',

          error_message:
            null,
        })
        .eq(
          'id',
          requestData.id
        );


      if (uploadedStatusError) {
        throw new Error(
          `접수 상태 변경 실패: ${uploadedStatusError.message}`
        );
      }


      // ====================================================
      // 5. FastAPI 자체 AI 호출
      // ====================================================

      setUploadProgress(
        'AI가 사진과 영상을 분석하고 있어요...'
      );


      const normalizedApiUrl =
        apiUrl.replace(
          /\/+$/,
          ''
        );


      const response =
        await fetch(
          `${normalizedApiUrl}/analyze-request/${requestData.id}`,
          {
            method:
              'POST',

            headers: {
              Accept:
                'application/json',
            },
          }
        );


      let result:
        AiAnalysisResponse & {
          detail?: unknown;
        };


      try {
        result =
          await response.json();

      } catch {
        throw new Error(
          'AI 서버 응답을 읽을 수 없습니다.'
        );
      }


      if (!response.ok) {
        console.error(
          'AI server error:',
          result
        );


        let message =
          'AI 분석에 실패했습니다.';


        if (
          typeof result.detail ===
          'string'
        ) {
          message =
            result.detail;
        }


        throw new Error(
          message
        );
      }


      if (
        !result.success ||
        !result.report
      ) {
        throw new Error(
          'AI 분석 결과가 올바르지 않습니다.'
        );
      }


      // ====================================================
      // 6. 성공
      // ====================================================

      console.log(
        'AI 분석 결과:',
        result
      );


      setAnalysisResult(
        result
      );


      setUploadProgress('');


      Alert.alert(
        '분석 완료',
        '집수리 AI 분석이 완료되었습니다.'
      );

    } catch (error) {
      console.error(
        'A/S AI 접수 오류:',
        error
      );


      const errorMessage =
        error instanceof Error
          ? error.message
          : '접수 중 오류가 발생했습니다.';


      // 이미 request가 만들어졌다면
      // 실패 상태 저장
      if (requestId) {
        try {
          await supabase
            .from('as_requests')
            .update({
              status:
                'failed',

              error_message:
                errorMessage,
            })
            .eq(
              'id',
              requestId
            );

        } catch (
          statusUpdateError
        ) {
          console.error(
            'failed 상태 저장 오류:',
            statusUpdateError
          );
        }
      }


      setUploadProgress('');


      Alert.alert(
        '접수 실패',
        errorMessage
      );

    } finally {
      setSubmitting(false);
    }
  };


  // ========================================================
  // 새로운 분석
  // ========================================================

  const resetForm = () => {
    setDescription('');

    setImages([]);

    setVideo(null);

    setAnalysisResult(null);

    setCreatedRequestId(null);

    setUploadProgress('');
  };


  // ========================================================
  // 화면
  // ========================================================

  return (
    <SafeAreaView
      style={styles.screen}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() =>
            router.back()
          }
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
        >
          <Ionicons
            name="chevron-back"
            size={26}
            color={theme.text}
          />
        </TouchableOpacity>

        <Text
          style={styles.headerTitle}
        >
          집수리 A/S 접수
        </Text>

        <View
          style={styles.headerButton}
        />
      </View>


      <ScrollView
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* ================================================= */}
        {/* 소개 */}
        {/* ================================================= */}

        <View style={styles.intro}>
          <View
            style={styles.introIcon}
          >
            <Ionicons
              name="sparkles-outline"
              size={28}
              color={theme.primary}
            />
          </View>

          <View style={styles.flex}>
            <Text
              style={styles.introTitle}
            >
              고장 난 곳을 알려주세요
            </Text>

            <Text
              style={styles.muted}
            >
              증상과 사진·영상을 올리면 AI가 먼저
              문제를 분석해드려요.
            </Text>
          </View>
        </View>


        {/* ================================================= */}
        {/* 증상 설명 */}
        {/* ================================================= */}

        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
          >
            어떤 문제가 있나요?
          </Text>

          <Text
            style={styles.sectionDescription}
          >
            언제부터 어떤 증상이 발생하는지
            자세히 작성할수록 분석 정확도가 높아집니다.
          </Text>

          <TextInput
            value={description}
            onChangeText={(text) => {
              setDescription(text);

              setAnalysisResult(null);
            }}
            editable={!submitting}
            multiline
            maxLength={3000}
            placeholder={
              '예) 세면대 아래에서 물이 새는데 물을 사용할 때만 물방울이 떨어져요.'
            }
            placeholderTextColor={
              theme.textMuted
            }
            style={styles.textInput}
          />

          <Text
            style={styles.characterCount}
          >
            {description.length}/3000
          </Text>
        </View>


        {/* ================================================= */}
        {/* 사진 */}
        {/* ================================================= */}

        <View style={styles.section}>
          <View
            style={styles.sectionHeader}
          >
            <View style={styles.flex}>
              <Text
                style={styles.sectionTitle}
              >
                사진
              </Text>

              <Text
                style={styles.sectionDescription}
              >
                전체 모습과 문제 부위를 가까이 찍으면
                좋아요.
              </Text>
            </View>

            <Text
              style={styles.countText}
            >
              {images.length}/{MAX_IMAGES}
            </Text>
          </View>


          <TouchableOpacity
            style={styles.mediaButton}
            disabled={
              submitting ||
              images.length >= MAX_IMAGES
            }
            onPress={pickImages}
          >
            <Ionicons
              name="images-outline"
              size={23}
              color={
                images.length >= MAX_IMAGES
                  ? theme.textMuted
                  : theme.primary
              }
            />

            <Text
              style={[
                styles.mediaButtonText,

                images.length >=
                  MAX_IMAGES && {
                  color:
                    theme.textMuted,
                },
              ]}
            >
              {images.length >=
              MAX_IMAGES
                ? '사진 5장 선택 완료'
                : '사진 선택하기'}
            </Text>
          </TouchableOpacity>


          {images.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={
                false
              }
              contentContainerStyle={
                styles.imageList
              }
            >
              {images.map(
                (asset, index) => (
                  <View
                    key={
                      `${asset.uri}-${index}`
                    }
                    style={
                      styles.imageContainer
                    }
                  >
                    <Image
                      source={{
                        uri:
                          asset.uri,
                      }}
                      style={
                        styles.previewImage
                      }
                    />

                    <View
                      style={
                        styles.imageNumber
                      }
                    >
                      <Text
                        style={
                          styles.imageNumberText
                        }
                      >
                        {index + 1}
                      </Text>
                    </View>


                    {!submitting && (
                      <TouchableOpacity
                        style={
                          styles.removeMediaButton
                        }
                        onPress={() =>
                          removeImage(
                            index
                          )
                        }
                      >
                        <Ionicons
                          name="close"
                          size={18}
                          color="#fff"
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                )
              )}
            </ScrollView>
          )}
        </View>


        {/* ================================================= */}
        {/* 동영상 */}
        {/* ================================================= */}

        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
          >
            동영상
          </Text>

          <Text
            style={
              styles.sectionDescription
            }
          >
            누수, 소음, 움직임처럼 사진으로 설명하기
            어려운 증상은 최대 60초 영상으로
            보여주세요.
          </Text>


          {!video ? (
            <TouchableOpacity
              style={
                styles.mediaButton
              }
              disabled={submitting}
              onPress={pickVideo}
            >
              <Ionicons
                name="videocam-outline"
                size={24}
                color={theme.primary}
              />

              <Text
                style={
                  styles.mediaButtonText
                }
              >
                영상 선택하기
              </Text>
            </TouchableOpacity>
          ) : (
            <View
              style={
                styles.videoCard
              }
            >
              <View
                style={
                  styles.videoIcon
                }
              >
                <Ionicons
                  name="videocam"
                  size={26}
                  color={theme.primary}
                />
              </View>

              <View
                style={styles.flex}
              >
                <Text
                  style={
                    styles.videoName
                  }
                  numberOfLines={1}
                >
                  {video.fileName ??
                    '첨부 영상'}
                </Text>

                <Text
                  style={styles.muted}
                >
                  {video.duration
                    ? `${Math.ceil(
                        video.duration /
                          1000
                      )}초`
                    : '영상 1개 선택됨'}
                </Text>
              </View>


              {!submitting && (
                <TouchableOpacity
                  style={
                    styles.videoDeleteButton
                  }
                  onPress={
                    removeVideo
                  }
                >
                  <Ionicons
                    name="trash-outline"
                    size={21}
                    color="#d14343"
                  />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>


        {/* ================================================= */}
        {/* AI 분석 버튼 */}
        {/* ================================================= */}

        {!analysisResult && (
          <View style={styles.section}>
            <TouchableOpacity
              style={[
                styles.submitButton,

                submitting &&
                  styles.submitButtonDisabled,
              ]}
              disabled={submitting}
              onPress={
                submitAiAnalysis
              }
            >
              {submitting ? (
                <>
                  <ActivityIndicator
                    color="#fff"
                  />

                  <Text
                    style={
                      styles.submitButtonText
                    }
                  >
                    분석 중...
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name="sparkles"
                    size={22}
                    color="#fff"
                  />

                  <Text
                    style={
                      styles.submitButtonText
                    }
                  >
                    AI로 문제 분석하기
                  </Text>
                </>
              )}
            </TouchableOpacity>


            {submitting &&
            uploadProgress ? (
              <View
                style={
                  styles.progressBox
                }
              >
                <ActivityIndicator
                  size="small"
                  color={theme.primary}
                />

                <Text
                  style={
                    styles.progressText
                  }
                >
                  {uploadProgress}
                </Text>
              </View>
            ) : null}
          </View>
        )}


        {/* ================================================= */}
        {/* AI 결과 */}
        {/* ================================================= */}

        {analysisResult?.report && (
          <AnalysisResult
            report={
              analysisResult.report
            }
            requestId={
              createdRequestId ??
              analysisResult.request_id
            }
            theme={theme}
            styles={styles}
            onReset={resetForm}
          />
        )}


        {/* ================================================= */}
        {/* 안내 */}
        {/* ================================================= */}

        <View style={styles.notice}>
          <Ionicons
            name="information-circle-outline"
            size={22}
            color={theme.primary}
          />

          <Text
            style={styles.noticeText}
          >
            AI 분석은 사전 안내용입니다. 가스, 전기,
            화재, 구조체 문제 등 위험한 상황은 직접
            수리하지 말고 전문가의 점검을 받아주세요.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}


// ==========================================================
// 분석 결과 UI
// ==========================================================

function AnalysisResult({
  report,
  requestId,
  theme,
  styles,
  onReset,
}: {
  report: AiReport;

  requestId?: string;

  theme: AsPalette;

  styles: ReturnType<
    typeof createStyles
  >;

  onReset: () => void;
}) {
  const confidence =
    typeof report.confidence ===
    'number'
      ? Math.round(
          report.confidence * 100
        )
      : null;


  return (
    <View
      style={styles.resultContainer}
    >
      <View
        style={styles.resultHeader}
      >
        <View
          style={
            styles.resultSuccessIcon
          }
        >
          <Ionicons
            name="checkmark-circle"
            size={30}
            color={theme.positive}
          />
        </View>

        <View style={styles.flex}>
          <Text
            style={styles.resultEyebrow}
          >
            AI 사전 분석 완료
          </Text>

          <Text
            style={styles.resultTitle}
          >
            {report.title ||
              report.subtype_label ||
              report.category_label ||
              '집수리 분석 결과'}
          </Text>
        </View>
      </View>


      <View
        style={styles.badgeRow}
      >
        {report.category_label && (
          <View style={styles.badge}>
            <Text
              style={styles.badgeText}
            >
              {report.category_label}
            </Text>
          </View>
        )}


        {report.subtype_label && (
          <View style={styles.badge}>
            <Text
              style={styles.badgeText}
            >
              {report.subtype_label}
            </Text>
          </View>
        )}


        {confidence != null && (
          <View
            style={
              styles.confidenceBadge
            }
          >
            <Text
              style={
                styles.confidenceText
              }
            >
              신뢰도 {confidence}%
            </Text>
          </View>
        )}
      </View>


      {report.summary ? (
        <ResultSection
          title="분석 요약"
          icon="document-text-outline"
          items={[report.summary]}
          styles={styles}
        />
      ) : null}


      <View style={styles.diyCard}>
        <Ionicons
          name={
            report.diy_possible
              ? 'construct-outline'
              : 'warning-outline'
          }
          size={26}
          color={
            report.diy_possible
              ? theme.positive
              : '#d14343'
          }
        />

        <View style={styles.flex}>
          <Text
            style={styles.diyTitle}
          >
            {report.diy_possible
              ? '셀프수리 가능성이 있어요'
              : '직접 수리는 권장하지 않아요'}
          </Text>

          {report.professional_required &&
          report.professional_type ? (
            <Text
              style={styles.muted}
            >
              권장 전문가:{' '}
              {
                report.professional_type
              }
            </Text>
          ) : null}
        </View>
      </View>


      <ResultSection
        title="예상 원인"
        icon="search-outline"
        items={
          report.possible_causes
        }
        styles={styles}
      />


      <ResultSection
        title="추가로 확인해보세요"
        icon="eye-outline"
        items={
          report.additional_checks
        }
        styles={styles}
      />


      <ResultSection
        title="필요한 공구"
        icon="hammer-outline"
        items={report.tools}
        styles={styles}
      />


      <ResultSection
        title="필요할 수 있는 부품"
        icon="cube-outline"
        items={report.parts}
        styles={styles}
      />


      <ResultSection
        title="수리 방법"
        icon="list-outline"
        items={report.steps}
        styles={styles}
        numbered
      />


      <ResultSection
        title="안전 주의사항"
        icon="shield-outline"
        items={
          report.safety_warnings
        }
        styles={styles}
      />


      <ResultSection
        title="작업을 중단해야 하는 경우"
        icon="hand-left-outline"
        items={
          report.stop_conditions
        }
        styles={styles}
      />


      <ResultSection
        title="추가 사진이 있으면 좋아요"
        icon="camera-outline"
        items={
          report.additional_photo_requests
        }
        styles={styles}
      />


      {requestId ? (
        <Text
          style={styles.requestIdText}
        >
          접수번호: {requestId}
        </Text>
      ) : null}


      <TouchableOpacity
        style={
          styles.resetButton
        }
        onPress={onReset}
      >
        <Ionicons
          name="refresh-outline"
          size={20}
          color={theme.primary}
        />

        <Text
          style={
            styles.resetButtonText
          }
        >
          새로운 문제 분석하기
        </Text>
      </TouchableOpacity>
    </View>
  );
}


// ==========================================================
// 결과 배열 표시
// ==========================================================

function ResultSection({
  title,
  icon,
  items,
  styles,
  numbered = false,
}: {
  title: string;

  icon:
    React.ComponentProps<
      typeof Ionicons
    >['name'];

  items?: string[];

  styles: ReturnType<
    typeof createStyles
  >;

  numbered?: boolean;
}) {
  if (!items?.length) {
    return null;
  }


  return (
    <View
      style={styles.resultSection}
    >
      <View
        style={
          styles.resultSectionHeader
        }
      >
        <Ionicons
          name={icon}
          size={20}
          color={
            styles.resultSectionTitle
              .color as string
          }
        />

        <Text
          style={
            styles.resultSectionTitle
          }
        >
          {title}
        </Text>
      </View>


      <View style={{ gap: 8 }}>
        {items.map(
          (item, index) => (
            <View
              key={`${title}-${index}`}
              style={
                styles.resultItem
              }
            >
              <Text
                style={
                  styles.resultBullet
                }
              >
                {numbered
                  ? `${index + 1}.`
                  : '•'}
              </Text>

              <Text
                style={
                  styles.resultItemText
                }
              >
                {item.replace(
                  /^\d+\.\s*/,
                  ''
                )}
              </Text>
            </View>
          )
        )}
      </View>
    </View>
  );
}


// ==========================================================
// 스타일
// ==========================================================

function createStyles(
  theme: AsPalette
) {
  return StyleSheet.create({
    screen: {
      flex: 1,

      backgroundColor:
        theme.background,
    },


    header: {
      minHeight: 56,

      flexDirection: 'row',

      alignItems: 'center',

      justifyContent:
        'space-between',

      paddingHorizontal: 12,

      borderBottomWidth: 1,

      borderBottomColor:
        theme.border,
    },


    headerButton: {
      width: 44,

      height: 44,

      alignItems: 'center',

      justifyContent:
        'center',
    },


    headerTitle: {
      fontSize: 18,

      fontWeight: '700',

      color: theme.text,
    },


    content: {
      width: '100%',

      maxWidth: 680,

      alignSelf: 'center',

      padding: 20,

      paddingBottom: 50,

      gap: 22,
    },


    flex: {
      flex: 1,

      minWidth: 0,
    },


    intro: {
      flexDirection: 'row',

      alignItems: 'center',

      gap: 12,

      padding: 16,

      borderRadius: 12,

      backgroundColor:
        theme.primarySoft,
    },


    introIcon: {
      width: 48,

      height: 48,

      borderRadius: 24,

      alignItems: 'center',

      justifyContent:
        'center',

      backgroundColor:
        theme.surface,
    },


    introTitle: {
      fontSize: 17,

      lineHeight: 24,

      fontWeight: '700',

      color: theme.text,

      marginBottom: 4,
    },


    section: {
      gap: 10,
    },


    sectionHeader: {
      flexDirection: 'row',

      alignItems:
        'flex-start',

      justifyContent:
        'space-between',

      gap: 10,
    },


    sectionTitle: {
      fontSize: 17,

      lineHeight: 24,

      fontWeight: '700',

      color: theme.text,
    },


    sectionDescription: {
      fontSize: 12,

      lineHeight: 19,

      color: theme.textMuted,
    },


    muted: {
      fontSize: 12,

      lineHeight: 19,

      color: theme.textMuted,
    },


    characterCount: {
      alignSelf:
        'flex-end',

      fontSize: 11,

      color: theme.textMuted,
    },


    textInput: {
      minHeight: 130,

      borderWidth: 1,

      borderColor:
        theme.border,

      borderRadius: 10,

      padding: 14,

      fontSize: 15,

      lineHeight: 23,

      color: theme.text,

      backgroundColor:
        theme.surface,

      textAlignVertical:
        'top',
    },


    countText: {
      fontSize: 13,

      fontWeight: '700',

      color: theme.primary,
    },


    mediaButton: {
      minHeight: 54,

      borderWidth: 1,

      borderColor:
        theme.border,

      borderRadius: 10,

      backgroundColor:
        theme.surface,

      flexDirection: 'row',

      alignItems: 'center',

      justifyContent:
        'center',

      gap: 8,
    },


    mediaButtonText: {
      fontSize: 14,

      fontWeight: '600',

      color: theme.primary,
    },


    imageList: {
      gap: 10,

      paddingVertical: 2,
    },


    imageContainer: {
      width: 110,

      height: 110,

      borderRadius: 10,

      overflow: 'hidden',

      backgroundColor:
        theme.surfaceSoft,
    },


    previewImage: {
      width: '100%',

      height: '100%',
    },


    imageNumber: {
      position: 'absolute',

      left: 6,

      bottom: 6,

      width: 24,

      height: 24,

      borderRadius: 12,

      backgroundColor:
        'rgba(0,0,0,0.65)',

      alignItems: 'center',

      justifyContent:
        'center',
    },


    imageNumberText: {
      color: '#fff',

      fontSize: 11,

      fontWeight: '700',
    },


    removeMediaButton: {
      position: 'absolute',

      top: 6,

      right: 6,

      width: 28,

      height: 28,

      borderRadius: 14,

      backgroundColor:
        'rgba(0,0,0,0.65)',

      alignItems: 'center',

      justifyContent:
        'center',
    },


    videoCard: {
      minHeight: 70,

      flexDirection: 'row',

      alignItems: 'center',

      gap: 12,

      padding: 12,

      borderRadius: 10,

      borderWidth: 1,

      borderColor:
        theme.border,

      backgroundColor:
        theme.surface,
    },


    videoIcon: {
      width: 46,

      height: 46,

      borderRadius: 10,

      backgroundColor:
        theme.primarySoft,

      alignItems: 'center',

      justifyContent:
        'center',
    },


    videoName: {
      fontSize: 14,

      fontWeight: '600',

      color: theme.text,
    },


    videoDeleteButton: {
      width: 42,

      height: 42,

      alignItems: 'center',

      justifyContent:
        'center',
    },


    submitButton: {
      minHeight: 58,

      borderRadius: 10,

      backgroundColor:
        theme.action,

      flexDirection: 'row',

      alignItems: 'center',

      justifyContent:
        'center',

      gap: 9,
    },


    submitButtonDisabled: {
      opacity: 0.65,
    },


    submitButtonText: {
      color: '#fff',

      fontSize: 17,

      fontWeight: '800',
    },


    progressBox: {
      flexDirection: 'row',

      alignItems: 'center',

      justifyContent:
        'center',

      gap: 9,

      padding: 12,
    },


    progressText: {
      fontSize: 13,

      color: theme.textMuted,
    },


    notice: {
      flexDirection: 'row',

      alignItems:
        'flex-start',

      gap: 9,

      padding: 14,

      borderRadius: 10,

      backgroundColor:
        theme.surfaceMuted,
    },


    noticeText: {
      flex: 1,

      fontSize: 12,

      lineHeight: 19,

      color: theme.textMuted,
    },


    resultContainer: {
      gap: 16,

      padding: 18,

      borderRadius: 12,

      backgroundColor:
        theme.surface,

      borderWidth: 1,

      borderColor:
        theme.border,
    },


    resultHeader: {
      flexDirection: 'row',

      alignItems: 'center',

      gap: 10,
    },


    resultSuccessIcon: {
      width: 48,

      height: 48,

      borderRadius: 24,

      backgroundColor:
        theme.positiveSoft,

      alignItems: 'center',

      justifyContent:
        'center',
    },


    resultEyebrow: {
      color:
        theme.positive,

      fontSize: 12,

      fontWeight: '700',

      marginBottom: 2,
    },


    resultTitle: {
      color: theme.text,

      fontSize: 19,

      lineHeight: 27,

      fontWeight: '800',
    },


    badgeRow: {
      flexDirection: 'row',

      flexWrap: 'wrap',

      gap: 7,
    },


    badge: {
      paddingHorizontal: 10,

      paddingVertical: 6,

      borderRadius: 20,

      backgroundColor:
        theme.primarySoft,
    },


    badgeText: {
      color: theme.primary,

      fontSize: 12,

      fontWeight: '700',
    },


    confidenceBadge: {
      paddingHorizontal: 10,

      paddingVertical: 6,

      borderRadius: 20,

      backgroundColor:
        theme.surfaceMuted,
    },


    confidenceText: {
      color: theme.textMuted,

      fontSize: 12,

      fontWeight: '600',
    },


    diyCard: {
      flexDirection: 'row',

      alignItems: 'center',

      gap: 10,

      padding: 13,

      borderRadius: 10,

      backgroundColor:
        theme.surfaceMuted,
    },


    diyTitle: {
      color: theme.text,

      fontSize: 15,

      lineHeight: 22,

      fontWeight: '700',
    },


    resultSection: {
      gap: 10,

      paddingTop: 4,
    },


    resultSectionHeader: {
      flexDirection: 'row',

      alignItems: 'center',

      gap: 7,
    },


    resultSectionTitle: {
      fontSize: 15,

      lineHeight: 22,

      fontWeight: '700',

      color: theme.primary,
    },


    resultItem: {
      flexDirection: 'row',

      alignItems:
        'flex-start',

      gap: 8,
    },


    resultBullet: {
      width: 22,

      color: theme.primary,

      fontSize: 14,

      lineHeight: 22,

      fontWeight: '700',

      textAlign: 'center',
    },


    resultItemText: {
      flex: 1,

      color: theme.text,

      fontSize: 14,

      lineHeight: 22,
    },


    requestIdText: {
      fontSize: 10,

      lineHeight: 16,

      color: theme.textMuted,
    },


    resetButton: {
      minHeight: 50,

      flexDirection: 'row',

      alignItems: 'center',

      justifyContent:
        'center',

      gap: 7,

      borderWidth: 1,

      borderColor:
        theme.primary,

      borderRadius: 10,
    },


    resetButtonText: {
      color: theme.primary,

      fontSize: 14,

      fontWeight: '700',
    },
  });
}