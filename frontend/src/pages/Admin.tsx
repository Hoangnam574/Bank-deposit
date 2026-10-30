/**
 * Admin "/admin" (T6.11) — chỉ owner của VaultManager:
 *   - tạo plan, update APR, enable/disable plan
 *   - fund/withdraw vault (hiển thị available vs owed — solvency C2)
 *   - pause/unpause + đồng hồ C5 (emergency delay 7 ngày)
 * Nếu không phải owner → panel hiển thị nội danh khóa.
 */
import { useEffect, useMemo, useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import type { ContractTransactionResponse } from "ethers";
import StatusBadge from "@/components/StatusBadge";
import NoDeploymentState from "@/components/NoDeploymentState";
import VaultHealthGauge from "@/components/VaultHealthGauge";
import { useContracts, useSignerContracts, useContractTime } from "@/providers/ContractsProvider";
import { useWallet } from "@/providers/WalletProvider";import { useTx } from "@/hooks/useTx";
import { fmtToken, formatBps, parseToken as parseTokenInput } from "@/lib/format";
import type { PlanRow } from "@/components/PlanCard";
import { useLang } from "@/lib/i18n";

export default function Admin() {
  const { contracts, hasDeployment } = useContracts();
  const signerC = useSignerContracts();
  const { emergencyDelay } = useContractTime();
  const { address, hasWallet, getBrowser } = useWallet();
  const { state, run } = useTx();
  const { t } = useLang();

  const [owner, setOwner] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [vaultBal, setVaultBal] = useState<bigint | null>(null);
  const [owed, setOwed] = useState<bigint | null>(null);
  const [paused, setPaused] = useState<boolean>(false);
  const [pauseAt, setPauseAt] = useState<number | null>(null);
  const [nowSec, setNowSec] = useState(0);

  /* Form cookie cho create-plan */
  const [fTenor, setFTenor] = useState("");
  const [fApr, setFApr] = useState("");
  const [fMin, setFMin] = useState("");
  const [fMax, setFMax] = useState("");
  const [fPenalty, setFPenalty] = useState("");

  /* Form for actions */
  const [newApr, setNewApr] = useState<{ id: number; value: string }>({ id: 0, value: "" });
  const [vaultAmount, setVaultAmount] = useState<string>("");
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const pending = state.status === "pending";
  const isOwner = owner !== null && address !== null && owner.toLowerCase() === address.toLowerCase();

  const available = useMemo(
    () => (vaultBal === null || owed === null ? null : vaultBal - owed),
    [vaultBal, owed],
  );

  useEffect(() => {
    let cancelled = false;
    if (!contracts || !hasDeployment) return;
    void (async () => {
      try {
        const block = await getBrowser()?.getBlock("latest");
        if (!cancelled && block) setNowSec(Number(block.timestamp));
        const own = String(await contracts.vault.owner());
        const bal = (await contracts.vault.getVaultBalance()) as bigint;
        const o = (await contracts.vault.totalOwedInterest()) as bigint;
        const p = Boolean(await contracts.vault.isPaused());
        const pat = Number(String(await contracts.vault.pausedAt()));
        const nextId = (await contracts.core.nextPlanId()) as bigint;
        const count = Number(nextId) - 1;
        const rows: PlanRow[] = [];
        for (let i = 1; i <= count; i++) {
          const raw = (await contracts.core.getPlan(i)) as unknown[];
          rows.push({
            id: i,
            tenorDays: raw[0] as bigint,
            aprBps: raw[1] as bigint,
            minDeposit: raw[2] as bigint,
            maxDeposit: raw[3] as bigint,
            earlyWithdrawPenaltyBps: raw[4] as bigint,
            enabled: Boolean(raw[5]),
          });
        }
        if (!cancelled) {
          setOwner(own);
          setVaultBal(bal);
          setOwed(o);
          setPaused(p);
          setPauseAt(pat);
          setPlans(rows);
        }
      } catch {
        // network/deployment lỗi — hiển thị trống cẩn trọng
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contracts, hasDeployment, state.status]);

  const call = (label: string, actionKey: string, fn: (c: NonNullable<typeof signerC>) => Promise<unknown>): void => {
    if (!signerC) return;
    setActiveAction(actionKey);
    void run(label, async () => {
      try {
        return (await fn(signerC)) as unknown as ContractTransactionResponse;
      } finally {
        setActiveAction(null);
      }
    });
  };

  const createPlan = () => {
    call(t("admin.txCreate"), "createPlan", async (c) => {
      const tenor = Number(fTenor);
      const apr = Number(fApr);
      const min = fMin ? parseTokenInput(fMin) : 0n;
      const max = fMax ? parseTokenInput(fMax) : 0n;
      const penalty = Number(fPenalty || "0");
      if (!tenor || !apr) throw new Error(t("admin.txMissingTenorApr"));
      return c.core.createPlan(tenor, apr, min, max, penalty);
    });
  };

  const updateApr = (planId: number) => {
    call(t("admin.txUpdateApr"), `updateApr-${planId}`, async (c) => c.core.updatePlan(planId, Number(newApr.value)));
  };

  const togglePlan = (planId: number, nextEnabled: boolean) => {
    call(nextEnabled ? t("admin.txEnable") : t("admin.txDisable"), `togglePlan-${planId}`, async (c) =>
      c.core.setPlanEnabled(planId, nextEnabled),
    );
  };

  const fundVault = () => {
    call(t("admin.txFund"), "fundVault", async (c) => {
      const amt = parseTokenInput(vaultAmount);
      if (amt <= 0n) throw new Error(t("admin.txNoAmount"));
      await c.usdc.approve(c.vault.target, amt); // approve trước (2 tx tất nhiên — chạy trong prompt 2 giao dịch)
      return c.vault.fundVault(amt);
    });
  };

  const withdrawVault = () => {
    call(t("admin.txWithdraw"), "withdrawVault", async (c) => c.vault.withdrawVault(parseTokenInput(vaultAmount)));
  };

  const pauseToggle = (nextPause: boolean) => {
    call(nextPause ? t("admin.txPause") : t("admin.txUnpause"), "pauseToggle", async (c) => (nextPause ? c.vault.pause() : c.vault.unpause()));
  };

  if (!hasWallet) {
    return (
      <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 py-16 text-subtle text-center">
        {t("admin.connectFirst")}{" "}
        <strong className="text-txt">{t("admin.connectFirstBtn")}</strong> {t("admin.connectFirst2")}
      </main>
    );
  }
  if (!contracts) {
    /* Chain allowed nhưng chưa deploy — empty state có action thay câu text lơ lửng. */
    return (
      <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-16">
        <NoDeploymentState page={t("admin.title")} />
      </main>
    );
  }

  const emergencyUnlocked = paused && pauseAt !== null && nowSec >= pauseAt + emergencyDelay;

  return (
    <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-16">
      <section className="mt-6 rounded-2xl border border-line band px-6 py-6 sm:px-9">
        <span className="eyebrow">{t("admin.eyebrow")}</span>
        <h1 className="mt-3 text-3xl font-bold font-display tracking-tight">{t("admin.title")}</h1>
        <p className="num text-subtle text-sm mt-1 flex flex-wrap items-center gap-x-1">
          {t("admin.ownerLabel")}
          {/* Rút gọn 0xAB…XYZ + copy — tránh chuỗi dài làm tràn card trên mobile */}
          {owner && (
            <button
              type="button"
              title={t("admin.copyTitle", { addr: owner })}
              onClick={() => void navigator.clipboard?.writeText(owner)}
              className="num text-txt cursor-pointer hover:text-primary transition-colors duration-200"
            >
              <code>{owner.slice(0, 6)}…{owner.slice(-4)}</code>
            </button>
          )}{" "}
          {isOwner ? (
            <span className="text-ok">{t("admin.youAreOwner")}</span>
          ) : (
            <span className="text-warn">{t("admin.notOwner")}</span>
          )}
        </p>
      </section>

      {!isOwner && (
        <div className="card mt-4 border-subtle/40 flex items-center gap-2 text-sm text-subtle">
          <Lock size={16} /> {t("admin.lockedNote")}
        </div>
      )}

      {!owner && <div className="text-subtle text-sm mt-4">{t("admin.reading")}</div>}

      {owner && (
        <>
          {/* ── Vault status: 3 tile ─── */}
          <section aria-label={t("admin.vaultStatusAria")} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
            <div className="stat-tile !rounded-2xl !p-4">
              <div className="text-xs text-subtle">{t("admin.tileBalance")}</div>
              <div className="num mt-1 text-2xl font-display">
                {vaultBal !== null ? fmtToken(vaultBal) : "…"}{" "}
                <span className="text-sm text-subtle font-body">USDC</span>
              </div>
            </div>
            <div className="stat-tile !rounded-2xl !p-4">
              <div className="text-xs text-subtle">{t("admin.tileOwed")}</div>
              <div className="num mt-1 text-2xl font-display text-warn">
                {owed !== null ? fmtToken(owed) : "…"}{" "}
                <span className="text-sm text-subtle font-body">USDC</span>
              </div>
            </div>
            <div className="stat-tile !rounded-2xl !p-4 !border-ok/30">
              <div className="text-xs text-subtle">{t("admin.tileAvailable")}</div>
              <div className="num mt-1 text-2xl font-display text-ok">
                {available !== null ? fmtToken(available) : "…"}
              </div>
            </div>
          </section>

          {/* ── Health gauge — solvency trực quan ─── */}
          <div className="card mt-4">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="font-display text-sm tracking-wider text-subtle">
                {t("admin.healthTitle")}
              </h2>
              {available !== null && available < 0n && (
                <span className="text-xs text-err num">{t("admin.insolvent")}</span>
              )}
            </div>
            <VaultHealthGauge balance={vaultBal} owed={owed} />
          </div>

          <div className="card mt-4 text-sm flex flex-wrap items-center gap-3">
            <span>
              {t("admin.sysLabel")} {paused ? <strong className="text-err">{t("admin.paused")}</strong> : <strong className="text-ok">{t("admin.running")}</strong>}
              {paused && pauseAt !== null && !emergencyUnlocked && (
                <span className="text-warn">
                  {' '}· {pauseAt + emergencyDelay - nowSec < 3600
                    ? `${Math.max(0, pauseAt + emergencyDelay - nowSec)}s`
                    : t("admin.unlockIn", { h: Math.max(0, Math.ceil((pauseAt + emergencyDelay - nowSec) / 3600)) })}
                </span>
              )}
            </span>
            {isOwner && (
              <button
                type="button"
                className={`btn ${paused ? "btn-cta" : "btn-danger"} ml-auto inline-flex items-center gap-1.5`}
                onClick={() => pauseToggle(!paused)}
                disabled={pending}
              >
                {activeAction === "pauseToggle" && <Loader2 size={15} className="animate-spin shrink-0" />}
                <span>{paused ? t("admin.btnUnpause") : t("admin.btnPause")}</span>
              </button>
            )}
          </div>

          {/* ── Plans ─── */}
          <section className="mt-8">
            <span className="eyebrow">{t("admin.plansEyebrow")}</span>
            <h2 className="mt-2 font-display text-xl tracking-tight mb-3">{t("admin.plansTitle")}</h2>
            <div className="grid gap-3">
              {plans.map((p) => (
                <div key={p.id} className="num card !p-4 flex flex-wrap items-center gap-3">
                  <span className="eyebrow">#{p.id}</span>
                  <span className="font-display text-lg">
                    {Number(p.tenorDays)} <span className="text-subtle text-sm">{t("common.dayUnit")}</span>
                  </span>
                  <span className="text-primary">{formatBps(p.aprBps)}</span>
                  <span className="text-subtle text-sm">
                    {t("admin.minShort")} {p.minDeposit === 0n ? "—" : fmtToken(p.minDeposit)} · {t("admin.maxShort")}{" "}
                    {p.maxDeposit === 0n ? "∞" : fmtToken(p.maxDeposit)} · {t("admin.penaltyShort")}{" "}
                    <span className="text-warn">{formatBps(p.earlyWithdrawPenaltyBps)}</span>
                  </span>
                  {p.enabled ? (
                    <StatusBadge status={0} />
                  ) : (
                    <span className="inline-block rounded-full border border-warn/40 bg-warn/10 px-2.5 py-0.5 text-xs font-semibold text-warn">
                      {t("plan.paused")}
                    </span>
                  )}

                  {isOwner && (
                    <div className="ml-auto flex items-center gap-2">
                      <input
                        aria-label={t("admin.newAprAria", { id: p.id })}
                        className="field !w-24 !py-1 text-sm"
                        inputMode="decimal"
                        placeholder={t("admin.aprPh")}
                        value={newApr.id === p.id ? newApr.value : ""}
                        onChange={(e) => setNewApr({ id: p.id, value: e.target.value })}
                      />
                      <button
                        type="button"
                        className="btn btn-outline !py-1 !px-3 text-xs inline-flex items-center gap-1.5"
                        disabled={pending}
                        onClick={() => updateApr(p.id)}
                      >
                        {activeAction === `updateApr-${p.id}` && <Loader2 size={13} className="animate-spin shrink-0" />}
                        <span>{t("admin.btnUpdate")}</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline !py-1 !px-3 text-xs inline-flex items-center gap-1.5"
                        disabled={pending}
                        onClick={() => togglePlan(p.id, !p.enabled)}
                      >
                        {activeAction === `togglePlan-${p.id}` && <Loader2 size={13} className="animate-spin shrink-0" />}
                        <span>{p.enabled ? t("admin.btnDisable") : t("admin.btnEnable")}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {isOwner && (
              <div className="grid gap-4 mt-4 lg:grid-cols-2">
                <div className="card">
                  <h3 className="font-display mb-3">{t("admin.createTitle")}</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Field label={t("admin.fTenor")} value={fTenor} onChange={setFTenor} placeholder="180" />
                    <Field label={t("admin.fApr")} value={fApr} onChange={setFApr} placeholder="300" />
                    <Field label={t("admin.fPenalty")} value={fPenalty} onChange={setFPenalty} placeholder="450" />
                    <Field label={t("admin.fMin")} value={fMin} onChange={setFMin} placeholder="100" />
                    <Field label={t("admin.fMax")} value={fMax} onChange={setFMax} placeholder="50000" />
                  </div>
                  <button
                    type="button"
                    className="btn btn-cta mt-3 inline-flex items-center gap-1.5"
                    disabled={pending}
                    onClick={createPlan}
                  >
                    {activeAction === "createPlan" && <Loader2 size={15} className="animate-spin shrink-0" />}
                    <span>{t("admin.btnCreate")}</span>
                  </button>
                </div>

                {/* Vault funding — đặt cạnh card Tạo plan (2 cột từ lg) */}
                <section className="card">
                  <h2 className="font-display mb-1">{t("admin.fundTitle")}</h2>
                  <p className="text-xs text-subtle mb-3">
                    {t("admin.fundNote")}
                  </p>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label htmlFor="vault-amount">{t("admin.amountLabel")}</label>
                      <input
                        id="vault-amount"
                        className="field !w-56"
                        inputMode="decimal"
                        placeholder={t("admin.amountPh")}
                        value={vaultAmount}
                        onChange={(e) => setVaultAmount(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-cta inline-flex items-center justify-center gap-2"
                      disabled={pending || !vaultAmount}
                      onClick={fundVault}
                    >
                      {activeAction === "fundVault" && <Loader2 size={15} className="animate-spin shrink-0" />}
                      <span>{t("admin.btnFund")}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline inline-flex items-center justify-center gap-2"
                      disabled={pending || !vaultAmount}
                      onClick={() => (available !== null && parseTokenInput(vaultAmount) <= available ? withdrawVault() : undefined)}
                    >
                      {activeAction === "withdrawVault" && <Loader2 size={15} className="animate-spin shrink-0" />}
                      <span>{t("admin.btnWithdraw")}</span>
                    </button>
                  </div>
                  {available !== null && vaultAmount && parseTokenInput(vaultAmount) > available && (
                    <p className="text-xs text-err mt-2" role="alert">
                      {t("admin.withdrawCap", { amount: fmtToken(available) })}
                    </p>
                  )}
                </section>
              </div>
            )}
          </section>
        </>
      )}

      {state.status === "error" && (
        <p className="text-xs text-err mt-3" role="alert" aria-live="polite">
          {state.message}
        </p>
      )}
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={label}>{label}</label>
      <input
        id={label}
        className="field"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
