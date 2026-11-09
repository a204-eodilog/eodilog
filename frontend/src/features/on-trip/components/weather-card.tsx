import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import {
  clearsAt,
  clock,
  conditionIcon,
  dateClock,
  tempLine,
  weatherHeadline,
} from '../on-trip-rules';
import type { Weather } from '../types';

/** 흰 동그라미 안 날씨 아이콘 */
function WeatherBadge({ name }: { name: 'sun' | 'cloud' | 'cloud-rain' | 'cloud-off' }) {
  return (
    <View style={styles.badge}>
      <Icon name={name} size={22} color={colors.text.icon} />
    </View>
  );
}

/** 흰 알약 [다시 시도] */
function RetryPill({ onPress, busy }: { onPress(): void; busy: boolean }) {
  return (
    <Pressable
      style={styles.retry}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.text.icon} />
      ) : (
        <Icon name="refresh" size={16} color={colors.text.default} />
      )}
      <Text style={[typography.subMedium, styles.retryText]}>다시 시도</Text>
    </Pressable>
  );
}

type CardProps = {
  weather: Weather | null;
  /** 마지막 새로고침이 실패했다 */
  failed: boolean;
  refreshing: boolean;
  onRefresh(): void;
  /** 비 오는 시간 첫 일정. "10:00 해운대 해변" */
  affected: { time: string; name: string } | null;
  onAlternatives(): void;
  /** 날씨를 물을 장소가 없다(코스 없음, Q-10-4) */
  noPlace?: boolean;
};

/**
 * S25 오늘 날씨(Figma 201-14252). 요약, 비 그침과 기온, 조회 시각, 새로고침.
 * 새로 받지 못하면 갱신 실패(201-14701)와 마지막 기준을 보인다.
 */
export function WeatherCard(props: CardProps) {
  const w = props.weather;
  if (props.noPlace) {
    return (
      <View style={[styles.card, styles.row]}>
        <WeatherBadge name="cloud" />
        <Text style={[typography.body, styles.sub, styles.flex]}>
          코스를 저장하면 날씨가 보여요
        </Text>
      </View>
    );
  }
  if (props.failed || !w) {
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <WeatherBadge name="cloud-off" />
          <View style={styles.flex}>
            <Text style={[typography.bodyBold, styles.title]}>날씨를 새로 불러오지 못했어요</Text>
            {w ? (
              <Text style={[typography.caption, styles.sub]}>
                {`${clock(w.queriedAt)} 기준 · ${weatherHeadline(w)}`}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.retryRow}>
          <RetryPill onPress={props.onRefresh} busy={props.refreshing} />
        </View>
      </View>
    );
  }
  const detail = [clearsAt(w), tempLine(w)].filter(Boolean).join(' · ');
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <WeatherBadge name={conditionIcon(w.condition)} />
        <View style={styles.flex}>
          <Text style={[typography.bodyBold, styles.title]}>{weatherHeadline(w)}</Text>
          {detail ? <Text style={[typography.caption, styles.sub]}>{detail}</Text> : null}
          <View style={styles.line}>
            <Icon name="clock" size={16} color={colors.text.sub} />
            <Text style={[typography.caption, styles.queried]}>{`${clock(w.queriedAt)} 조회`}</Text>
          </View>
        </View>
        <Pressable
          style={styles.refresh}
          onPress={props.onRefresh}
          disabled={props.refreshing}
          accessibilityRole="button"
          accessibilityLabel="날씨 새로고침"
        >
          {props.refreshing ? (
            <ActivityIndicator size="small" color={colors.text.icon} />
          ) : (
            <Icon name="refresh" size={18} color={colors.text.icon} />
          )}
        </Pressable>
      </View>
      {props.affected ? (
        <View style={styles.affected}>
          <Icon name="alert" size={16} color={colors.text.default} />
          <Text style={[typography.caption, styles.affectedText]} numberOfLines={2}>
            {`${props.affected.time} ${props.affected.name}에 비가 와요`}
          </Text>
          <Pressable
            style={styles.link}
            onPress={props.onAlternatives}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={[typography.captionMedium, styles.linkText]}>날씨 대안 보기</Text>
            <Icon name="chevron-right" size={14} color={colors.brand.primaryDark} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * S26 위 날씨 요약(Figma 201-14861). "오전 비 70% · 12시부터 그쳐요"와 날짜·조회 시각.
 * 새로 받지 못하면(201-29899) 마지막 날씨 기준과 마지막 조회 시각, [다시 시도].
 */
export function WeatherSummary(props: {
  weather: Weather | null;
  failed: boolean;
  refreshing: boolean;
  onRefresh(): void;
}) {
  const w = props.weather;
  if (props.failed || !w) {
    return (
      <View style={styles.row}>
        <WeatherBadge name="cloud-off" />
        <View style={styles.flex}>
          <Text style={[typography.bodyBold, styles.title]}>날씨를 새로 불러오지 못했어요</Text>
          <Text style={[typography.caption, styles.sub]}>마지막 날씨 기준이에요</Text>
          {w ? (
            <View style={styles.line}>
              <Icon name="clock" size={16} color={colors.text.sub} />
              <Text style={[typography.caption, styles.queried]}>
                {`마지막 조회 ${dateClock(w.queriedAt)}`}
              </Text>
            </View>
          ) : null}
          <View style={styles.retryRow}>
            <RetryPill onPress={props.onRefresh} busy={props.refreshing} />
          </View>
        </View>
      </View>
    );
  }
  const head = [weatherHeadline(w), clearsAt(w)].filter(Boolean).join(' · ');
  return (
    <View style={styles.row}>
      <WeatherBadge name={conditionIcon(w.condition)} />
      <View style={styles.flex}>
        <Text style={[typography.bodyBold, styles.title]}>{head}</Text>
        <Text style={[typography.caption, styles.sub]}>{`${dateClock(w.queriedAt)} 조회`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing[20],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.default,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[18] },
  flex: { flex: 1, gap: spacing[2] },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text.default },
  sub: { color: colors.text.icon },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  queried: { color: colors.text.sub },
  refresh: {
    width: 36,
    height: 36,
    marginTop: -6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  affected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    paddingTop: spacing[12],
  },
  affectedText: { flex: 1, color: colors.text.default },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  linkText: { color: colors.brand.primaryDark },
  retryRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing[8] },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 40,
    paddingHorizontal: spacing[16],
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
  },
  retryText: { color: colors.text.default },
});
