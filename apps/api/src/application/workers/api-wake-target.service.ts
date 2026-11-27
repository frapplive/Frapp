import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  API_WAKE_REPOSITORY,
  type IApiWakeRepository,
} from '#domain/repositories/api-wake.repository.interface';
import { reportCaughtFailure } from '../../infrastructure/observability/report-caught-failure';
import { apiBaseUrl } from '../services/discord-oauth.service';

/**
 * The base `wake_api()` pokes (it appends `/health`), from `API_URL`: the
 * same base every other reader of `API_URL` uses ({@link apiBaseUrl}: trailing
 * slashes and a stale `/v1` dropped), kept only when it is https. Null for
 * anything else, so a laptop's `http://localhost:3001` is never written and a
 * local database never sends a request.
 */
export function wakeOrigin(apiUrl: string | undefined): string | null {
  const base = apiBaseUrl(apiUrl);
  if (base === null) return null;
  try {
    return new URL(base).protocol === 'https:' ? base : null;
  } catch {
    return null;
  }
}

/**
 * Tells the database where this API lives, so a chat message sent while the
 * API sleeps can wake it (#6123).
 *
 * Staging's Cloud Run service runs at min 0 and stops about 15 minutes after
 * its last request, taking the push worker's Realtime subscription with it.
 * `wake_api()` (`20261127184653_api_wake_chat_push_catch_up.sql`) sends a
 * request to the address written here when a message is inserted, Cloud Run
 * starts an instance for it, and the push worker catches up on boot
 * (`ChatPushWorkerService.catchUp`).
 *
 * Written at every boot, from the API's own `API_URL`, so no deploy step or
 * per-environment setting has to carry it, and a changed address is picked up
 * by the next revision. A failed write is reported and costs only the wake:
 * the API itself runs as before.
 */
@Injectable()
export class ApiWakeTargetService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ApiWakeTargetService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(API_WAKE_REPOSITORY) private readonly wake: IApiWakeRepository,
  ) {}

  onApplicationBootstrap(): void {
    void this.record();
  }

  /** The write, awaited. Exposed for unit tests. */
  async record(): Promise<void> {
    const origin = wakeOrigin(this.config.get<string>('API_URL'));
    if (origin === null) return;
    try {
      await this.wake.setUrl(origin);
    } catch (err) {
      reportCaughtFailure(this.logger, {
        level: 'warning',
        site: 'api-wake-target-write',
        message:
          'api-wake: could not record this API address; a chat message sent while it sleeps will not wake it',
        error: err,
      });
    }
  }
}
