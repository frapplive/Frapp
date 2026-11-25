/**
 * The structured `code` an `HttpException`'s response carries, such as
 * `new ForbiddenException({ code: 'chat.timed_out', message })`, or
 * `undefined` when it has none. Only a non-empty string counts. Takes the
 * response (`exception.getResponse()`) so the domain layer needs no Nest
 * import; the exception filter and any service that branches on a refusal
 * read the code through this one rule (#1020, #6006).
 */
export function errorCodeOf(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const { code } = response as { code?: unknown };
  return typeof code === 'string' && code.length > 0 ? code : undefined;
}
