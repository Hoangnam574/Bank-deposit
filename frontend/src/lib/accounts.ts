/**
 * lib/accounts.ts — nhận diện account Hardhat mặc định để guide user
 * (nếu ví đang dùng account ngoài → không có ETH/USDC trên local).
 * Danh sách đầy đủ 20 key luôn được in ra khi `npm run node` — xem terminal node.
 */
export interface HardhatAccount {
  index: number;
  address: string;
  key: string;
  role: string;
}

/** 2 account chính dùng trong demo (network local công khai — không phải key thật). */
export const HARDHAT_ACCOUNTS: HardhatAccount[] = [
  {
    index: 0,
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    key: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    role: "Deployer · Admin (owner vault)",
  },
  {
    index: 1,
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    role: "Alice · user demo",
  },
];

export function findHardhatAccount(address: string | null): HardhatAccount | null {
  if (!address) return null;
  const lower = address.toLowerCase();
  return HARDHAT_ACCOUNTS.find((a) => a.address.toLowerCase() === lower) ?? null;
}

/** Cờ dùng StatStrip/chip vai trò — admin đọc từ vault.owner() nên không cứng hoá ở đây. */
export function isKnownDemoAccount(address: string | null): boolean {
  return findHardhatAccount(address) !== null;
}
