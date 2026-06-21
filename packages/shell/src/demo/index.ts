export { DemoOverlay, DemoSpotlight, demoShowInfo, demoHighlight, demoResetOverlay, type DemoInfoRequest } from "./overlay";
export {
  buildAutomation,
  type CanvasHandleLike,
  type DemoGlobals,
  type AutomationOptions,
  type PagedScriptApi,
  type EditorAutomationApi,
  type DemoNarrationApi,
} from "./automation";
export { runDemoScript, runDemoScriptWithHandle, type RunResult } from "./runner";
export {
  DemoSession,
  splitTopLevelStatements,
  type Statement,
  type SessionState,
  type SessionStatus,
  type DemoSessionOptions,
} from "./session";
