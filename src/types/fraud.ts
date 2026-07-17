/** Similarity level for a duplicate detection result. */
export type DuplicateLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/** Result of comparing two device profiles for duplication. */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  level: DuplicateLevel;
  score: number;
  matchedFields: string[];
  fingerprintA: string;
  fingerprintB: string;
}

/** Payload for a duplicate check. */
export interface DuplicateCheckInput {
  fingerprint: string;
  machineSignature?: string;
  applicationId: string;
  workspaceId?: string;
  memberId?: string;
}

/** Known fraud signals detected by the engine. */
export type FraudSignal =
  | 'DEVICE_CHANGE_TOO_FREQUENT'
  | 'LOGIN_FROM_MANY_DEVICES'
  | 'WORKSPACE_SHARED'
  | 'LICENSE_SHARED'
  | 'FINGERPRINT_CHANGED'
  | 'INVALID_SDK_VERSION'
  | 'INVALID_CONFIGURATION'
  | 'DUPLICATE_DEVICE'
  | 'MODIFIED_APK'
  | 'TAMPERED_SDK'
  | 'ROOT_DETECTED'
  | 'EMULATOR_DETECTED'
  | 'DEBUGGER_DETECTED'
  | 'VPN_DETECTED'
  | 'TIME_MANIPULATION'
  | 'FAKE_DEVICE_ID';

/** Risk score category. */
export type RiskCategory = 'SAFE' | 'WARNING' | 'HIGH' | 'CRITICAL';

/** Result of a risk assessment. */
export interface RiskAssessment {
  score: number;
  category: RiskCategory;
  signals: FraudSignal[];
  details: Record<string, unknown>;
}

/** Input for a fraud risk assessment. */
export interface FraudAssessmentInput {
  deviceId?: string;
  fingerprint: string;
  applicationId: string;
  workspaceId?: string;
  memberId?: string;
  sdkVersion?: string;
  configurationVersion?: number;
  /** Number of distinct devices seen for this member recently. */
  deviceCount?: number;
  /** Number of logins from different devices in the window. */
  loginDeviceCount?: number;
  /** Whether the workspace is used on multiple concurrent devices. */
  workspaceConcurrent?: boolean;
  /** Whether the license is used on multiple devices. */
  licenseShared?: boolean;
  /** Known valid SDK versions. */
  validSdkVersions?: string[];
  /** Known valid configuration versions. */
  validConfigurationVersions?: number[];
  /** Whether the APK has been modified. */
  modifiedApk?: boolean;
  /** Whether the SDK integrity check failed. */
  tamperedSdk?: boolean;
  /** Whether the device is rooted/jailbroken. */
  rooted?: boolean;
  /** Whether the device appears to be an emulator. */
  emulator?: boolean;
  /** Whether a debugger is attached. */
  debuggerAttached?: boolean;
  /** Whether a VPN connection is detected. */
  vpnDetected?: boolean;
  /** Whether the system time has been manipulated. */
  timeManipulated?: boolean;
  /** Whether the device ID appears fake. */
  fakeDeviceId?: boolean;
}

/** A fraud rule definition. */
export interface FraudRule {
  name: FraudSignal;
  evaluate(input: FraudAssessmentInput): boolean;
  weight: number;
}
