// The DuckDB boot gate for the paged.data journeys.
//
// Every data journey imports a CSV first, which boots DuckDB-WASM inside the
// bundle. When DuckDB does not come up (the package shipped without
// bin/duckdb-engine.wasm, the host did not serve the bundle's bin/, or the
// context is not cross-origin isolated) the journey cannot observe anything
// and, by default, SKIPS and says why. Under REQUIRE_REAL_DUCKDB=1 that skip is
// a FAILURE: the lane that sets it has promised a real DuckDB, so a silent skip
// would hide exactly the regression it exists to catch. Same shape as
// REQUIRE_REAL_INDESIGN in tests/showcase.
import { test } from "@playwright/test";

export const REQUIRE_REAL_DUCKDB = process.env.REQUIRE_REAL_DUCKDB === "1";

/** Skip the journey because DuckDB did not boot — or fail it under
 *  REQUIRE_REAL_DUCKDB=1. `status` is the sources panel's `data-status`. */
export function skipWithoutDuckDB(status: string, reason: string): void {
  if (REQUIRE_REAL_DUCKDB) {
    throw new Error(
      `REQUIRE_REAL_DUCKDB=1 but DuckDB-WASM did not boot (engine status "${status}"). ${reason}`,
    );
  }
  test.skip(true, reason);
}
