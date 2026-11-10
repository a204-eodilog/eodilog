import { useRef, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, EmptyState, Icon, type IconName } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { UNKNOWN_NAME } from '../candidate-options';
import {
  isNewCandidate,
  MAX_CANDIDATES,
  myVoteSummary,
  notVotedCount,
  remainingLabel,
  voteRatio,
} from '../poll-rules';
import type { Poll } from '../types';
import { CandidateRow, type CandidateRowTone } from './candidate-row';
import { MyVoteBar } from './my-vote-bar';
import { PollOpenHeaderCard } from './poll-header-card';

/**
 * S22 진행 중인 투표 없음(Figma 201-10579). 가운데 아이콘 + 제목 + 설명 두 줄 + [후보 고르러 가기].
 * [후보 고르러 가기]는 S20 대신 N8을 바로 연다 (가정 — 사용자 확인 필요, Q-4-1)
 */
export function PollEmptyView({ onPick }: { onPick: () => void }) {
  return (
    <View style={styles.center}>
      <EmptyState
        icon="check"
        title="진행 중인 투표가 없어요"
        description={'즐겨찾기나 추천에서 후보를 골라요\n마감은 기본 24시간 뒤예요'}
        actionLabel="후보 고르러 가기"
        onAction={onPick}
      />
    </View>
  );
}

type OpenViewProps = {
  /** 내 선택이 반영된 투표(applyMyBallot) */
  poll: Poll;
  names: Record<string, string>;
  myName: string;
  now: Date;
  /** 투표 바꾸기 실패(Figma 201-29384) 안내 두 줄. 없으면 null */
  failLines: [string, string] | null;
  onToggle: (candidateId: string) => void;
  onCancel: () => void;
  onRetry: () => void;
  /** 후보 추가 시트 열기. 없으면 [+ 후보 추가]를 숨긴다 */
  onAddCandidate?: () => void;
};

/**
 * S22 진행 중(Figma 201-10912)과 투표 바꾸기 실패(201-29384).
 * 위쪽 카드, 후보 목록, [+ 후보 추가], 내 선택 요약. 실패면 아래에 어두운 안내와 [다시 시도]가 뜬다
 */
export function PollOpenView({
  poll,
  names,
  myName,
  now,
  failLines,
  onToggle,
  onCancel,
  onRetry,
  onAddCandidate,
}: OpenViewProps) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  // 아래에 뜨는 안내·버튼이 홈 표시줄에 가리지 않게 안전 영역만큼 올린다
  const bottom = useSafeAreaInsets().bottom + spacing[16];
  const mine = new Set(poll.myCandidateIds);
  const hasNew = poll.candidates.some((c) => isNewCandidate(c, poll.candidates));
  const myNames = poll.candidates.filter((c) => mine.has(c.id)).map((c) => names[c.id]);
  return (
    <View style={styles.fill}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        <PollOpenHeaderCard
          remaining={remainingLabel(poll.closesAt, now)}
          title={poll.title}
          votedCount={poll.votedMemberCount}
          notVotedCount={notVotedCount(poll)}
        />
        <View style={styles.section}>
          {failLines ? (
            <Text style={styles.heading} lineBreakStrategyIOS="hangul-word">
              후보를 눌러 투표해요
            </Text>
          ) : (
            <Text style={styles.heading} lineBreakStrategyIOS="hangul-word">
              {`후보 ${poll.candidates.length}곳`}
              <Text style={styles.headingSub}>{'  여러 곳 골라도 돼요'}</Text>
            </Text>
          )}
          {poll.candidates.map((c) => {
            const isNew = isNewCandidate(c, poll.candidates);
            return (
              <CandidateRow
                key={c.id}
                name={names[c.id] ?? UNKNOWN_NAME}
                votes={c.voteCount}
                ratio={voteRatio(c.voteCount, poll.eligibleMemberCount)}
                tone={mine.has(c.id) ? 'mine' : 'plain'}
                showCheck
                checked={mine.has(c.id)}
                mineTag={mine.has(c.id)}
                newTag={isNew}
                sub={isNew ? { icon: 'bulb', text: '투표 중에 추가됐어요' } : null}
                onPress={() => onToggle(c.id)}
              />
            );
          })}
          {/* 투표 바꾸기 실패 안내 중에는 후보 추가를 숨긴다(Figma 201-29384) */}
          {onAddCandidate && !failLines && poll.candidates.length < MAX_CANDIDATES ? (
            <Pressable
              accessibilityRole="button"
              onPress={onAddCandidate}
              style={({ pressed }) => [styles.add, pressed && styles.pressed]}
            >
              <Text style={styles.addText}>+ 후보 추가</Text>
            </Pressable>
          ) : null}
        </View>
        <MyVoteBar
          myName={myName}
          summary={myVoteSummary(myNames)}
          highlight={hasNew && !failLines}
          onCancel={onCancel}
          onChange={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
        />
      </ScrollView>
      {failLines ? (
        <View style={[styles.failBar, { bottom }]}>
          <View
            style={styles.failTexts}
            accessible
            accessibilityRole="alert"
            accessibilityLabel={`${failLines[0]} ${failLines[1]}`}
          >
            <Icon name="info" size={20} color={colors.brand.primarySoft} />
          </View>
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
            <Text style={styles.retry}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', paddingBottom: spacing[32] },
  fill: { flex: 1 },
  // 피그마: 좌우 20, 위 16, 묶음 사이 28, 아래 여백 56(하단 막대에 가리지 않게)
  scroll: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: 56 + spacing[32],
    gap: spacing[28],
  },
  section: { gap: spacing[12] },
  heading: { ...typography.title3, color: colors.text.default, paddingBottom: spacing[4] },
  headingSub: { ...typography.sub, color: colors.text.sub2 },
  // 피그마 403-865: 점선 1.5, 둥글기 16, 안쪽 16, 파랑 굵은 14
  add: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.gray[300],
    borderRadius: radius.lg,
    padding: spacing[16],
    alignItems: 'center',
  },
  addText: { ...typography.subBold, color: colors.brand.primary },
  pressed: { opacity: 0.6 },
  // 피그마 201-29384: 어두운 안내, 둥글기 12, 화면 좌우 20, 아래 쪽에 뜬다
  failBar: {
    position: 'absolute',
    left: layout.screenPaddingX,
    right: layout.screenPaddingX,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingHorizontal: spacing[20],
    paddingVertical: spacing[16],
    borderRadius: radius.md,
    backgroundColor: colors.text.default,
  },
  failTexts: { flex: 1 },
  retry: { ...typography.subBold, color: colors.brand.primarySoft },
  // 누르는 자리 44 이상
  retryButton: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 아래 오른쪽에 뜨는 파랑 버튼(Figma 201-11073 [확정된 여행지 보기])
  actionWrap: {
    position: 'absolute',
    right: layout.screenPaddingX,
  },
  // 피그마 201-11213: 회색 면, 둥글기 16, 안쪽 좌우 16 위아래 14
  tieLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[14],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  tieLineText: { ...typography.body, color: colors.text.default, flex: 1 },
  // 피그마 201-11494: 가운데 정렬, 아이콘 원 64
  zero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: spacing[32],
  },
  zeroIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zeroTitle: {
    ...typography.title1,
    color: colors.text.default,
    textAlign: 'center',
    marginTop: spacing[20],
  },
  zeroBody: {
    ...typography.body,
    color: colors.text.icon,
    textAlign: 'center',
    marginTop: spacing[8],
  },
  // Button은 부모 가운데 정렬을 따르지 않아 스스로 가운데에 둔다
  zeroButton: { marginTop: spacing[24], alignSelf: 'center' },
  decide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    minHeight: layout.minTouchTarget,
    marginTop: spacing[12],
    paddingHorizontal: spacing[16],
  },
  decideText: { ...typography.bodyMedium, color: colors.text.icon },
  zeroNote: { ...typography.caption, color: colors.text.sub, marginTop: spacing[16] },
});

/** 결과 화면 후보 보조 줄(그룹 즐겨찾기 N곳). 없으면 줄을 숨긴다 */
export type CandidateSources = Record<string, { icon: IconName; text: string }>;

type ResultProps = {
  poll: Poll;
  names: Record<string, string>;
  sources?: CandidateSources;
  /** 결과 목록 위 제목. "결과", "투표 결과", "부산과 강릉이 함께 확정됐어요" */
  heading: string;
  /** 위쪽 카드 */
  header: ReactNode;
  /** 카드와 목록 사이 줄(동률의 "부산과 강릉을 모두 확정했어요") */
  between?: ReactNode;
  /** 동률: 확정된 후보에 체크 원을 보인다 */
  tie?: boolean;
  /** '내 선택' 태그를 보인다. 여행지 확정 카드 화면(Figma 201-11569)은 숨긴다 */
  showMine?: boolean;
  /** 아래 오른쪽 파랑 버튼 */
  action?: { label: string; icon: IconName; onPress: () => void };
};

/**
 * S22 결과 화면 공통 몸체(Figma 201-11073 마감 후 자동 확정, 201-11213 동률, 201-11569 여행지 확정).
 * 확정 후보는 초록(동률은 내 선택 연파랑), 나머지는 회색 막대, 0표 후보는 흐리게
 */
export function PollResultView({
  poll,
  names,
  sources = {},
  heading,
  header,
  between,
  tie = false,
  showMine = true,
  action,
}: ResultProps) {
  const selected = new Set(poll.selectedCandidateIds);
  const mine = new Set(poll.myCandidateIds);
  const bottom = useSafeAreaInsets().bottom + spacing[16];
  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {header}
        {between}
        <View style={styles.section}>
          <Text style={styles.heading} lineBreakStrategyIOS="hangul-word">
            {heading}
          </Text>
          {poll.candidates.map((c) => {
            const won = selected.has(c.id);
            const tone = resultTone({ tie, won, mine: mine.has(c.id) });
            return (
              <CandidateRow
                key={c.id}
                name={names[c.id] ?? UNKNOWN_NAME}
                votes={c.voteCount}
                ratio={voteRatio(c.voteCount, poll.eligibleMemberCount)}
                tone={tone}
                showCheck={tie && won}
                checked={tie && won && mine.has(c.id)}
                mineTag={showMine && mine.has(c.id)}
                topTag={!tie && won}
                sub={sources[c.id] ?? null}
                barColor={tone === 'winner' ? undefined : tie ? colors.text.sub : colors.text.muted}
              />
            );
          })}
        </View>
      </ScrollView>
      {action ? (
        <View style={[styles.actionWrap, { bottom }]} pointerEvents="box-none">
          <Button
            label={action.label}
            size="lg"
            weight="medium"
            leading={<Icon name={action.icon} size={20} color={colors.text.inverse} />}
            onPress={action.onPress}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * 결과 목록 후보 줄 색. 동률이면 확정 후보 중 내 선택은 연파랑, 다른 확정 후보는 회색 면, 확정되지 않은 후보는 흐리게.
 * 동률이 아니면 확정 후보는 초록, 나머지는 회색 면
 */
function resultTone({
  tie,
  won,
  mine,
}: {
  tie: boolean;
  won: boolean;
  mine: boolean;
}): CandidateRowTone {
  if (!tie) return won ? 'winner' : 'plain';
  if (!won) return 'muted';
  return mine ? 'mine' : 'plain';
}

/** 동률 화면 카드 아래 줄(Figma 201-11213). 회색 면에 사람 아이콘 + "부산과 강릉을 모두 확정했어요" */
export function TieConfirmedLine({ text }: { text: string }) {
  return (
    <View style={styles.tieLine}>
      <Icon name="people" size={20} color={colors.text.icon} />
      <Text style={styles.tieLineText}>{text}</Text>
    </View>
  );
}

/**
 * S22 0표(Figma 201-11494). 가운데 체크 아이콘 원, "아무도 투표하지 않았어요", [다시 열기], [직접 정하기], 24시간 안내
 */
export function PollNoVotesView({
  onReopen,
  reopening,
  onDecide,
}: {
  onReopen: () => void;
  reopening: boolean;
  onDecide: () => void;
}) {
  return (
    <View style={styles.zero}>
      <View style={styles.zeroIcon}>
        <Icon name="check" size={28} color={colors.text.icon} />
      </View>
      <Text style={styles.zeroTitle} accessibilityRole="header" lineBreakStrategyIOS="hangul-word">
        아무도 투표하지 않았어요
      </Text>
      <Text style={styles.zeroBody}>확정 없이 마감됐어요. 다시 열 수 있어요</Text>
      <Button
        label="다시 열기"
        weight="medium"
        loading={reopening}
        disabled={reopening}
        leading={<Icon name="clock" size={20} color={colors.text.inverse} />}
        onPress={onReopen}
        style={styles.zeroButton}
      />
      <Pressable
        accessibilityRole="button"
        onPress={onDecide}
        style={({ pressed }) => [styles.decide, pressed && styles.pressed]}
      >
        <Icon name="map-pin" size={20} color={colors.text.icon} />
        <Text style={styles.decideText}>직접 정하기</Text>
      </Pressable>
      <Text style={styles.zeroNote}>다시 열면 마감은 24시간 뒤예요</Text>
    </View>
  );
}

/**
 * 볼 수 없는 투표(FR-022). 지워졌거나 다른 여행의 투표, 지금 동행이 아닌 여행의 투표.
 * 디자인이 없어 채팅 비참여자 차단 화면과 같은 모양으로 둔다 (가정 — 사용자 확인 필요, Q-4-6)
 */
export function PollNotFoundView({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.zero}>
      <View style={styles.zeroIcon}>
        <Icon name="lock" size={28} color={colors.text.icon} />
      </View>
      <Text style={styles.zeroTitle} accessibilityRole="header" lineBreakStrategyIOS="hangul-word">
        볼 수 없는 투표예요
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.decide, pressed && styles.pressed]}
      >
        <Text style={styles.decideText}>돌아가기</Text>
      </Pressable>
    </View>
  );
}
