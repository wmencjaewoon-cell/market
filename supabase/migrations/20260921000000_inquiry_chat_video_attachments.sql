-- 기존 사진 버킷/경로/접근 권한을 유지하고 동영상 MIME과 업로드 용량만 확장한다.
-- estimate_request_images.image_path에는 실제 파일 확장자를 기록하므로 테이블 변경은 필요 없다.
begin;

do $$
begin
  if (select count(*) from storage.buckets where id in ('estimate-images', 'chat-images')) <> 2 then
    raise exception 'estimate-images 또는 chat-images 버킷이 없습니다. 기존 사진 업로드용 버킷과 권한 설정을 먼저 확인해 주세요.';
  end if;
end;
$$;

update storage.buckets b
set
  allowed_mime_types = case
    -- NULL은 모든 MIME 허용이므로 기존 설정을 보존한다.
    when b.allowed_mime_types is null then null
    else array(
      select distinct mime
      from unnest(b.allowed_mime_types || array[
        'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
        'video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm'
      ]::text[]) as types(mime)
      order by mime
    )
  end,
  file_size_limit = greatest(coalesce(b.file_size_limit, 31457280::bigint), 31457280::bigint)
where b.id in ('estimate-images', 'chat-images');

-- public 여부, storage.objects 정책, 채팅/문의 RLS는 변경하지 않는다.
commit;
