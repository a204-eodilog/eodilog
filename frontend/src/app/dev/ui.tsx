import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  AvatarGroup,
  BottomSheet,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  MascotTraveler,
  type IconName,
  TabBar,
  Tag,
  type TabKey,
  TextField,
  toast,
} from '@/components/ui';
import { LeaveTripSheet } from '@/features/trip/components/leave-trip-sheet';
import type { LeaveTripFailure } from '@/features/trip/hooks/use-leave-trip';
import { formatThousands, parseAmount } from '@/lib/format-number';
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
  'info',
  'clock',
  'refresh',
  'card',
  'calculator',
  'star',
  'trash',
  'leave',
  'image',
];

/** 서버 상한 9,007,199,254,740,991원(16자리) + 쉼표 5개 */
const AMOUNT_MAX_LENGTH = 21;

type LeaveExample = 'member' | 'owner' | 'alone' | 'fail' | 'conflict';

const TASTES = ['바다', '맛집', '카페', '산책', '야경', '사진'];

/** 개발용 부품 모아 보기. 앱 흐름에는 안 나오고 /dev/ui로만 들어온다. */
export default function UiCatalog() {
  const [tab, setTab] = useState<TabKey>('home');
  const [filter, setFilter] = useState<'all' | 'overlap'>('all');
  const [tastes, setTastes] = useState<string[]>(['바다']);
  const [name, setName] = useState('겨울 여행');
  const [nickname, setNickname] = useState('');
  const [amount, setAmount] = useState('21,000');
  const [memo, setMemo] = useState('');
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState<'photo' | 'withdraw' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string>();
  const [leave, setLeave] = useState<LeaveExample | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveFailure, setLeaveFailure] = useState<LeaveTripFailure>();
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'catalog' | 'empty' | 'first' | 'error'>('catalog');

  const toggleTaste = (t: string) =>
    setTastes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const fakeLoad = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1500);
  };

  const openConfirm = (kind: 'photo' | 'withdraw') => {
    setConfirmError(undefined);
    setConfirm(kind);
  };

  // 사진 삭제는 1초 뒤 지운 것처럼, 탈퇴는 1초 뒤 실패한 것처럼 보여 준다
  const fakeConfirm = () => {
    setConfirming(true);
    setTimeout(() => {
      setConfirming(false);
      if (confirm === 'withdraw') {
        setConfirmError('탈퇴하지 못했어요');
        return;
      }
      setConfirm(null);
      toast.success('사진 2장을 지웠어요');
    }, 1000);
  };

  const openLeave = (kind: LeaveExample) => {
    setLeaveFailure(undefined);
    setLeave(kind);
  };

  // 실패·충돌 예시만 1초 뒤 실패하고, 나머지는 나간 것처럼 닫는다
  const fakeLeave = () => {
    setLeaving(true);
    setTimeout(() => {
      setLeaving(false);
      if (leave === 'fail' || leave === 'conflict') {
        setLeaveFailure(leave === 'fail' ? 'error' : 'conflict');
        return;
      }
      setLeave(null);
      toast.success(leave === 'alone' ? '여행을 삭제했어요' : '여행에서 나왔어요');
    }, 1000);
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
          icon="trip"
        />
        <TabBar active="trip" onChange={() => setView('catalog')} />
      </SafeAreaView>
    );
  }

  if (view === 'first') {
    return (
      <SafeAreaView style={styles.screen}>
        <Header
          title="어디로그"
          hideBack
          right={
            <Button label="돌아가기" variant="text" size="sm" onPress={() => setView('catalog')} />
          }
        />
        <EmptyState
          title="첫 여행을 만들어 볼까요?"
          description="새 여행을 만들거나 초대 링크로 참여해요"
          actionLabel="새 여행"
          onAction={() => setView('catalog')}
          illustration={<MascotTraveler />}
        />
        <TabBar active="home" onChange={() => setView('catalog')} />
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

        <Section title="입력칸 · 회색 상자 (variant=filled)">
          <TextField
            label="금액"
            required
            variant="filled"
            large
            keyboardType="number-pad"
            value={amount}
            onChangeText={(v) => setAmount(formatThousands(v))}
            style={styles.amount}
            trailing={<Text style={[typography.title1, styles.text]}>원</Text>}
            maxLength={AMOUNT_MAX_LENGTH}
            hideCount
            error={parseAmount(amount) ? undefined : '금액을 입력해 주세요'}
            helper="서버 규칙: 1원 이상 정수, 0은 저장할 수 없어요"
          />
          <TextField
            label="한 줄 평가"
            variant="filled"
            placeholder="예: 노을 질 때 가 보기"
            value={memo}
            onChangeText={setMemo}
            maxLength={100}
          />
          <TextField
            label="메모"
            variant="filled"
            multiline
            placeholder="여러 줄로 적어요"
            error="메모를 저장하지 못했어요"
          />
        </Section>

        <Section title="태그 (누를 수 없음)">
          <Row>
            <Tag label="야경" />
            <Tag label="비공개" icon="person" />
            <Tag label="게시됨" tone="brand" icon="check" />
            <Tag label="계획 중" tone="brandSoft" icon="calendar" />
            <Tag label="사진으로 확인됨" tone="success" icon="check" />
            <Tag label="지도 핀 없음" tone="outline" icon="map-pin" />
          </Row>
        </Section>

        <Section title="카드">
          <Card variant="filled" rounded="lg">
            <Text style={[typography.caption, styles.muted]}>함께 쓴 돈</Text>
            <Text style={[typography.title1, styles.text]}>23.4만 원</Text>
          </Card>
          <Card onPress={() => toast.show('사진 목록으로 가요')} accessibilityLabel="사진 32장">
            <Text style={[typography.bodyBold, styles.text]}>사진 32장</Text>
            <Text style={[typography.caption, styles.muted]}>누를 수 있는 흰 테두리 카드</Text>
          </Card>
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
            <Avatar name="지우" size="sm" me />
            <Avatar name="민준" size="md" />
            <Avatar name="서연" size="lg" />
            <Avatar name="사진" size="lg" imageUrl="https://picsum.photos/seed/eodilog/80" />
          </Row>
          <Row>
            <AvatarGroup people={[{ name: '지우', me: true }, { name: '민준' }]} />
            <AvatarGroup
              people={[
                { name: '지우' },
                { name: '민준' },
                { name: '서연' },
                { name: '하늘' },
                { name: '도윤' },
                { name: '유나' },
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

        <Section title="확인 시트 (S50)">
          <Row>
            <Button label="사진 삭제" variant="neutral" onPress={() => openConfirm('photo')} />
            <Button
              label="탈퇴 (실패 예시)"
              variant="neutral"
              onPress={() => openConfirm('withdraw')}
            />
          </Row>
          <Row>
            <Button label="여행 나가기" variant="neutral" onPress={() => openLeave('member')} />
            <Button label="방장일 때" variant="neutral" onPress={() => openLeave('owner')} />
            <Button label="혼자 남았을 때" variant="neutral" onPress={() => openLeave('alone')} />
            <Button label="나가기 실패 예시" variant="neutral" onPress={() => openLeave('fail')} />
            <Button
              label="먼저 바뀐 예시"
              variant="neutral"
              onPress={() => openLeave('conflict')}
            />
          </Row>
        </Section>

        <Section title="짧은 알림 (토스트)">
          <Row>
            <Button
              label="링크를 복사했어요"
              variant="secondary"
              onPress={() => toast.success('링크를 복사했어요')}
            />
            <Button label="기본 안내" variant="neutral" onPress={() => toast.show('저장했어요')} />
            <Button
              label="버튼 있는 안내"
              variant="neutral"
              onPress={() =>
                toast.success('강릉 바다 여행에 담았어요', {
                  action: { label: '보기', onPress: () => toast.show('여행으로 가요') },
                })
              }
            />
            <Button
              label="실패 안내"
              variant="neutral"
              onPress={() => toast.error('복사하지 못했어요')}
            />
          </Row>
        </Section>

        <Section title="빈 화면 · 오류 화면">
          <Row>
            <Button label="빈 화면 보기" variant="neutral" onPress={() => setView('empty')} />
            <Button label="첫 방문 홈 보기" variant="neutral" onPress={() => setView('first')} />
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

      <ConfirmSheet
        visible={confirm === 'photo'}
        onClose={() => setConfirm(null)}
        onConfirm={fakeConfirm}
        title="사진 2장을 지울까요?"
        description="휴대폰 원본은 그대로예요"
        confirmLabel="지우기"
        confirmIcon="trash"
        loading={confirming}
      />
      <ConfirmSheet
        visible={confirm === 'withdraw'}
        onClose={() => setConfirm(null)}
        onConfirm={fakeConfirm}
        title="어디로그를 탈퇴할까요?"
        description={'내 기록이 모두 지워져요.\n함께 만든 여행은 동행에게 남아요'}
        confirmLabel={confirmError ? '다시 시도' : '탈퇴하기'}
        confirmIcon={confirmError ? 'refresh' : undefined}
        loading={confirming}
        error={confirmError}
        errorDescription="다시 시도해 주세요"
      />
      {/* 방장일 때는 서버가 지우기를 받게 된 뒤의 모습(체크를 고를 수 있음)을 미리 보여 준다 */}
      <LeaveTripSheet
        visible={leave !== null}
        onClose={() => setLeave(null)}
        onConfirm={fakeLeave}
        tripTitle="겨울 여행"
        nextOwnerName={leave === 'owner' ? '민준' : undefined}
        alone={leave === 'alone'}
        ownPhotoCount={12}
        onHandOver={() => toast.show('S19 방장 넘기기로 가요')}
        cleanupSupported={leave === 'owner'}
        loading={leaving}
        failure={leaveFailure}
      />
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
  amount: { textAlign: 'right' },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    paddingVertical: spacing[6],
  },
});
