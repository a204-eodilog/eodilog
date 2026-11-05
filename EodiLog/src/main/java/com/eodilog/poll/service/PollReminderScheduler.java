package com.eodilog.poll.service;

import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

// 1분마다 마감 1시간 전 알림을 보낸다. 주기 마감(PollClosingScheduler)과 같은 방식이다
// 테스트 프로필은 app.polls.reminder-enabled=false로 끄고 PollReminderSender를 직접 부른다
@Component
@EnableScheduling
@ConditionalOnProperty(prefix = "app.polls", name = "reminder-enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
public class PollReminderScheduler {

	private final PollReminderSender pollReminderSender;

	@Scheduled(initialDelay = 60, fixedDelay = 60, timeUnit = TimeUnit.SECONDS)
	public void sendDueReminders() {
		pollReminderSender.sendDueReminders();
	}

}
