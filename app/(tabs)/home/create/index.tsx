// 게시글 작성 기본 라우트: 공용 ListingForm을 새 글 작성 모드로 연다.
import ListingForm from '../../../../components/ListingForm';

export default function CreateIndexScreen() {
  return <ListingForm mode="create" />;
}
