import { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

type ListingMapItem = {
  id: number;
  title: string;
  category: 'trade' | 'share' | 'want';
  region: string | null;
  price_text: string | null;
  latitude: number;
  longitude: number;
};

type Props = {
  items: ListingMapItem[];
  onMarkerPress?: (item: ListingMapItem) => void;
};

const KAKAO_KEY = process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY || '';

export default function KakaoMapView({ items, onMarkerPress }: Props) {
  const html = useMemo(() => {
    const safeItems = JSON.stringify(items);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
          />
          <style>
            html, body, #map {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              overflow: hidden;
              background: #f3f4f6;
            }
          </style>
          <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false"></script>
        </head>
        <body>
          <div id="map"></div>
          <script>
            const listings = ${safeItems};

            function roundCoord(value, precision = 3) {
              const factor = Math.pow(10, precision);
              return Math.round(value * factor) / factor;
            }

            function getCategoryLabel(category) {
              if (category === 'trade') return '판매';
              if (category === 'share') return '나눔';
              return '구해요';
            }

            function getCategoryColor(category) {
              if (category === 'trade') return '#166534';
              if (category === 'share') return '#16a34a';
              return '#d97706';
            }

            kakao.maps.load(function () {
              const container = document.getElementById('map');
              const map = new kakao.maps.Map(container, {
                center: new kakao.maps.LatLng(37.5665, 126.9780),
                level: 7,
              });

              const grouped = new Map();

              listings.forEach((item) => {
                const lat = roundCoord(item.latitude, 3);
                const lng = roundCoord(item.longitude, 3);
                const key = lat + ',' + lng;
                const bucket = grouped.get(key) || [];
                bucket.push(item);
                grouped.set(key, bucket);
              });

              const bounds = new kakao.maps.LatLngBounds();

              grouped.forEach((bucket) => {
                const item = bucket[0];
                const position = new kakao.maps.LatLng(item.latitude, item.longitude);
                const single = bucket.length === 1;
                const color = single ? getCategoryColor(item.category) : '#111827';
                const label = single ? getCategoryLabel(item.category) : String(bucket.length);

                const content = \`
                  <div style="
                    min-width:44px;
                    height:44px;
                    padding:0 10px;
                    border-radius:22px;
                    background:\${color};
                    border:2px solid #ffffff;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    color:#ffffff;
                    font-size:12px;
                    font-weight:800;
                    box-sizing:border-box;
                    box-shadow:0 2px 8px rgba(0,0,0,0.15);
                    cursor:pointer;
                  ">
                    \${label}
                  </div>
                \`;

                const overlay = new kakao.maps.CustomOverlay({
                  position,
                  content,
                  yAnchor: 1,
                });

                overlay.setMap(map);

                if (overlay.a) {
                  overlay.a.onclick = function () {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'marker',
                      items: bucket
                    }));
                  };
                }

                bounds.extend(position);
              });

              if (listings.length > 0) {
                map.setBounds(bounds);
              }
            });
          </script>
        </body>
      </html>
    `;
  }, [items]);

  return (
    <View style={{ flex: 1 }}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        onMessage={(event) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data);

            if (payload?.type === 'marker' && Array.isArray(payload.items)) {
              if (payload.items.length === 1) {
                onMarkerPress?.(payload.items[0]);
              } else {
                // 여러 개면 첫 번째만 넘기는 대신
                // 나중에 modal/list 용으로 확장 가능
                onMarkerPress?.(payload.items[0]);
              }
            }
          } catch (e) {
            console.log('카카오 지도 메시지 파싱 실패:', e);
          }
        }}
      />
    </View>
  );
}
