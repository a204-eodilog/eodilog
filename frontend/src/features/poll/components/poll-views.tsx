import { useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { EmptyState, Icon } from '@/components/ui';
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
import { CandidateRow } from './candidate-row';
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
            <Text style={styles.heading}>후보를 눌러 투표해요</Text>
          ) : (
            <Text style={styles.heading}>
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
          {onAddCandidate && poll.candidates.length < MAX_CANDIDATES ? (
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
        <View style={styles.failBar} accessibilityRole="alert">
          <Icon name="info" size={20} color={colors.brand.primarySoft} />
          <View style={styles.failTexts}>
            <Text style={styles.failText}>{failLines[0]}</Text>
            <Text style={styles.failText}>{failLines[1]}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={spacing[8]}>
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
    bottom: spacing[24],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingHorizontal: spacing[20],
    paddingVertical: spacing[16],
    borderRadius: radius.md,
    backgroundColor: colors.text.default,
  },
  failTexts: { flex: 1 },
  failText: { ...typography.sub, color: colors.text.inverse },
  retry: { ...typography.subBold, color: colors.brand.primarySoft },
});
