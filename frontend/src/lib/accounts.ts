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

/** Các account demo (network local công khai — không phải key thật). */
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
  {
    index: 2,
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    key: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    role: "Bob · user demo",
  },
  {
    index: 3,
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    key: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    role: "Carol · user demo",
  },
  {
    index: 4,
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    key: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
    role: "Dave · user demo",
  },
  {
    index: 5,
    address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
    key: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
    role: "Eve · user demo",
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
