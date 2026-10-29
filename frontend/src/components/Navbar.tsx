/**
 * Navbar v5 — App shell: logo · nav (active = tint gold) · chain pill · USDC chip ·
 * vai trò (Vault owner → "Admin") · Faucet · nút ví.
 * Mobile (< 640px) chia 2 vùng để hết tràn ngang:
 *   - Header sticky trên: logo + chain pill compact + faucet + nút ví
 *   - Footer-nav cố định đáy: 3–4 kho điều hướng lớn (tap target ≥ 44px)
 * Desktop (≥ sm): giữ nguyên header một hàng như cũ.
 * Faucet: mint 1.000 MockUSDC, chỉ hiện khi chain là local/testnet (T6.12).
 */
import { useEffect, useState, type ComponentType } from "react";
import { Link, NavLink } from "react-router-dom";
import { Landmark, Droplet, ShieldCheck, Home, PlusCircle, Wallet, Languages, Menu, X, LogOut } from "lucide-react";
import type { ContractTransactionResponse } from "ethers";
import { useWallet } from "@/providers/WalletProvider";
import { useContracts, useSignerContracts } from "@/providers/ContractsProvider";
import { fmtToken, SCALAR } from "@/lib/format";
import { findHardhatAccount } from "@/lib/accounts";
import NetworkMenu from "@/components/NetworkMenu";
import { useTx } from "@/hooks/useTx";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useLang, type TKey } from "@/lib/i18n";

const NAV: { to: string; key: TKey; icon: ComponentType<{ size?: number; className?: string }> }[] = [
  { to: "/", key: "nav.overview", icon: Home },
  { to: "/open", key: "nav.open", icon: PlusCircle },
  { to: "/deposits", key: "nav.deposits", icon: Wallet },
  { to: "/admin", key: "nav.admin", icon: ShieldCheck },
];

export default function Navbar() {
  const { address, connect, disconnect, connecting, error, chainId } = useWallet();
  const { contracts } = useContracts();
  const signerC = useSignerContracts();
  const { run, state } = useTx();
  const { isAdmin } = useAdminRole();
  const { lang, setLang, t } = useLang();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  /* ESC đóng menu ☰ */
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  /* USDC balance — refresh khi tx thành công (bank:tx-ok); vai trò admin dùng useAdminRole */
  useEffect(() => {
    if (!contracts || !address) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const bal = (await contracts.usdc.balanceOf(address)) as bigint;
        if (!cancelled) setBalance(bal);
      } catch {
        /* giữ nguyên */
      }
    })();
    const onTxOk = () => {
      contracts.usdc
        .balanceOf(address)
        .then((b) => !cancelled && setBalance(b as bigint))
        .catch(() => {});
    };
    window.addEventListener("bank:tx-ok", onTxOk);
    return () => {
      cancelled = true;
      window.removeEventListener("bank:tx-ok", onTxOk);
    };
  }, [contracts, address, chainId]);

  const isTestChain = chainId === 31337 || chainId === 11155111;
  const demo = findHardhatAccount(address);
  const navItems = NAV.filter((item) => item.to !== "/admin" || isAdmin);

  const faucet = () => {
    void run(t("nav.faucetLabel"), async () => {
      if (!signerC || !address) throw new Error(t("nav.txNoWallet"));
      const tx = (await signerC.usdc.mint(address, SCALAR * 1000n)) as unknown as ContractTransactionResponse;
      return tx;
    });
  };

  return (
    <>
      {/* Nav v5 — flat full-width trên canvas (Binance top-nav): hairline dưới,
          logo block yellow đặc + icon ink. Mobile: header chỉ giữ logo + cụm ví. */}
      <div className="sticky top-0 z-40 border-b border-line bg-bg relative">
        <header className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10">
          {/* ── DESKTOP ≥sm: một hàng như cũ ── */}
          <div className="hidden sm:flex items-center gap-x-2.5 flex-nowrap py-2.5">
            <Link to="/" className="flex items-center gap-2 cursor-pointer shrink-0">
              <span className="grid place-items-center w-9 h-9 rounded-md bg-primary">
                <Landmark className="text-ink" size={20} />
              </span>
              <span className="font-bold tracking-tight text-lg text-white">
                BANK<span className="text-primary">·</span>DEPOSIT
              </span>
            </Link>

            <nav aria-label={t("nav.mainAria")} className="hidden lg:flex items-center gap-1 flex-nowrap">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `relative px-2.5 xl:px-3 py-1.5 rounded-full text-sm whitespace-nowrap cursor-pointer transition-colors duration-200 ${
                      isActive
                        ? "bg-primary/15 text-primary font-semibold"
                        : "text-subtle hover:text-txt hover:bg-panel"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {t(item.key)}
                      {isActive && (
                        <span
                          aria-hidden
                          className="absolute left-3 right-3 -bottom-[7px] h-0.5 rounded-full bg-primary"
                        />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2 flex-nowrap justify-end">
              {isAdmin && (
                <span className="inline-flex items-center gap-1 rounded-md border border-ok/40 bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok whitespace-nowrap">
                  <ShieldCheck size={12} /> Admin
                </span>
              )}
              {balance !== null && (
                <span className="num text-xs sm:text-sm font-display text-secondary whitespace-nowrap">{fmtToken(balance, 2)}</span>
              )}
              {isTestChain && address && (
                <button
                  type="button"
                  onClick={faucet}
                  disabled={state.status === "pending"}
                  aria-label={t("nav.faucetAria")}
                  className="btn btn-outline !py-1.5 !px-2 xl:!px-2.5 text-xs inline-flex items-center gap-1 shrink-0"
                >
                  <Droplet size={14} /> <span className="hidden xl:inline">{t("nav.faucet")}</span>
                </button>
              )}
              {address ? (
                <div
                  className="num text-xs font-medium px-2.5 py-1.5 rounded-md bg-panel border border-line text-txt whitespace-nowrap"
                  aria-label={demo
                    ? t("nav.demoTitle", { i: demo.index, role: demo.role })
                    : t("nav.extTitle")}
                >
                  {address.slice(0, 6)}…{address.slice(-4)}
                  {demo && <span className="text-xs text-subtle hidden xl:inline"> (#{demo.index})</span>}
                </div>
              ) : (
                <button type="button" onClick={() => void connect()} disabled={connecting} className="btn btn-cta !py-1.5 shrink-0 text-xs">
                  {connecting ? t("nav.connecting") : t("nav.connect")}
                </button>
              )}
              {/* ☰ menu — chứa chọn mạng, ngôn ngữ, đăng xuất và nav link (khi hẹp) */}
              <button
                type="button"
                aria-label={t("nav.menuAria")}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                className="btn btn-outline !py-1.5 !px-2.5 inline-flex shrink-0 items-center justify-center cursor-pointer"
              >
                {menuOpen ? <X size={16} /> : <Menu size={16} />}
              </button>
            </div>
          </div>

          {/* ── Dropdown ☰ — nav (mobile/tablet) + chọn mạng + ngôn ngữ + đăng xuất ── */}
          {menuOpen && (
            <>
              {/* Backdrop trong suốt — click ngoài đóng; z-40 dưới modal z-[60] */}
              <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setMenuOpen(false)} />
              <div
                role="menu"
                aria-label={t("nav.mainAria")}
                className="absolute right-4 sm:right-6 lg:right-10 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-card shadow-2xl py-2 z-50 text-txt"
              >
                {/* Nav links khi ở tablet / màn hẹp (lg:hidden) */}
                <div className="lg:hidden pb-1">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-2 text-sm cursor-pointer transition-colors duration-150 ${
                          isActive ? "text-primary bg-primary/10 font-semibold" : "text-subtle hover:text-txt hover:bg-panel"
                        }`
                      }
                    >
                      <item.icon size={16} />
                      {t(item.key)}
                    </NavLink>
                  ))}
                  <div className="my-1.5 border-t border-line" />
                </div>

                {/* ── Chọn mạng ── */}
                <div className="px-4 py-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-subtle font-medium">{t("chain.modalTitle")}</span>
                  <NetworkMenu />
                </div>

                <div className="my-1 border-t border-line" />

                {/* ── Ngôn ngữ ── */}
                <div className="px-4 py-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-subtle font-medium flex items-center gap-1.5">
                    <Languages size={14} className="text-muted" />
                    {lang === "vi" ? "Ngôn ngữ" : "Language"}
                  </span>
                  <div className="flex items-center gap-1 bg-panel rounded-md p-0.5 border border-line text-xs">
                    <button
                      type="button"
                      onClick={() => setLang("vi")}
                      className={`px-2 py-0.5 rounded transition-colors text-xs font-medium cursor-pointer ${
                        lang === "vi" ? "bg-primary text-ink font-semibold" : "text-subtle hover:text-txt"
                      }`}
                    >
                      VI
                    </button>
                    <button
                      type="button"
                      onClick={() => setLang("en")}
                      className={`px-2 py-0.5 rounded transition-colors text-xs font-medium cursor-pointer ${
                        lang === "en" ? "bg-primary text-ink font-semibold" : "text-subtle hover:text-txt"
                      }`}
                    >
                      EN
                    </button>
                  </div>
                </div>

                {/* ── Đăng xuất ── */}
                {address && (
                  <div className="pt-2 px-2 border-t border-line mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        disconnect();
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-err hover:bg-err/10 transition-colors cursor-pointer text-left"
                    >
                      <LogOut size={14} />
                      <span>{t("nav.disconnect")}</span>
                      <span className="ml-auto font-mono text-[11px] opacity-70">
                        {address.slice(0, 6)}…{address.slice(-4)}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── MOBILE <sm: header gọn — logo + faucet + ví + hamburger ── */}
          <div className="flex sm:hidden items-center justify-between gap-1.5 py-2">
            <Link to="/" className="flex items-center gap-1.5 cursor-pointer shrink-0">
              <span className="grid place-items-center w-8 h-8 rounded-md bg-primary">
                <Landmark className="text-ink" size={18} />
              </span>
              <span className="font-bold tracking-tight text-base text-white">
                BANK<span className="text-primary">·</span>DEPOSIT
              </span>
            </Link>

            <div className="flex items-center gap-1.5 min-w-0">
              {balance !== null && (
                <span className="num text-xs font-display text-secondary whitespace-nowrap">{fmtToken(balance, 2)}</span>
              )}
              {isTestChain && address && (
                <button
                  type="button"
                  onClick={faucet}
                  disabled={state.status === "pending"}
                  aria-label={t("nav.faucetAria")}
                  className="btn btn-outline !px-2 !py-1.5 shrink-0"
                >
                  <Droplet size={14} />
                </button>
              )}
              {address ? (
                <span className="btn btn-outline !px-2 !py-1.5 text-xs num shrink-0">
                  {address.slice(0, 5)}…{address.slice(-3)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void connect()}
                  disabled={connecting}
                  className="btn btn-cta !px-2.5 !py-1.5 text-xs shrink-0"
                >
                  {connecting ? t("nav.connecting") : t("nav.connectShort")}
                </button>
              )}
              <button
                type="button"
                aria-label={t("nav.menuAria")}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                className="btn btn-outline !px-2 !py-1.5 shrink-0 inline-flex items-center justify-center cursor-pointer"
              >
                {menuOpen ? <X size={16} /> : <Menu size={16} />}
              </button>
            </div>
          </div>
          {error && <div className="pb-2 text-xs text-err sm:hidden">{error}</div>}
        </header>
      </div>

      {/* ── MOBILE footer-nav: cố định đáy, kho to dễ chạm (≥44px) ── */}
      <nav
        aria-label={t("nav.mainAriaMobile")}
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-bg"
      >
        <div
          className={`grid ${isAdmin ? "grid-cols-4" : "grid-cols-3"} px-1`}
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] cursor-pointer transition-colors duration-200 ${
                  isActive ? "text-primary" : "text-subtle active:text-txt"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={18} className={isActive ? "text-primary" : undefined} />
                  <span className={`text-[10px] leading-tight ${isActive ? "font-semibold" : ""}`}>{t(item.key)}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
