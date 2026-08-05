/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

export {
  ActionsProvider,
  useActions,
  type ActionsApi,
  type RecordingState,
  type ReplayReport,
  type ReplayStepResult,
} from "./actions-context";

export {
  ACTIONS_SCHEMA_VERSION,
  EMPTY_LIBRARY,
  EMPTY_TALLY,
  NON_RECORDABLE_COMMANDS,
  classifyPayload,
  isRecordable,
  looksLikeDocumentId,
  newActionId,
  parseLibrary,
  planReplay,
  skipReasonLabel,
  stepFromInvocation,
  toDemoScript,
  verdictLabel,
  verdictTitle,
  type ActionLibrary,
  type ActionStep,
  type PagedAction,
  type PlannedStep,
  type ReplayPlan,
  type SkipReason,
  type SkippedStep,
  type StepVerdict,
  type UncapturedTally,
} from "./model";

export {
  ACTIONS_STORAGE_KEY,
  loadLibrary,
  parseImport,
  saveLibrary,
  serializeForExport,
} from "./store";
