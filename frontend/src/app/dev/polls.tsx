import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AvatarGroup, Button, Header } from '@/components/ui';
import { AddCandidateSheet } from '@/features/poll/components/add-candidate-sheet';
import { OpenPollSheet } from '@/features/poll/components/open-poll-sheet';
import { PollEmptyView, PollOpenView } from '@/features/poll/components/poll-views';
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
  },
  {
    key: 'p2',
    title: '광안리 바다뷰 카페',
    subtitle: '부산 수영구',
    input: { placeId: 'p2' },
    savedCount: 1,
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

type Example =
  | { kind: 'empty' }
  | { kind: 'open'; poll: Poll; fail?: [string, string]; addSheet?: boolean }
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
  const [example, setExample] = useState<Example | null>(null);
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
          names={NAMES}
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
