import type {LayoutSummary, LayoutOptions} from '../layout-contracts.js';
export interface DeviceInsets { top: number; right: number; bottom: number; left: number }
export interface DeviceSize { width: number; height: { min: number; max: number } }
export interface DeviceProfile {
  id: string; kind: 'phone' | 'tablet' | 'desktop' | 'foldable' | 'dual-screen'; source: 'playwright' | 'statcounter' | 'curated';
  devices: string[]; dpr?: number; touch?: boolean; screen: { width: number; height: number };
  portrait: DeviceSize; landscape?: DeviceSize; spanned?: DeviceSize & { hinge: { left: number; top: number; width: number; height: number } };
  /** Market share (percent) of this screen size, shared by the profiles of the same size. */
  screenShare: { jp: number; worldwide: number };
  safeArea?: { cutout: 'notch' | 'dynamic-island' | 'none'; measured: boolean; browser: Record<'portrait' | 'landscape', DeviceInsets>; fullscreen: Record<'portrait' | 'landscape', DeviceInsets> } | null;
}
export interface DeviceCheck {
  id: string; profile: string; devices: string[]; kind: DeviceProfile['kind']; orientation: 'portrait' | 'landscape' | 'spanned';
  screenShare: number; viewport: { min: number; max: number; height: { min: number; max: number } };
  safeArea?: DeviceInsets; safeAreaMeasured?: boolean; cutout?: string; hinge?: { left: number; top: number; width: number; height: number };
}
export declare const deviceData: { month: string; sources: Record<string, unknown>; resolutions: Record<'jp' | 'worldwide', Record<'mobile' | 'tablet' | 'desktop', { width: number; height: number; share: number }[]>>; profiles: DeviceProfile[] };
export declare function deviceChecks(options?: { region?: 'jp' | 'worldwide'; kinds?: DeviceProfile['kind'][]; minShare?: number; orientations?: ('portrait' | 'landscape')[]; mode?: 'browser' | 'fullscreen'; special?: boolean }): DeviceCheck[];
export declare function analyzeDevices(html: string, options: Omit<LayoutOptions, 'viewport'>, checks?: DeviceCheck[]): {
  results: { check: DeviceCheck; report: LayoutSummary }[];
  findings: { code: string; severity: string; box?: string; message: string; checks: string[] }[];
};
