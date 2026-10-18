import type { Repository } from '../core/storage';
import type { Settings } from '../core/types';

export interface AppContext {
  repo: Repository;
  storageOk: boolean;
  settings: Settings;
}
