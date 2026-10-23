import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

const testnetPrivateKey = process.env.TESTNET_PRIVATE_KEY;
const mainnetPrivateKey = process.env.MAINNET_PRIVATE_KEY;

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
      accounts: {
        // `npx hardhat node` dùng mnemonic mặc định này và mở khóa 20 account
        // đầu tiên với 10.000 ETH mỗi account — dùng cùng mnemonic để ký hợp lệ.
        mnemonic: "test test test test test test test test test test test junk",
        count: 20,
        passphrase: "",
      },
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: testnetPrivateKey ? [testnetPrivateKey] : [],
    },
    ethereum: {
      type: "http",
      chainType: "l1",
      url: process.env.MAINNET_RPC_URL || "https://eth-mainnet.public.blastapi.io",
      accounts: mainnetPrivateKey ? [mainnetPrivateKey] : [],
    },
    bscTestnet: {
      type: "http",
      chainType: "l1",
      url: process.env.BSC_TESTNET_RPC_URL || "https://bsc-testnet-dataseed.bnbchain.org",
      accounts: testnetPrivateKey ? [testnetPrivateKey] : [],
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
  },
});
