import type {
  DuplicateCheckInput,
  DuplicateCheckResult,
  DuplicateLevel,
  FraudAssessmentInput,
  FraudRule,
  FraudSignal,
  RiskAssessment,
  RiskCategory,
} from '../types/index.js';

/** Compare two fingerprints for similarity. Returns 0–1 similarity ratio. */
function fingerprintSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const setA = new Set(a.split(''));
  const setB = new Set(b.split(''));
  let common = 0;
  for (const ch of setA) {
    if (setB.has(ch)) common++;
  }
  return common / Math.max(setA.size, setB.size);
}

/** Determine duplicate level from a similarity score. */
function levelFromScore(score: number): DuplicateLevel {
  if (score >= 0.85) return 'HIGH';
  if (score >= 0.6) return 'MEDIUM';
  return 'LOW';
}

/**
 * Duplicate detection engine. Compares device fingerprints and contextual
 * fields (machine signature, application, workspace, member) to flag
 * likely-duplicate devices.
 */
export class DuplicateEngine {
  /** Compare a new device fingerprint against a known device. */
  check(
    input: DuplicateCheckInput,
    known: DuplicateCheckInput,
  ): DuplicateCheckResult {
    const matchedFields: string[] = [];

    const fpScore = fingerprintSimilarity(
      input.fingerprint,
      known.fingerprint,
    );
    if (fpScore >= 0.6) matchedFields.push('fingerprint');

    if (
      input.machineSignature &&
      known.machineSignature &&
      input.machineSignature === known.machineSignature
    ) {
      matchedFields.push('machineSignature');
    }

    if (input.applicationId === known.applicationId) {
      matchedFields.push('applicationId');
    }

    if (
      input.workspaceId &&
      known.workspaceId &&
      input.workspaceId === known.workspaceId
    ) {
      matchedFields.push('workspaceId');
    }

    if (
      input.memberId &&
      known.memberId &&
      input.memberId === known.memberId
    ) {
      matchedFields.push('memberId');
    }

    const score = Math.min(
      1,
      fpScore * 0.5 + (matchedFields.length > 2 ? 0.3 : 0) + (fpScore >= 0.85 ? 0.2 : 0),
    );

    const level = levelFromScore(score);
    const isDuplicate = score >= 0.6;

    return {
      isDuplicate,
      level,
      score: Math.round(score * 100),
      matchedFields,
      fingerprintA: input.fingerprint,
      fingerprintB: known.fingerprint,
    };
  }
}

const DEFAULT_RULES: FraudRule[] = [
  {
    name: 'DEVICE_CHANGE_TOO_FREQUENT',
    weight: 25,
    evaluate: (input) => (input.deviceCount ?? 0) > 5,
  },
  {
    name: 'LOGIN_FROM_MANY_DEVICES',
    weight: 20,
    evaluate: (input) => (input.loginDeviceCount ?? 0) > 3,
  },
  {
    name: 'WORKSPACE_SHARED',
    weight: 15,
    evaluate: (input) => input.workspaceConcurrent === true,
  },
  {
    name: 'LICENSE_SHARED',
    weight: 20,
    evaluate: (input) => input.licenseShared === true,
  },
  {
    name: 'FINGERPRINT_CHANGED',
    weight: 15,
    evaluate: (input) => !input.fingerprint || input.fingerprint.length < 5,
  },
  {
    name: 'INVALID_SDK_VERSION',
    weight: 10,
    evaluate: (input) => {
      if (!input.sdkVersion || !input.validSdkVersions?.length) return false;
      return !input.validSdkVersions.includes(input.sdkVersion);
    },
  },
  {
    name: 'INVALID_CONFIGURATION',
    weight: 10,
    evaluate: (input) => {
      if (
        input.configurationVersion === undefined ||
        !input.validConfigurationVersions?.length
      ) {
        return false;
      }
      return !input.validConfigurationVersions.includes(
        input.configurationVersion,
      );
    },
  },
  {
    name: 'MODIFIED_APK',
    weight: 30,
    evaluate: (input) => input.modifiedApk === true,
  },
  {
    name: 'TAMPERED_SDK',
    weight: 30,
    evaluate: (input) => input.tamperedSdk === true,
  },
  {
    name: 'ROOT_DETECTED',
    weight: 20,
    evaluate: (input) => input.rooted === true,
  },
  {
    name: 'EMULATOR_DETECTED',
    weight: 15,
    evaluate: (input) => input.emulator === true,
  },
  {
    name: 'DEBUGGER_DETECTED',
    weight: 10,
    evaluate: (input) => input.debuggerAttached === true,
  },
  {
    name: 'VPN_DETECTED',
    weight: 10,
    evaluate: (input) => input.vpnDetected === true,
  },
  {
    name: 'TIME_MANIPULATION',
    weight: 20,
    evaluate: (input) => input.timeManipulated === true,
  },
  {
    name: 'FAKE_DEVICE_ID',
    weight: 25,
    evaluate: (input) => input.fakeDeviceId === true,
  },
];

/** Categorize a 0–100 risk score into a risk category. */
export function categoryFromScore(score: number): RiskCategory {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'WARNING';
  return 'SAFE';
}

/**
 * Fraud detection engine. Evaluates a set of fraud rules against a device
 * context and produces a risk score (0–100) with a category and signal list.
 */
export class FraudEngine {
  private rules: FraudRule[];

  constructor(rules?: FraudRule[]) {
    this.rules = rules ?? DEFAULT_RULES;
  }

  assess(input: FraudAssessmentInput): RiskAssessment {
    const triggered: FraudSignal[] = [];
    const details: Record<string, unknown> = {};

    for (const rule of this.rules) {
      if (rule.evaluate(input)) {
        triggered.push(rule.name);
        details[rule.name] = rule.weight;
      }
    }

    const score = Math.min(
      100,
      triggered.reduce((sum, signal) => {
        const rule = this.rules.find((r) => r.name === signal);
        return sum + (rule?.weight ?? 0);
      }, 0),
    );

    return {
      score,
      category: categoryFromScore(score),
      signals: triggered,
      details,
    };
  }

  addRule(rule: FraudRule): void {
    this.rules.push(rule);
  }

  removeRule(name: FraudSignal): void {
    this.rules = this.rules.filter((r) => r.name !== name);
  }
}
