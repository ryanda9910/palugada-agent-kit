import { httpFetch } from "./http.js";
import { rememberFact, recallFacts } from "./memory.js";
import { now } from "./clock.js";

export { httpFetch } from "./http.js";
export { rememberFact, recallFacts } from "./memory.js";
export { now } from "./clock.js";

/** A sensible default toolbox: web/API access, memory, clock. */
export const coreTools = [httpFetch, rememberFact, recallFacts, now];
