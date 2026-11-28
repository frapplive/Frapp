export const API_WAKE_REPOSITORY = 'API_WAKE_REPOSITORY';

/**
 * The one row of `api_wake` (#6123): where the database sends the request
 * that wakes a sleeping API when a chat message arrives (`wake_api()`).
 */
export interface IApiWakeRepository {
  /** Record the API's public origin. Throws on a failed write. */
  setUrl(url: string): Promise<void>;
}
