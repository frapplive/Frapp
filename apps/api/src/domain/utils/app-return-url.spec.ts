import {
  devAppsAllowed,
  isAppReturnUrl,
  withQueryParams,
} from './app-return-url';

describe('devAppsAllowed', () => {
  it('is every server but production', () => {
    expect(devAppsAllowed('https://unttyvyfezddlyafcydh.supabase.co')).toBe(
      false,
    );
    expect(devAppsAllowed('http://localhost:54321')).toBe(true);
    expect(devAppsAllowed(undefined)).toBe(true);
  });
});

describe('isAppReturnUrl', () => {
  const dev = { allowDevApps: true };
  const prod = { allowDevApps: false };

  it("takes the app's own scheme everywhere", () => {
    expect(isAppReturnUrl('frapp://google-calendar', prod)).toBe(true);
    expect(isAppReturnUrl('frapp://google-calendar', dev)).toBe(true);
  });

  it('takes the staging app and local Expo Go outside production only', () => {
    for (const url of [
      'frapp-staging://preferences',
      'exp://localhost:8081/--/preferences',
      'exp://10.0.0.5:8081/--/preferences',
      'exp://172.20.1.1:8081/--/preferences',
    ]) {
      expect(isAppReturnUrl(url, dev)).toBe(true);
      expect(isAppReturnUrl(url, prod)).toBe(false);
    }
  });

  it('refuses web addresses, public Expo Go servers and unsafe characters', () => {
    for (const url of [
      'https://app.frapp.live/preferences',
      'exp://203.0.113.9:8081/--/preferences',
      'frapp://pref erences',
      'frapp://preferences\t',
      `frapp://${'a'.repeat(512)}`,
      '',
    ]) {
      expect(isAppReturnUrl(url, dev)).toBe(false);
    }
  });

  it('refuses a fragment, even with no screens listed', () => {
    // The caller's query would land inside it.
    expect(isAppReturnUrl('frapp://google-calendar#x', dev)).toBe(false);
    expect(isAppReturnUrl('frapp://google-calendar?a=1#x', dev)).toBe(false);
  });

  it('can refuse Expo Go while taking the staging app', () => {
    const noExpo = { allowDevApps: true, allowExpoGo: false };
    expect(isAppReturnUrl('frapp-staging://preferences', noExpo)).toBe(true);
    expect(
      isAppReturnUrl('exp://192.168.1.5:8081/--/preferences', noExpo),
    ).toBe(false);
  });

  describe('with a closed list of screens', () => {
    const routes = ['preferences'] as const;

    it.each([
      'frapp://preferences',
      'frapp:///preferences',
      'frapp://preferences/',
      'frapp://preferences?from=settings',
      'exp://192.168.1.5:8081/--/preferences',
    ])('takes %s', (url) => {
      expect(isAppReturnUrl(url, { ...dev, routes })).toBe(true);
    });

    it.each([
      'frapp://chat',
      'frapp://preferences/../chat',
      'frapp://preferences@evil',
      'frapp://preferences#top',
      'frapp://preferences?a=1#top',
      'exp://192.168.1.5:8081/preferences',
    ])('refuses %s', (url) => {
      expect(isAppReturnUrl(url, { ...dev, routes })).toBe(false);
    });
  });
});

describe('withQueryParams', () => {
  it('starts a query, or adds to the one there', () => {
    expect(withQueryParams('frapp://preferences', { discord: 'pending' })).toBe(
      'frapp://preferences?discord=pending',
    );
    expect(withQueryParams('frapp://x?a=1', { b: '2' })).toBe(
      'frapp://x?a=1&b=2',
    );
  });
});
