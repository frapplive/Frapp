import { desktopReleaseObject } from './desktop-updates';

describe('desktopReleaseObject', () => {
  it.each([
    'latest.yml',
    'latest-mac.yml',
    'beta.yml',
    'beta-mac.yml',
    'Frapp-Setup-0.2.0.exe',
    'Frapp-Setup-0.2.0.exe.blockmap',
    'Frapp-0.2.0-universal.dmg',
    'Frapp-0.2.0-universal-mac.zip',
    'Frapp-0.2.0-universal-mac.zip.blockmap',
  ])('serves %s from the releases prefix', (file) => {
    expect(desktopReleaseObject(file)).toBe(`desktop/${file}`);
  });

  it.each([
    '',
    'alpha.yml',
    'latest.yml.bak',
    'feeds/0.2.0/latest.yml',
    '../secrets.yml',
    'Frapp-..-x.exe',
    'Frapp-Setup-0.2.0.exe/extra',
    'Frapp Setup 0.2.0.exe',
    'Other-0.2.0.exe',
    'Frapp-0.2.0.sh',
    `Frapp-${'1'.repeat(61)}.exe`,
  ])('refuses %j', (file) => {
    expect(desktopReleaseObject(file)).toBeNull();
  });
});
