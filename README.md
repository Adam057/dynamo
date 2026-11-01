# DYNAMO

Interactive scientific laboratory and BNB Smart Chain discovery commitment registry.

## Run locally

```bash
npm install
npm run dev
npm test
npm run contract:test
npm run build
```

The lab works without a wallet or deployed contract. The built-in datasets are numerical simulations, not published discoveries. CSV uploads require a header, increasing numeric timestamps, and at least ten samples.

## Scientific method

Built-in trajectories use fourth-order Runge–Kutta integration. Candidate equations use centered finite differences, constant/linear/quadratic feature libraries, and sequential thresholded least squares with ridge stabilization. Reported RMSE and R² are **training derivative-fit metrics**, not trajectory accuracy or independent validation. Noisy derivatives and poorly conditioned measurements may give unreliable equations. The discovery package contains the actual dataset and coefficients so it can be inspected and reproduced.

## Contract and mainnet preparation

`DiscoveryRegistry.sol` stores compact commitments and parent links, with no owner, custody, fees, transfers, or upgrade path. Verification submissions are records, not scientific endorsements.

The default RPC is BNB Chain's public `https://bsc-dataseed.bnbchain.org` endpoint. The deployment script checks the RPC's live chain ID, the public deployer address, balance, gas estimate, and gas price before allowing a broadcast. Configure `DEPLOYER_PRIVATE_KEY` only in a private local environment; never commit it or put it in a `NEXT_PUBLIC_` variable. With `CONFIRM_MAINNET_DEPLOY` unset, run `npx hardhat run scripts/deploy.cjs --network bsc` for a no-broadcast dry run. It requires a configured deployment wallet and enough BNB for the estimated cost plus a 20% buffer. Review its live results before obtaining explicit approval to set `CONFIRM_MAINNET_DEPLOY=YES` and rerun the same command. Record the confirmed contract address in `NEXT_PUBLIC_REGISTRY_ADDRESS`, then rebuild and redeploy the frontend.

The frontend reads the latest 30 registry records directly from chain and only permits publication on chain ID 56. Wallet confirmation is requested for each registration. The explorer does not invent records when no address is configured. Only browser-local saved packages are available until users export them; onchain hashes do not provide permanent dataset availability.

## Current limits

- No contract has been deployed; the address is intentionally unset.
- The public BSC RPC reports chain ID 56, but endpoint availability and gas prices can change. Its `eth_getLogs` method is disabled; registration confirmation is decoded from transaction receipt logs instead.
- Real browser-wallet behavior remains untested because no compatible injected wallet was available in the browser session. Account, chain, and rejection behavior has mocked-provider test coverage.
- The discovery map displays registered parent links but has no pan/zoom controls.
- The comparison mode overlays two computed runs; it does not compare fitted models.
- The current fit view shows derivative predictions and metrics, not integrated trajectory forecast error.
