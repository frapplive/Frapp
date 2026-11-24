import type { DiscordAuthorLinkService } from '../../application/services/discord-author-link.service';
import { DiscordAuthorLinkController } from './discord-author-link.controller';

const CHAPTER = '11111111-1111-4111-8111-111111111111';
const USER = { id: '22222222-2222-4222-8222-222222222222' };

describe('DiscordAuthorLinkController — starting a link (#5414)', () => {
  function build() {
    const begin = jest.fn(async () => ({
      authorize_url: 'https://discord.com/oauth2/authorize?x',
      expires_at: '2026-11-24T12:15:00Z',
    }));
    const controller = new DiscordAuthorLinkController({
      begin,
    } as unknown as DiscordAuthorLinkService);
    return { controller, begin };
  }

  it('returns to the web when the body says nothing, as every older client sends', async () => {
    const { controller, begin } = build();
    await controller.begin(CHAPTER, USER);
    expect(begin).toHaveBeenCalledWith(CHAPTER, USER.id, null);
  });

  it("passes the phone's address on to be checked", async () => {
    const { controller, begin } = build();
    await controller.begin(CHAPTER, USER, {
      client: 'mobile',
      return_url: 'frapp://preferences',
    });
    expect(begin).toHaveBeenCalledWith(CHAPTER, USER.id, 'frapp://preferences');
  });

  it('sends a phone start with no address to be refused, never to the web', async () => {
    const { controller, begin } = build();
    await controller.begin(CHAPTER, USER, { client: 'mobile' });
    expect(begin).toHaveBeenCalledWith(CHAPTER, USER.id, '');
  });

  it('ignores an address on a web start', async () => {
    const { controller, begin } = build();
    await controller.begin(CHAPTER, USER, {
      client: 'web',
      return_url: 'frapp://preferences',
    });
    expect(begin).toHaveBeenCalledWith(CHAPTER, USER.id, null);
  });
});
