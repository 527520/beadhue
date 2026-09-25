/**
 * 类目条的像素小图标（豆色数据文件：十六进制色值只允许出现在这里与 beadTokens.ts）。
 * 内置图标键的图案按 13 格栅格化后固化，客户端不必带程序化栅格器。
 */
import type { TagIcon, TagIconKey } from '@/lib/community/tagIcon';
import type { Pattern } from '@/lib/types';
import { keysPattern } from './beads';

/** 图标用到的豆色。 */
const ICON_BEADS: Readonly<Record<string, string>> = {
  B: '#3F7FD9', C: '#8FDCC8', D: '#A92C35', E: '#1F6B45', G: '#47A35B', K: '#3A2A30', M: '#7C4F36',
  O: '#F28B2C', P: '#F59CB0', R: '#E0473F', S: '#8E929C', T: '#D49A5E', W: '#FBF8F1', Y: '#FFD447',
  g: '#A8D774', o: '#F8BE7A', p: '#FCD9E1', t: '#F2D3A6', y: '#FFF0B3',
};

const BUILTIN_ROWS: Readonly<Record<TagIconKey, readonly string[]>> = {
  strawberry: ['.............', '......K......', '....KKEKK....', '...KGGGGGK...', '..KRpRRRRRK..', '.KRRpRRRRRRK.', '.KRypRRRyRRK.', '..KRRRRRRRK..', '..KRRRRRRRK..', '...KRRRyRK...', '...KKRRRKK...', '.....KKK.....', '.............'],
  mushroom: ['.............', '.............', '...KKKKKKK...', '..KWRRWWRRK..', '.KRWWRRRRWRK.', '.KRRRRWRRWRK.', '.KWRRRRRRRRK.', '..KKtttttKK..', '....KyyyK....', '....KyyyK....', '....KyyyK....', '....KKKKK....', '.............'],
  cat: ['.............', '.............', '..KK.....KK..', '..KPKKKKKPK..', '..KPOTTTOPK..', '..KoooooooK..', '.KoooooooooK.', '.KooKoooKooK.', '.KoPoyPyoPoK.', '..KooyyyooK..', '...KooyooK...', '....KKKKK....', '.............'],
  heart: ['.............', '...DD...DD...', '.DDRRD.DRRDD.', '.DRRRRDRRRRD.', '.DRWWPRRRRRD.', '.DRPPPRRRRRD.', '.DRRRRRRRRRD.', '.DRRRRRRRRRD.', '..DRRRRRRRD..', '..DDDDDDDDD..', '...DDDDDDD...', '.....DDD.....', '......D......'],
  star: ['.............', '......M......', '......M......', '.....MYM.....', '.....MYM.....', '.MMMMyYYMMMM.', '..MYYKYKYYM..', '...MPYYYPM...', '....MYYYM....', '...MYYMYYM...', '...MMM.MMM...', '...M.....M...', '.............'],
  icecream: ['.......K.....', '.....KKK.....', '....KWCCK....', '....KCCCK....', '...KPCCCPK...', '...KPPPPPK...', '...KPPPPPK...', '...KPPPPK....', '....KPGPK....', '.....KTK.....', '.....KtK.....', '......K......', '......K......'],
  rainbow: ['.............', '.............', '.............', '.....SSS.....', '...SSOYOSS...', '..SYGGGGGYS..', '.SYGBSSSBGYS.', '.SYBS...SBYS.', 'SWWWS...SWWWS', '.SWWWS.SWWWS.', '.SSSSS.SSSSS.', '.............', '.............'],
  chick: ['.............', '......MM.....', '.....MYM.....', '....MYYYM....', '...MYYYYYM...', '..MYYYYYYYM..', '..MYYKYKYYM..', '..MYPYYYPYM..', '..MYYYYYYoM..', '..MYYYYYooM..', '...MYYYYYM...', '....MMMMM....', '.............'],
  sakura: ['.............', '.....D.D.....', '.....DDD.....', '.....DpD.....', '..DDDpPpDDD..', '.DppPpPpPppD.', '.DDpPYOYPpDD.', '...DpPYPpD...', '...DPPpPPD...', '..DpppDpppD..', '..DDpD.DpDD..', '....D...D....', '.............'],
  watermelon: ['.............', '.............', '.............', '.............', '.EEEEEEEEEEE.', '.ERRRRRRRRRE.', '.ERRRRRRRRRE.', '..ERRRRRRRE..', '...EgRRRgE...', '....EEEEE....', '.............', '.............', '.............'],
  frog: ['.............', '.............', '.............', '...EE...EE...', '..EWKE.EWKE..', '..EWWGEGWWE..', '.EGGGGGGGGGE.', '.EGGGGGGGGGE.', '.EPPGgggGPPE.', '.EGggEEEggGE.', '..EEEgggEEE..', '.....EEE.....', '.............'],
  panda: ['.............', '..K.......K..', '.KKK.KKK.KKK.', '.KKKKWWWKKKK.', '..KWWWWWWWK..', '.KWWWWWWWWWK.', '.KWKWWWWWKWK.', '.KWWKWWWKWWK.', '.KWpWWKWWpWK.', '..KWWWWWWWK..', '...KWWWWWK...', '....KKKKK....', '.............'],
};

/** 「全部」：红黄蓝绿四块。 */
export const ALL_CATEGORY_ICON: Pattern = keysPattern(['RR.YY', 'RR.YY', '.....', 'BB.GG', 'BB.GG'], ICON_BEADS);
/** 「精选」：星星。 */
export const FEATURED_CATEGORY_ICON: Pattern = keysPattern(BUILTIN_ROWS.star, ICON_BEADS);
/** 标签没有设置图标时的默认豆粒：一颗带孔的蓝豆。 */
export const DEFAULT_CATEGORY_ICON: Pattern = keysPattern(['..KKK..', '.KBBBK.', 'KBBBBBK', 'KBBWBBK', 'KBBBBBK', '.KBBBK.', '..KKK..'], ICON_BEADS);

/** 标签图标 → 像素图案；无图标或非法取值用默认豆粒。 */
export function tagIconPattern(icon: TagIcon | null): Pattern {
  if (!icon) return DEFAULT_CATEGORY_ICON;
  if (icon.kind === 'builtin') return keysPattern(BUILTIN_ROWS[icon.key], ICON_BEADS);
  return {
    width: icon.width,
    height: icon.height,
    cells: icon.cells.map((index) => {
      const hex = index === null ? null : icon.palette[index];
      return { hex, code: null, transparent: hex === null };
    }),
  };
}
