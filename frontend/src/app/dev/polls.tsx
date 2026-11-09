import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AvatarGroup, Button, Header } from '@/components/ui';
import { AddCandidateSheet } from '@/features/poll/components/add-candidate-sheet';
import { OpenPollSheet } from '@/features/poll/components/open-poll-sheet';
import { PollClosedHeaderCard, PollDecidedCard } from '@/features/poll/components/poll-header-card';
import {
  PollEmptyView,
  PollNoVotesView,
  PollNotFoundView,
  PollOpenView,
  PollResultView,
  TieConfirmedLine,
} from '@/features/poll/components/poll-views';
import { candidate, poll } from '@/features/poll/testing';
import type { CandidateOption, Poll } from '@/features/poll/types';
import { colors, layout, spacing, typography } from '@/theme';

/**
 * 개발용 N8·S22 상태 보기. 서버 없이 표시 부품에 예시 데이터를 넘겨 그린다.
 * 피그마 상태(docs/design/screens/README.md의 N8·S22 줄)와 피그마에 없는 상태를 모두 둔다. /dev/polls로만 들어온다
 */

const PEOPLE = [{ name: '영광' }, { name: '세은' }, { name: '승기' }];

const PLACE_OPTIONS: CandidateOption[] = [
  {
    key: 'p1',
    title: '해운대 해변',
    subtitle: '부산 해운대구',
    input: { placeId: 'p1' },
    savedCount: 2,
    savers: ['세은', '승기'],
  },
  {
    key: 'p2',
    title: '광안리 바다뷰 카페',
    subtitle: '부산 수영구',
    input: { placeId: 'p2' },
    savedCount: 1,
    savers: ['세은'],
  },
  {
    key: 'p3',
    title: '감천문화마을',
    subtitle: '부산 사하구',
    input: { placeId: 'p3' },
    savedCount: 2,
  },
  {
    key: 'p4',
    title: '서면 돼지국밥집',
    subtitle: '부산 부산진구',
    input: { placeId: 'p4' },
    savedCount: 1,
  },
];

const NOW = new Date('2026-10-27T12:00:00Z');
const AT = '2026-10-27T11:00:00Z';
const NAMES: Record<string, string> = { c1: '부산', c2: '강릉', c3: '여수', c4: '경주' };

/** 진행 중 지역 투표: 부산 1표(내 선택), 강릉 1표, 여수 0표, 2명 투표, 3명 대상, 2일 남음 */
const OPEN: Poll = poll({
  closesAt: '2026-10-29T13:00:00Z',
  eligibleMemberCount: 3,
  votedMemberCount: 2,
  candidates: [
    candidate('c1', { voteCount: 1, addedAt: AT }),
    candidate('c2', { voteCount: 1, addedAt: AT }),
    candidate('c3', { voteCount: 0, addedAt: AT }),
  ],
  myCandidateIds: ['c1'],
});

/** 진행 중 후보 추가됨(Figma 385-2305): 경주가 투표 중에 들어왔고 내 선택은 부산·강릉 2곳 */
const ADDED: Poll = poll({
  ...OPEN,
  version: 2,
  votedMemberCount: 2,
  candidates: [
    candidate('c1', { voteCount: 1, addedAt: AT }),
    candidate('c2', { voteCount: 2, addedAt: AT }),
    candidate('c3', { voteCount: 0, addedAt: AT }),
    candidate('c4', { voteCount: 0, addedAt: '2026-10-27T11:50:00Z' }),
  ],
  myCandidateIds: ['c1', 'c2'],
});

const ADD_OPTIONS: CandidateOption[] = [
  { key: 'r5', title: '경주', subtitle: '그룹 즐겨찾기 2곳', input: { regionId: 'r5' } },
  { key: 'r6', title: '제주', subtitle: '그룹 즐겨찾기 1곳', input: { regionId: 'r6' } },
  { key: 'r7', title: '전주', subtitle: '그룹 즐겨찾기 1곳', input: { regionId: 'r7' } },
];

/** 마감 후 자동 확정(Figma 201-11073): 부산 2표(내 선택) 확정, 강릉 1표, 여수 0표 */
const DECIDED: Poll = poll({
  ...OPEN,
  status: 'FINALIZED',
  closedReason: 'DEADLINE',
  closesAt: '2026-10-27T09:40:00Z',
  votedMemberCount: 3,
  candidates: [
    candidate('c1', { voteCount: 2, addedAt: AT }),
    candidate('c2', { voteCount: 1, addedAt: AT }),
    candidate('c3', { voteCount: 0, addedAt: AT }),
  ],
  myCandidateIds: ['c1'],
  selectedCandidateIds: ['c1'],
});

/** 동률(Figma 201-11213): 부산 1표(내 선택)·강릉 1표 모두 확정, 1명 투표 안 함 */
const TIE: Poll = poll({
  ...OPEN,
  status: 'FINALIZED',
  closedReason: 'DEADLINE',
  closesAt: '2026-10-28T12:00:00Z',
  votedMemberCount: 2,
  selectedCandidateIds: ['c1', 'c2'],
});

/** 긴 이름·후보 30곳(점검표 "최대 길이 예시") */
const LONG: Poll = poll({
  ...OPEN,
  title: '이번 겨울 여행에서 꼭 가 보고 싶은 곳을 모두 골라 주세요. 마감 전까지 바꿀 수 있어요',
  candidates: Array.from({ length: 30 }, (_, i) =>
    candidate(`l${i + 1}`, { voteCount: i % 4, addedAt: AT }),
  ),
  myCandidateIds: ['l1', 'l2'],
});
const LONG_NAMES: Record<string, string> = Object.fromEntries(
  Array.from({ length: 30 }, (_, i) => [
    `l${i + 1}`,
    i === 0 ? '제주특별자치도 서귀포시 안덕면 산방산 아래 바닷가 카페 거리' : `후보 지역 ${i + 1}`,
  ]),
);

const SOURCES = {
  c1: { icon: 'bookmark' as const, text: '그룹 즐겨찾기 3곳' },
  c2: { icon: 'bookmark' as const, text: '그룹 즐겨찾기 2곳' },
};

type Example =
  | { kind: 'empty' }
  | { kind: 'decided' }
  | { kind: 'decidedCard' }
  | { kind: 'tie' }
  | { kind: 'noVotes' }
  | { kind: 'notFound' }
  | {
      kind: 'open';
      poll: Poll;
      fail?: [string, string];
      addSheet?: boolean;
      names?: Record<string, string>;
    }
  | { kind: 'n8'; type: 'REGION' | 'PLACE'; options: CandidateOption[]; selected: string[] };

const EXAMPLES: { group: string; label: string; example: Example }[] = [
  {
    group: 'N8',
    label: '장소 투표 열기',
    example: { kind: 'n8', type: 'PLACE', options: PLACE_OPTIONS, selected: ['p1', 'p2', 'p3'] },
  },
  {
    group: 'N8',
    label: '지역 투표 열기',
    example: {
      kind: 'n8',
      type: 'REGION',
      options: [
        { key: 'r1', title: '부산', subtitle: '그룹 즐겨찾기 3곳', input: { regionId: 'r1' } },
        { key: 'r2', title: '강릉', subtitle: '그룹 즐겨찾기 2곳', input: { regionId: 'r2' } },
      ],
      selected: [],
    },
  },
  {
    group: 'N8',
    label: '그룹 즐겨찾기 없음',
    example: { kind: 'n8', type: 'PLACE', options: [], selected: [] },
  },
  { group: 'S22', label: '진행 중인 투표 없음', example: { kind: 'empty' } },
  { group: 'S22', label: '진행 중', example: { kind: 'open', poll: OPEN } },
  {
    group: 'S22',
    label: '투표 바꾸기 실패',
    example: {
      kind: 'open',
      poll: OPEN,
      fail: ['강릉으로 바꾸지 못했어요.', '부산 투표는 그대로예요'],
    },
  },
  { group: 'S22', label: '후보 추가 시트', example: { kind: 'open', poll: OPEN, addSheet: true } },
  { group: 'S22', label: '진행 중 후보 추가됨', example: { kind: 'open', poll: ADDED } },
  { group: 'S22', label: '마감 후 자동 확정', example: { kind: 'decided' } },
  { group: 'S22', label: '동률 · 같은 표 모두 확정', example: { kind: 'tie' } },
  { group: 'S22', label: '0표', example: { kind: 'noVotes' } },
  { group: 'S22', label: '여행지 확정', example: { kind: 'decidedCard' } },
  { group: 'S22 그 밖', label: '볼 수 없는 투표', example: { kind: 'notFound' } },
  {
    group: 'S22 그 밖',
    label: '긴 제목 · 후보 30곳',
    example: { kind: 'open', poll: LONG, names: LONG_NAMES },
  },
  {
    group: 'S22 그 밖',
    label: '아직 투표 안 함',
    example: { kind: 'open', poll: { ...OPEN, myCandidateIds: [], votedMemberCount: 1 } },
  },
];

const noop = () => undefined;

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.screen}>
      <Header
        title={title}
        subtitle="겨울 여행"
        subtitleIcon="trip"
        right={<AvatarGroup people={PEOPLE} max={3} />}
      />
      {children}
    </View>
  );
}

export default function PollStates() {
  // 검토용: /dev/polls?state=진행%20중 처럼 상태 이름으로 바로 연다
  const { state } = useLocalSearchParams<{ state?: string }>();
  const [example, setExample] = useState<Example | null>(
    () => EXAMPLES.find((e) => e.label === state)?.example ?? null,
  );
  const back = () => setExample(null);

  if (example?.kind === 'empty') {
    return (
      <Frame title="투표">
        <PollEmptyView onPick={back} />
      </Frame>
    );
  }

  if (example?.kind === 'open') {
    return (
      <Frame title="지역 투표">
        <PollOpenView
          poll={example.poll}
          names={example.names ?? NAMES}
          myName="영광"
          now={NOW}
          failLines={example.fail ?? null}
          onToggle={noop}
          onCancel={noop}
          onRetry={noop}
          onAddCandidate={noop}
        />
        <AddCandidateSheet
          visible={!!example.addSheet}
          onClose={back}
          tripId="trip-1"
          poll={example.poll}
          onSubmit={async () => back()}
          busy={false}
          previewOptions={ADD_OPTIONS}
        />
      </Frame>
    );
  }

  if (example?.kind === 'decided') {
    return (
      <Frame title="지역 투표">
        <PollResultView
          poll={DECIDED}
          names={NAMES}
          sources={SOURCES}
          heading="결과"
          header={
            <PollClosedHeaderCard
              closedAt="10.27(화) 18:40"
              title="투표가 마감됐어요"
              sub="가장 많이 받은 부산으로 확정됐어요"
            />
          }
          action={{ label: '확정된 여행지 보기', icon: 'map-pin', onPress: noop }}
        />
      </Frame>
    );
  }

  if (example?.kind === 'decidedCard') {
    return (
      <Frame title="지역 투표">
        <PollResultView
          poll={DECIDED}
          names={NAMES}
          heading="투표 결과"
          showMine={false}
          header={
            <PollDecidedCard
              closedDate="10.27(화)"
              label="겨울 여행 여행지"
              name="부산"
              votes="3명 중 2표"
              voters="모두 투표했어요"
            />
          }
          action={{ label: '장소 모으고 코스 짜기', icon: 'route', onPress: noop }}
        />
      </Frame>
    );
  }

  if (example?.kind === 'tie') {
    return (
      <Frame title="지역 투표">
        <PollResultView
          poll={TIE}
          names={NAMES}
          tie
          heading="부산과 강릉이 함께 확정됐어요"
          header={
            <PollClosedHeaderCard
              closedAt="10.28(수) 21:00"
              title="부산과 강릉이 1표씩 같아요"
              sub="1명이 투표하지 않고 마감됐어요"
            />
          }
          between={<TieConfirmedLine text="부산과 강릉을 모두 확정했어요" />}
          action={{ label: '코스에서 날짜별로 나누기', icon: 'check', onPress: noop }}
        />
      </Frame>
    );
  }

  if (example?.kind === 'notFound') {
    return (
      <Frame title="투표">
        <PollNotFoundView onBack={back} />
      </Frame>
    );
  }

  if (example?.kind === 'noVotes') {
    return (
      <Frame title="지역 투표">
        <PollNoVotesView onReopen={noop} reopening={false} onDecide={noop} />
      </Frame>
    );
  }

  if (example?.kind === 'n8') {
    return (
      <Frame title="그룹 즐겨찾기">
        <OpenPollSheet
          visible
          onClose={back}
          tripId="trip-1"
          onOpened={noop}
          initialType={example.type}
          initialSelected={example.selected}
          previewOptions={example.options}
        />
      </Frame>
    );
  }

  const groups = [...new Set(EXAMPLES.map((e) => e.group))];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.menu}>
      {groups.map((group) => (
        <View key={group} style={styles.group}>
          <Text style={[typography.subBold, styles.heading]}>{group}</Text>
          <View style={styles.row}>
            {EXAMPLES.filter((e) => e.group === group).map((e) => (
              <Button
                key={e.label}
                label={e.label}
                size="sm"
                variant="secondary"
                onPress={() => setExample(e.example)}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, gap: spacing[24] },
  group: { gap: spacing[8] },
  heading: { color: colors.text.default },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
