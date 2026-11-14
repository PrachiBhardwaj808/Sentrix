# Blockchain Setup Guide

This guide explains how to connect the Border Surveillance Django backend to the append-only `EvidenceRegistry` smart contract.

The repository already contains the contract and Django integration. The setup below supplies the network, deployment address, and backend signer that are intentionally left out of Git.

## What we are implementing

```text
Camera/AI event
      -> Django hashes evidence and creates an incident reference
      -> Django sends only hashes and audit metadata to EvidenceRegistry
      -> blockchain returns a transaction hash
      -> Django stores the transaction reference with the operational alert
      -> dashboard verifies the evidence hash later
```

Large files remain off-chain:

- Firebase or the local outpost server stores operational alert data.
- Pinata private IPFS stores the approved encrypted snapshot or clip.
- The blockchain stores the incident hash, evidence hash, custody events, and high-severity model provenance.
- The Vercel frontend never holds a private key and does not send transactions directly.
The contract is [EvidenceRegistry.sol](backend/blockchain/contracts/EvidenceRegistry.sol). It has no edit or delete functions. The Django signer is the only account allowed to append records.

## Choose the network

Use both environments during development:

| Environment | Chain ID | Purpose | Cost |
| --- | ---: | --- | --- |
| Anvil | `31337` | Local development and automated testing | Free local test ETH |
| Ethereum Sepolia | `11155111` | Hackathon demonstration and public verification | Testnet ETH only |

Sepolia is the recommended public network for this application demo. It is not a production network and its testnet state should not be treated as permanent evidence.

## 1. Install the required tools

Install Foundry, which provides `forge` for compiling/deploying and `anvil` for a local EVM node. Follow the [official Foundry installation guide](https://getfoundry.sh/introduction/installation/).

Confirm the tools are available in a new PowerShell window:

```powershell
forge --version
anvil --version
```

Install the Django blockchain dependencies from the repository root:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-services.txt
```

The Python client uses `web3.py` to build, sign, submit, and verify contract transactions. See the [web3.py contract documentation](https://web3py.readthedocs.io/en/stable/web3.contract.html).

## 2. Create a dedicated test signer

Create a new wallet used only by the Django backend. Do not use a personal or funded production wallet.

- For Anvil, use one of the temporary accounts printed by Anvil.
- For Sepolia, create a separate testnet wallet and obtain test ETH from a [Sepolia faucet listed by ethereum.org](https://ethereum.org/developers/docs/networks/#sepolia).
- The wallet is a backend service account; the frontend team does not need MetaMask or a wallet connection for this flow.
- Keep the private key in a local environment variable or deployment secret manager. Never commit it, paste it into the frontend, or add it to Vercel `NEXT_PUBLIC_*` variables.

## 3. Test locally with Anvil

Open **Terminal 1** and start a local chain:

```powershell
anvil --host 127.0.0.1 --port 8545
```

Anvil prints funded accounts and private keys. Use the first account for local deployment only. Anvil runs in memory, so its deployed contracts disappear when the process stops.

In **Terminal 2**, set temporary variables. Replace the placeholders with the first Anvil private key and matching account address:

```powershell
$env:BLOCKCHAIN_NETWORK = "Anvil local"
$env:BLOCKCHAIN_RPC_URL = "http://127.0.0.1:8545"
$env:BLOCKCHAIN_CHAIN_ID = "31337"
$env:BLOCKCHAIN_SIGNER_PRIVATE_KEY = "<ANVIL_PRIVATE_KEY>"
$env:BLOCKCHAIN_EXPLORER_BASE_URL = ""
$env:BLOCKCHAIN_CONFIRMATIONS = "1"
```

Deploy the contract from the repository root. `forge create` compiles the target contract as part of deployment:

```powershell
forge create .\backend\blockchain\contracts\EvidenceRegistry.sol:EvidenceRegistry `
  --root . `
  --rpc-url $env:BLOCKCHAIN_RPC_URL `
  --private-key $env:BLOCKCHAIN_SIGNER_PRIVATE_KEY `
  --constructor-args <ANVIL_ACCOUNT_ADDRESS> `
  --broadcast
```

Copy the `Deployed to:` address from the output and set it in the same terminal:

```powershell
$env:BLOCKCHAIN_CONTRACT_ADDRESS = "<DEPLOYED_ANVIL_CONTRACT_ADDRESS>"
```

Check that Django can connect:

```powershell
.\.venv\Scripts\python.exe backend\manage.py check
Invoke-RestMethod http://127.0.0.1:8000/api/blockchain/status
```

The status response should contain:

```json
{
  "configured": true,
  "connected": true,
  "mode": "live",
  "chainId": 31337
}
```

Start Django in this same terminal so it inherits the blockchain variables:

```powershell
.\.venv\Scripts\python.exe backend\manage.py runserver 127.0.0.1:8000
```

## 4. Deploy to Sepolia for the hackathon demo

Create an RPC endpoint in an approved EVM RPC provider account. The RPC URL is private infrastructure configuration; do not place it in the browser bundle.

Set the deployment variables in a temporary PowerShell session:

```powershell
$env:BLOCKCHAIN_NETWORK = "Sepolia testnet"
$env:BLOCKCHAIN_RPC_URL = "<SEPOLIA_RPC_URL>"
$env:BLOCKCHAIN_CHAIN_ID = "11155111"
$env:BLOCKCHAIN_SIGNER_PRIVATE_KEY = "<SEPOLIA_TEST_WALLET_PRIVATE_KEY>"
$env:BLOCKCHAIN_EXPLORER_BASE_URL = "https://sepolia.etherscan.io"
$env:BLOCKCHAIN_CONFIRMATIONS = "1"
```

Derive the signer address and deploy the contract with that address as the constructor writer:

```powershell
$deployerAddress = cast wallet address --private-key $env:BLOCKCHAIN_SIGNER_PRIVATE_KEY
$deployerAddress

forge create .\backend\blockchain\contracts\EvidenceRegistry.sol:EvidenceRegistry `
  --root . `
  --rpc-url $env:BLOCKCHAIN_RPC_URL `
  --private-key $env:BLOCKCHAIN_SIGNER_PRIVATE_KEY `
  --constructor-args $deployerAddress `
  --broadcast
```

Before continuing, confirm that the deployer wallet has Sepolia test ETH. Copy the deployed contract address into:

```powershell
$env:BLOCKCHAIN_CONTRACT_ADDRESS = "<DEPLOYED_SEPOLIA_CONTRACT_ADDRESS>"
```

The contract address, deployer address, and deployment transaction should be recorded in the project handoff notes. The private key must not be recorded.

## 5. Configure Django

The Django settings read environment variables from the server process. For local PowerShell testing, set them in the same terminal before starting Django. For deployment, add them to the backend secret manager or backend host environment.

Required values:

```dotenv
BLOCKCHAIN_NETWORK=Sepolia testnet
BLOCKCHAIN_RPC_URL=<APPROVED_SEPOLIA_RPC_URL>
BLOCKCHAIN_CHAIN_ID=11155111
BLOCKCHAIN_CONTRACT_ADDRESS=<DEPLOYED_EVIDENCE_REGISTRY_ADDRESS>
BLOCKCHAIN_SIGNER_PRIVATE_KEY=<BACKEND_ONLY_TEST_WALLET_PRIVATE_KEY>
BLOCKCHAIN_EXPLORER_BASE_URL=https://sepolia.etherscan.io
BLOCKCHAIN_CONFIRMATIONS=1
BLOCKCHAIN_TX_TIMEOUT_SECONDS=120
BLOCKCHAIN_DECISION_THRESHOLD=0.80
```

`backend/.env.example` contains the same placeholders. It is safe to copy the names, but do not commit real values. The current backend does not automatically load a `.env` file; either export the variables before starting Django or add them through the production secret manager.

## 6. Verify the backend connection

With Django running:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/blockchain/status
```

The expected live response is:

```json
{
  "configured": true,
  "connected": true,
  "mode": "live",
  "network": "Sepolia testnet",
  "chainId": 11155111,
  "contractAddress": "0x..."
}
```

If the response says `not_configured`, one or more required environment variables are missing. If it says `unavailable`, check the RPC URL, chain ID, contract address, or signer key.

## 7. Create a synthetic alert for the first test

Do not upload real border evidence during the first test. Create a synthetic alert in the local Django repository:

```powershell
$payload = @{
  id = "DEMO-BLOCKCHAIN-001"
  eventType = "synthetic_perimeter_test"
  level = "critical"
  confidence = 92
  sourceCameraId = "DEMO-CAMERA-01"
  timestamp = (Get-Date).ToUniversalTime().ToString("o")
  modelVersion = "yolov8n.pt"
  evidenceUrl = $null
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/api/alerts `
  -ContentType "application/json" `
  -Body $payload
```

Anchor the synthetic alert:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/api/alerts/DEMO-BLOCKCHAIN-001/anchor `
  -ContentType "application/json" `
  -Body "{}"
```

A successful response contains `transactionHash`, `blockNumber`, `incidentReferenceHash`, and `evidenceSha256`. Open the transaction at:

```text
https://sepolia.etherscan.io/tx/<TRANSACTION_HASH>
```

For Anvil, no public explorer exists; use the transaction hash with `cast receipt`:

```powershell
cast receipt <TRANSACTION_HASH> --rpc-url http://127.0.0.1:8545
```

## 8. Verify the evidence hash

Verify through the Django API:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/alerts/DEMO-BLOCKCHAIN-001/verification
```

The result should contain:

```json
{
  "status": "verified",
  "verified": true
}
```

The dashboard uses the same API through the **VERIFY HASH** action in the blockchain evidence card. The **ANCHOR EVIDENCE** action calls Django; it never exposes the signer to the browser.

After stopping the demo, remove the private key from the current PowerShell process:

```powershell
Remove-Item Env:BLOCKCHAIN_SIGNER_PRIVATE_KEY
```

## 9. Add Pinata evidence later

Pinata is the off-chain evidence store, not the blockchain. For the complete production-like flow:

1. Capture the exact approved snapshot or short clip on the local border server.
2. Calculate SHA-256 before upload.
3. Upload the encrypted file to a private Pinata workspace.
4. Store the CID and file metadata in the operational database.
5. Send the same SHA-256 to `EvidenceRegistry`.
6. Verify the downloaded file's SHA-256 against the on-chain hash before displaying or exporting it.

Required Pinata values remain server-only and may be added later:

```dotenv
PINATA_JWT=<ADD_LATER>
PINATA_GATEWAY_URL=<RESTRICTED_PRIVATE_GATEWAY>
PINATA_GROUP_ID=<OPTIONAL>
PINATA_NETWORK=private
PINATA_ALLOW_PUBLIC_DEMO=false
```

For the hackathon, use synthetic or redacted media in a separate test workspace. Do not upload operational border footage, face images, plate images, precise sensitive coordinates, or personal identities to public IPFS or a public blockchain.

## 10. How a real incident will be anchored

The production sequence is:

```text
AI detection
   -> capture snapshot
   -> SHA-256 evidence file
   -> save locally in durable outbox
   -> upload privately to Pinata after connectivity returns
   -> store CID in Firebase/operational database
   -> Django calls registerIncident(...)
   -> for high severity, call registerHighSeverityIncident(...)
   -> append created/viewed/downloaded/assigned/resolved custody events
   -> save transaction IDs and confirmation times
```

If the network is unavailable, the local outbox retains the event and evidence. The worker retries after connectivity returns. `event_id` and custody IDs make retries idempotent, so a timeout does not require creating a duplicate record.

## 11. Production security checklist

- [ ] Use a dedicated backend signer with testnet funds only for the hackathon.
- [ ] Keep the signer private key outside Git, Firebase client settings, Vercel frontend variables, and browser code.
- [ ] Keep Pinata evidence private and use a restricted gateway.
- [ ] Never put images, video, face embeddings, plate numbers, full identities, or sensitive coordinates on-chain.
- [ ] Deploy the non-upgradeable contract from an approved account and record its address.
- [ ] Add backend authentication and role checks before enabling anchor/verification routes publicly.
- [ ] Restrict RPC credentials and rotate the signer if it is ever exposed.
- [ ] Test network loss, retry, duplicate submission, failed transaction, and evidence-hash mismatch.
- [ ] Use synthetic or redacted evidence for the public hackathon demo.

## Useful references

- [Foundry / Anvil](https://www.getfoundry.sh/anvil/index.html)
- [Foundry deployment guide](https://getfoundry.sh/forge/deploying/)
- [Ethereum network documentation](https://ethereum.org/developers/docs/networks/)
- [web3.py contract API](https://web3py.readthedocs.io/en/stable/web3.contract.html)
