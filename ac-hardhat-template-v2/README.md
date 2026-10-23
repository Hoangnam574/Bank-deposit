# AC Hardhat Template V2

Template Hardhat v3 với TypeScript, Ethers.js v6 và Hardhat Ignition.

## Cấu trúc thư mục

### `contracts/`
Chứa mã nguồn Solidity của smart contract. Đây là thư mục bạn viết code contract chính.

| File | Mô tả |
|---|---|
| `Counter.sol` | Contract đếm đơn giản (ví dụ cơ bản) |
| `MyToken.sol` | Token ERC-20 (sử dụng OpenZeppelin) |
| `MyMintableToken.sol` | Token ERC-20 có hàm `mint` chỉ owner gọi được |
| `MyNFT.sol` | NFT ERC-721 (sử dụng OpenZeppelin) |

### `scripts/`
Chứa các script chạy bằng `hardhat run` để tương tác với contract đã deploy (gọi hàm, gửi giao dịch, mint...).

| File | Mô tả |
|---|---|
| `interact.ts` | Tương tác với `Counter` |
| `interactToken.ts` | Tương tác với `MyToken` (transfer, balance...) |
| `interactNFT.ts` | Tương tác với `MyNFT` |
| `interactMintableToken.ts` | Deploy/thao tác `MyMintableToken`: mint 1000 token cho deployer và in balance |
| `mintNFT.ts` | Mint NFT (dùng cho mạng Sepolia) |

### `test/`
Chứa các bài test (Mocha + Chai + Ethers) kiểm tra hành vi của contract. Chạy bằng `npm test`.

- `Counter.ts`, `MyToken.ts`, `MyMintableToken.ts`, `MyNFT.ts` — test tương ứng cho từng contract.

### `ignition/`
Cấu hình deploy bằng **Hardhat Ignition** (cơ chế deploy có state, chống deploy trùng, retry an toàn).

- `modules/` — module deploy cho từng contract: `Counter.ts`, `MyToken.ts`, `MyMintableToken.ts`, `MyNFT.ts`.
- `deployments/` — nhật ký và kết quả deploy đã thực hiện, phân theo chain ID
  (ví dụ `chain-11155111` = Sepolia), gồm `journal.jsonl`, `deployed_addresses.json`, artifacts.

### `types/`
File TypeScript types được sinh tự động (typechain-style) từ ABI của contract, giúp IDE autocomplete khi gọi contract bằng Ethers.

- `types/ethers-contracts/` — types cho từng contract.
- `types/ethers-contracts/factories/` — Factory classes để deploy/instantiate contract.

> Không chỉnh sửa thủ công — sẽ được sinh lại khi chạy `npm run compile`.

### `artifacts/`
Kết quả biên dịch Solidity: ABI, bytecode, metadata... Do Hardhat tự sinh khi chạy `npm run compile`.

### `cache/`
Bộ nhớ đệm biên dịch của Hardhat (theo dõi file nào đã compile) để lần chạy sau nhanh hơn. An toàn khi xoá.

### `node_modules/`
Các package cài đặt từ npm (`hardhat`, `ethers`, `@openzeppelin/contracts`...).

## File cấu hình

| File | Mô tả |
|---|---|
| `hardhat.config.ts` | Cấu hình Hardhat: phiên bản Solidity (0.8.28), optimizer, các mạng (`hardhatMainnet`, `sepolia`, `ethereum`, `bscTestnet`) |
| `package.json` | Scripts (`compile`, `test`, `deploy:*`, `interact:*`) và dependencies |
| `tsconfig.json` | Cấu hình TypeScript |
| `.env` | Biến bí mật (private key, RPC URL) — **không commit vào git** |
| `.env_example` | Mẫu biến môi trường để sao chép sang `.env` |
| `.gitignore` | Các file/thư mục loại trừ khỏi git (`node_modules`, `artifacts`, `cache`, `.env`...) |

## Lệnh thường dùng

```bash
npm run compile          # Biên dịch contract
npm test                 # Chạy test
npm run node             # Chạy local node

npm run deploy:local     # Deploy Counter bằng Ignition (local)
npm run deploy:sepolia   # Deploy Counter lên Sepolia
npm run deploy:token:sepolia
npm run deploy:nft:sepolia
npm run deploy:mintable:local     # Deploy MyMintableToken bằng Ignition (local)
npm run deploy:mintable:sepolia   # Deploy MyMintableToken lên Sepolia

npm run interact         # Tương tác Counter
npm run interact:token   # Tương tác token
npm run interact:nft     # Tương tác NFT
npm run interact:mintable:local     # Deploy + mint 1000 MMT + in balance
npm run interact:mintable:sepolia   # Mint 1000 MMT + in balance trên Sepolia
npm run mint:nft:sepolia # Mint NFT trên Sepolia
```

> **Lưu ý:** các lệnh `deploy:*:sepolia` sẽ hỏi xác nhận `Confirm deploy to network sepolia (11155111)?` — gõ `y` để tiếp tục.
> Khi chạy không tương tác (CI, script tự động) thì đặt biến môi trường `HARDHAT_IGNITION_CONFIRM_DEPLOYMENT=true` để bỏ qua prompt.

> **Lưu ý:** `interact:mintable:sepolia` yêu cầu contract đã được deploy bằng `npm run deploy:mintable:sepolia` trước
> (địa chỉ được lấy từ `ignition/deployments/chain-11155111/deployed_addresses.json`).
