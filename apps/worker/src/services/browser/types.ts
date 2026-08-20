import type { Stagehand } from "@browserbasehq/stagehand";

/** Non-null Stagehand page handle used throughout the live audit pipeline. */
export type StagehandPage = NonNullable<
  ReturnType<Stagehand["context"]["activePage"]>
>;
