// Cockpit — filmstrip/document-map navigation hand-off. The camera
// fit math (page layout + fit) lives app-side; the app registers a
// navigator from inside the provider tree (CanvasAppIntegration) and
// the shell's chrome calls it. Same module-level pattern as the
// export-dialog notifier.

export type PageNavigator = (pageIndices: number[]) => void;

let navigator: PageNavigator | null = null;

export function setCockpitPageNavigator(fn: PageNavigator | null): void {
  navigator = fn;
}

export function navigateToPages(pageIndices: number[]): void {
  navigator?.(pageIndices);
}
