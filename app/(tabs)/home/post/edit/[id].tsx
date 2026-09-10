// 게시글 수정 라우트: 공용 ListingForm에 기존 게시글 id를 넘겨 편집 모드로 연다.
import { useLocalSearchParams } from 'expo-router';
import ListingForm from '../../../../../components/ListingForm';

export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const rawId = Array.isArray(id) ? id[0] : id;
  const listingId = rawId ? Number(rawId) : null;

  return <ListingForm mode="edit" listingId={listingId} />;
}
