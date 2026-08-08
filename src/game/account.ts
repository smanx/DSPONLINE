import type { GameState } from "./types";
import { aggregateGalacticFactoryMetric } from "../../server/galactic-metrics.mjs";

export const ACCOUNT_STORAGE_KEY = "dsp-idle-network.account.v1";
export const ACCOUNT_SCHEMA_VERSION = 2;

export type AccountPrivacy = "public" | "private";

export interface AccountProfile {
  id: string;
  displayName: string;
  avatar: string;
  privacy: AccountPrivacy;
  createdAt: number;
  updatedAt: number;
  cloudUserId: string | null;
  cloudEmail: string | null;
  cloudBoundAt: number | null;
}

export interface AccountLedger {
  energyGeneratedMj: number;
  uploadedWhiteMatrix: number;
  peakGenerationKw: number;
  /** Historical nominal capacity retained for local diagnostics. */
  peakThroughputPerMinute: number;
  /** 60 simulated-second totalProduced delta; never mixed with the nominal peak. */
  peakActualThroughputPerMinute?: number;
  throughputWindowStartedAtSeconds?: number;
  throughputWindowStartedProduced?: number;
  peakDysonPowerKw: number;
  exploredSystems: number;
  colonizedPlanets: number;
  lastGameElapsedSeconds: number;
  lastWhiteMatrixTotal: number;
  lastSyncedAt: number;
}

export interface AccountRecord {
  profile: AccountProfile;
  ledger: AccountLedger;
}

export interface AccountState {
  version: typeof ACCOUNT_SCHEMA_VERSION;
  activeAccountId: string;
  accounts: Record<string, AccountRecord>;
}

export interface AccountProfileChanges {
  displayName?: string;
  avatar?: string;
  privacy?: AccountPrivacy;
  cloudUserId?: string | null;
  cloudEmail?: string | null;
  cloudBoundAt?: number | null;
}

const AVATARS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

function now(): number {
  return Date.now();
}

function createId(timestamp = now()): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `acct_${timestamp.toString(36)}_${random}`;
}

function nonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function integer(value: unknown): number {
  return Math.floor(nonNegative(value));
}

function saturatingAdd(left: number, right: number): number {
  const safeLeft = nonNegative(left);
  const safeRight = nonNegative(right);
  return safeLeft >= Number.MAX_VALUE - safeRight ? Number.MAX_VALUE : safeLeft + safeRight;
}

function saturatingProduct(left: number, right: number): number {
  const safeLeft = nonNegative(left);
  const safeRight = nonNegative(right);
  if (safeLeft === 0 || safeRight === 0) return 0;
  return safeLeft > Number.MAX_VALUE / safeRight ? Number.MAX_VALUE : safeLeft * safeRight;
}

function normalizeName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const name = value.trim().replace(/\s+/g, " ").slice(0, 24);
  return name || fallback;
}

function normalizeAvatar(value: unknown, fallback = "A"): string {
  return typeof value === "string" && AVATARS.includes(value as typeof AVATARS[number]) ? value : fallback;
}

function createLedger(): AccountLedger {
  return {
    energyGeneratedMj: 0,
    uploadedWhiteMatrix: 0,
    peakGenerationKw: 0,
    peakThroughputPerMinute: 0,
    peakActualThroughputPerMinute: 0,
    throughputWindowStartedAtSeconds: 0,
    throughputWindowStartedProduced: 0,
    peakDysonPowerKw: 0,
    exploredSystems: 0,
    colonizedPlanets: 0,
    lastGameElapsedSeconds: 0,
    lastWhiteMatrixTotal: 0,
    lastSyncedAt: 0,
  };
}

function createRecord(displayName: string, avatar: string, timestamp = now()): AccountRecord {
  const id = createId(timestamp);
  return {
    profile: {
      id,
      displayName: normalizeName(displayName, "新星际工程师"),
      avatar: normalizeAvatar(avatar),
      privacy: "public",
      createdAt: timestamp,
      updatedAt: timestamp,
      cloudUserId: null,
      cloudEmail: null,
      cloudBoundAt: null,
    },
    ledger: createLedger(),
  };
}

export function createAccountState(timestamp = now()): AccountState {
  const record = createRecord("新星际工程师", "A", timestamp);
  return {
    version: ACCOUNT_SCHEMA_VERSION,
    activeAccountId: record.profile.id,
    accounts: { [record.profile.id]: record },
  };
}

function normalizeRecord(value: unknown, fallbackName: string, fallbackAvatar: string, timestamp: number): AccountRecord | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, any>;
  const profileSource = source.profile && typeof source.profile === "object" ? source.profile : {};
  const ledgerSource = source.ledger && typeof source.ledger === "object" ? source.ledger : {};
  const id = typeof profileSource.id === "string" && /^acct_[a-z0-9_]+$/.test(profileSource.id)
    ? profileSource.id
    : createId(timestamp);
  const createdAt = nonNegative(profileSource.createdAt) || timestamp;
  const profile: AccountProfile = {
    id,
    displayName: normalizeName(profileSource.displayName, fallbackName),
    avatar: normalizeAvatar(profileSource.avatar, fallbackAvatar),
    privacy: profileSource.privacy === "private" ? "private" : "public",
    createdAt,
    updatedAt: nonNegative(profileSource.updatedAt) || createdAt,
    cloudUserId: typeof profileSource.cloudUserId === "string" && /^user_[A-Za-z0-9]+$/.test(profileSource.cloudUserId) ? profileSource.cloudUserId : null,
    cloudEmail: typeof profileSource.cloudEmail === "string" && profileSource.cloudEmail.length <= 254 ? profileSource.cloudEmail : null,
    cloudBoundAt: nonNegative(profileSource.cloudBoundAt) || null,
  };
  const ledger: AccountLedger = {
    energyGeneratedMj: nonNegative(ledgerSource.energyGeneratedMj),
    uploadedWhiteMatrix: integer(ledgerSource.uploadedWhiteMatrix),
    peakGenerationKw: nonNegative(ledgerSource.peakGenerationKw),
    peakThroughputPerMinute: nonNegative(ledgerSource.peakThroughputPerMinute),
    peakActualThroughputPerMinute: nonNegative(ledgerSource.peakActualThroughputPerMinute),
    ...(Number.isFinite(ledgerSource.throughputWindowStartedAtSeconds)
      ? { throughputWindowStartedAtSeconds: nonNegative(ledgerSource.throughputWindowStartedAtSeconds) }
      : {}),
    ...(Number.isFinite(ledgerSource.throughputWindowStartedProduced)
      ? { throughputWindowStartedProduced: nonNegative(ledgerSource.throughputWindowStartedProduced) }
      : {}),
    peakDysonPowerKw: nonNegative(ledgerSource.peakDysonPowerKw),
    exploredSystems: integer(ledgerSource.exploredSystems),
    colonizedPlanets: integer(ledgerSource.colonizedPlanets),
    lastGameElapsedSeconds: nonNegative(ledgerSource.lastGameElapsedSeconds),
    lastWhiteMatrixTotal: integer(ledgerSource.lastWhiteMatrixTotal),
    lastSyncedAt: nonNegative(ledgerSource.lastSyncedAt),
  };
  return { profile, ledger };
}

export function normalizeAccountState(value: unknown): AccountState {
  const fallback = createAccountState();
  if (!value || typeof value !== "object") return fallback;
  const source = value as Record<string, any>;
  const rawAccounts = source.accounts && typeof source.accounts === "object" ? source.accounts : {};
  const accounts: Record<string, AccountRecord> = {};
  Object.entries(rawAccounts).forEach(([key, raw], index) => {
    const record = normalizeRecord(raw, `星际工程师 ${index + 1}`, AVATARS[index % AVATARS.length], now());
    if (record) accounts[record.profile.id] = record;
  });
  if (Object.keys(accounts).length === 0) return fallback;
  const activeAccountId = typeof source.activeAccountId === "string" && accounts[source.activeAccountId]
    ? source.activeAccountId
    : Object.keys(accounts)[0];
  return { version: ACCOUNT_SCHEMA_VERSION, activeAccountId, accounts };
}

export function loadAccountState(): AccountState {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
    const state = raw ? normalizeAccountState(JSON.parse(raw)) : createAccountState();
    saveAccountState(state);
    return state;
  } catch {
    return createAccountState();
  }
}

export function saveAccountState(state: AccountState): void {
  try {
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Account progress is best-effort when browser storage is unavailable.
  }
}

export function getActiveAccount(state: AccountState): AccountRecord {
  return state.accounts[state.activeAccountId] ?? Object.values(state.accounts)[0] ?? createRecord("新星际工程师", "A");
}

export function updateAccountProfile(state: AccountState, changes: AccountProfileChanges): AccountState {
  const active = getActiveAccount(state);
  const cloudUserId = changes.cloudUserId === undefined ? active.profile.cloudUserId : changes.cloudUserId;
  const profile: AccountProfile = {
    ...active.profile,
    displayName: changes.displayName === undefined ? active.profile.displayName : normalizeName(changes.displayName, active.profile.displayName),
    avatar: changes.avatar === undefined ? active.profile.avatar : normalizeAvatar(changes.avatar, active.profile.avatar),
    privacy: changes.privacy === undefined ? active.profile.privacy : changes.privacy,
    cloudUserId,
    cloudEmail: cloudUserId === null ? null : changes.cloudEmail === undefined ? active.profile.cloudEmail : changes.cloudEmail,
    cloudBoundAt: cloudUserId === null ? null : changes.cloudBoundAt === undefined ? active.profile.cloudBoundAt : changes.cloudBoundAt,
    updatedAt: now(),
  };
  const next = { ...state, accounts: { ...state.accounts, [active.profile.id]: { ...active, profile } } };
  saveAccountState(next);
  return next;
}

export function createLocalAccount(state: AccountState, displayName = "新星际工程师"): AccountState {
  const used = new Set(Object.values(state.accounts).map((record) => record.profile.avatar));
  const avatar = AVATARS.find((candidate) => !used.has(candidate)) ?? AVATARS[Object.keys(state.accounts).length % AVATARS.length];
  const record = createRecord(displayName, avatar);
  const next = { ...state, activeAccountId: record.profile.id, accounts: { ...state.accounts, [record.profile.id]: record } };
  saveAccountState(next);
  return next;
}

export function switchLocalAccount(state: AccountState, accountId: string): AccountState {
  if (!state.accounts[accountId] || state.activeAccountId === accountId) return state;
  const next = { ...state, activeAccountId: accountId };
  saveAccountState(next);
  return next;
}

export function setActiveCloudBinding(state: AccountState, cloud: { id: string; email: string } | null, timestamp = now()): AccountState {
  const active = getActiveAccount(state);
  const accounts = Object.fromEntries(Object.entries(state.accounts).map(([accountId, record]) => {
    const ownsIncomingBinding = cloud && record.profile.cloudUserId === cloud.id && accountId !== active.profile.id;
    if (accountId !== active.profile.id && !ownsIncomingBinding) return [accountId, record];
    const binding = accountId === active.profile.id && cloud
      ? { cloudUserId: cloud.id, cloudEmail: cloud.email, cloudBoundAt: timestamp }
      : { cloudUserId: null, cloudEmail: null, cloudBoundAt: null };
    return [accountId, { ...record, profile: { ...record.profile, ...binding, updatedAt: timestamp } }];
  }));
  const next = { ...state, accounts };
  saveAccountState(next);
  return next;
}

/** Align an account with the current save without crediting time spent under another local identity. */
export function baselineAccountProgress(state: AccountState, game: GameState, timestamp = now()): AccountState {
  const active = getActiveAccount(state);
  const generationKw = getGenerationKw(game);
  const dysonPowerKw = saturatingAdd(game.dysonSwarm?.generationKw ?? 0, game.dysonSphere?.generationKw ?? 0);
  const nextLedger: AccountLedger = {
    ...active.ledger,
    peakGenerationKw: Math.max(active.ledger.peakGenerationKw, generationKw),
    peakThroughputPerMinute: Math.max(active.ledger.peakThroughputPerMinute, getThroughput(game)),
    peakActualThroughputPerMinute: nonNegative(active.ledger.peakActualThroughputPerMinute),
    throughputWindowStartedAtSeconds: nonNegative(game.elapsedSeconds),
    throughputWindowStartedProduced: getTotalProduced(game),
    peakDysonPowerKw: Math.max(active.ledger.peakDysonPowerKw, dysonPowerKw),
    exploredSystems: Math.max(active.ledger.exploredSystems, game.exploration.unlockedSystemIds.length),
    colonizedPlanets: Math.max(active.ledger.colonizedPlanets, game.exploration.colonizedPlanetIds.length),
    lastGameElapsedSeconds: nonNegative(game.elapsedSeconds),
    lastWhiteMatrixTotal: integer(game.endgame?.exportProjects?.universe_archive?.totalDelivered),
    lastSyncedAt: timestamp,
  };
  const next = { ...state, accounts: { ...state.accounts, [active.profile.id]: { ...active, ledger: nextLedger } } };
  saveAccountState(next);
  return next;
}

function getGenerationKw(game: GameState): number {
  return aggregateGalacticFactoryMetric(game, "generationKw").galacticValue;
}

function getThroughput(game: GameState): number {
  return getGalacticThroughputSnapshot(game).galacticValue;
}

export function getGalacticThroughputSnapshot(game: GameState) {
  return aggregateGalacticFactoryMetric(game, "totalItemsPerMinute");
}

export const ACTUAL_THROUGHPUT_WINDOW_SECONDS = 60;

function getTotalProduced(game: GameState): number {
  return Object.values(game.totalProduced).reduce((sum, amount) => saturatingAdd(sum, integer(amount)), 0);
}

/** Accumulate account-only ranking stats without changing the game save schema. */
export function recordAccountProgress(state: AccountState, game: GameState, timestamp = now()): AccountState {
  const active = getActiveAccount(state);
  const ledger = active.ledger;
  const elapsed = nonNegative(game.elapsedSeconds);
  const elapsedDelta = elapsed >= ledger.lastGameElapsedSeconds ? elapsed - ledger.lastGameElapsedSeconds : 0;
  const generationKw = getGenerationKw(game);
  const whiteMatrixTotal = integer(game.endgame?.exportProjects?.universe_archive?.totalDelivered);
  const whiteMatrixDelta = whiteMatrixTotal >= ledger.lastWhiteMatrixTotal
    ? whiteMatrixTotal - ledger.lastWhiteMatrixTotal
    : whiteMatrixTotal;
  const dysonPowerKw = saturatingAdd(game.dysonSwarm?.generationKw ?? 0, game.dysonSphere?.generationKw ?? 0);
  const totalProduced = getTotalProduced(game);
  const hasThroughputBaseline = Number.isFinite(ledger.throughputWindowStartedAtSeconds) &&
    Number.isFinite(ledger.throughputWindowStartedProduced);
  let throughputWindowStartedAtSeconds = hasThroughputBaseline
    ? nonNegative(ledger.throughputWindowStartedAtSeconds)
    : elapsed;
  let throughputWindowStartedProduced = hasThroughputBaseline
    ? nonNegative(ledger.throughputWindowStartedProduced)
    : totalProduced;
  let peakActualThroughputPerMinute = nonNegative(ledger.peakActualThroughputPerMinute);
  if (elapsed < throughputWindowStartedAtSeconds || totalProduced < throughputWindowStartedProduced) {
    throughputWindowStartedAtSeconds = elapsed;
    throughputWindowStartedProduced = totalProduced;
  } else {
    const windowSeconds = elapsed - throughputWindowStartedAtSeconds;
    if (windowSeconds >= ACTUAL_THROUGHPUT_WINDOW_SECONDS) {
      const producedDelta = totalProduced - throughputWindowStartedProduced;
      const scaled = saturatingProduct(producedDelta, 60 / windowSeconds);
      peakActualThroughputPerMinute = Math.max(peakActualThroughputPerMinute, scaled);
      throughputWindowStartedAtSeconds = elapsed;
      throughputWindowStartedProduced = totalProduced;
    }
  }
  const nextLedger: AccountLedger = {
    ...ledger,
    energyGeneratedMj: saturatingAdd(ledger.energyGeneratedMj, saturatingProduct(generationKw, elapsedDelta / 1000)),
    uploadedWhiteMatrix: saturatingAdd(ledger.uploadedWhiteMatrix, whiteMatrixDelta),
    peakGenerationKw: Math.max(ledger.peakGenerationKw, generationKw),
    peakThroughputPerMinute: Math.max(ledger.peakThroughputPerMinute, getThroughput(game)),
    peakActualThroughputPerMinute,
    throughputWindowStartedAtSeconds,
    throughputWindowStartedProduced,
    peakDysonPowerKw: Math.max(ledger.peakDysonPowerKw, dysonPowerKw),
    exploredSystems: Math.max(ledger.exploredSystems, game.exploration.unlockedSystemIds.length),
    colonizedPlanets: Math.max(ledger.colonizedPlanets, game.exploration.colonizedPlanetIds.length),
    lastGameElapsedSeconds: elapsed,
    lastWhiteMatrixTotal: whiteMatrixTotal,
    lastSyncedAt: timestamp,
  };
  const changed = JSON.stringify(nextLedger) !== JSON.stringify(ledger);
  if (!changed) return state;
  const next = { ...state, accounts: { ...state.accounts, [active.profile.id]: { ...active, ledger: nextLedger } } };
  return next;
}

export const ACCOUNT_AVATARS = AVATARS;
