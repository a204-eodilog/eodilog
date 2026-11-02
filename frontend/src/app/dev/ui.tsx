import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  AvatarGroup,
  BottomSheet,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  MascotTraveler,
  type IconName,
  TabBar,
  type TabKey,
  TextField,
} from '@/components/ui';
import { colors, layout, spacing, typography } from '@/theme';

const ICONS: IconName[] = [
  'back',
  'close',
  'plus',
  'check',
  'chevron-right',
  'search',
  'home',
  'trip',
  'bookmark',
  'chat',
  'person',
  'people',
  'bell',
  'map-pin',
  'calendar',
  'link',
  'copy',
  'alert',
];

const TASTES = ['바다', '맛집', '카페', '산책', '야경', '사진'];

/** 개발용 부품 모아 보기. 앱 흐름에는 안 나오고 /dev/ui로만 들어온다. */
export default function UiCatalog() {
  const [tab, setTab] = useState<TabKey>('home');
  const [filter, setFilter] = useState<'all' | 'overlap'>('all');
  const [tastes, setTastes] = useState<string[]>(['바다']);
  const [name, setName] = useState('겨울 여행');
  const [nickname, setNickname] = useState('');
  const [sheet, setSheet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'catalog' | 'empty' | 'error'>('catalog');

  const toggleTaste = (t: string) =>
    setTastes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const fakeLoad = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1500);
  };

  if (view === 'empty') {
    return (
      <SafeAreaView style={styles.screen}>
        <Header
          title="여행"
          hideBack
          right={
            <Button label="돌아가기" variant="text" size="sm" onPress={() => setView('catalog')} />
          }
        />
        <EmptyState
          title="아직 여행이 없어요"
          description="새 여행을 만들거나 초대 링크로 참여해요"
          actionLabel="새 여행"
          onAction={() => setView('catalog')}
          illustration={<MascotTraveler />}
        />
        <TabBar active="trip" onChange={() => setView('catalog')} />
      </SafeAreaView>
    );
  }

  if (view === 'error') {
    return (
      <SafeAreaView style={styles.screen}>
        <Header title="여행 상세" onBack={() => setView('catalog')} />
        <ErrorState onRetry={() => setView('catalog')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Header
        title="부품 모아 보기"
        subtitle="개발용 · /dev/ui"
        hideBack
        right={<Icon name="bell" color={colors.text.default} />}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="버튼">
          <Row>
            <Button label="주 버튼" />
            <Button label="보조" variant="secondary" />
            <Button label="회색" variant="neutral" />
          </Row>
          <Row>
            <Button label="나가기" variant="danger" />
            <Button label="글자 버튼" variant="text" />
            <Button label="누를 수 없음" disabled />
          </Row>
          <Row>
            <Button label="작게" size="sm" variant="secondary" />
            <Button label="중간" size="md" variant="secondary" />
            <Button label="기본" size="lg" variant="secondary" />
          </Row>
          <Button
            label={loading ? '' : '여행 만들기 (누르면 1.5초 기다림)'}
            size="xl"
            block
            loading={loading}
            onPress={fakeLoad}
          />
          <Button
            label="아이콘 붙인 버튼"
            variant="secondary"
            leading={<Icon name="plus" size={20} color={colors.brand.primary} />}
          />
        </Section>

        <Section title="입력칸">
          <TextField
            label="여행 이름"
            required
            large
            value={name}
            onChangeText={setName}
            maxLength={200}
            placeholder="어떤 여행을 떠나시나요?"
            helper="이름만 정하면 바로 시작할 수 있어요"
          />
          <TextField
            label="닉네임"
            placeholder="친구에게 보이는 이름이에요"
            value={nickname}
            onChangeText={setNickname}
            maxLength={50}
          />
          <TextField
            label="오류 예시"
            value=""
            placeholder="비워 두면"
            error="여행 이름을 입력해 주세요"
          />
        </Section>

        <Section title="칩 · 필터">
          <Row>
            <Chip label="전체 5" selected={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip
              label="겹친 곳 3"
              selected={filter === 'overlap'}
              onPress={() => setFilter('overlap')}
            />
            <Chip label="누를 수 없음" disabled />
          </Row>
        </Section>

        <Section title="칩 · 여러 개 고르기 (취향)">
          <Row>
            {TASTES.map((t) => (
              <Chip
                key={t}
                label={t}
                size="md"
                selected={tastes.includes(t)}
                onPress={() => toggleTaste(t)}
              />
            ))}
          </Row>
          <Text style={[typography.caption, styles.muted]}>
            고른 것: {tastes.join(', ') || '없음'}
          </Text>
        </Section>

        <Section title="동행 얼굴">
          <Row>
            <Avatar name="세은" size="sm" />
            <Avatar name="승기" size="md" />
            <Avatar name="영광" size="lg" />
            <Avatar name="사진" size="lg" imageUrl="https://picsum.photos/seed/eodilog/80" />
          </Row>
          <Row>
            <AvatarGroup people={[{ name: '세은' }, { name: '승기' }]} />
            <AvatarGroup
              people={[
                { name: '세은' },
                { name: '승기' },
                { name: '영광' },
                { name: '성환' },
                { name: '인경' },
                { name: '수철' },
              ]}
            />
          </Row>
        </Section>

        <Section title="아이콘">
          <Row>
            {ICONS.map((n) => (
              <View key={n} style={styles.iconCell}>
                <Icon name={n} />
                <Text style={[typography.micro, styles.muted]}>{n}</Text>
              </View>
            ))}
          </Row>
        </Section>

        <Section title="하단 시트">
          <Button
            label="나가기 확인 시트 열기"
            variant="secondary"
            onPress={() => setSheet(true)}
          />
        </Section>

        <Section title="빈 화면 · 오류 화면">
          <Row>
            <Button label="빈 화면 보기" variant="neutral" onPress={() => setView('empty')} />
            <Button label="오류 화면 보기" variant="neutral" onPress={() => setView('error')} />
          </Row>
        </Section>

        <Section title="글자 스타일">
          {(Object.keys(typography) as (keyof typeof typography)[]).map((k) => (
            <Text key={k} style={[typography[k], styles.text]}>
              {k} · 어디로 떠날지 친구 여행에서 찾아봐요
            </Text>
          ))}
        </Section>
      </ScrollView>

      <TabBar active={tab} onChange={setTab} badges={{ chat: true }} />

      <BottomSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="겨울 여행에서 나갈까요?"
        description="나가면 이렇게 바뀌어요"
        footer={
          <>
            <Button label="취소" variant="text" onPress={() => setSheet(false)} />
            <Button label="나가기" variant="danger" onPress={() => setSheet(false)} />
          </>
        }
      >
        <View style={styles.sheetRow}>
          <Icon name="map-pin" size={20} />
          <Text style={[typography.body, styles.text]}>내 지도에서 이 여행이 빠져요</Text>
        </View>
        <View style={styles.sheetRow}>
          <Icon name="people" size={20} />
          <Text style={[typography.body, styles.text]}>경비 기록은 남아요</Text>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[typography.label, styles.sectionTitle]}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingVertical: spacing[16],
    gap: spacing[28],
  },
  section: { gap: spacing[12] },
  sectionTitle: { color: colors.text.sub },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8], alignItems: 'center' },
  text: { color: colors.text.default },
  muted: { color: colors.text.muted },
  iconCell: { width: 64, alignItems: 'center', gap: spacing[4] },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    paddingVertical: spacing[6],
  },
});
