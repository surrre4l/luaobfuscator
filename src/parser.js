// Load luaparse (UMD) via esm.sh – works in browsers
import luaparseMod from 'https://esm.sh/luaparse@0.3.1';
const luaparse = luaparseMod.default || luaparseMod;

export function parse(source) {
  return luaparse.parse(source, {
    luaVersion: '5.3',
    locations: false,
    scope: false,
    comments: false,
    extendedIdentifiers: true,
  });
}