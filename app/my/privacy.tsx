import { ActivityIndicator, Linking, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

const PRIVACY_POLICY_URL = 'https://wmencjaewoon-cell.github.io/privacy-policy-jajemarket/';

export default function PrivacyScreen() {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.screen}>
        <iframe src={PRIVACY_POLICY_URL} style={webFrameStyle} title="개인정보처리방침" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <WebView
        source={{ uri: PRIVACY_POLICY_URL }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" />
          </View>
        )}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url.startsWith(PRIVACY_POLICY_URL)) {
            return true;
          }

          Linking.openURL(request.url);
          return false;
        }}
      />
    </View>
  );
}

const webFrameStyle = {
  border: 'none',
  width: '100%',
  height: '100%',
} as const;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingBox: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
