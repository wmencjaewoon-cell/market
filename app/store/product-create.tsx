import { Stack } from 'expo-router';
import ListingForm from '../../components/ListingForm';

export default function StoreProductCreateScreen() {
  return (
    <>
      <Stack.Screen options={{ title: '상품 등록' }} />
      <ListingForm
        mode="create"
        createReturnTo="/store/product-create"
        createRedirectTo="/store/products"
      />
    </>
  );
}
