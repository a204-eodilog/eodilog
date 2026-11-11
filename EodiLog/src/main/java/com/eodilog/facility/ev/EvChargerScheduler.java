package com.eodilog.facility.ev;

import jakarta.annotation.PreDestroy;
import java.time.Instant;
import java.util.TimeZone;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.stereotype.Component;

/**
 * 충전소 갱신 주기 실행. 전국 수신은 몇 분 걸리므로 공용 스케줄러(투표 마감 등)를 막지 않게 전용 스레드 하나에서 돈다.
 * 같은 스레드라 5분 갱신과 하루 한 번 수신이 겹치지 않는다. 테스트 프로필은 app.facilities.ev.sync-enabled=false로 끄고
 * 테스트가 {@link EvChargerSync}를 직접 부른다. 키가 없으면 돌아도 아무것도 하지 않는다
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "app.facilities.ev", name = "sync-enabled", havingValue = "true", matchIfMissing = true)
public class EvChargerScheduler {

	private final EvChargerSync sync;
	private final EvChargerProperties properties;
	private final ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();

	public EvChargerScheduler(EvChargerSync sync, EvChargerProperties properties) {
		this.sync = sync;
		this.properties = properties;
		scheduler.setPoolSize(1);
		scheduler.setThreadNamePrefix("ev-sync-");
		scheduler.setWaitForTasksToCompleteOnShutdown(false);
	}

	// 서버가 다 뜬 뒤 30초 있다가 시작한다. 첫 적재(몇 분)가 기동을 막지 않는다
	@EventListener(ApplicationReadyEvent.class)
	public void start() {
		if (!properties.hasKey()) {
			log.info("EV charger sync disabled: no service key (app.facilities.ev.service-key)");
			return;
		}
		scheduler.initialize();
		scheduler.scheduleWithFixedDelay(sync::tick, Instant.now().plusSeconds(30), properties.statusInterval());
		scheduler.schedule(sync::dailyRefresh, new CronTrigger(properties.fullRefreshCron(), TimeZone.getTimeZone("Asia/Seoul")));
	}

	@PreDestroy
	public void stop() {
		scheduler.shutdown();
	}

}
