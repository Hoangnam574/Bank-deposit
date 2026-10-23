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
import { useContracts, useSignerContracts } from "@/providers/ContractsProvider";
import { useWallet } from "@/providers/WalletProvider";import { useTx } from "@/hooks/useTx";
import { fmtToken, formatBps, parseToken as parseTokenInput } from "@/lib/format";
import type { PlanRow } from "@/components/PlanCard";

const EMERGENCY_DELAY_SECONDS = 7 * 86_400;

export default function Admin() {
  const { contracts, hasDeployment } = useContracts();
  const signerC = useSignerContracts();
  const { address, hasWallet, getBrowser } = useWallet();
  const { state, run } = useTx();

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

  const call = (label: string, fn: (c: NonNullable<typeof signerC>) => Promise<unknown>): void => {
    if (!signerC) return;
    void run(label, async () => (await fn(signerC)) as unknown as ContractTransactionResponse);
  };

  const createPlan = () => {
    call("Tạo plan", async (c) => {
      const tenor = Number(fTenor);
      const apr = Number(fApr);
      const min = fMin ? parseTokenInput(fMin) : 0n;
      const max = fMax ? parseTokenInput(fMax) : 0n;
      const penalty = Number(fPenalty || "0");
      if (!tenor || !apr) throw new Error("Thiếu tenor/APR");
      return c.core.createPlan(tenor, apr, min, max, penalty);
    });
  };

  const updateApr = (planId: number) => {
    call("Update APR", async (c) => c.core.updatePlan(planId, Number(newApr.value)));
  };

  const togglePlan = (planId: number, nextEnabled: boolean) => {
    call(nextEnabled ? "Enable plan" : "Disable plan", async (c) =>
      c.core.setPlanEnabled(planId, nextEnabled),
    );
  };

  const fundVault = () => {
    call("Fund vault", async (c) => {
      const amt = parseTokenInput(vaultAmount);
      if (amt <= 0n) throw new Error("Số amount phải > 0");
      await c.usdc.approve(c.vault.target, amt); // approve trước (2 tx tất nhiên — chạy trong prompt 2 giao dịch)
      return c.vault.fundVault(amt);
    });
  };

  const withdrawVault = () => {
    call("Withdraw vault (residual surplus)", async (c) => c.vault.withdrawVault(parseTokenInput(vaultAmount)));
  };

  const pauseToggle = (nextPause: boolean) => {
    call(nextPause ? "Pause hệ thống" : "Unpause", async (c) => (nextPause ? c.vault.pause() : c.vault.unpause()));
  };

  if (!hasWallet) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-subtle text-center">
        Kết nối ví để xem trang admin (nút{" "}
        <strong className="text-txt">"Kết nối ví"</strong> ở navbar).
      </div>
    );
  }
  if (!contracts) {
    /* Chain allowed nhưng chưa deploy (vd Sepolia khi chưa deploy, hoặc chain lạ
       vượt NetworkGuard) — empty state có action thay câu text lơ lửng. */
    return <NoDeploymentState page="Admin" />;
  }

  const emergencyUnlocked = paused && pauseAt !== null && nowSec >= pauseAt + EMERGENCY_DELAY_SECONDS;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <section className="mt-6 rounded-2xl border border-line hero-gradient px-6 py-6 sm:px-9">
        <h1 className="text-3xl font-bold font-display tracking-wide">Admin console</h1>
        <p className="text-subtle text-sm mt-1">
          Vault owner: <code>{owner ?? "—"}</code>{" "}
          {isOwner ? (
            <span className="text-ok">(bạn là owner)</span>
          ) : (
            <span className="text-warn">(không phải bạn — chế độ xem)</span>
          )}
        </p>
      </section>

      {!isOwner && (
        <div className="card mt-4 border-subtle/40 flex items-center gap-2 text-sm text-subtle">
          <Lock size={16} /> Các thao tác write chỉ dành cho owner — form bên dưới bị khóa.
        </div>
      )}

      {!owner && <div className="text-subtle text-sm mt-4">Đang đọc state VaultManager…</div>}

      {owner && (
        <>
          {/* ── Vault status: 3 tile lớn ─── */}
          <section aria-label="Trạng thái vault" className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
            <div className="card !p-4">
              <div className="text-xs text-subtle">Vault balance (thực)</div>
              <div className="mt-1 text-2xl font-display">
                {vaultBal !== null ? fmtToken(vaultBal) : "…"}{" "}
                <span className="text-sm text-subtle font-body">USDC</span>
              </div>
            </div>
            <div className="card !p-4">
              <div className="text-xs text-subtle">Owed interest (cam kết trả)</div>
              <div className="mt-1 text-2xl font-display text-warn">
                {owed !== null ? fmtToken(owed) : "…"}{" "}
                <span className="text-sm text-subtle font-body">USDC</span>
              </div>
            </div>
            <div className="card !p-4 border-ok/30">
              <div className="text-xs text-subtle">Available (admin rút được)</div>
              <div className="mt-1 text-2xl font-display text-ok glow-num">
                {available !== null ? fmtToken(available) : "…"}
              </div>
            </div>
          </section>

          <div className="card mt-4 text-sm flex flex-wrap items-center gap-3">
            <span>
              Hệ thống: {paused ? <strong className="text-err">PAUSED</strong> : <strong className="text-ok">RUNNING</strong>}
              {paused && pauseAt !== null && !emergencyUnlocked && (
                <span className="text-warn">
                  {' '}· C5 unlock sau {Math.max(0, Math.ceil((pauseAt + EMERGENCY_DELAY_SECONDS - nowSec) / 3600))} giờ
                </span>
              )}
            </span>
            {isOwner && (
              <button type="button" className={`btn ${paused ? "btn-cta" : "btn-danger"} ml-auto`} onClick={() => pauseToggle(!paused)} disabled={pending}>
                {paused ? "Unpause" : "Pause"}
              </button>
            )}
          </div>

          {/* ── Plans ─── */}
          <section className="mt-8">
            <h2 className="font-display tracking-wider text-xl mb-3">Plans</h2>
            <div className="grid gap-3">
              {plans.map((p) => (
                <div key={p.id} className="card !p-4 flex flex-wrap items-center gap-3">
                  <span className="text-subtle text-sm">#{p.id}</span>
                  <span className="font-display text-lg">{Number(p.tenorDays)}d</span>
                  <span className="text-primary">{formatBps(p.aprBps)}</span>
                  <span className="text-subtle text-sm">
                    min {p.minDeposit === 0n ? "—" : fmtToken(p.minDeposit)} · max{" "}
                    {p.maxDeposit === 0n ? "∞" : fmtToken(p.maxDeposit)} · penalty{" "}
                    <span className="text-warn">{formatBps(p.earlyWithdrawPenaltyBps)}</span>
                  </span>
                  <StatusBadge status={p.enabled ? 0 : 2} />

                  {isOwner && (
                    <div className="ml-auto flex items-center gap-2">
                      <input
                        aria-label={`APR mới cho plan ${p.id}`}
                        className="field !w-24 !py-1 text-sm"
                        inputMode="decimal"
                        placeholder="APR bps"
                        value={newApr.id === p.id ? newApr.value : ""}
                        onChange={(e) => setNewApr({ id: p.id, value: e.target.value })}
                      />
                      <button
                        type="button"
                        className="btn btn-outline !py-1 !px-3 text-xs"
                        disabled={pending}
                        onClick={() => updateApr(p.id)}
                      >
                        Update
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline !py-1 !px-3 text-xs"
                        disabled={pending}
                        onClick={() => togglePlan(p.id, !p.enabled)}
                      >
                        {p.enabled ? "Disable" : "Enable"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {isOwner && (
              <div className="card mt-4 max-w-2xl">
                <h3 className="font-display mb-3">Tạo plan mới</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Tenor (ngày)" value={fTenor} onChange={setFTenor} placeholder="180" />
                  <Field label="APR (bps)" value={fApr} onChange={setFApr} placeholder="300" />
                  <Field label="Penalty (bps)" value={fPenalty} onChange={setFPenalty} placeholder="450" />
                  <Field label="Min deposit (USDC)" value={fMin} onChange={setFMin} placeholder="100" />
                  <Field label="Max deposit (USDC)" value={fMax} onChange={setFMax} placeholder="50000" />
                </div>
                <button type="button" className="btn btn-cta mt-3" disabled={pending} onClick={createPlan}>
                  Tạo plan
                </button>
              </div>
            )}
          </section>

          {/* ── Vault funding ─── */}
          {isOwner && (
            <section className="card mt-8 max-w-2xl">
              <h2 className="font-display mb-1">Nạp / Rút vault</h2>
              <p className="text-xs text-subtle mb-3">
                Fund: approve + fundVault (2 tx). Withdraw: rút phần available — không thể rút dưới owed (C2 solvency).
              </p>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label htmlFor="vault-amount">Số USDC</label>
                  <input
                    id="vault-amount"
                    className="field !w-56"
                    inputMode="decimal"
                    placeholder="VD: 100000"
                    value={vaultAmount}
                    onChange={(e) => setVaultAmount(e.target.value)}
                  />
                </div>
                <button type="button" className="btn btn-cta" disabled={pending || !vaultAmount} onClick={fundVault}>
                  {pending && <Loader2 size={15} className="animate-spin inline mr-1" />} Nạp vault
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={pending || !vaultAmount}
                  onClick={() => (available !== null && parseTokenInput(vaultAmount) <= available ? withdrawVault() : undefined)}
                >
                  Rút vault
                </button>
              </div>
              {available !== null && vaultAmount && parseTokenInput(vaultAmount) > available && (
                <p className="text-xs text-err mt-2" role="alert">
                  Chỉ rút được tối đa {fmtToken(available)} USDC (C2: không vượt available).
                </p>
              )}
            </section>
          )}
        </>
      )}

      {state.status === "error" && (
        <p className="text-xs text-err mt-3" role="alert" aria-live="polite">
          {state.message}
        </p>
      )}
    </div>
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
