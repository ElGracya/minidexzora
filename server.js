const { createWalletClient, http, createPublicClient, parseEther } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { base } = require("viem/chains");

function sanitizeBigInt(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return obj.toString();
  if (Array.isArray(obj)) return obj.map(sanitizeBigInt);
  if (typeof obj === "object") {
    const out = {};
    for (const k in obj) out[k] = sanitizeBigInt(obj[k]);
    return out;
  }
  return obj;
}

const { createMetadataBuilder, createZoraUploaderForCreator, createCoinCall, createTradeCall, CreateConstants, setApiKey } = require("@zoralabs/coins-sdk");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const miniDexMetadataStore = new Map();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));

const ZORA_API_KEY = process.env.ZORA_API_KEY;
if (ZORA_API_KEY) setApiKey(ZORA_API_KEY);

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
let deployerAccount = null;
let walletClient = null;
let publicClient = null;
if (DEPLOYER_PRIVATE_KEY) {
  const pk = DEPLOYER_PRIVATE_KEY.startsWith("0x") ? DEPLOYER_PRIVATE_KEY : "0x" + DEPLOYER_PRIVATE_KEY;
  deployerAccount = privateKeyToAccount(pk);
  walletClient = createWalletClient({ account: deployerAccount, chain: base, transport: http() });
  publicClient = createPublicClient({ chain: base, transport: http() });
  console.log("✅ Deployer wallet loaded:", deployerAccount.address);
} else {
  console.log("⚠️ DEPLOYER_PRIVATE_KEY tidak ditemukan di .env");
}

const PORT = process.env.PORT || 3000;
const BASE_URL = "https://api-sdk.zora.engineering";

function ipfsToHttp(ipfsUrl) {
  if (!ipfsUrl) return "https://cloudflare-ipfs.com/ipfs/bafybeif3obmqw7n323q6b42bby7f776sctbe3bbyvsk6msbyvsk6msbyvs";
  if (typeof ipfsUrl === 'string' && ipfsUrl.startsWith("ipfs://")) {
    return ipfsUrl.replace("ipfs://", "https://cloudflare-ipfs.com/ipfs/");
  }
  return ipfsUrl;
}

function parseRealtimeZora(rawJson) {
  if (rawJson && rawJson.exploreList && Array.isArray(rawJson.exploreList.edges)) {
    return rawJson.exploreList.edges.map((edge) => {
      const token = edge.node;
      return {
        name: token.name || "Unnamed Token",
        symbol: token.symbol || "UNKNOWN",
        marketCap: parseFloat(token.marketCap) || 15000,
        marketCapDelta24h: parseFloat(token.marketCapDelta24h) || 0,
        trades: token.totalVolume ? (parseFloat(token.totalVolume) / 100).toFixed(1) + "k" : "12.5k",
        uniqueHolders: token.uniqueHolders ? token.uniqueHolders.toLocaleString() : "100",
        address: token.address || "0x0000000000000000000000000000000000000000",
        image: ipfsToHttp(token.mediaContent?.previewImage?.small || token.tokenUri),
        description: token.description || "No description provided by the creator yet.",
        creator: token.creatorAddress || "0xCreatorAddressUnverified",
        supply: token.totalSupply ? parseFloat(token.totalSupply).toLocaleString() : "1,000,000,000"
      };
    });
  }
  return null;
}

app.get("/api/tokens", async (req, res) => {
  try {
    const filter = req.query.filter || "TOP_GAINERS"; 
    let zoraValidFilter = filter === "NEW" ? "NEW" : "TOP_GAINERS";
    const url = `${BASE_URL}/explore?listType=${zoraValidFilter}&count=150`;
    
    const response = await fetch(url, { 
      method: "GET",
      headers: { 
        "X-API-KEY": ZORA_API_KEY,
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    
    if (!response.ok) throw new Error();
    const rawData = await response.json();
    const realCleanData = parseRealtimeZora(rawData);
    
    if (realCleanData && realCleanData.length > 0) {
      return res.json(realCleanData);
    }
    throw new Error();
  } catch (err) {
    const mockupDataset = [
      { name: "cc0company", symbol: "CC0", marketCap: 75000, marketCapDelta24h: 18.2, trades: "35.2k", uniqueHolders: "2.1k", address: "0x1111111111111111111111111111111111111111", image: "https://cloudflare-ipfs.com/ipfs/bafybeiasmz42ozpepyn7nicqa7a3giuoxdrzcpjfqp2ra5skqpdaccyz74", description: "Empowering the CC0 internet culture framework globally.", creator: "0xcc0creatorfb383c9284fa028d84a3b83984", supply: "1,000,000,000" }
    ];
    res.json(mockupDataset);
  }
});






app.post("/api/buy-coin-call", async (req, res) => {
  try {
    const { contractAddress, ethAmount, sender } = req.body;

    if (!contractAddress || !ethAmount || !sender) {
      return res.status(400).json({ error: "contractAddress, ethAmount, and sender are required." });
    }

    const quote = await createTradeCall({
      sell: { type: "eth" },
      buy: { type: "erc20", address: contractAddress },
      amountIn: parseEther(String(ethAmount)),
      slippage: 0.05,
      sender,
      recipient: sender
    });

    return res.json({
      success: true,
      to: quote.call.target,
      data: quote.call.data,
      value: quote.call.value.toString()
    });
  } catch (err) {
    console.error("Buy quote failed:", err);
    return res.status(500).json({ error: err.message || "Failed to create Zora buy transaction." });
  }
});



app.get("/api/metadata/:id", (req, res) => {
  const metadata = miniDexMetadataStore.get(req.params.id);
  if (!metadata) return res.status(404).json({ error: "Metadata not found" });
  res.setHeader("Content-Type", "application/json");
  return res.json(metadata);
});

app.post("/api/create-coin-call", async (req, res) => {
  try {
    const { File } = require("node:buffer");
    const { name, symbol, description, imageUri } = req.body;

    if (!deployerAccount || !walletClient || !publicClient) {
      return res.status(500).json({ error: "Deployer wallet belum dikonfigurasi (DEPLOYER_PRIVATE_KEY kosong)." });
    }
    if (!name || !symbol) {
      return res.status(400).json({ error: "name dan symbol wajib diisi" });
    }

    const cleanSymbol = String(symbol).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12);
    if (!cleanSymbol) {
      return res.status(400).json({ error: "Symbol harus berupa huruf/angka, contoh: MINIDEX" });
    }

    let imageFile;
    if (imageUri && imageUri.includes("base64,")) {
      const base64Data = imageUri.split("base64,")[1];
      const mime = imageUri.split(";")[0].split(":")[1];
      imageFile = new File([Buffer.from(base64Data, "base64")], "token.png", { type: mime });
    } else {
      imageFile = new File([Buffer.from("")], "token.png", { type: "image/png" });
    }

    console.log(`📡 Membangun metadata + on-chain call untuk $${cleanSymbol} | deployer wallet: ${deployerAccount.address}`);

    const metadataId = `${Date.now()}-${cleanSymbol.toLowerCase()}`;
    const metadata = {
      name,
      symbol: cleanSymbol,
      description: description || "",
      image: "https://minidexzora.xyz/mini-zora-logo.jpg"
    };

    miniDexMetadataStore.set(metadataId, metadata);

    const publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://minidexzora.xyz";
    const createMetadataParameters = {
      uri: `${publicBaseUrl}/api/metadata/${metadataId}`
    };

    const result = await createCoinCall({
      creator: deployerAccount.address,
      ...createMetadataParameters,
      chainId: 8453,
      currency: CreateConstants.ContentCoinCurrencies.ZORA,
      startingMarketCap: CreateConstants.StartingMarketCaps.LOW,
      skipMetadataValidation: true
    });

    console.log(`✅ Call siap. Predicted Coin Address: ${result.predictedCoinAddress}`);
    console.log(`🖊️  Signing & broadcasting via deployer wallet...`);

    const txHashes = [];
    for (const call of result.calls) {
      const hash = await walletClient.sendTransaction({
        to: call.to,
        data: call.data,
        value: call.value || 0n
      });
      console.log(`⛓️  TX sent: ${hash}`);
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`✅ TX confirmed: ${hash}`);
      txHashes.push(hash);
    }

    return res.json(sanitizeBigInt({
      success: true,
      predictedCoinAddress: result.predictedCoinAddress,
      txHashes
    }));

  } catch (err) {
    console.error("ZORA SDK ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => { console.log(`🚀 Mini Dex Engine Berjalan di port ${PORT}`); });
