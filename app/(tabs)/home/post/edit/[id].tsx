import { useLocalSearchParams } from 'expo-router';
import ListingForm from '../../../../../components/ListingForm';

export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const rawId = Array.isArray(id) ? id[0] : id;
  const listingId = rawId ? Number(rawId) : null;

  return <ListingForm mode="edit" listingId={listingId} />;
}
