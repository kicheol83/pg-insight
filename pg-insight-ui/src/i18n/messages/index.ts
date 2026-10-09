import type { Dictionary } from "../locales";
import { common } from "./common";
import { layout } from "./layout";
import { auth } from "./auth";
import { dashboard } from "./dashboard";
import { targets } from "./targets";
import { backups } from "./backups";
import { connections } from "./connections";
import { tables } from "./tables";
import { settings } from "./settings";
import { database } from "./database";
import { io } from "./io";
import { diagnostics } from "./diagnostics";
import { alerts } from "./alerts";
import { queries } from "./queries";
import { locks } from "./locks";
import { vacuum } from "./vacuum";
import { replication } from "./replication";
import { jobProgress } from "./jobProgress";

export const messages = {
  ...common,
  ...layout,
  ...auth,
  ...dashboard,
  ...targets,
  ...backups,
  ...connections,
  ...tables,
  ...settings,
  ...database,
  ...io,
  ...diagnostics,
  ...alerts,
  ...queries,
  ...locks,
  ...vacuum,
  ...replication,
  ...jobProgress,
} satisfies Dictionary;

export type MessageKey = keyof typeof messages;
