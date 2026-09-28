import { Image, StyleSheet, View } from 'react-native';
import { isVideoAttachment } from '../lib/mediaAttachments';
import { supabase } from '../lib/supabase';
import VideoAttachment from './VideoAttachment';

export default function AttachmentGallery({ attachments }: {
  attachments: { image_path: string; sort_order?: number | null }[];
}) {
  return (
    <View style={styles.gallery}>
      {[...attachments].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((attachment) => {
        const uri = supabase.storage.from('estimate-images').getPublicUrl(attachment.image_path).data.publicUrl;
        return isVideoAttachment(attachment.image_path)
          ? <VideoAttachment key={attachment.image_path} uri={uri} name="문의 첨부영상" />
          : <Image key={attachment.image_path} source={{ uri }} style={styles.image} resizeMode="contain" accessibilityLabel="문의 첨부사진" />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  gallery: { gap: 10 },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8 },
});
