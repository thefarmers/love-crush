import type { Goal, LevelDef } from '../core/types';
import { L } from '../i18n';
import { iconURL } from '../render/sprites';


export function goalIcon(goal: Goal, level: LevelDef): string {
  switch (goal.type) {
    case 'collect':
      return iconURL(`gem${goal.color}`);
    case 'jelly':
      return iconURL('jelly');
    case 'drop':
      return iconURL(level.items?.type === 'letter' ? 'letter' : 'ring');
    case 'gift':
      return iconURL('gift');
    case 'choco':
      return iconURL('choco');
    case 'score':
      return iconURL('star');
  }
}

export function goalText(goal: Goal, level: LevelDef, target = 0): string {
  switch (goal.type) {
    case 'collect':
      return L.goals.collect(L.fruits[goal.color], goal.count);
    case 'jelly':
      return L.goals.jelly(target || goal.count);
    case 'drop':
      return L.goals.drop(level.items?.type === 'letter', goal.count);
    case 'gift':
      return L.goals.gift(goal.count);
    case 'choco':
      return L.goals.choco;
    case 'score':
      return L.goals.score(goal.target.toLocaleString());
  }
}
