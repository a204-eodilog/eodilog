package com.eodilog.poll.service;

import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

// 1분마다 주기 마감을 돌린다. jobs의 kind 목록에 투표 마감이 없어 Spring 스케줄러를 쓴다(정책 §13 V-12)
// 테스트 프로필은 app.polls.auto-close-enabled=false로 끄고 PollAutoCloser를 직접 부른다
@Component
@EnableScheduling
@ConditionalOnProperty(prefix = "app.polls", name = "auto-close-enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
public class PollClosingScheduler {

	private final PollAutoCloser pollAutoCloser;

	@Scheduled(initialDelay = 60, fixedDelay = 60, timeUnit = TimeUnit.SECONDS)
	public void closeDuePolls() {
		pollAutoCloser.closeDuePolls();
	}

}
